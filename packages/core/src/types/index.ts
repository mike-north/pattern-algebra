/**
 * Type definitions for the path pattern language.
 * @packageDocumentation
 */

// AST types
export type {
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
} from './ast'

// Automaton types
export type {
  CompiledPattern,
  QuickRejectFilter,
  SegmentAutomaton,
  AutomatonState,
  AutomatonTransition,
  LiteralTransition,
  WildcardTransition,
  SegmentMatcher,
  GlobstarTransition,
  EpsilonTransition,
} from './automaton'

// Containment types
export type {
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
} from './containment'

// Error types
export type { PatternErrorCode, PatternError } from './errors'
export { AutomatonLimitError } from './errors'
