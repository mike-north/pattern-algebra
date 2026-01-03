/**
 * Segment-level matching utilities.
 * @packageDocumentation
 */

import type { Segment, WildcardSegment, CharClassSegment, CompositeSegment, WildcardPart, SegmentPart } from '../types'

/**
 * Check if a path segment matches a segment pattern.
 *
 * @param segment - The actual path segment (e.g., "file.ts")
 * @param pattern - The pattern segment from AST
 * @returns true if the segment matches
 *
 * @public
 */
export function matchSegment(segment: string, pattern: Segment): boolean {
  switch (pattern.type) {
    case 'literal':
      return segment === pattern.value

    case 'globstar':
      // Globstar matches any single segment (when used as transition)
      return true

    case 'wildcard':
      return matchWildcard(segment, pattern)

    case 'charclass':
      // Single charclass matches a single character segment
      return segment.length === 1 && matchCharClass(segment[0], pattern)

    case 'composite':
      return matchComposite(segment, pattern)
  }
}

/**
 * Match a segment against a wildcard pattern.
 */
function matchWildcard(segment: string, pattern: WildcardSegment): boolean {
  return matchWildcardParts(segment, 0, pattern.parts, 0)
}

/**
 * Recursive wildcard matching with backtracking.
 */
function matchWildcardParts(
  segment: string,
  segPos: number,
  parts: readonly WildcardPart[],
  partIndex: number,
): boolean {
  // Base case: consumed all parts
  if (partIndex >= parts.length) {
    return segPos === segment.length
  }

  const part = parts[partIndex]

  switch (part.type) {
    case 'literal': {
      const literal = part.value
      if (!segment.startsWith(literal, segPos)) {
        return false
      }
      return matchWildcardParts(segment, segPos + literal.length, parts, partIndex + 1)
    }

    case 'question': {
      // Must match exactly one character
      if (segPos >= segment.length) {
        return false
      }
      return matchWildcardParts(segment, segPos + 1, parts, partIndex + 1)
    }

    case 'star': {
      // Star matches zero or more characters - try all possibilities
      // Optimization: if this is the last part, consume everything
      if (partIndex === parts.length - 1) {
        return true
      }

      // Try matching 0, 1, 2, ... characters
      for (let i = segPos; i <= segment.length; i++) {
        if (matchWildcardParts(segment, i, parts, partIndex + 1)) {
          return true
        }
      }
      return false
    }
  }
}

/**
 * Match a character against a character class.
 */
function matchCharClass(char: string, spec: CharClassSegment): boolean {
  let matches = false

  // Check individual characters
  if (spec.chars.includes(char)) {
    matches = true
  }

  // Check ranges
  if (!matches) {
    const code = char.charCodeAt(0)
    for (const range of spec.ranges) {
      if (code >= range.start.charCodeAt(0) && code <= range.end.charCodeAt(0)) {
        matches = true
        break
      }
    }
  }

  // Apply negation
  return spec.negated ? !matches : matches
}

/**
 * Match a segment against a composite pattern.
 */
function matchComposite(segment: string, pattern: CompositeSegment): boolean {
  return matchCompositeParts(segment, 0, pattern.parts, 0)
}

/**
 * Recursive composite matching.
 */
function matchCompositeParts(
  segment: string,
  segPos: number,
  parts: readonly SegmentPart[],
  partIndex: number,
): boolean {
  // Base case: consumed all parts
  if (partIndex >= parts.length) {
    return segPos === segment.length
  }

  const part = parts[partIndex]

  switch (part.type) {
    case 'literal': {
      const literal = part.value
      if (!segment.startsWith(literal, segPos)) {
        return false
      }
      return matchCompositeParts(segment, segPos + literal.length, parts, partIndex + 1)
    }

    case 'question': {
      if (segPos >= segment.length) {
        return false
      }
      return matchCompositeParts(segment, segPos + 1, parts, partIndex + 1)
    }

    case 'star': {
      // If last part, consume everything
      if (partIndex === parts.length - 1) {
        return true
      }

      // Try matching 0, 1, 2, ... characters
      for (let i = segPos; i <= segment.length; i++) {
        if (matchCompositeParts(segment, i, parts, partIndex + 1)) {
          return true
        }
      }
      return false
    }

    case 'charclass': {
      if (segPos >= segment.length) {
        return false
      }
      if (!matchCharClass(segment[segPos], part.spec)) {
        return false
      }
      return matchCompositeParts(segment, segPos + 1, parts, partIndex + 1)
    }
  }
}

/**
 * Build a RegExp from a segment pattern for automaton transitions.
 *
 * @param pattern - Segment pattern
 * @returns RegExp that matches the segment, or null for globstar/literal
 *
 * @public
 */
export function segmentToRegex(pattern: Segment): RegExp | null {
  switch (pattern.type) {
    case 'literal':
      // Literal doesn't need regex - use exact comparison
      return null

    case 'globstar':
      // Globstar matches any segment
      return /^.+$/

    case 'wildcard':
      return wildcardToRegex(pattern)

    case 'charclass':
      return charClassToRegex(pattern)

    case 'composite':
      return compositeToRegex(pattern)
  }
}

/**
 * Convert wildcard pattern to regex.
 */
function wildcardToRegex(pattern: WildcardSegment): RegExp {
  let regexStr = '^'

  for (const part of pattern.parts) {
    switch (part.type) {
      case 'literal':
        regexStr += escapeRegex(part.value)
        break
      case 'star':
        regexStr += '.*'
        break
      case 'question':
        regexStr += '.'
        break
    }
  }

  regexStr += '$'
  return new RegExp(regexStr)
}

/**
 * Convert char class to regex.
 */
function charClassToRegex(spec: CharClassSegment): RegExp {
  let charClass = '['
  if (spec.negated) {
    charClass += '^'
  }

  // Add individual chars (escaped)
  for (const char of spec.chars) {
    charClass += escapeRegexChar(char)
  }

  // Add ranges
  for (const range of spec.ranges) {
    charClass += escapeRegexChar(range.start) + '-' + escapeRegexChar(range.end)
  }

  charClass += ']'
  return new RegExp(`^${charClass}$`)
}

/**
 * Convert composite pattern to regex.
 */
function compositeToRegex(pattern: CompositeSegment): RegExp {
  let regexStr = '^'

  for (const part of pattern.parts) {
    switch (part.type) {
      case 'literal':
        regexStr += escapeRegex(part.value)
        break
      case 'star':
        regexStr += '.*'
        break
      case 'question':
        regexStr += '.'
        break
      case 'charclass': {
        const spec = part.spec
        let charClass = '['
        if (spec.negated) {
          charClass += '^'
        }
        for (const char of spec.chars) {
          charClass += escapeRegexChar(char)
        }
        for (const range of spec.ranges) {
          charClass += escapeRegexChar(range.start) + '-' + escapeRegexChar(range.end)
        }
        charClass += ']'
        regexStr += charClass
        break
      }
    }
  }

  regexStr += '$'
  return new RegExp(regexStr)
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Escape a single character for use in a regex character class.
 */
function escapeRegexChar(char: string): string {
  if ('^-]\\'.includes(char)) {
    return '\\' + char
  }
  return char
}
