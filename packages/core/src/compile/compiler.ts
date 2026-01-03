/**
 * Pattern compiler - compiles AST to efficient matching form.
 * @packageDocumentation
 */

import type { PathPattern, CompiledPattern } from '../types'
import { buildAutomaton, getMinSegments, getMaxSegments, isUnbounded } from './automaton-builder'
import { buildQuickRejectFilter } from './quick-reject'

/**
 * Compile a pattern to an efficient matching form.
 *
 * The compiled pattern includes:
 * - Original source and AST for debugging/analysis
 * - Quick-reject filters for fast path elimination
 * - Segment automaton for full matching
 * - Depth constraints for optimization
 *
 * @param pattern - Parsed pattern AST
 * @returns Compiled pattern ready for matching
 *
 * @public
 */
export function compilePattern(pattern: PathPattern): CompiledPattern {
  const automaton = buildAutomaton(pattern)
  const quickReject = buildQuickRejectFilter(pattern)
  const minSegments = getMinSegments(pattern)
  const maxSegments = getMaxSegments(pattern)

  return {
    source: pattern.source,
    ast: pattern,
    quickReject,
    automaton,
    isUnbounded: isUnbounded(pattern),
    minSegments,
    maxSegments,
  }
}

/**
 * Compile a pattern from source string.
 *
 * Convenience function that parses and compiles in one step.
 *
 * @param source - Pattern source string
 * @returns Compiled pattern
 *
 * @public
 */
export { parsePattern } from '../parse'
