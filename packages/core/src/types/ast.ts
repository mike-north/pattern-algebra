import type { PatternError } from './errors'

// =============================================================================
// PATH PATTERN AST
// =============================================================================

/**
 * Root pattern node - the entry point for any parsed pattern.
 * @public
 */
export interface PathPattern {
  /** Original pattern string for error messages and debugging */
  readonly source: string

  /** Parsed structure */
  readonly root: PatternNode

  /** Whether this is an absolute pattern (starts with / or ~) */
  readonly isAbsolute: boolean

  /** Whether this is a negation pattern (starts with !) */
  readonly isNegation: boolean

  /** Validation errors, if any */
  readonly errors?: readonly PatternError[]
}

/**
 * A node in the pattern AST. Patterns are sequences of segments or alternations.
 * @public
 */
export type PatternNode = SegmentSequence | Alternation

/**
 * A sequence of path segments (the most common case).
 *
 * @example
 * "src/**\/*.ts" becomes:
 *   segments: [Literal("src"), Globstar, Wildcard("*.ts")]
 *
 * @public
 */
export interface SegmentSequence {
  readonly type: 'sequence'
  readonly segments: readonly Segment[]
}

/**
 * Brace expansion creates alternation between pattern branches.
 *
 * @example
 * "\{src,lib\}/**\/*.ts" becomes:
 *   Alternation([
 *     SegmentSequence([Literal("src"), Globstar, Wildcard("*.ts")]),
 *     SegmentSequence([Literal("lib"), Globstar, Wildcard("*.ts")])
 *   ])
 *
 * @public
 */
export interface Alternation {
  readonly type: 'alternation'
  readonly branches: readonly PatternNode[]
}

// =============================================================================
// SEGMENT TYPES
// =============================================================================

/**
 * A segment represents one path component between slashes.
 * @public
 */
export type Segment = LiteralSegment | WildcardSegment | GlobstarSegment | CharClassSegment | CompositeSegment

/**
 * An exact literal match for a path segment.
 *
 * @example "package.json" matches only "package.json"
 *
 * @public
 */
export interface LiteralSegment {
  readonly type: 'literal'
  readonly value: string
}

/**
 * A segment containing wildcards (* or ?).
 *
 * Compiles to a regex pattern for the segment.
 *
 * @example
 *   "*.ts" -> parts: [{ type: "star" }, { type: "literal", value: ".ts" }]
 *   "test-*-spec.js" -> complex pattern
 *
 * @public
 */
export interface WildcardSegment {
  readonly type: 'wildcard'

  /** Original pattern text for this segment */
  readonly pattern: string

  /** Components for efficient prefix/suffix matching */
  readonly parts: readonly WildcardPart[]
}

/**
 * A part of a wildcard segment pattern.
 * @public
 */
export type WildcardPart =
  | { readonly type: 'literal'; readonly value: string }
  | { readonly type: 'star' } // * - any characters (zero or more)
  | { readonly type: 'question' } // ? - single character

/**
 * The ** globstar - matches zero or more complete segments.
 * @public
 */
export interface GlobstarSegment {
  readonly type: 'globstar'
}

/**
 * A character class like [a-z] or [!0-9].
 * @public
 */
export interface CharClassSegment {
  readonly type: 'charclass'

  /** Whether this is a negated class (e.g., [!abc] or [^abc]) */
  readonly negated: boolean

  /** Character ranges (e.g., a-z, 0-9) */
  readonly ranges: readonly CharRange[]

  /** Individual characters not in ranges */
  readonly chars: string
}

/**
 * A character range within a character class.
 * @public
 */
export interface CharRange {
  /** Single character - start of range */
  readonly start: string
  /** Single character - end of range */
  readonly end: string
}

/**
 * A segment composed of multiple parts (literal + wildcard + charclass).
 *
 * @example "test-[0-9]*-spec.ts" is a composite of:
 *   - literal "test-"
 *   - charclass [0-9]
 *   - star *
 *   - literal "-spec.ts"
 *
 * @public
 */
export interface CompositeSegment {
  readonly type: 'composite'
  readonly parts: readonly SegmentPart[]
}

/**
 * A part of a composite segment.
 * @public
 */
export type SegmentPart =
  | { readonly type: 'literal'; readonly value: string }
  | { readonly type: 'star' }
  | { readonly type: 'question' }
  | { readonly type: 'charclass'; readonly spec: CharClassSegment }
