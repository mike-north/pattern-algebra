/**
 * Automaton builder - converts pattern AST to segment automaton.
 * @packageDocumentation
 */

import type {
  PathPattern,
  PatternNode,
  SegmentSequence,
  Alternation,
  Segment,
  SegmentAutomaton,
  AutomatonState,
  AutomatonTransition,
} from '../types'
import { segmentToRegex } from '../match/segment-matcher'

/**
 * Mutable state builder for constructing automata.
 */
interface AutomatonBuilder {
  states: AutomatonState[]
  nextStateId: number
}

/**
 * Build a segment automaton from a pattern AST.
 *
 * The automaton operates on path segments (not characters).
 * This representation enables:
 * - O(n) matching where n is number of path segments
 * - Standard automaton operations for containment checking
 *
 * @param pattern - Parsed pattern AST
 * @returns Segment automaton (NFA)
 *
 * @public
 */
export function buildAutomaton(pattern: PathPattern): SegmentAutomaton {
  const builder: AutomatonBuilder = {
    states: [],
    nextStateId: 0,
  }

  // Create initial and final states
  const initialId = createState(builder, false)
  const finalId = createState(builder, true)

  // Build automaton for the pattern node
  buildNodeAutomaton(builder, pattern.root, initialId, finalId)

  return {
    states: builder.states,
    initialState: initialId,
    acceptingStates: [finalId],
    isDeterministic: false, // NFAs are not deterministic by default
  }
}

/**
 * Create a new state in the automaton.
 */
function createState(builder: AutomatonBuilder, accepting: boolean): number {
  const id = builder.nextStateId++
  builder.states.push({
    id,
    transitions: [],
    accepting,
  })
  return id
}

/**
 * Add a transition to a state.
 */
function addTransition(builder: AutomatonBuilder, fromState: number, transition: AutomatonTransition): void {
  const state = builder.states[fromState]
  builder.states[fromState] = {
    ...state,
    transitions: [...state.transitions, transition],
  }
}

/**
 * Build automaton for a pattern node.
 */
function buildNodeAutomaton(builder: AutomatonBuilder, node: PatternNode, startState: number, endState: number): void {
  if (node.type === 'sequence') {
    buildSequenceAutomaton(builder, node, startState, endState)
  } else {
    buildAlternationAutomaton(builder, node, startState, endState)
  }
}

/**
 * Build automaton for a segment sequence.
 */
function buildSequenceAutomaton(
  builder: AutomatonBuilder,
  sequence: SegmentSequence,
  startState: number,
  endState: number,
): void {
  const segments = sequence.segments

  if (segments.length === 0) {
    // Empty sequence - epsilon transition
    addTransition(builder, startState, { type: 'epsilon', target: endState })
    return
  }

  // Create intermediate states between segments
  let currentState = startState
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const isLast = i === segments.length - 1
    const nextState = isLast ? endState : createState(builder, false)

    buildSegmentAutomaton(builder, segment, currentState, nextState)
    currentState = nextState
  }
}

/**
 * Build automaton for an alternation (brace expansion).
 */
function buildAlternationAutomaton(
  builder: AutomatonBuilder,
  alternation: Alternation,
  startState: number,
  endState: number,
): void {
  // Each branch connects start to end via epsilon transitions
  for (const branch of alternation.branches) {
    const branchStart = createState(builder, false)
    const branchEnd = createState(builder, false)

    // Epsilon from start to branch start
    addTransition(builder, startState, { type: 'epsilon', target: branchStart })

    // Build branch automaton
    buildNodeAutomaton(builder, branch, branchStart, branchEnd)

    // Epsilon from branch end to end
    addTransition(builder, branchEnd, { type: 'epsilon', target: endState })
  }
}

/**
 * Build automaton for a single segment.
 */
function buildSegmentAutomaton(
  builder: AutomatonBuilder,
  segment: Segment,
  startState: number,
  endState: number,
): void {
  switch (segment.type) {
    case 'literal':
      addTransition(builder, startState, {
        type: 'literal',
        segment: segment.value,
        target: endState,
      })
      break

    case 'globstar':
      // Globstar: can match zero or more segments
      // Model as: epsilon to end (zero segments) OR consume one and loop
      addTransition(builder, startState, {
        type: 'globstar',
        selfLoop: startState,
        exit: endState,
      })
      break

    case 'wildcard':
    case 'charclass':
    case 'composite': {
      const regex = segmentToRegex(segment)
      if (regex) {
        addTransition(builder, startState, {
          type: 'wildcard',
          pattern: regex,
          patternSource: segment.type === 'wildcard' ? segment.pattern : '',
          target: endState,
        })
      }
      break
    }
  }
}

/**
 * Get the minimum number of segments a pattern can match.
 *
 * @param pattern - Pattern AST
 * @returns Minimum segment count
 *
 * @public
 */
export function getMinSegments(pattern: PathPattern): number {
  return getNodeMinSegments(pattern.root)
}

function getNodeMinSegments(node: PatternNode): number {
  if (node.type === 'sequence') {
    let count = 0
    for (const segment of node.segments) {
      if (segment.type !== 'globstar') {
        count++
      }
      // Globstar contributes 0 to minimum
    }
    return count
  } else {
    // Alternation: minimum of all branches
    return Math.min(...node.branches.map(getNodeMinSegments))
  }
}

/**
 * Get the maximum number of segments a pattern can match.
 *
 * @param pattern - Pattern AST
 * @returns Maximum segment count, or undefined if unbounded (contains **)
 *
 * @public
 */
export function getMaxSegments(pattern: PathPattern): number | undefined {
  return getNodeMaxSegments(pattern.root)
}

function getNodeMaxSegments(node: PatternNode): number | undefined {
  if (node.type === 'sequence') {
    let count = 0
    for (const segment of node.segments) {
      if (segment.type === 'globstar') {
        return undefined // Unbounded
      }
      count++
    }
    return count
  } else {
    // Alternation: max of all branches (undefined if any is undefined)
    const maxes = node.branches.map(getNodeMaxSegments)
    if (maxes.some((m) => m === undefined)) {
      return undefined
    }
    return Math.max(...(maxes as number[]))
  }
}

/**
 * Check if a pattern contains a globstar (**).
 *
 * @param pattern - Pattern AST
 * @returns true if pattern is unbounded
 *
 * @public
 */
export function isUnbounded(pattern: PathPattern): boolean {
  return getMaxSegments(pattern) === undefined
}
