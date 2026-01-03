// =============================================================================
// CONTAINMENT ANALYSIS
// =============================================================================

/**
 * Describes the relationship between two pattern sets.
 * @public
 */
export type PatternRelationship =
  | 'subset' // A ⊂ B (proper subset)
  | 'equal' // A = B
  | 'superset' // A ⊃ B
  | 'overlapping' // A ∩ B ≠ ∅, but neither contains the other
  | 'disjoint' // A ∩ B = ∅

/**
 * Categories of reasons why containment may fail.
 * Used to provide structured explanation data.
 * @public
 */
export type ContainmentFailureReason =
  | 'depth_mismatch' // A allows deeper/shallower paths than B
  | 'prefix_mismatch' // A allows different path prefixes than B
  | 'suffix_mismatch' // A allows different file extensions/suffixes than B
  | 'segment_mismatch' // A allows segments at a position that B doesn't
  | 'charclass_mismatch' // A allows characters in a segment that B doesn't
  | 'negation_conflict' // A includes paths that B explicitly negates
  | 'alternation_escape' // A's alternation includes branches outside B

/**
 * A witness path that demonstrates a containment property.
 * @public
 */
export interface WitnessPath {
  /** The actual path string */
  readonly path: string

  /** Which pattern(s) this path matches */
  readonly matchesA: boolean
  readonly matchesB: boolean

  /**
   * For counterexamples, the segment index where patterns diverge.
   * Useful for highlighting the specific point of difference.
   */
  readonly divergenceIndex?: number

  /**
   * Human-oriented classification of this witness.
   */
  readonly category: WitnessCategory
}

/**
 * Classification of witness paths for explanation generation.
 * @public
 */
export type WitnessCategory =
  | 'counterexample' // Matches A but not B (proves A ⊄ B)
  | 'reverse_counterexample' // Matches B but not A (proves B ⊄ A)
  | 'shared' // Matches both A and B (proves A ∩ B ≠ ∅)
  | 'neither' // Matches neither (less useful, but sometimes illustrative)

/**
 * Structured explanation of why two patterns have a particular relationship.
 * Provides sufficient data for downstream systems to generate human-readable explanations.
 * @public
 */
export interface ContainmentExplanation {
  /**
   * High-level categorization of why containment fails (if it does).
   * Empty array if A ⊆ B.
   */
  readonly failureReasons: readonly ContainmentFailureReason[]

  /**
   * Segment-by-segment comparison showing where patterns differ.
   * Each entry describes one position in the path.
   */
  readonly segmentComparison: readonly SegmentComparisonEntry[]

  /**
   * Structural differences between the patterns.
   */
  readonly structuralDiffs: StructuralDifferences

  /**
   * Witness paths that demonstrate the relationship.
   * Includes counterexamples, shared paths, and illustrative examples.
   */
  readonly witnesses: readonly WitnessPath[]
}

/**
 * Comparison of what patterns allow at a specific segment position.
 * @public
 */
export interface SegmentComparisonEntry {
  /** Segment position (0-indexed from path root) */
  readonly position: number

  /** What pattern A allows at this position */
  readonly patternAAllows: SegmentConstraint

  /** What pattern B allows at this position */
  readonly patternBAllows: SegmentConstraint

  /** Whether A's constraint is a subset of B's at this position */
  readonly aSubsetOfB: boolean

  /** Brief description of the difference (if any) */
  readonly difference?: string
}

/**
 * Describes what a pattern allows at a segment position.
 * @public
 */
export interface SegmentConstraint {
  /** The type of constraint */
  readonly type: SegmentConstraintType

  /** For literal: the exact value required */
  readonly literalValue?: string

  /** For wildcard: the pattern (e.g., "*.ts") */
  readonly wildcardPattern?: string

  /** For charclass: description of allowed characters */
  readonly charclassDescription?: string

  /** Whether this position can be skipped (due to ** before it) */
  readonly optional: boolean

  /** Whether this position can repeat (is within a ** range) */
  readonly repeatable: boolean
}

/**
 * Types of segment constraints.
 * @public
 */
export type SegmentConstraintType =
  | 'literal' // Exact match required
  | 'wildcard' // Pattern match (*, ?, *.ts, etc.)
  | 'charclass' // Character class match
  | 'any' // Any single segment (bare *)
  | 'any_sequence' // Zero or more segments (**)
  | 'end' // End of pattern (no more segments allowed)
  | 'unreachable' // Position cannot be reached

/**
 * High-level structural differences between patterns.
 * @public
 */
export interface StructuralDifferences {
  /** Whether patterns have different depth bounds */
  readonly depthDifference: DepthComparison

  /** Whether patterns require different prefixes */
  readonly prefixDifference: PrefixComparison

  /** Whether patterns require different suffixes */
  readonly suffixDifference: SuffixComparison

