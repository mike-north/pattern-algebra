/**
 * Quick-reject filter construction.
 * @packageDocumentation
 */

import type { PathPattern, SegmentSequence, Segment, QuickRejectFilter } from '../types'

/**
 * Build quick-reject filters for a pattern.
 *
 * Quick-reject filters enable fast elimination of non-matching paths
 * before full automaton simulation.
 *
 * @param pattern - Pattern AST
 * @returns Quick-reject filter configuration
 *
 * @public
 */
export function buildQuickRejectFilter(pattern: PathPattern): QuickRejectFilter {
  // Extract from sequence (alternations are more complex)
  if (pattern.root.type === 'sequence') {
    return extractSequenceFilters(pattern.root)
  }

  return {}
}

/**
 * Extract filters from a segment sequence.
 */
function extractSequenceFilters(sequence: SegmentSequence): QuickRejectFilter {
  const segments = sequence.segments

  // Required prefix: leading literal segments before any wildcard
  const prefixParts: string[] = []
  for (const segment of segments) {
    if (segment.type === 'literal') {
      prefixParts.push(segment.value)
    } else {
      break
    }
  }
  const requiredPrefix = prefixParts.length > 0 ? '/' + prefixParts.join('/') : undefined

  // Required suffix: trailing literal segments after last wildcard
  const suffixParts: string[] = []
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]
    if (segment.type === 'literal') {
      suffixParts.unshift(segment.value)
    } else {
      break
    }
  }
  // Only use suffix if it doesn't overlap with prefix
  const requiredSuffix =
    suffixParts.length > 0 && suffixParts.length < segments.length ? '/' + suffixParts.join('/') : undefined

  // Required literals: any literal segment that must appear
  const literals: string[] = []
  for (const segment of segments) {
    if (segment.type === 'literal') {
      literals.push(segment.value)
    }
  }
  const requiredLiterals = literals.length > 0 ? literals : undefined

  // Minimum length: sum of minimum segment lengths
  let minLengthValue = 0
  for (const segment of segments) {
    minLengthValue += getSegmentMinLength(segment)
    minLengthValue += 1 // For the separator (/)
  }
  const minLength = minLengthValue > 1 ? minLengthValue : undefined

  return {
    requiredPrefix,
    requiredSuffix,
    requiredLiterals,
    minLength,
  }
}

/**
 * Get minimum character length for a segment.
 */
function getSegmentMinLength(segment: Segment): number {
  switch (segment.type) {
    case 'literal':
      return segment.value.length

    case 'globstar':
      return 0 // Globstar can match zero characters

    case 'wildcard': {
      // Count required characters
      let min = 0
      for (const part of segment.parts) {
        if (part.type === 'literal') {
          min += part.value.length
        } else if (part.type === 'question') {
          min += 1
        }
        // star contributes 0
      }
      return min
    }

    case 'charclass':
      return 1 // Single character

    case 'composite': {
      let min = 0
      for (const part of segment.parts) {
        if (part.type === 'literal') {
          min += part.value.length
        } else if (part.type === 'question' || part.type === 'charclass') {
          min += 1
        }
        // star contributes 0
      }
      return min
    }
  }
}

/**
 * Apply quick-reject filter to a path.
 *
 * @param path - Normalized path to check
 * @param filter - Quick-reject filter
 * @returns false if path definitely doesn't match, true if it might match
 *
 * @public
 */
export function applyQuickReject(path: string, filter: QuickRejectFilter): boolean {
  // Check minimum length
  if (filter.minLength !== undefined && path.length < filter.minLength) {
    return false
  }

  // Check required prefix
  if (filter.requiredPrefix !== undefined && !path.startsWith(filter.requiredPrefix)) {
    return false
  }

  // Check required suffix
  if (filter.requiredSuffix !== undefined && !path.endsWith(filter.requiredSuffix)) {
    return false
  }

  // Check required literals (must appear as segments)
  if (filter.requiredLiterals !== undefined) {
    const segments = path.split('/')
    for (const required of filter.requiredLiterals) {
      if (!segments.includes(required)) {
        return false
      }
    }
  }

  return true
}
