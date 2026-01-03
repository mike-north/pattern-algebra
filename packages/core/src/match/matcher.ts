/**
 * Path matching - matches paths against compiled patterns.
 * @packageDocumentation
 */

import type { CompiledPattern, SegmentAutomaton, AutomatonTransition, PathPattern } from '../types'
import { pathToSegments, normalizePath, type PathContext } from './path-utils'
import { applyQuickReject } from '../compile/quick-reject'
import { matchSegment } from './segment-matcher'

/**
 * Test if a path matches a compiled pattern.
 *
 * @param path - Absolute, normalized path (e.g., "/home/user/dev/foo.ts")
 * @param pattern - Compiled pattern
 * @returns true if path matches
 *
 * @public
 */
export function matchPath(path: string, pattern: CompiledPattern): boolean {
  // Match against the underlying pattern (ignoring negation for now)
  const matches = matchPathUnderlying(path, pattern)

  // Apply negation
  return pattern.ast.isNegation ? !matches : matches
}

/**
 * Match against the underlying pattern (without negation).
 */
function matchPathUnderlying(path: string, pattern: CompiledPattern): boolean {
  // Quick-reject filter
  if (!applyQuickReject(path, pattern.quickReject)) {
    return false
  }

  // Split into segments
  const segments = pathToSegments(path)

  // Check segment count bounds
  if (segments.length < pattern.minSegments) {
    return false
  }
  if (pattern.maxSegments !== undefined && segments.length > pattern.maxSegments) {
    return false
  }

  return simulateNFA(pattern.automaton, segments)
}

/**
 * Match a path with context (for ~ expansion and relative paths).
 *
 * @param path - Path to match (may be relative or contain ~)
 * @param pattern - Compiled pattern
 * @param context - Path context for normalization
 * @returns true if normalized path matches
 *
 * @public
 */
export function matchPathWithContext(path: string, pattern: CompiledPattern, context: PathContext): boolean {
  const normalized = normalizePath(path, context)
  return matchPath(normalized, pattern)
}

/**
 * Simulate NFA on path segments.
 *
 * Uses set-based simulation to handle non-determinism.
 * For deterministic automata, prefers literal transitions over wildcards
 * to correctly handle complement operations.
 */
function simulateNFA(automaton: SegmentAutomaton, segments: readonly string[]): boolean {
  // Start with epsilon closure of initial state
  let currentStates = epsilonClosure(automaton, new Set([automaton.initialState]))

  // Process each segment
  for (const segment of segments) {
    const nextStates = new Set<number>()

    for (const stateId of currentStates) {
      const state = automaton.states[stateId]

      // For DFAs (used in complement), prefer literal transitions over wildcards
      // This ensures complement works correctly when we have catch-all wildcards
      if (automaton.isDeterministic) {
        const target = getDeterministicTarget(state.transitions, segment)
        if (target !== null) {
          nextStates.add(target)
        }
      } else {
        // NFA: explore all matching transitions
        for (const transition of state.transitions) {
          if (matchTransition(transition, segment)) {
            const target = getTransitionTarget(transition, segment)
            if (target !== null) {
              nextStates.add(target)
            }
          }
        }
      }
    }

    // Compute epsilon closure of next states
    currentStates = epsilonClosure(automaton, nextStates)

    if (currentStates.size === 0) {
      return false // No valid states - no match possible
    }
  }

  // Check if any current state is accepting
  for (const stateId of currentStates) {
    if (automaton.states[stateId].accepting) {
      return true
    }
  }

  return false
}

/**
 * Get the deterministic target state for a segment.
 * Prefers literal matches over wildcard matches.
 */
function getDeterministicTarget(transitions: readonly AutomatonTransition[], segment: string): number | null {
  // First, try literal match (highest priority)
  for (const transition of transitions) {
    if (transition.type === 'literal' && transition.segment === segment) {
      return transition.target
    }
  }

  // Then, try wildcard match
  for (const transition of transitions) {
    if (transition.type === 'wildcard' && transition.pattern.test(segment)) {
      return transition.target
    }
  }

  // Then, try globstar
  for (const transition of transitions) {
    if (transition.type === 'globstar') {
      return transition.selfLoop
    }
  }

  return null
}

