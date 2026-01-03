/**
 * Brace expansion utilities.
 * @packageDocumentation
 */

import type { PathPattern, PatternError } from '../types'
import { parsePattern } from './parser'

/** Default maximum expansion factor */
const DEFAULT_MAX_EXPANSION = 100

/**
 * Expand brace expressions in a pattern, creating multiple patterns.
 *
 * @example
 * expandBraces(parsePattern('{src,lib}/*.ts'))
 * // => [parsePattern('src/*.ts'), parsePattern('lib/*.ts')]
 *
 * @example
 * expandBraces(parsePattern('file{1..3}.txt'))
 * // => [parsePattern('file1.txt'), parsePattern('file2.txt'), parsePattern('file3.txt')]
 *
 * @param pattern - The pattern to expand
 * @param maxExpansion - Maximum number of expanded patterns (default: 100)
 * @returns Array of expanded patterns
 *
 * @public
 */
export function expandBraces(
  pattern: PathPattern,
  maxExpansion: number = DEFAULT_MAX_EXPANSION,
): readonly PathPattern[] {
  // If already has errors, return as-is
  if (pattern.errors && pattern.errors.length > 0) {
    return [pattern]
  }

  // Check if pattern contains braces at all
  if (!pattern.source.includes('{')) {
    return [pattern]
  }

  // Expand the source string
  const expanded = expandBraceString(pattern.source, maxExpansion)

  if (expanded.error) {
    // Add error to pattern and return
    const errorPattern: PathPattern = {
      ...pattern,
      errors: [...(pattern.errors ?? []), expanded.error],
    }
    return [errorPattern]
  }

  // Parse each expanded pattern
  return expanded.patterns.map((src) => parsePattern(src))
}

/**
 * Result of brace expansion on a string.
 */
interface BraceExpansionResult {
  patterns: string[]
  error?: PatternError
}

/**
 * Expand braces in a pattern string.
 */
function expandBraceString(source: string, maxExpansion: number): BraceExpansionResult {
  // Handle negation prefix
  let prefix = ''
  let toExpand = source

  if (source.startsWith('!')) {
    prefix = '!'
    toExpand = source.slice(1)
  }

  const expanded = doExpandBraces(toExpand, maxExpansion)

  if (expanded.error) {
    return expanded
  }

  return {
    patterns: expanded.patterns.map((p) => prefix + p),
  }
}

/**
 * Core brace expansion logic.
 */
function doExpandBraces(pattern: string, maxExpansion: number): BraceExpansionResult {
  // Find first top-level brace
  const braceInfo = findTopLevelBrace(pattern)

  if (!braceInfo) {
    return { patterns: [pattern] }
  }

  const { start, end, content } = braceInfo

  // Check for nested braces
  if (content.includes('{')) {
    return {
      patterns: [pattern],
      error: {
        code: 'NESTED_BRACES',
        message: 'Nested braces are not allowed',
        position: start,
        length: end - start + 1,
      },
    }
  }

  const prefix = pattern.slice(0, start)
  const suffix = pattern.slice(end + 1)

  // Parse brace content
  const alternatives = parseBraceContent(content)

  if (alternatives.error) {
    return {
      patterns: [pattern],
      error: alternatives.error,
    }
  }

  // Check expansion limit before expanding
  if (alternatives.items.length > maxExpansion) {
    return {
      patterns: [pattern],
      error: {
        code: 'EXPANSION_LIMIT',
        message: `Brace expansion exceeds limit of ${maxExpansion}`,
        position: start,
        length: end - start + 1,
      },
    }
  }

  // Expand
  const expanded = alternatives.items.map((item) => prefix + item + suffix)

  // Check total expansion
  if (expanded.length > maxExpansion) {
    return {
      patterns: expanded.slice(0, maxExpansion),
      error: {
        code: 'EXPANSION_LIMIT',
        message: `Brace expansion exceeds limit of ${maxExpansion}`,
        position: start,
        length: end - start + 1,
      },
    }
  }

  // Recursively expand remaining braces
  const allExpanded: string[] = []
  for (const exp of expanded) {
    const recursive = doExpandBraces(exp, maxExpansion - allExpanded.length)
    if (recursive.error) {
      return recursive
    }
    allExpanded.push(...recursive.patterns)
    if (allExpanded.length > maxExpansion) {
      return {
        patterns: allExpanded.slice(0, maxExpansion),
        error: {
          code: 'EXPANSION_LIMIT',
          message: `Total brace expansion exceeds limit of ${maxExpansion}`,
        },
      }
    }
  }

  return { patterns: allExpanded }
}

