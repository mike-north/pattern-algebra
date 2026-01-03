/**
 * Automaton emptiness checking and witness finding.
 * @packageDocumentation
 */

import type { SegmentAutomaton, AutomatonTransition, SegmentMatcher } from '../types'

/**
 * Check if an automaton's language is empty.
 *
 * Uses reachability analysis from the initial state to any accepting state.
 *
 * @param automaton - The automaton to check
 * @returns true if the automaton accepts no strings
 *
 * @public
 */
export function isEmpty(automaton: SegmentAutomaton): boolean {
  // Check if any accepting state is reachable from initial state
  const reachable = findReachableStates(automaton)

  for (const acceptingId of automaton.acceptingStates) {
    if (reachable.has(acceptingId)) {
      return false // Found a reachable accepting state
    }
  }

  return true // No accepting state is reachable
}

/**
 * Find all states reachable from the initial state.
 */
function findReachableStates(automaton: SegmentAutomaton): Set<number> {
  const reachable = new Set<number>()
  const worklist = [automaton.initialState]

  while (worklist.length > 0) {
    const stateId = worklist.pop()!

    if (reachable.has(stateId)) continue
    reachable.add(stateId)

    const state = automaton.states[stateId]
    if (!state) continue

    for (const transition of state.transitions) {
      const targets = getTransitionTargets(transition)
      for (const target of targets) {
        if (!reachable.has(target)) {
          worklist.push(target)
        }
      }
    }
  }

  return reachable
}

/**
 * Get all target states from a transition.
 */
function getTransitionTargets(transition: AutomatonTransition): number[] {
  switch (transition.type) {
    case 'literal':
    case 'wildcard':
    case 'epsilon':
      return [transition.target]
    case 'globstar':
      return [transition.selfLoop, transition.exit]
  }
}

/**
 * Find a witness string accepted by the automaton.
 *
 * If the automaton is non-empty, returns a path (sequence of segments)
 * that leads to an accepting state.
 *
 * @param automaton - The automaton to find a witness for
 * @returns A witness path string, or undefined if the language is empty
 *
 * @public
 */
export function findWitness(automaton: SegmentAutomaton): string | undefined {
  // BFS to find shortest path to an accepting state
  interface SearchState {
    stateId: number
    path: string[]
  }

  const visited = new Set<number>()
  const queue: SearchState[] = [{ stateId: automaton.initialState, path: [] }]

  // First, handle epsilon closure from initial state
  const initialClosure = epsilonClosure(automaton, automaton.initialState)
  for (const stateId of initialClosure) {
    if (automaton.states[stateId]?.accepting) {
      return '/' // Empty path matches
    }
  }

  // Add all states in initial closure to queue
  for (const stateId of initialClosure) {
    if (stateId !== automaton.initialState) {
      queue.push({ stateId, path: [] })
    }
  }

  while (queue.length > 0) {
    const { stateId, path } = queue.shift()!

    if (visited.has(stateId)) continue
    visited.add(stateId)

    const state = automaton.states[stateId]
    if (!state) continue

    // Check if this state is accepting
    if (state.accepting && path.length > 0) {
      return '/' + path.join('/')
    }

    // Explore transitions
    for (const transition of state.transitions) {
      if (transition.type === 'epsilon') {
        // Epsilon: same path, different state
        if (!visited.has(transition.target)) {
          queue.push({ stateId: transition.target, path })
        }
      } else if (transition.type === 'literal') {
        // Literal: extend path with the segment
        if (!visited.has(transition.target)) {
          queue.push({
            stateId: transition.target,
            path: [...path, transition.segment],
          })
        }
      } else if (transition.type === 'wildcard') {
        // Wildcard: generate a sample segment that matches
        const sample = generateMatchingSample(transition.pattern, transition.patternSource)
        if (!visited.has(transition.target)) {
          queue.push({
            stateId: transition.target,
            path: [...path, sample],
          })
        }
      } else if (transition.type === 'globstar') {
        // Globstar exit: try exiting immediately (zero segments)
        const exitClosure = epsilonClosure(automaton, transition.exit)
        for (const exitState of exitClosure) {
          if (!visited.has(exitState)) {
            queue.push({ stateId: exitState, path })
          }
        }

        // Globstar self-loop: consume one segment and continue
        if (!visited.has(transition.selfLoop)) {
          queue.push({
            stateId: transition.selfLoop,
            path: [...path, 'x'], // Generic segment
          })
        }
      }
    }
  }

  return undefined // No accepting state found
}

