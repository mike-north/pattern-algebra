/**
 * Error codes for pattern validation failures.
 * @public
 */
export type PatternErrorCode =
  | 'INVALID_GLOBSTAR' // ** not as complete segment
  | 'UNCLOSED_BRACKET' // [abc without ]
  | 'UNCLOSED_BRACE' // {a,b without }
  | 'EMPTY_CHARCLASS' // []
  | 'INVALID_RANGE' // [z-a] (reversed)
  | 'EXPANSION_LIMIT' // Too many brace expansions
  | 'NESTED_BRACES' // {a,{b,c}} not allowed
  | 'INVALID_ESCAPE' // Bad escape sequence
  | 'BANNED_FEATURE' // Attempted to use banned regex feature
  | 'INVALID_REGEX' // Malformed regex pattern
  | 'UNSAFE_REGEX' // ReDoS-vulnerable regex
  | 'DFA_STATE_LIMIT' // DFA construction exceeded state limit

/**
 * A pattern validation error with location information.
 * @public
 */
export interface PatternError {
  /** Error classification code */
  readonly code: PatternErrorCode

  /** Human-readable error description */
  readonly message: string

  /** Character position in source where error starts */
  readonly position?: number

  /** Length of the problematic section */
  readonly length?: number
}

/**
 * Error thrown when automaton operations exceed configured limits.
 *
 * This typically occurs during DFA construction when a pattern
 * would result in exponential state explosion.
 *
 * @public
 */
export class AutomatonLimitError extends Error {
  /** Error classification code */
  readonly code: PatternErrorCode

  /** The limit that was exceeded */
  readonly limit: number

  /** The actual value that exceeded the limit */
  readonly actual: number

  constructor(code: PatternErrorCode, message: string, limit: number, actual: number) {
    super(message)
    this.name = 'AutomatonLimitError'
    this.code = code
    this.limit = limit
    this.actual = actual
  }
}