/**
 * Find the first top-level brace pair.
 */
function findTopLevelBrace(pattern: string): { start: number; end: number; content: string } | null {
  let inBracket = false
  let braceStart = -1
  let depth = 0

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    const prevChar = i > 0 ? pattern[i - 1] : ''

    if (prevChar === '\\') continue

    if (char === '[' && !inBracket) {
      inBracket = true
    } else if (char === ']' && inBracket) {
      inBracket = false
    } else if (char === '{' && !inBracket) {
      if (depth === 0) {
        braceStart = i
      }
      depth++
    } else if (char === '}' && !inBracket && depth > 0) {
      depth--
      if (depth === 0) {
        return {
          start: braceStart,
          end: i,
          content: pattern.slice(braceStart + 1, i),
        }
      }
    }
  }

  return null
}

/**
 * Parse the content inside braces.
 */
function parseBraceContent(content: string): { items: string[]; error?: PatternError } {
  // Check for numeric range
  const rangeMatch = /^(-?\d+)\.\.(-?\d+)$/.exec(content)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)
    const step = start <= end ? 1 : -1
    const count = Math.abs(end - start) + 1

    if (count > 50) {
      return {
        items: [],
        error: {
          code: 'EXPANSION_LIMIT',
          message: `Numeric range {${start}..${end}} exceeds limit of 50 elements`,
        },
      }
    }

    const items: string[] = []
    for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
      items.push(String(n))
    }
    return { items }
  }

  // Split by commas
  const items = splitByComma(content)
  return { items }
}

/**
 * Split content by commas (not inside brackets).
 */
function splitByComma(content: string): string[] {
  const parts: string[] = []
  let current = ''
  let inBracket = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const prevChar = i > 0 ? content[i - 1] : ''

    if (prevChar === '\\') {
      current += char
      continue
    }

    if (char === '[' && !inBracket) {
      inBracket = true
      current += char
    } else if (char === ']' && inBracket) {
      inBracket = false
      current += char
    } else if (char === ',' && !inBracket) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }

  parts.push(current)
  return parts
}

/**
 * Count the number of patterns that would result from expansion.
 * Does not actually expand - useful for limit checking.
 *
 * @param source - Pattern source string
 * @returns Estimated expansion count, or Infinity if it would exceed reasonable limits
 *
 * @public
 */
export function countBraceExpansions(source: string): number {
  let count = 1
  let i = 0
  let inBracket = false
  let braceDepth = 0
  let currentAlternatives = 0

  while (i < source.length) {
    const char = source[i]
    const prevChar = i > 0 ? source[i - 1] : ''

    if (prevChar === '\\') {
      i++
      continue
    }

    if (char === '[' && !inBracket) {
      inBracket = true
    } else if (char === ']' && inBracket) {
      inBracket = false
    } else if (char === '{' && !inBracket) {
      braceDepth++
      if (braceDepth === 1) {
        currentAlternatives = 1
      }
    } else if (char === ',' && braceDepth === 1 && !inBracket) {
      currentAlternatives++
    } else if (char === '}' && !inBracket && braceDepth > 0) {
      braceDepth--
      if (braceDepth === 0) {
        count *= currentAlternatives
        if (count > 10000) {
          return Infinity
        }
      }
    }

    i++
  }

  return count
}