/**
 * Compute epsilon closure from a single state.
 */
function epsilonClosure(automaton: SegmentAutomaton, startState: number): Set<number> {
  const closure = new Set<number>()
  const worklist = [startState]

  while (worklist.length > 0) {
    const stateId = worklist.pop()!

    if (closure.has(stateId)) continue
    closure.add(stateId)

    const state = automaton.states[stateId]
    if (!state) continue

    for (const transition of state.transitions) {
      if (transition.type === 'epsilon') {
        if (!closure.has(transition.target)) {
          worklist.push(transition.target)
        }
      } else if (transition.type === 'globstar') {
        // Globstar exit is epsilon-reachable
        if (!closure.has(transition.exit)) {
          worklist.push(transition.exit)
        }
      }
    }
  }

  return closure
}

/**
 * Generate a sample segment that matches a pattern.
 */
function generateMatchingSample(pattern: RegExp | SegmentMatcher, patternSource: string): string {
  // Try to generate a sensible sample based on the pattern source
  if (patternSource.includes('.ts')) {
    return 'file.ts'
  }
  if (patternSource.includes('.js')) {
    return 'file.js'
  }
  if (patternSource.startsWith('*.')) {
    const ext = patternSource.slice(1)
    return `sample${ext}`
  }
  if (patternSource.endsWith('*')) {
    const prefix = patternSource.slice(0, -1)
    return `${prefix}sample`
  }
  if (patternSource.startsWith('*')) {
    const suffix = patternSource.slice(1)
    return `sample${suffix}`
  }

  // Default: try some common segments
  const samples = ['file', 'dir', 'foo', 'bar', 'test', 'src', 'index.ts']
  for (const sample of samples) {
    if (pattern.test(sample)) {
      return sample
    }
  }

  return 'segment'
}

/**
 * Count the number of accepting paths of a given length.
 *
 * Useful for understanding the "size" of a pattern's language.
 *
 * @param automaton - The automaton
 * @param maxDepth - Maximum path length to consider
 * @returns Object with counts per depth
 *
 * @public
 */
export function countPaths(automaton: SegmentAutomaton, maxDepth: number): Map<number, number> {
  const counts = new Map<number, number>()

  // Dynamic programming: count[state][depth] = number of paths
  // This is exponential in worst case, so we cap at maxDepth

  const memo = new Map<string, number>()

  const countFrom = (stateId: number, depth: number): number => {
    if (depth > maxDepth) return 0

    const key = `${stateId}:${depth}`
    if (memo.has(key)) return memo.get(key)!

    const state = automaton.states[stateId]
    if (!state) return 0

    let total = 0

    // Count if accepting at this depth
    if (state.accepting) {
      total++
      counts.set(depth, (counts.get(depth) ?? 0) + 1)
    }

    // Count paths through transitions
    for (const transition of state.transitions) {
      if (transition.type === 'epsilon') {
        total += countFrom(transition.target, depth)
      } else if (transition.type === 'globstar') {
        total += countFrom(transition.exit, depth)
        total += countFrom(transition.selfLoop, depth + 1)
      } else {
        const target = transition.type === 'literal' || transition.type === 'wildcard' ? transition.target : 0
        total += countFrom(target, depth + 1)
      }
    }

    memo.set(key, total)
    return total
  }

  countFrom(automaton.initialState, 0)
  return counts
}
