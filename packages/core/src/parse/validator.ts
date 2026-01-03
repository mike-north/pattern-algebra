/**
 * Pattern validation - checks for banned features and structural issues.
 * @packageDocumentation
 */

import type { PathPattern, PatternNode, Segment, PatternError } from '../types'

/**
 * Validate a pattern against the allowed feature set.
 *
 * Returns errors for:
 * - Patterns that already have errors from parsing
 * - Invalid globstar usage
 * - Empty patterns
 * - Other structural issues
 *
 * @param pattern - The parsed pattern to validate
 * @returns Array of validation errors (empty if valid)
 *
 * @public
 */
export function validatePattern(pattern: PathPattern): readonly PatternError[] {
  const errors: PatternError[] = []

  // Include any parsing errors
  if (pattern.errors) {
    errors.push(...pattern.errors)
  }

  // Validate the AST structure
  validateNode(pattern.root, pattern.source, errors)

  return errors
}

/**
 * Recursively validate a pattern node.
 */
function validateNode(node: PatternNode, source: string, errors: PatternError[]): void {
  if (node.type === 'sequence') {
    validateSequence(node.segments, source, errors)
  } else if (node.type === 'alternation') {
    for (const branch of node.branches) {
      validateNode(branch, source, errors)
    }
  }
}

/**
 * Validate a sequence of segments.
 */
function validateSequence(segments: readonly Segment[], source: string, errors: PatternError[]): void {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    validateSegment(segment, source, errors)

    // Check for consecutive globstars (redundant but allowed)
    // This is a warning, not an error, so we don't add it
  }
}

/**
 * Validate a single segment.
 */
function validateSegment(segment: Segment, source: string, errors: PatternError[]): void {
  switch (segment.type) {
    case 'literal':
      // Literals are always valid
      break

    case 'globstar':
      // Globstars are valid (** as complete segment)
      break

    case 'wildcard':
      // Check for embedded ** (should have been caught by parser)
      if (segment.pattern.includes('**')) {
        const pos = source.indexOf(segment.pattern)
        errors.push({
          code: 'INVALID_GLOBSTAR',
          message: '** must be a complete path segment',
          position: pos >= 0 ? pos : undefined,
          length: segment.pattern.length,
        })
      }
      break

    case 'charclass':
      // Validate character class
      if (segment.chars === '' && segment.ranges.length === 0) {
        errors.push({
          code: 'EMPTY_CHARCLASS',
          message: 'Empty character class',
        })
      }

      // Validate ranges
      for (const range of segment.ranges) {
        if (range.start.charCodeAt(0) > range.end.charCodeAt(0)) {
          errors.push({
            code: 'INVALID_RANGE',
            message: `Invalid range [${range.start}-${range.end}]: start > end`,
          })
        }
      }
      break

    case 'composite':
      // Validate each part
      for (const part of segment.parts) {
        if (part.type === 'charclass') {
          validateSegment(part.spec, source, errors)
        }
      }
      break
  }
}

/**
 * Check if a pattern is valid (has no errors).
 *
 * @param pattern - The pattern to check
 * @returns true if the pattern has no errors
 *
 * @public
 */
export function isValidPattern(pattern: PathPattern): boolean {
  return validatePattern(pattern).length === 0
}
