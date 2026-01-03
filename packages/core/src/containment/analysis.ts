/**
 * Pattern analysis utilities.
 * @packageDocumentation
 */

import type {
  CompiledPattern,
  PatternAnalysis,
  PatternDescription,
  PatternRelationship,
  SegmentSequence,
  Segment,
} from '../types'
import { checkContainment } from './containment'
import { matchPath } from '../match/matcher'

/**
 * Analyze the relationship between two patterns in detail.
 *
 * Provides comprehensive information about how patterns relate,
 * including the intersection and set differences.
 *
 * @param a - First compiled pattern
 * @param b - Second compiled pattern
 * @returns Full analysis of pattern relationship
 *
 * @public
 */
export function analyzePatterns(a: CompiledPattern, b: CompiledPattern): PatternAnalysis {
  const containment = checkContainment(a, b)

  const intersection = describeIntersection(a, b)
  const aMinusB = describeSetDifference(a, b, 'A-B')
  const bMinusA = describeSetDifference(a, b, 'B-A')

  return {
    patternA: a.source,
    patternB: b.source,
    relationship: containment.relationship,
    containment,
    intersection,
    aMinusB,
    bMinusA,
  }
}

/**
 * Describe the intersection of two patterns.
 */
function describeIntersection(a: CompiledPattern, b: CompiledPattern): PatternDescription {
  // Generate test paths from both patterns and find common matches
  const examples: string[] = []
  const aPaths = generateTestPaths(a, 15)
  const bPaths = generateTestPaths(b, 15)

  // Check A paths that also match B
  for (const path of aPaths) {
    if (matchPath(path, b) && !examples.includes(path)) {
      examples.push(path)
      if (examples.length >= 3) break
    }
  }

  // Check B paths that also match A
  for (const path of bPaths) {
    if (matchPath(path, a) && !examples.includes(path)) {
      examples.push(path)
      if (examples.length >= 3) break
    }
  }

  // Try combined paths if no overlap found yet
  if (examples.length === 0) {
    const combinedPaths = generateCombinedPaths(a, b, 15)
    for (const path of combinedPaths) {
      if (matchPath(path, a) && matchPath(path, b) && !examples.includes(path)) {
        examples.push(path)
        if (examples.length >= 3) break
      }
    }
  }

  if (examples.length === 0) {
    return {
      isEmpty: true,
      description: 'The patterns have no paths in common',
    }
  }

  // Try to describe the intersection pattern
  const pattern = describeIntersectionPattern(a, b)

  return {
    isEmpty: false,
    examples,
    pattern,
    description: pattern
      ? `Paths matching both patterns: ${pattern}`
      : `Paths that match both "${a.source}" and "${b.source}"`,
  }
}

/**
 * Describe the set difference between patterns.
 */
function describeSetDifference(a: CompiledPattern, b: CompiledPattern, direction: 'A-B' | 'B-A'): PatternDescription {
  const [first, second] = direction === 'A-B' ? [a, b] : [b, a]

  // Generate paths from the first pattern that don't match the second
  const examples: string[] = []
  const firstPaths = generateTestPaths(first, 20)

  for (const path of firstPaths) {
    if (!matchPath(path, second) && !examples.includes(path)) {
      examples.push(path)
      if (examples.length >= 3) break
    }
  }

  if (examples.length === 0) {
    return {
      isEmpty: true,
      description:
        direction === 'A-B'
          ? `All paths matching "${a.source}" also match "${b.source}"`
          : `All paths matching "${b.source}" also match "${a.source}"`,
    }
  }

  return {
    isEmpty: false,
    examples,
    description:
      direction === 'A-B'
        ? `Paths matching "${a.source}" but not "${b.source}"`
        : `Paths matching "${b.source}" but not "${a.source}"`,
  }
}

/**
 * Try to describe the intersection as a pattern.
 */