/**
 * Compute epsilon closure of a set of states.
 *
 * Includes all states reachable via epsilon transitions and globstar "exit" transitions.
 */
function epsilonClosure(automaton: SegmentAutomaton, states: Set<number>): Set<number> {
  const closure = new Set(states)
  const worklist = [...states]

  while (worklist.length > 0) {
    const stateId = worklist.pop()!
    const state = automaton.states[stateId]

    for (const transition of state.transitions) {
      if (transition.type === 'epsilon') {
        if (!closure.has(transition.target)) {
          closure.add(transition.target)
          worklist.push(transition.target)
        }
      } else if (transition.type === 'globstar') {
        // Globstar can exit without consuming (epsilon to exit state)
        if (!closure.has(transition.exit)) {
          closure.add(transition.exit)
          worklist.push(transition.exit)
        }
      }
    }
  }

  return closure
}

/**
 * Check if a transition matches a segment.
 */
function matchTransition(transition: AutomatonTransition, segment: string): boolean {
  switch (transition.type) {
    case 'literal':
      return transition.segment === segment

    case 'wildcard':
      return transition.pattern.test(segment)

    case 'globstar':
      // Globstar always matches (can consume any segment)
      return true

    case 'epsilon':
      // Epsilon transitions don't consume input
      return false
  }
}

/**
 * Get the target state for a transition after consuming a segment.
 */
function getTransitionTarget(transition: AutomatonTransition, _segment: string): number | null {
  switch (transition.type) {
    case 'literal':
    case 'wildcard':
      return transition.target

    case 'globstar':
      // Globstar stays in self-loop when consuming
      return transition.selfLoop

    case 'epsilon':
      return null // Epsilon doesn't consume
  }
}

/**
 * Match a path against a pattern AST directly (without compilation).
 *
 * This is less efficient than using compiled patterns but useful for one-off matching.
 *
 * @param path - Normalized path
 * @param pattern - Pattern AST
 * @returns true if path matches
 *
 * @public
 */
export function matchPathDirect(path: string, pattern: PathPattern): boolean {
  const segments = pathToSegments(path)
  return matchPatternNode(segments, 0, pattern.root) !== null
}

/**
 * Recursive pattern matching on segments.
 * Returns the number of segments consumed, or null if no match.
 */
function matchPatternNode(
  segments: readonly string[],
  startIndex: number,
  node: import('../types').PatternNode,
): number | null {
  if (node.type === 'sequence') {
    return matchSequence(segments, startIndex, node.segments)
  } else {
    // Alternation: try each branch
    for (const branch of node.branches) {
      const result = matchPatternNode(segments, startIndex, branch)
      if (result !== null) {
        return result
      }
    }
    return null
  }
}

/**
 * Match a sequence of segment patterns.
 */
function matchSequence(
  segments: readonly string[],
  startIndex: number,
  patterns: readonly import('../types').Segment[],
): number | null {
  return matchSequenceRecursive(segments, startIndex, patterns, 0)
}

function matchSequenceRecursive(
  segments: readonly string[],
  segIndex: number,
  patterns: readonly import('../types').Segment[],
  patIndex: number,
): number | null {
  // Base case: consumed all patterns
  if (patIndex >= patterns.length) {
    return segIndex // Must have consumed all segments for full match
  }

  const pattern = patterns[patIndex]

  if (pattern.type === 'globstar') {
    // Globstar: try consuming 0, 1, 2, ... segments
    for (let consume = 0; consume <= segments.length - segIndex; consume++) {
      const result = matchSequenceRecursive(segments, segIndex + consume, patterns, patIndex + 1)
      if (result !== null && result === segments.length) {
        return result
      }
    }
    return null
  }

  // Regular segment: must match current segment
  if (segIndex >= segments.length) {
    return null // No more segments to match
  }

  if (!matchSegment(segments[segIndex], pattern)) {
    return null
  }

  return matchSequenceRecursive(segments, segIndex + 1, patterns, patIndex + 1)
}
