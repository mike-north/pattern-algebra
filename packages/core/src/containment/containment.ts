/**
 * Pattern containment checking.
 * @packageDocumentation
 */

import type {
  CompiledPattern,
  ContainmentResult,
  ContainmentExplanation,
  ContainmentFailureReason,
  PatternRelationship,
  StructuralDifferences,
  SegmentComparisonEntry,
  WitnessPath,
  DepthComparison,
  PrefixComparison,
  SuffixComparison,
  AnchoringComparison,
  SegmentConstraint,
} from '../types'
import { matchPath } from '../match/matcher'

/**
 * Check if pattern A is contained within pattern B.
 *
 * A ⊆ B means: every path that matches A also matches B.
 *
 * Uses a hybrid approach:
 * 1. Structural analysis for quick checks
 * 2. Sample-based testing for validation
 * 3. Automaton operations for complex cases (when available)
 *
 * @param a - First compiled pattern
 * @param b - Second compiled pattern
 * @returns Containment result with explanation data
 *
 * @public
 */
export function checkContainment(a: CompiledPattern, b: CompiledPattern): ContainmentResult {
  // Use structural analysis for containment checking
  const { isSubset, isSuperset, counterexample, reverseCounterexample } = checkContainmentStructural(a, b)

  const isEqual = isSubset && isSuperset
  const hasOverlap = checkHasOverlap(a, b)

  let relationship: PatternRelationship
  if (isEqual) {
    relationship = 'equal'
  } else if (isSubset) {
    relationship = 'subset'
  } else if (isSuperset) {
    relationship = 'superset'
  } else if (!hasOverlap) {
    relationship = 'disjoint'
  } else {
    relationship = 'overlapping'
  }

  // Build explanation
  const explanation = buildExplanation(a, b, relationship, counterexample, reverseCounterexample)

  return {
    patternA: a.source,
    patternB: b.source,
    isSubset,
    isSuperset,
    isEqual,
    hasOverlap,
    relationship,
    counterexample,
    reverseCounterexample,
    explanation,
  }
}

/**
 * Structural containment check.
 */
function checkContainmentStructural(
  a: CompiledPattern,
  b: CompiledPattern,
): {
  isSubset: boolean
  isSuperset: boolean
  counterexample?: string
  reverseCounterexample?: string
} {
  // Generate test paths from pattern A and check if they match B
  const aPaths = generateTestPaths(a, 20)
  const bPaths = generateTestPaths(b, 20)

  let aSubsetB = true
  let bSubsetA = true
  let counterexample: string | undefined
  let reverseCounterexample: string | undefined

  // Check if all A paths match B
  for (const path of aPaths) {
    if (!matchPath(path, b)) {
      aSubsetB = false
      counterexample = path
      break
    }
  }

  // Check if all B paths match A
  for (const path of bPaths) {
    if (!matchPath(path, a)) {
      bSubsetA = false
      reverseCounterexample = path
      break
    }
  }

  // Additional structural checks
  if (aSubsetB) {
    // Verify with depth analysis
    if (a.isUnbounded && !b.isUnbounded) {
      // A can go deeper than B allows
      aSubsetB = false
      counterexample = generateDeepPath(a, (b.maxSegments ?? 0) + 1)
    }
  }

  if (bSubsetA) {
    if (b.isUnbounded && !a.isUnbounded) {
      bSubsetA = false
      reverseCounterexample = generateDeepPath(b, (a.maxSegments ?? 0) + 1)
    }
  }

  return {
    isSubset: aSubsetB,
    isSuperset: bSubsetA,
    counterexample,
    reverseCounterexample,
  }
}

/**
 * Check if patterns have any overlap.
 */
function checkHasOverlap(a: CompiledPattern, b: CompiledPattern): boolean {
  // Generate paths from A and check if they match B
  const aPaths = generateTestPaths(a, 10)
  for (const path of aPaths) {
    if (matchPath(path, b)) {
      return true
    }
  }

  // Generate paths from B and check if they match A
  const bPaths = generateTestPaths(b, 10)
  for (const path of bPaths) {
    if (matchPath(path, a)) {
      return true
    }
  }

  // Try to generate paths that combine constraints from both patterns
  const combinedPaths = generateCombinedPaths(a, b, 10)
  for (const path of combinedPaths) {
    if (matchPath(path, a) && matchPath(path, b)) {
      return true
    }
  }

  return false
}

/**
 * Generate paths that might match both patterns by combining their constraints.
 */