function describeIntersectionPattern(a: CompiledPattern, b: CompiledPattern): string | undefined {
  // Special cases where we can compute an explicit pattern

  // If one is a subset of the other, the intersection is the smaller one
  const aPrefix = a.quickReject.requiredPrefix
  const bPrefix = b.quickReject.requiredPrefix

  if (aPrefix && bPrefix) {
    // Both have prefixes - intersection might be expressible
    if (aPrefix.startsWith(bPrefix)) {
      return a.source // A is more specific
    }
    if (bPrefix.startsWith(aPrefix)) {
      return b.source // B is more specific
    }
  }

  // For simple cases, return undefined (too complex to express)
  return undefined
}

/**
 * Determine if two patterns are equivalent (match the same set of paths).
 *
 * @param a - First pattern
 * @param b - Second pattern
 * @returns true if patterns are equivalent
 *
 * @public
 */
export function areEquivalent(a: CompiledPattern, b: CompiledPattern): boolean {
  const result = checkContainment(a, b)
  return result.isEqual
}

/**
 * Determine if two patterns have any overlap.
 *
 * @param a - First pattern
 * @param b - Second pattern
 * @returns true if there exists a path matching both patterns
 *
 * @public
 */
export function hasOverlap(a: CompiledPattern, b: CompiledPattern): boolean {
  // Generate paths from A and check if any match B
  const aPaths = generateTestPaths(a, 15)
  for (const path of aPaths) {
    if (matchPath(path, b)) {
      return true
    }
  }

  // Generate paths from B and check if any match A
  const bPaths = generateTestPaths(b, 15)
  for (const path of bPaths) {
    if (matchPath(path, a)) {
      return true
    }
  }

  // Try to generate paths that combine constraints from both patterns
  const combinedPaths = generateCombinedPaths(a, b, 15)
  for (const path of combinedPaths) {
    if (matchPath(path, a) && matchPath(path, b)) {
      return true
    }
  }

  return false
}

/**
 * Generate paths that might match both patterns by combining their constraints.
 */
