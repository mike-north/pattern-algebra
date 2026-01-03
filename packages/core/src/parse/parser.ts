/**
 * Pattern parser - converts glob pattern strings to AST.
 * @packageDocumentation
 */

import type {
  PathPattern,
  PatternNode,
  SegmentSequence,
  Segment,
  CharClassSegment,
  WildcardPart,
  SegmentPart,
  CharRange,
  PatternError,
} from '../types'

/**
 * Parser state for tracking position and errors.
 */
interface ParserState {
  source: string
  position: number
  errors: PatternError[]
}

/**
 * Parse a pattern string into an AST.
 *
 * @param source - The pattern string to parse
 * @returns Parsed PathPattern with AST and any errors
 *
 * @public
 */
export function parsePattern(source: string): PathPattern {
  const state: ParserState = {
    source,
    position: 0,
    errors: [],
  }

  // Handle negation prefix
  let isNegation = false
  let patternToParse = source

  if (source.startsWith('!')) {
    isNegation = true
    patternToParse = source.slice(1)
    state.position = 1
  }

  // Determine if absolute
  const isAbsolute = patternToParse.startsWith('/') || patternToParse.startsWith('~')

  // Check for brace expansion at top level
  const hasBraces = containsTopLevelBraces(patternToParse)

  let root: PatternNode

  if (hasBraces) {
    // Parse as alternation
    const branches = expandBracesOnce(patternToParse, state)
    if (branches.length === 1) {
      root = parseSegmentSequence(branches[0], state)
    } else {
      root = {
        type: 'alternation',
        branches: branches.map((branch) => parseSegmentSequence(branch, state)),
      }
    }
  } else {
    root = parseSegmentSequence(patternToParse, state)
  }

  return {
    source,
    root,
    isAbsolute,
    isNegation,
    errors: state.errors.length > 0 ? state.errors : undefined,
  }
}

/**
 * Check if a pattern contains top-level braces (not nested in brackets).
 */
function containsTopLevelBraces(pattern: string): boolean {
  let inBracket = false
  let braceDepth = 0

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    const prevChar = i > 0 ? pattern[i - 1] : ''

    // Skip escaped characters
    if (prevChar === '\\') continue

    if (char === '[' && !inBracket) {
      inBracket = true
    } else if (char === ']' && inBracket) {
      inBracket = false
    } else if (char === '{' && !inBracket) {
      braceDepth++
    } else if (char === '}' && !inBracket && braceDepth > 0) {
      braceDepth--
    }
  }

  // Check again for actual braces
  braceDepth = 0
  inBracket = false

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    const prevChar = i > 0 ? pattern[i - 1] : ''

    if (prevChar === '\\') continue

    if (char === '[' && !inBracket) {
      inBracket = true
    } else if (char === ']' && inBracket) {
      inBracket = false
    } else if (char === '{' && !inBracket) {
      return true
    }
  }

  return false
}

/**
 * Expand braces one level (non-recursive, nested braces are an error).
 */
