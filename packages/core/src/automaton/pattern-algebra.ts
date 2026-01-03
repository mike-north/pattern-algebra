/**
 * Pattern-level set operations (pattern algebra).
 *
 * These functions operate on CompiledPattern objects and return new
 * CompiledPattern objects, providing a higher-level API than the raw
 * automaton operations.
 *
 * @packageDocumentation
 */

import type { CompiledPattern, QuickRejectFilter, PathPattern, Alternation } from '../types'
import { intersect, union } from './intersect'
import { complement } from './complement'
import { determinize } from './determinize'

// =============================================================================
// PATTERN SET OPERATIONS
// =============================================================================

/**
 * Compute the intersection of two patterns.
 *
 * The result matches paths that match BOTH input patterns.
 * L(result) = L(a) ∩ L(b)
 *
 * @param a - First pattern
 * @param b - Second pattern
 * @returns Pattern matching paths in both a and b
 *
 * @public
 */
export function patternIntersect(a: CompiledPattern, b: CompiledPattern): CompiledPattern {
  // Determinize inputs to handle epsilon transitions properly
  const dfaA = a.automaton.isDeterministic ? a.automaton : determinize(a.automaton)
  const dfaB = b.automaton.isDeterministic ? b.automaton : determinize(b.automaton)
  const automaton = intersect(dfaA, dfaB)
  const source = `(${a.source}) ∩ (${b.source})`
  const ast = createSyntheticAst(source, 'intersection', [a.ast, b.ast])
  const quickReject = mergeQuickRejectForIntersection(a.quickReject, b.quickReject)

  return {
    source,
    ast,
    quickReject,
    automaton,
    isUnbounded: a.isUnbounded && b.isUnbounded,
    minSegments: Math.max(a.minSegments, b.minSegments),
    maxSegments: computeIntersectionMaxSegments(a.maxSegments, b.maxSegments),
  }
}

/**
 * Compute the union of two patterns.
 *
 * The result matches paths that match EITHER input pattern.
 * L(result) = L(a) ∪ L(b)
 *
 * @param a - First pattern
 * @param b - Second pattern
 * @returns Pattern matching paths in a or b (or both)
 *
 * @public
 */
export function patternUnion(a: CompiledPattern, b: CompiledPattern): CompiledPattern {
  // Determinize inputs to handle epsilon transitions properly
  const dfaA = a.automaton.isDeterministic ? a.automaton : determinize(a.automaton)
  const dfaB = b.automaton.isDeterministic ? b.automaton : determinize(b.automaton)
  const automaton = union(dfaA, dfaB)
  const source = `(${a.source}) ∪ (${b.source})`
  const ast = createSyntheticAst(source, 'union', [a.ast, b.ast])
  const quickReject = mergeQuickRejectForUnion(a.quickReject, b.quickReject)

  return {
    source,
    ast,
    quickReject,
    automaton,
    isUnbounded: a.isUnbounded || b.isUnbounded,
    minSegments: Math.min(a.minSegments, b.minSegments),
    maxSegments: computeUnionMaxSegments(a.maxSegments, b.maxSegments, a.isUnbounded, b.isUnbounded),
  }
}

/**
 * Compute the complement of a pattern.
 *
 * The result matches paths that do NOT match the input pattern.
 * L(result) = Σ* - L(a)
 *
 * @param a - Pattern to complement
 * @returns Pattern matching paths not matched by a
 *
 * @public
 */
export function patternComplement(a: CompiledPattern): CompiledPattern {
  // Determinize input (complement already does this, but be explicit)
  const dfa = a.automaton.isDeterministic ? a.automaton : determinize(a.automaton)
  const automaton = complement(dfa)
  const source = `¬(${a.source})`
  const ast = createSyntheticAst(source, 'complement', [a.ast])

  // Complement has no useful quick-reject filters
  // (the complement of any bounded set is unbounded)
  const quickReject: QuickRejectFilter = {}

  return {
    source,
    ast,
    quickReject,
    automaton,
    // Complement is always unbounded (matches infinite set of paths)
    isUnbounded: true,
    minSegments: 0,
    maxSegments: undefined,
  }
}

/**
 * Compute the difference of two patterns.
 *
 * The result matches paths that match a but NOT b.
 * L(result) = L(a) - L(b) = L(a) ∩ L(¬b)
 *
 * @param a - Pattern to subtract from
 * @param b - Pattern to subtract
 * @returns Pattern matching paths in a but not in b
 *
 * @public
 */