function generateCombinedPaths(a: CompiledPattern, b: CompiledPattern, count: number): string[] {
  const paths: string[] = []

  // Extract constraints from both patterns, removing leading slashes
  const aPrefix = a.quickReject.requiredPrefix?.replace(/^\//, '') ?? ''
  const bPrefix = b.quickReject.requiredPrefix?.replace(/^\//, '') ?? ''
  const aSuffix = a.quickReject.requiredSuffix?.replace(/^\//, '') ?? ''
  const bSuffix = b.quickReject.requiredSuffix?.replace(/^\//, '') ?? ''

  // Extract file extensions and base names from suffixes
  const extractFileInfo = (suffix: string): { basename: string; ext: string } => {
    if (!suffix) return { basename: '', ext: '' }
    const lastDot = suffix.lastIndexOf('.')
    if (lastDot > 0) {
      return { basename: suffix.slice(0, lastDot), ext: suffix.slice(lastDot) }
    }
    return { basename: suffix, ext: '' }
  }

  // Build candidate paths
  const prefixes = [aPrefix, bPrefix].filter(Boolean)
  if (prefixes.length === 0) prefixes.push('')

  // If we have suffixes like "index.ts", extract the components
  const suffixInfoA = extractFileInfo(aSuffix)
  const suffixInfoB = extractFileInfo(bSuffix)

  // File basenames to try
  const basenames = [suffixInfoA.basename || 'index', suffixInfoB.basename || 'index', 'file', 'test'].filter(Boolean)

  // Extensions to try
  const extensions = [suffixInfoA.ext, suffixInfoB.ext, '.ts', '.js'].filter(Boolean)

  for (const prefix of prefixes) {
    for (const basename of basenames) {
      for (const ext of extensions) {
        // Build path: /prefix/basename.ext
        const filename = basename + ext
        const path = prefix ? `/${prefix}/${filename}` : `/${filename}`

        if (!paths.includes(path)) {
          paths.push(path)
        }

        // Also try with subdirectory
        if (prefix) {
          const deepPath = `/${prefix}/sub/${filename}`
          if (!paths.includes(deepPath)) {
            paths.push(deepPath)
          }
        }

        if (paths.length >= count) break
      }
      if (paths.length >= count) break
    }
    if (paths.length >= count) break
  }

  return paths.slice(0, count)
}

/**
 * Determine if two patterns are disjoint (no common paths).
 *
 * @param a - First pattern
 * @param b - Second pattern
 * @returns true if patterns have no paths in common
 *
 * @public
 */
export function areDisjoint(a: CompiledPattern, b: CompiledPattern): boolean {
  return !hasOverlap(a, b)
}

/**
 * Get a human-readable summary of the relationship between patterns.
 *
 * @param relationship - The pattern relationship
 * @param patternA - Source of pattern A
 * @param patternB - Source of pattern B
 * @returns Human-readable description
 *
 * @public
 */
export function summarizeRelationship(relationship: PatternRelationship, patternA: string, patternB: string): string {
  switch (relationship) {
    case 'equal':
      return `"${patternA}" and "${patternB}" match exactly the same paths`

    case 'subset':
      return `"${patternA}" is contained within "${patternB}" (every path matching A also matches B)`

    case 'superset':
      return `"${patternA}" contains "${patternB}" (every path matching B also matches A)`

    case 'overlapping':
      return `"${patternA}" and "${patternB}" have some paths in common, but neither contains the other`

    case 'disjoint':
      return `"${patternA}" and "${patternB}" have no paths in common`
  }
}

/**
 * Generate test paths that match a pattern.
 */
function generateTestPaths(pattern: CompiledPattern, count: number): string[] {
  const paths: string[] = []
  const ast = pattern.ast

  if (ast.root.type === 'alternation') {
    // Generate paths for each branch
    for (const branch of ast.root.branches) {
      paths.push(...generatePathsFromSequence(branch as SegmentSequence, Math.ceil(count / ast.root.branches.length)))
    }
  } else {
    paths.push(...generatePathsFromSequence(ast.root, count))
  }

  return paths.slice(0, count)
}

/**
 * Generate paths from a segment sequence.
 */
function generatePathsFromSequence(sequence: SegmentSequence, count: number): string[] {
  const paths: string[] = []

  // Generate base path
  const basePath = generateBasePath(sequence.segments)
  paths.push(basePath)

  // Generate variations
  for (let i = 1; i < count && paths.length < count; i++) {
    const variation = generatePathVariation(sequence.segments, i)
    if (variation && !paths.includes(variation)) {
      paths.push(variation)
    }
  }

  return paths
}

/**
 * Generate a base path from segments.
 */
function generateBasePath(segments: readonly Segment[]): string {
  const parts: string[] = []

  for (const segment of segments) {
    parts.push(generateSegmentValue(segment, 0))
  }

  return '/' + parts.join('/')
}

/**
 * Generate a path variation.
 */
function generatePathVariation(segments: readonly Segment[], variationIndex: number): string {
  const parts: string[] = []
  let usedVariation = false

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.type === 'globstar' && !usedVariation) {
      // For globstar, always add at least one segment (globstar requires at least 1)
      // Then optionally add more based on variation
      const extraCount = 1 + (variationIndex % 3)
      for (let j = 0; j < extraCount; j++) {
        parts.push(`dir${j}`)
      }
      usedVariation = true
    } else {
      parts.push(generateSegmentValue(segment, usedVariation ? 0 : variationIndex))
    }
  }

  return '/' + parts.join('/')
}

/**
 * Generate a value that matches a segment pattern.
 */
function generateSegmentValue(segment: Segment, variation: number): string {
  switch (segment.type) {
    case 'literal':
      return segment.value

    case 'globstar':
      return 'subdir'

    case 'wildcard': {
      // Generate based on pattern
      const pattern = segment.pattern
      if (pattern.endsWith('.ts')) {
        return `file${variation}.ts`
      }
      if (pattern.endsWith('.js')) {
        return `file${variation}.js`
      }
      if (pattern.startsWith('test-')) {
        return `test-${variation}`
      }
      return `match${variation}`
    }

    case 'charclass':
      // Pick a character from the class
      if (segment.ranges.length > 0) {
        const range = segment.ranges[0]
        return range.start
      }
      return segment.chars[0] || 'x'

    case 'composite':
      return `composite${variation}`
  }
}
