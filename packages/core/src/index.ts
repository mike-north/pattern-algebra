/**
 * Path Pattern Language Library
 *
 * A library for parsing, compiling, matching, and comparing path patterns
 * (globs and restricted regexes). Designed for downstream use by policy systems.
 *
 * @packageDocumentation
 */

/**
 * Library version.
 * @public
 */
export const version = '0.0.0'

// =============================================================================
// Types
// =============================================================================

export type {
  // AST types
  PathPattern,
  PatternNode,
  SegmentSequence,
  Alternation,
  Segment,
  LiteralSegment,
  WildcardSegment,
  WildcardPart,
  GlobstarSegment,
  CharClassSegment,
  CharRange,
  CompositeSegment,
  SegmentPart,
  // Automaton types
  CompiledPattern,
  QuickRejectFilter,
  SegmentAutomaton,
  AutomatonState,
  AutomatonTransition,
  LiteralTransition,
  WildcardTransition,
  GlobstarTransition,
  EpsilonTransition,
  // Containment types
  PatternRelationship,
  ContainmentFailureReason,
  WitnessPath,
  WitnessCategory,
  ContainmentExplanation,
  SegmentComparisonEntry,
  SegmentConstraint,
  SegmentConstraintType,
  StructuralDifferences,
  DepthComparison,
  PrefixComparison,
  SuffixComparison,
  AnchoringComparison,
  ContainmentResult,
  PatternDescription,
  PatternAnalysis,
  // Error types
  PatternErrorCode,
  PatternError,
} from './types'
export { AutomatonLimitError } from './types'

// =============================================================================
// Parsing
// =============================================================================

export { parsePattern } from './parse'
export { validatePattern, isValidPattern } from './parse'
export { expandBraces, countBraceExpansions } from './parse'

// =============================================================================
// Compilation
// =============================================================================

export { compilePattern } from './compile'
export { buildAutomaton, getMinSegments, getMaxSegments, isUnbounded } from './compile'
export { buildQuickRejectFilter, applyQuickReject } from './compile'

// =============================================================================
// Matching
// =============================================================================

export { matchPath, matchPathWithContext, matchPathDirect } from './match'
export { matchSegment, segmentToRegex } from './match'
export {
  normalizePath,
  pathToSegments,
  segmentsToPath,
  isAbsolutePath,
  getExtension,
  getBasename,
  getDirname,
  isAncestorPath,
  commonPrefix,
  type PathContext,
} from './match'

// =============================================================================
// Automaton Operations
// =============================================================================

export { determinize, DEFAULT_MAX_DFA_STATES, type DeterminizeOptions } from './automaton'
export { complement } from './automaton'
export { intersect, union } from './automaton'
export { isEmpty, findWitness, countPaths } from './automaton'

// =============================================================================
// Pattern Algebra (Set Operations)
// =============================================================================

export { patternIntersect, patternUnion, patternComplement, patternDifference } from './automaton'

// =============================================================================
// Containment Checking
// =============================================================================

export { checkContainment } from './containment'
export { analyzePatterns, areEquivalent, hasOverlap, areDisjoint, summarizeRelationship } from './containment'