export function patternDifference(a: CompiledPattern, b: CompiledPattern): CompiledPattern {
  // A \ B = A ∩ ¬B
  // Determinize inputs to handle epsilon transitions properly
  const dfaA = a.automaton.isDeterministic ? a.automaton : determinize(a.automaton)
  const dfaB = b.automaton.isDeterministic ? b.automaton : determinize(b.automaton)
  const bComplement = complement(dfaB)
  const automaton = intersect(dfaA, bComplement)
  const source = `(${a.source}) \\ (${b.source})`
  const ast = createSyntheticAst(source, 'difference', [a.ast, b.ast])

  // Difference inherits quick-reject from a (paths must match a)
  // But we can't use b's filters since we're excluding b
  const quickReject = a.quickReject

  return {
    source,
    ast,
    quickReject,
    automaton,
    // Difference of A and B has same unbounded status as A
    // (we're only removing paths from A)
    isUnbounded: a.isUnbounded,
    minSegments: a.minSegments,
    maxSegments: a.maxSegments,
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

type SyntheticOperation = 'intersection' | 'union' | 'complement' | 'difference'

/**
 * Create a synthetic AST for algebraic pattern operations.
 */
function createSyntheticAst(
  source: string,
  _operation: SyntheticOperation,
  operands: readonly PathPattern[],
): PathPattern {
  // For synthetic patterns, we create an alternation node containing
  // references to the original patterns. This preserves the structure
  // while indicating this is a computed pattern.
  const root: Alternation = {
    type: 'alternation',
    branches: operands.map((p) => p.root),
  }

  return {
    source,
    root,
    // Synthetic patterns inherit absoluteness from operands
    isAbsolute: operands.some((p) => p.isAbsolute),
    isNegation: false,
  }
}

/**
 * Merge quick-reject filters for intersection (AND semantics).
 *
 * For intersection, a path must satisfy BOTH patterns, so we take
 * the more restrictive constraint for each field.
 */
function mergeQuickRejectForIntersection(a: QuickRejectFilter, b: QuickRejectFilter): QuickRejectFilter {
  return {
    requiredPrefix: mergePrefix(a.requiredPrefix, b.requiredPrefix, 'intersection'),
    requiredSuffix: mergeSuffix(a.requiredSuffix, b.requiredSuffix, 'intersection'),
    minLength: mergeMinLength(a.minLength, b.minLength, 'intersection'),
    requiredLiterals: mergeLiterals(a.requiredLiterals, b.requiredLiterals, 'intersection'),
  }
}

/**
 * Merge quick-reject filters for union (OR semantics).
 *
 * For union, a path need only satisfy ONE pattern, so we take
 * the less restrictive (common) constraint for each field.
 */
function mergeQuickRejectForUnion(a: QuickRejectFilter, b: QuickRejectFilter): QuickRejectFilter {
  return {
    requiredPrefix: mergePrefix(a.requiredPrefix, b.requiredPrefix, 'union'),
    requiredSuffix: mergeSuffix(a.requiredSuffix, b.requiredSuffix, 'union'),
    minLength: mergeMinLength(a.minLength, b.minLength, 'union'),
    requiredLiterals: mergeLiterals(a.requiredLiterals, b.requiredLiterals, 'union'),
  }
}

/**
 * Merge prefix constraints.
 */
function mergePrefix(a: string | undefined, b: string | undefined, mode: 'intersection' | 'union'): string | undefined {
  if (a === undefined) return mode === 'intersection' ? b : undefined
  if (b === undefined) return mode === 'intersection' ? a : undefined

  if (mode === 'intersection') {
    // For intersection, take longer prefix if one is substring of other
    if (a.startsWith(b)) return a
    if (b.startsWith(a)) return b
    // Incompatible prefixes - keep the longer one (will likely reject more)
    return a.length >= b.length ? a : b
  } else {
    // For union, take common prefix only
    let common = ''
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) {
        common += a[i]
      } else {
        break
      }
    }
    return common || undefined
  }
}

/**
 * Merge suffix constraints.
 */
function mergeSuffix(a: string | undefined, b: string | undefined, mode: 'intersection' | 'union'): string | undefined {
  if (a === undefined) return mode === 'intersection' ? b : undefined
  if (b === undefined) return mode === 'intersection' ? a : undefined

  if (mode === 'intersection') {
    // For intersection, take longer suffix if one is substring of other
    if (a.endsWith(b)) return a
    if (b.endsWith(a)) return b
    // Incompatible suffixes - keep the longer one
    return a.length >= b.length ? a : b
  } else {
    // For union, take common suffix only
    let common = ''
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[a.length - 1 - i] === b[b.length - 1 - i]) {
        common = a[a.length - 1 - i] + common
      } else {
        break
      }
    }
    return common || undefined
  }
}

/**
 * Merge minLength constraints.
 */
function mergeMinLength(
  a: number | undefined,
  b: number | undefined,
  mode: 'intersection' | 'union',
): number | undefined {
  if (a === undefined) return mode === 'intersection' ? b : undefined
  if (b === undefined) return mode === 'intersection' ? a : undefined

  if (mode === 'intersection') {
    // For intersection, take max (more restrictive)
    return Math.max(a, b)
  } else {
    // For union, take min (less restrictive)
    return Math.min(a, b)
  }
}

/**
 * Merge requiredLiterals constraints.
 */
function mergeLiterals(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
  mode: 'intersection' | 'union',
): readonly string[] | undefined {
  if (a === undefined) return mode === 'intersection' ? b : undefined
  if (b === undefined) return mode === 'intersection' ? a : undefined

  if (mode === 'intersection') {
    // For intersection, union of sets (all must be present)
    const combined = new Set([...a, ...b])
    return combined.size > 0 ? [...combined] : undefined
  } else {
    // For union, intersection of sets (must be in all branches)
    const bSet = new Set(b)
    const common = a.filter((lit) => bSet.has(lit))
    return common.length > 0 ? common : undefined
  }
}

/**
 * Compute maxSegments for intersection.
 */
function computeIntersectionMaxSegments(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.min(a, b)
}

/**
 * Compute maxSegments for union.
 */
function computeUnionMaxSegments(
  a: number | undefined,
  b: number | undefined,
  aUnbounded: boolean,
  bUnbounded: boolean,
): number | undefined {
  if (aUnbounded || bUnbounded) return undefined
  if (a === undefined || b === undefined) return undefined
  return Math.max(a, b)
}