  /** Whether one pattern is anchored and the other isn't */
  readonly anchoringDifference: AnchoringComparison
}

/**
 * Comparison of pattern depth constraints.
 * @public
 */
export interface DepthComparison {
  /** Whether the depth constraints differ between patterns */
  readonly differ: boolean

  /** Minimum segment depth for pattern A */
  readonly patternAMin: number

  /** Maximum segment depth for pattern A (or 'unbounded' for **) */
  readonly patternAMax: number | 'unbounded'

  /** Minimum segment depth for pattern B */
  readonly patternBMin: number

  /** Maximum segment depth for pattern B (or 'unbounded' for **) */
  readonly patternBMax: number | 'unbounded'

  /** Human-readable explanation of the difference */
  readonly explanation?: string
}

/**
 * Comparison of required path prefixes.
 * @public
 */
export interface PrefixComparison {
  /** Whether the required prefixes differ between patterns */
  readonly differ: boolean

  /** Required prefix for pattern A (if any) */
  readonly patternAPrefix?: string

  /** Required prefix for pattern B (if any) */
  readonly patternBPrefix?: string

  /** Human-readable explanation of the difference */
  readonly explanation?: string
}

/**
 * Comparison of required path suffixes (e.g., file extensions).
 * @public
 */
export interface SuffixComparison {
  /** Whether the required suffixes differ between patterns */
  readonly differ: boolean

  /** Required suffix for pattern A (e.g., ".ts") */
  readonly patternASuffix?: string

  /** Required suffix for pattern B (e.g., ".js") */
  readonly patternBSuffix?: string

  /** Human-readable explanation of the difference */
  readonly explanation?: string
}

/**
 * Comparison of pattern anchoring (absolute vs relative).
 * @public
 */
export interface AnchoringComparison {
  /** Whether the anchoring differs between patterns */
  readonly differ: boolean

  /** Whether pattern A is absolute (starts with / or ~) */
  readonly patternAAbsolute: boolean

  /** Whether pattern B is absolute (starts with / or ~) */
  readonly patternBAbsolute: boolean

  /** Human-readable explanation of the difference */
  readonly explanation?: string
}

// =============================================================================
// MAIN RESULT TYPES
// =============================================================================

/**
 * Result of checking whether pattern A is contained within pattern B.
 *
 * A ⊆ B means: every path that matches A also matches B.
 *
 * This type provides rich structured data to enable downstream systems
 * to generate human-readable explanations of containment results.
 *
 * @example
 *   - "src/*.ts" ⊆ "src/**" (true)
 *   - "src/**" ⊆ "src/*.ts" (false)
 *   - "*.ts" ⊆ "*" (true)
 *   - "\{src,lib\}/*.ts" ⊆ "**\/*.ts" (true)
 *
 * @public
 */
export interface ContainmentResult {
  /** The first pattern being compared */
  readonly patternA: string

  /** The second pattern being compared */
  readonly patternB: string

  /** Is A a subset of B? (A ⊆ B) */
  readonly isSubset: boolean

  /** Is B a subset of A? (B ⊆ A) */
  readonly isSuperset: boolean

  /** Is A equal to B (mutual containment)? */
  readonly isEqual: boolean

  /** Do the patterns have any overlap? (A ∩ B ≠ ∅) */
  readonly hasOverlap: boolean

  /** Relationship classification */
  readonly relationship: PatternRelationship

  /**
   * Primary counterexample: a path that matches A but not B.
   * Present when isSubset is false.
   */
  readonly counterexample?: string

  /**
   * Reverse counterexample: a path that matches B but not A.
   * Present when isSuperset is false.
   */
  readonly reverseCounterexample?: string

  /**
   * Structured explanation data for generating human-readable descriptions.
   */
  readonly explanation: ContainmentExplanation
}

/**
 * A human-readable description of a set of paths.
 * @public
 */
export interface PatternDescription {
  /** Is this set empty? */
  readonly isEmpty: boolean

  /** Example paths from this set (if non-empty) */
  readonly examples?: readonly string[]

  /** Pattern representation (if expressible as a single pattern) */
  readonly pattern?: string

  /** Natural language description */
  readonly description: string
}

/**
 * Detailed analysis of two patterns' relationship.
 *
 * Provides comprehensive data for understanding how two patterns relate,
 * including the intersection and set differences.
 *
 * @public
 */
export interface PatternAnalysis {
  readonly patternA: string
  readonly patternB: string
  readonly relationship: PatternRelationship

  /** Full containment result with explanation */
  readonly containment: ContainmentResult

  /** Description of paths matching both patterns */
  readonly intersection: PatternDescription

  /** Description of paths matching A but not B */
  readonly aMinusB: PatternDescription

  /** Description of paths matching B but not A */
  readonly bMinusA: PatternDescription
}