function expandBracesOnce(pattern: string, state: ParserState): string[] {
  // Find the first top-level brace
  let inBracket = false
  let braceStart = -1
  let braceEnd = -1
  let braceDepth = 0

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    const prevChar = i > 0 ? pattern[i - 1] : ''

    if (prevChar === '\\') continue

    if (char === '[' && !inBracket) {
      inBracket = true
    } else if (char === ']' && inBracket) {
      inBracket = false
    } else if (char === '{' && !inBracket) {
      if (braceDepth === 0) {
        braceStart = i
      }
      braceDepth++

      // Check for nested braces
      if (braceDepth > 1) {
        state.errors.push({
          code: 'NESTED_BRACES',
          message: 'Nested braces are not allowed',
          position: i,
          length: 1,
        })
        // Continue parsing as if it weren't nested
      }
    } else if (char === '}' && !inBracket) {
      if (braceDepth > 0) {
        braceDepth--
        if (braceDepth === 0) {
          braceEnd = i
          break
        }
      }
    }
  }

  if (braceStart === -1) {
    return [pattern]
  }

  if (braceEnd === -1) {
    state.errors.push({
      code: 'UNCLOSED_BRACE',
      message: 'Unclosed brace in pattern',
      position: braceStart,
      length: 1,
    })
    return [pattern]
  }

  const prefix = pattern.slice(0, braceStart)
  const braceContent = pattern.slice(braceStart + 1, braceEnd)
  const suffix = pattern.slice(braceEnd + 1)

  // Split brace content by commas (not inside nested structures)
  const alternatives = splitByComma(braceContent)

  // Check for numeric range like {1..10}
  if (alternatives.length === 1 && alternatives[0].includes('..')) {
    const rangeMatch = /^(-?\d+)\.\.(-?\d+)$/.exec(alternatives[0])
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10)
      const end = parseInt(rangeMatch[2], 10)
      const step = start <= end ? 1 : -1
      const count = Math.abs(end - start) + 1

      if (count > 50) {
        state.errors.push({
          code: 'EXPANSION_LIMIT',
          message: `Numeric range {${start}..${end}} exceeds limit of 50 elements`,
          position: braceStart,
          length: braceEnd - braceStart + 1,
        })
        // Truncate to 50
        const truncated: string[] = []
        for (let i = 0; i < 50; i++) {
          truncated.push(String(start + i * step))
        }
        return expandBracesOnce(truncated.map((n) => prefix + n + suffix).join('|SPLIT|'), state).flatMap((p) =>
          p.split('|SPLIT|'),
        )
      }

      const expanded: string[] = []
      for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
        expanded.push(prefix + n + suffix)
      }

      // Recursively expand if more braces in suffix
      if (containsTopLevelBraces(suffix)) {
        return expanded.flatMap((p) => expandBracesOnce(p, state))
      }
      return expanded
    }
  }

  // Standard brace expansion
  const expanded = alternatives.map((alt) => prefix + alt + suffix)

  // Recursively expand if more braces
  return expanded.flatMap((p) => {
    if (containsTopLevelBraces(p)) {
      return expandBracesOnce(p, state)
    }
    return [p]
  })
}

/**
 * Split a string by top-level commas.
 */
function splitByComma(content: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
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
    } else if (char === '{' && !inBracket) {
      depth++
      current += char
    } else if (char === '}' && !inBracket && depth > 0) {
      depth--
      current += char
    } else if (char === ',' && depth === 0 && !inBracket) {
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
 * Parse a segment sequence (path split by /).
 */
function parseSegmentSequence(pattern: string, state: ParserState): SegmentSequence {
  // Remove leading / for absolute paths (we track absoluteness separately)
  let toParse = pattern
  if (toParse.startsWith('/')) {
    toParse = toParse.slice(1)
  } else if (toParse.startsWith('~/')) {
    toParse = toParse.slice(2)
  } else if (toParse === '~') {
    toParse = ''
  }

  if (toParse === '') {
    return { type: 'sequence', segments: [] }
  }

  // Split by / but not inside brackets
  const segmentStrings = splitBySlash(toParse)
  const segments: Segment[] = segmentStrings.map((seg) => parseSegment(seg, state))

  return { type: 'sequence', segments }
}

/**
 * Split pattern by forward slashes (not inside brackets).
 */
function splitBySlash(pattern: string): string[] {
  const parts: string[] = []
  let current = ''
  let inBracket = false

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    const prevChar = i > 0 ? pattern[i - 1] : ''

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
    } else if (char === '/' && !inBracket) {
      if (current !== '') {
        parts.push(current)
      }
      current = ''
    } else {
      current += char
    }
  }

  if (current !== '') {
    parts.push(current)
  }

  return parts
}

/**
 * Check if a segment contains unescaped special characters.
 */
function hasUnescapedSpecial(segment: string, chars: string): boolean {
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]
    // Skip escaped characters
    if (char === '\\' && i + 1 < segment.length) {
      i++ // Skip next character
      continue
    }
    if (chars.includes(char)) {
      return true
    }
  }
  return false
}

/**
 * Parse a single segment string into a Segment node.
 */