function generateCombinedPaths(a: CompiledPattern, b: CompiledPattern, count: number): string[] {
  const paths: string[] = []

  // Extract constraints from both patterns, removing leading slashes
  const aPrefix = a.quickReject.requiredPrefix?.replace(/^\//, '') ?? ''
  const bPrefix = b.quickReject.requiredPrefix?.replace(/^\//, '') ?? ''
  const aSuffix = a.quickReject.requiredSuffix?.replace(/^\//, '') ?? ''
  const bSuffix = b.quickReject.requiredSuffix?.replace(/^\//, '') ?? ''

  // Extract file extensions and base names from suffixes
  const extractFileInfo = (suffix: string): { basename: string; ext: string } => {
    if (!suffix) return { basename: '', ext: '' }
    const lastDot = suffix.lastIndexOf('.')
    if (lastDot > 0) {
      return { basename: suffix.slice(0, lastDot), ext: suffix.slice(lastDot) }
    }
    return { basename: suffix, ext: '' }
  }

  // Build candidate paths
  const prefixes = [aPrefix, bPrefix].filter(Boolean)
  if (prefixes.length === 0) prefixes.push('')

  // If we have suffixes like "index.ts", extract the components
  const suffixInfoA = extractFileInfo(aSuffix)
  const suffixInfoB = extractFileInfo(bSuffix)

  // File basenames to try
  const basenames = [suffixInfoA.basename || 'index', suffixInfoB.basename || 'index', 'file', 'test'].filter(Boolean)

  // Extensions to try
  const extensions = [suffixInfoA.ext, suffixInfoB.ext, '.ts', '.js'].filter(Boolean)

  for (const prefix of prefixes) {
    for (const basename of basenames) {
      for (const ext of extensions) {
        // Build path: /prefix/basename.ext
        const filename = basename + ext
        const path = prefix ? `/${prefix}/${filename}` : `/${filename}`

        if (!paths.includes(path)) {
          paths.push(path)
        }

        // Also try with subdirectory
        if (prefix) {
          const deepPath = `/${prefix}/sub/${filename}`
          if (!paths.includes(deepPath)) {
            paths.push(deepPath)
          }
        }

        if (paths.length >= count) break
      }
      if (paths.length >= count) break
    }
    if (paths.length >= count) break
  }

  return paths.slice(0, count)
}

/**
 * Generate test paths that match a pattern.
 */
function generateTestPaths(pattern: CompiledPattern, count: number): string[] {
  const paths: string[] = []
  const ast = pattern.ast

  if (ast.root.type === 'alternation') {
    // Generate paths for each branch
    for (const branch of ast.root.branches) {
      paths.push(
        ...generatePathsFromSequence(
          branch as import('../types').SegmentSequence,
          Math.ceil(count / ast.root.branches.length),
        ),
      )
    }
  } else {
    paths.push(...generatePathsFromSequence(ast.root, count))
  }

  return paths.slice(0, count)
}

/**
 * Generate paths from a segment sequence.
 */
function generatePathsFromSequence(sequence: import('../types').SegmentSequence, count: number): string[] {
  const paths: string[] = []

  // Generate base path
  const basePath = generateBasePath(sequence.segments)
  paths.push(basePath)

  // Generate variations
  for (let i = 1; i < count && paths.length < count; i++) {
    const variation = generatePathVariation(sequence.segments, i)
    if (variation && !paths.includes(variation)) {
      paths.push(variation)
    }
  }

  return paths
}

/**
 * Generate a base path from segments.
 */
function generateBasePath(segments: readonly import('../types').Segment[]): string {
  const parts: string[] = []

  for (const segment of segments) {
    parts.push(generateSegmentValue(segment, 0))
  }

  return '/' + parts.join('/')
}

/**
 * Generate a path variation.
 */
function generatePathVariation(segments: readonly import('../types').Segment[], variationIndex: number): string {
  const parts: string[] = []
  let usedVariation = false

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.type === 'globstar' && !usedVariation) {
      // For globstar, always add at least one segment (globstar requires at least 1)
      // Then optionally add more based on variation
      const extraCount = 1 + (variationIndex % 3)
      for (let j = 0; j < extraCount; j++) {
        parts.push(`dir${j}`)
      }
      usedVariation = true
    } else {
      parts.push(generateSegmentValue(segment, usedVariation ? 0 : variationIndex))
    }
  }

  return '/' + parts.join('/')
}

/**
 * Generate a value that matches a segment pattern.
 */
function generateSegmentValue(segment: import('../types').Segment, variation: number): string {
  switch (segment.type) {
    case 'literal':
      return segment.value

    case 'globstar':
      return 'subdir'

    case 'wildcard': {
      // Generate based on pattern
      const pattern = segment.pattern
      if (pattern.endsWith('.ts')) {
        return `file${variation}.ts`
      }
      if (pattern.endsWith('.js')) {
        return `file${variation}.js`
      }
      if (pattern.startsWith('test-')) {
        return `test-${variation}`
      }
      return `match${variation}`
    }

    case 'charclass':
      // Pick a character from the class
      if (segment.ranges.length > 0) {
        const range = segment.ranges[0]
        return range.start
      }
      return segment.chars[0] || 'x'

    case 'composite':
      return `composite${variation}`
  }
}

/**
 * Generate a path with a specific depth.
 */
function generateDeepPath(pattern: CompiledPattern, depth: number): string {
  const ast = pattern.ast
  const segments: string[] = []

  if (ast.root.type === 'sequence') {
    for (const seg of ast.root.segments) {
      if (seg.type === 'globstar') {
        // Fill with enough segments to reach target depth
        while (segments.length < depth - 1) {
          segments.push('deep')
        }
      } else {
        segments.push(generateSegmentValue(seg, 0))
      }
    }
  }

  // Ensure we reach target depth
  while (segments.length < depth) {
    segments.push('extra')
  }

  return '/' + segments.join('/')
}

/**
 * Build a detailed explanation of the containment result.
 */
function buildExplanation(
  a: CompiledPattern,
  b: CompiledPattern,
  relationship: PatternRelationship,
  counterexample: string | undefined,
  reverseCounterexample: string | undefined,
): ContainmentExplanation {
  const failureReasons = determineFailureReasons(a, b, relationship, counterexample)
  const segmentComparison = buildSegmentComparison(a, b)
  const structuralDiffs = buildStructuralDifferences(a, b)
  const witnesses = buildWitnesses(a, b, counterexample, reverseCounterexample)

  return {
    failureReasons,
    segmentComparison,
    structuralDiffs,
    witnesses,
  }
}

/**
 * Determine the high-level reasons why containment fails.
 */
function determineFailureReasons(
  a: CompiledPattern,
  b: CompiledPattern,
  relationship: PatternRelationship,
  counterexample: string | undefined,
): readonly ContainmentFailureReason[] {
  if (relationship === 'subset' || relationship === 'equal') {
    return []
  }

  const reasons: ContainmentFailureReason[] = []

  // Check depth mismatch
  if (a.isUnbounded !== b.isUnbounded) {
    reasons.push('depth_mismatch')
  } else if (!a.isUnbounded && !b.isUnbounded) {
    if (a.maxSegments! > b.maxSegments! || a.minSegments < b.minSegments) {
      reasons.push('depth_mismatch')
    }
  }

  // Check prefix mismatch
  if (a.quickReject.requiredPrefix !== b.quickReject.requiredPrefix) {
    if (!b.quickReject.requiredPrefix || !a.quickReject.requiredPrefix?.startsWith(b.quickReject.requiredPrefix)) {
      reasons.push('prefix_mismatch')
    }
  }

  // Check suffix mismatch
  if (a.quickReject.requiredSuffix !== b.quickReject.requiredSuffix) {
    if (!b.quickReject.requiredSuffix || !a.quickReject.requiredSuffix?.endsWith(b.quickReject.requiredSuffix)) {
      reasons.push('suffix_mismatch')
    }
  }

  // Check for segment-level mismatches using counterexample
  if (counterexample && reasons.length === 0) {
    // If we have a counterexample but no obvious structural reason,
    // it's likely a segment-level mismatch
    reasons.push('segment_mismatch')
  }

  return reasons
}

/**
 * Build segment-by-segment comparison.
 */
function buildSegmentComparison(a: CompiledPattern, b: CompiledPattern): readonly SegmentComparisonEntry[] {
  const entries: SegmentComparisonEntry[] = []
  const maxPositions = Math.max(a.maxSegments ?? 10, b.maxSegments ?? 10, a.minSegments, b.minSegments)

  // For simplicity, compare the first few positions
  // A full implementation would analyze the automaton structure
  for (let pos = 0; pos < Math.min(maxPositions, 5); pos++) {
    const constraintA = getConstraintAtPosition(a, pos)
    const constraintB = getConstraintAtPosition(b, pos)

    const aSubsetOfB = isConstraintSubset(constraintA, constraintB)
    const difference = aSubsetOfB ? undefined : describeConstraintDifference(constraintA, constraintB)

    entries.push({
      position: pos,
      patternAAllows: constraintA,
      patternBAllows: constraintB,
      aSubsetOfB,
      difference,
    })
  }

  return entries
}

/**
 * Get the constraint at a given segment position.
 */
function getConstraintAtPosition(pattern: CompiledPattern, position: number): SegmentConstraint {
  const ast = pattern.ast
  if (ast.root.type !== 'sequence') {
    // For alternations, return a more general constraint
    return {
      type: 'any',
      optional: true,
      repeatable: false,
    }
  }

  const segments = ast.root.segments
  if (position >= segments.length) {
    // Past the end of the pattern
    if (pattern.isUnbounded) {
      return { type: 'any_sequence', optional: true, repeatable: true }
    }
    return { type: 'end', optional: false, repeatable: false }
  }

  const segment = segments[position]
  switch (segment.type) {
    case 'literal':
      return {
        type: 'literal',
        literalValue: segment.value,
        optional: false,
        repeatable: false,
      }
    case 'wildcard':
      return {
        type: 'wildcard',
        wildcardPattern: segment.pattern,
        optional: false,
        repeatable: false,
      }
    case 'globstar':
      return {
        type: 'any_sequence',
        optional: true,
        repeatable: true,
      }
    case 'charclass':
      return {
        type: 'charclass',
        charclassDescription: describeCharClass(segment),
        optional: false,
        repeatable: false,
      }
    case 'composite':
      return {
        type: 'wildcard',
        wildcardPattern: 'composite',
        optional: false,
        repeatable: false,
      }
  }
}

/**
 * Describe a character class for display.
 */
function describeCharClass(segment: import('../types').CharClassSegment): string {
  const desc = segment.negated ? 'not ' : ''
  const parts: string[] = []

  if (segment.chars) {
    parts.push(`[${segment.chars}]`)
  }

  for (const range of segment.ranges) {
    parts.push(`${range.start}-${range.end}`)
  }

  return desc + parts.join(', ')
}

/**
 * Check if constraint A is a subset of constraint B.
 */
function isConstraintSubset(a: SegmentConstraint, b: SegmentConstraint): boolean {
  const aType = a.type
  const bType = b.type

  // any_sequence contains everything
  if (bType === 'any_sequence') return true
  if (aType === 'any_sequence') return false

  // any contains any single segment (except any_sequence which is handled above)
  if (bType === 'any') return true

  // end only contains end
  if (bType === 'end') return aType === 'end'
  if (aType === 'end') return false

  // literal is only subset if same literal or B is wildcard/any
  if (aType === 'literal') {
    if (bType === 'literal') return a.literalValue === b.literalValue
    if (bType === 'wildcard') return true
    return false
  }

  // wildcard is subset of wildcard only if patterns align
  if (aType === 'wildcard' && bType === 'wildcard') {
    // Simplified: check if patterns look compatible
    return true // Would need regex analysis for accuracy
  }

  return false
}

/**
 * Describe the difference between two constraints.
 */
function describeConstraintDifference(a: SegmentConstraint, b: SegmentConstraint): string {
  if (a.type === 'any_sequence' && b.type !== 'any_sequence') {
    return 'A allows unlimited depth, B is bounded'
  }
  if (a.type === 'literal' && b.type === 'literal' && a.literalValue !== b.literalValue) {
    return `A requires "${a.literalValue}", B requires "${b.literalValue}"`
  }
  if (a.type === 'wildcard' && b.type === 'literal') {
    return `A allows any matching segment, B requires exact "${b.literalValue}"`
  }
  return 'Constraint mismatch'
}

/**
 * Build structural differences summary.
 */
function buildStructuralDifferences(a: CompiledPattern, b: CompiledPattern): StructuralDifferences {
  const depthDifference = buildDepthComparison(a, b)
  const prefixDifference = buildPrefixComparison(a, b)
  const suffixDifference = buildSuffixComparison(a, b)
  const anchoringDifference = buildAnchoringComparison(a, b)

  return {
    depthDifference,
    prefixDifference,
    suffixDifference,
    anchoringDifference,
  }
}

function buildDepthComparison(a: CompiledPattern, b: CompiledPattern): DepthComparison {
  const aMax = a.maxSegments ?? 'unbounded'
  const bMax = b.maxSegments ?? 'unbounded'
  const differ = a.minSegments !== b.minSegments || aMax !== bMax

  let explanation: string | undefined
  if (differ) {
    if (a.isUnbounded && !b.isUnbounded) {
      explanation = `A can match paths of any depth, B is limited to ${bMax} segments`
    } else if (!a.isUnbounded && b.isUnbounded) {
      explanation = `A is limited to ${aMax} segments, B can match any depth`
    } else if (a.minSegments !== b.minSegments) {
      explanation = `A requires at least ${a.minSegments} segments, B requires ${b.minSegments}`
    }
  }

  return {
    differ,
    patternAMin: a.minSegments,
    patternAMax: aMax as number | 'unbounded',
    patternBMin: b.minSegments,
    patternBMax: bMax as number | 'unbounded',
    explanation,
  }
}

function buildPrefixComparison(a: CompiledPattern, b: CompiledPattern): PrefixComparison {
  const prefixA = a.quickReject.requiredPrefix
  const prefixB = b.quickReject.requiredPrefix
  const differ = prefixA !== prefixB

  let explanation: string | undefined
  if (differ) {
    if (prefixA && prefixB) {
      explanation = `A requires prefix "${prefixA}", B requires "${prefixB}"`
    } else if (prefixA) {
      explanation = `A requires prefix "${prefixA}", B has no prefix requirement`
    } else {
      explanation = `A has no prefix requirement, B requires "${prefixB}"`
    }
  }

  return {
    differ,
    patternAPrefix: prefixA,
    patternBPrefix: prefixB,
    explanation,
  }
}

function buildSuffixComparison(a: CompiledPattern, b: CompiledPattern): SuffixComparison {
  const suffixA = a.quickReject.requiredSuffix
  const suffixB = b.quickReject.requiredSuffix
  const differ = suffixA !== suffixB

  let explanation: string | undefined
  if (differ) {
    if (suffixA && suffixB) {
      explanation = `A requires suffix "${suffixA}", B requires "${suffixB}"`
    } else if (suffixA) {
      explanation = `A requires suffix "${suffixA}", B has no suffix requirement`
    } else {
      explanation = `A has no suffix requirement, B requires "${suffixB}"`
    }
  }

  return {
    differ,
    patternASuffix: suffixA,
    patternBSuffix: suffixB,
    explanation,
  }
}

function buildAnchoringComparison(a: CompiledPattern, b: CompiledPattern): AnchoringComparison {
  const aAbsolute = a.ast.isAbsolute
  const bAbsolute = b.ast.isAbsolute
  const differ = aAbsolute !== bAbsolute

  let explanation: string | undefined
  if (differ) {
    explanation = aAbsolute ? 'A is an absolute pattern, B is relative' : 'A is a relative pattern, B is absolute'
  }

  return {
    differ,
    patternAAbsolute: aAbsolute,
    patternBAbsolute: bAbsolute,
    explanation,
  }
}

/**
 * Build witness paths for the containment result.
 */
function buildWitnesses(
  a: CompiledPattern,
  b: CompiledPattern,
  counterexample: string | undefined,
  reverseCounterexample: string | undefined,
): readonly WitnessPath[] {
  const witnesses: WitnessPath[] = []

  // Add counterexample if present
  if (counterexample) {
    witnesses.push({
      path: counterexample,
      matchesA: true,
      matchesB: false,
      category: 'counterexample',
      divergenceIndex: findDivergenceIndex(counterexample, a, b),
    })
  }

  // Add reverse counterexample if present
  if (reverseCounterexample) {
    witnesses.push({
      path: reverseCounterexample,
      matchesA: false,
      matchesB: true,
      category: 'reverse_counterexample',
      divergenceIndex: findDivergenceIndex(reverseCounterexample, a, b),
    })
  }

  // Try to find a shared example
  const sharedExample = findSharedExample(a, b)
  if (sharedExample) {
    witnesses.push({
      path: sharedExample,
      matchesA: true,
      matchesB: true,
      category: 'shared',
    })
  }

  return witnesses
}

/**
 * Find the segment index where patterns diverge for a path.
 */
function findDivergenceIndex(_path: string, _a: CompiledPattern, _b: CompiledPattern): number | undefined {
  // This would require tracing through both automata
  // For simplicity, return undefined
  return undefined
}

/**
 * Find an example path that matches both patterns.
 */
function findSharedExample(a: CompiledPattern, b: CompiledPattern): string | undefined {
  // Generate paths from A and check if any match B
  const aPaths = generateTestPaths(a, 10)
  for (const path of aPaths) {
    if (matchPath(path, b)) {
      return path
    }
  }

  // Generate paths from B and check if any match A
  const bPaths = generateTestPaths(b, 10)
  for (const path of bPaths) {
    if (matchPath(path, a)) {
      return path
    }
  }

  return undefined
}
