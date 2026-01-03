import type { PathPattern } from './ast'

// =============================================================================
// COMPILED PATTERN
// =============================================================================

/**
 * A compiled pattern ready for efficient matching.
 *
 * Patterns are compiled to a form optimized for:
 * 1. Fast rejection of non-matching paths
 * 2. Minimal backtracking during matching
 * 3. Support for containment analysis
 *
 * @public
 */
export interface CompiledPattern {
  /** Original source pattern */
  readonly source: string

  /** Parsed AST (for containment analysis) */
  readonly ast: PathPattern

  /**
   * Quick-reject filters applied before full matching.
   * If any filter fails, the path definitely doesn't match.
   */
  readonly quickReject: QuickRejectFilter

  /**
   * Segment automaton for matching.
   * Operates on path segments, not characters.
   */
  readonly automaton: SegmentAutomaton

  /** Whether pattern can match paths of any depth (contains **) */
  readonly isUnbounded: boolean

  /** Minimum number of segments this pattern requires */
  readonly minSegments: number

  /** Maximum segments (undefined if unbounded) */
  readonly maxSegments?: number
}

/**
 * Quick rejection filters for fast path elimination.
 * @public
 */
export interface QuickRejectFilter {
  /** If pattern requires specific prefix, check it first */
  readonly requiredPrefix?: string

  /** If pattern requires specific suffix, check it first */
  readonly requiredSuffix?: string

  /** Minimum path length (characters) */
  readonly minLength?: number

  /** Required literal segments that must appear somewhere */
  readonly requiredLiterals?: readonly string[]
}

// =============================================================================
// SEGMENT AUTOMATON
// =============================================================================

/**
 * A finite automaton that operates on path segments rather than characters.
 *
 * Key insight: treating segments as tokens rather than character-by-character
 * matching dramatically simplifies the automaton and enables efficient
 * containment checking.
 *
 * Alphabet:
 *   - Each literal segment is a symbol
 *   - "*" matches any single segment (wildcard transition)
 *   - "**" is an epsilon loop (zero or more segments)
 *
 * This representation supports:
 *   - O(n) matching where n is number of path segments
 *   - Standard automaton operations (union, intersection, complement)
 *   - Containment checking via (A ∩ B̄ = ∅)
 *
 * @public
 */
export interface SegmentAutomaton {
  /** All states in the automaton */
  readonly states: readonly AutomatonState[]

  /** Index of the initial state */
  readonly initialState: number

  /** Indices of accepting (final) states */
  readonly acceptingStates: readonly number[]

  /** Whether this automaton is deterministic */
  readonly isDeterministic: boolean
}

/**
 * A state in the segment automaton.
 * @public
 */
export interface AutomatonState {
  /** Unique identifier for this state (index in the states array) */
  readonly id: number

  /** Transitions from this state */
  readonly transitions: readonly AutomatonTransition[]

  /** Is this an accepting state? */
  readonly accepting: boolean
}

/**
 * A transition in the segment automaton.
 * @public
 */
export type AutomatonTransition = LiteralTransition | WildcardTransition | GlobstarTransition | EpsilonTransition

/**
 * Transition on an exact segment match.
 * @public
 */
export interface LiteralTransition {
  readonly type: 'literal'
  readonly segment: string
  /** Target state ID */
  readonly target: number
}

/**
 * A pattern matcher that can test if a segment matches.
 * This can be either a native RegExp or a composite pattern.
 * @public
 */
export interface SegmentMatcher {
  /** Test if a string matches the pattern */
  test(str: string): boolean

  /** The pattern source for debugging/serialization */
  readonly source: string
}

/**
 * Transition matching any single segment (from * or ?).
 * May have constraints from character classes or wildcards.
 * @public
 */
export interface WildcardTransition {
  readonly type: 'wildcard'

  /** Pattern for segment matching (from *.ts, test-*, etc.) */
  readonly pattern: RegExp | SegmentMatcher

  /** Original pattern string for serialization/debugging */
  readonly patternSource: string

  readonly target: number
}

/**
 * Globstar transition for ** (matches zero or more segments).
 *
 * Modeled as: epsilon to exit OR consume one segment and stay.
 * @public
 */
export interface GlobstarTransition {
  readonly type: 'globstar'

  /** Self-loop state (stays in same state consuming segments) */
  readonly selfLoop: number

  /** Exit state (moves forward without consuming) */
  readonly exit: number
}

/**
 * Epsilon transition (no input consumed).
 * Used for NFA construction and alternation.
 * @public
 */
export interface EpsilonTransition {
  readonly type: 'epsilon'
  readonly target: number
}