function parseSegment(segment: string, state: ParserState): Segment {
  // Check for globstar
  if (segment === '**') {
    return { type: 'globstar' }
  }

  // Check for invalid globstar usage (unescaped **)
  if (hasUnescapedSpecial(segment, '*') && segment !== '**') {
    // Check if there's an actual ** sequence (not escaped)
    for (let i = 0; i < segment.length - 1; i++) {
      if (segment[i] === '\\') {
        i++ // Skip escaped char
        continue
      }
      if (segment[i] === '*' && segment[i + 1] === '*') {
        state.errors.push({
          code: 'INVALID_GLOBSTAR',
          message: '** must be a complete path segment, not part of a larger pattern',
          position: state.source.indexOf(segment),
          length: segment.length,
        })
        break
      }
    }
  }

  // Analyze segment content - check for UNESCAPED special chars
  const hasWildcard = hasUnescapedSpecial(segment, '*?')
  const hasBracket = hasUnescapedSpecial(segment, '[')

  // Pure literal (no unescaped wildcards or brackets)
  if (!hasWildcard && !hasBracket) {
    return {
      type: 'literal',
      value: unescapeSegment(segment),
    }
  }

  // Parse into parts
  const parts = parseSegmentParts(segment, state)

  // If only wildcards (no charclass), use WildcardSegment
  if (!hasBracket) {
    const wildcardParts: WildcardPart[] = parts.map((p) => {
      if (p.type === 'literal') return { type: 'literal', value: p.value }
      if (p.type === 'star') return { type: 'star' }
      if (p.type === 'question') return { type: 'question' }
      // Should not happen for non-bracket segments
      throw new Error(`Unexpected part type: ${p.type}`)
    })

    return {
      type: 'wildcard',
      pattern: segment,
      parts: wildcardParts,
    }
  }

  // Has character classes - use CompositeSegment
  return {
    type: 'composite',
    parts,
  }
}

/**
 * Parse segment into component parts (literals, wildcards, charclasses).
 */
function parseSegmentParts(segment: string, state: ParserState): SegmentPart[] {
  const parts: SegmentPart[] = []
  let i = 0
  let literalBuffer = ''

  const flushLiteral = () => {
    if (literalBuffer !== '') {
      parts.push({ type: 'literal', value: literalBuffer })
      literalBuffer = ''
    }
  }

  while (i < segment.length) {
    const char = segment[i]

    // Handle escapes
    if (char === '\\' && i + 1 < segment.length) {
      literalBuffer += segment[i + 1]
      i += 2
      continue
    }

    if (char === '*') {
      flushLiteral()
      parts.push({ type: 'star' })
      i++
    } else if (char === '?') {
      flushLiteral()
      parts.push({ type: 'question' })
      i++
    } else if (char === '[') {
      flushLiteral()
      const { charclass, endIndex } = parseCharClass(segment, i, state)
      parts.push({ type: 'charclass', spec: charclass })
      i = endIndex
    } else {
      literalBuffer += char
      i++
    }
  }

  flushLiteral()
  return parts
}

/**
 * Parse a character class [abc] or [a-z] or [!...].
 */
function parseCharClass(
  segment: string,
  startIndex: number,
  state: ParserState,
): { charclass: CharClassSegment; endIndex: number } {
  let i = startIndex + 1 // Skip opening [
  let negated = false
  const ranges: CharRange[] = []
  let chars = ''

  // Check for negation
  if (i < segment.length && (segment[i] === '!' || segment[i] === '^')) {
    negated = true
    i++
  }

  // Handle ] as first char (literal)
  if (i < segment.length && segment[i] === ']') {
    chars += ']'
    i++
  }

  while (i < segment.length) {
    const char = segment[i]

    if (char === ']') {
      // End of character class
      if (chars === '' && ranges.length === 0) {
        state.errors.push({
          code: 'EMPTY_CHARCLASS',
          message: 'Empty character class',
          position: startIndex,
          length: i - startIndex + 1,
        })
      }

      return {
        charclass: { type: 'charclass', negated, ranges, chars },
        endIndex: i + 1,
      }
    }

    if (char === '\\' && i + 1 < segment.length) {
      // Escaped character
      chars += segment[i + 1]
      i += 2
      continue
    }

    // Check for range
    if (i + 2 < segment.length && segment[i + 1] === '-' && segment[i + 2] !== ']') {
      const start = char
      const end = segment[i + 2]

      // Validate range
      if (start.charCodeAt(0) > end.charCodeAt(0)) {
        state.errors.push({
          code: 'INVALID_RANGE',
          message: `Invalid range [${start}-${end}]: start > end`,
          position: startIndex + i,
          length: 3,
        })
      }

      ranges.push({ start, end })
      i += 3
    } else {
      chars += char
      i++
    }
  }

  // Unclosed bracket
  state.errors.push({
    code: 'UNCLOSED_BRACKET',
    message: 'Unclosed character class',
    position: startIndex,
    length: segment.length - startIndex,
  })

  return {
    charclass: { type: 'charclass', negated, ranges, chars },
    endIndex: segment.length,
  }
}

/**
 * Unescape a literal segment (remove backslashes).
 */
function unescapeSegment(segment: string): string {
  let result = ''
  let i = 0

  while (i < segment.length) {
    if (segment[i] === '\\' && i + 1 < segment.length) {
      result += segment[i + 1]
      i += 2
    } else {
      result += segment[i]
      i++
    }
  }

  return result
}
