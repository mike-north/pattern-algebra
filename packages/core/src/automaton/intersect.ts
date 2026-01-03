/**
 * Automaton intersection using product construction.
 * @packageDocumentation
 */

import type { SegmentAutomaton, AutomatonState, AutomatonTransition, SegmentMatcher } from '../types'

/**
 * Compute the intersection of two automata using product construction.
 *
 * The resulting automaton accepts a string iff both input automata accept it.
 * L(A ∩ B) = L(A) ∩ L(B)
 *
 * @param a - First automaton
 * @param b - Second automaton
 * @returns Intersection automaton
 *
 * @public
 */
export function intersect(a: SegmentAutomaton, b: SegmentAutomaton): SegmentAutomaton {
  return productConstruction(a, b, 'intersection')
}

/**
 * Compute the union of two automata using NFA construction.
 *
 * The resulting automaton accepts a string iff either input automaton accepts it.
 * L(A ∪ B) = L(A) ∪ L(B)
 *
 * We use NFA union: create a new initial state with epsilon transitions
 * to both automata's initial states, then merge the states.
 *
 * @param a - First automaton
 * @param b - Second automaton
 * @returns Union automaton (NFA)
 *
 * @public
 */
export function union(a: SegmentAutomaton, b: SegmentAutomaton): SegmentAutomaton {
  // Renumber states: a's states stay as-is, b's states are shifted by a.states.length
  const aOffset = 0
  const bOffset = a.states.length
  const newInitialState = a.states.length + b.states.length

  // Copy a's states
  const states: AutomatonState[] = a.states.map((state) => ({
    id: state.id + aOffset,
    accepting: state.accepting,
    transitions: state.transitions.map((t) => renumberTransition(t, aOffset)),
  }))

  // Copy b's states with renumbered IDs
  for (const state of b.states) {
    states.push({
      id: state.id + bOffset,
      accepting: state.accepting,
      transitions: state.transitions.map((t) => renumberTransition(t, bOffset)),
    })
  }

  // Create new initial state with epsilon transitions to both original initial states
  states.push({
    id: newInitialState,
    accepting: false,
    transitions: [
      { type: 'epsilon', target: a.initialState + aOffset },
      { type: 'epsilon', target: b.initialState + bOffset },
    ],
  })

  // Accepting states from both automata
  const acceptingStates = [...a.acceptingStates.map((s) => s + aOffset), ...b.acceptingStates.map((s) => s + bOffset)]

  return {
    states,
    initialState: newInitialState,
    acceptingStates,
    isDeterministic: false, // NFA union is non-deterministic
  }
}

/**
 * Renumber a transition's targets by adding an offset.
 */
function renumberTransition(t: AutomatonTransition, offset: number): AutomatonTransition {
  switch (t.type) {
    case 'literal':
      return { ...t, target: t.target + offset }
    case 'wildcard':
      return { ...t, target: t.target + offset }
    case 'epsilon':
      return { ...t, target: t.target + offset }
    case 'globstar':
      return { ...t, selfLoop: t.selfLoop + offset, exit: t.exit + offset }
  }
}

type ProductMode = 'intersection' | 'union'

/**
 * Product construction for intersection or union.
 */
function productConstruction(a: SegmentAutomaton, b: SegmentAutomaton, mode: ProductMode): SegmentAutomaton {
  // Map from (stateA, stateB) pair to product state ID
  const pairToState = new Map<string, number>()
  const productStates: AutomatonState[] = []

  const getPairKey = (sa: number, sb: number): string => `${sa},${sb}`

  const getOrCreateState = (sa: number, sb: number): number => {
    const key = getPairKey(sa, sb)
    let stateId = pairToState.get(key)

    if (stateId === undefined) {
      stateId = productStates.length
      pairToState.set(key, stateId)

      const acceptA = a.states[sa]?.accepting ?? false
      const acceptB = b.states[sb]?.accepting ?? false

      // For intersection: accepting iff both accept
      // For union: accepting iff either accepts
      const accepting = mode === 'intersection' ? acceptA && acceptB : acceptA || acceptB

      productStates.push({
        id: stateId,
        transitions: [],
        accepting,
      })
    }

    return stateId
  }

  // Start with initial states
  const initialState = getOrCreateState(a.initialState, b.initialState)

  // Worklist of state pairs to process
  const worklist: { stateId: number; sa: number; sb: number }[] = [
    { stateId: initialState, sa: a.initialState, sb: b.initialState },
  ]
  const processed = new Set<string>()

  while (worklist.length > 0) {
    const { stateId, sa, sb } = worklist.pop()!
    const key = getPairKey(sa, sb)

    if (processed.has(key)) continue
    processed.add(key)

    const stateA = a.states[sa]
    const stateB = b.states[sb]
    const transitions: AutomatonTransition[] = []

    // For each pair of transitions that can fire together
    for (const transA of stateA?.transitions ?? []) {
      for (const transB of stateB?.transitions ?? []) {
        const combined = combineTransitions(transA, transB)
        if (combined) {
          const targetState = getOrCreateState(combined.targetA, combined.targetB)
          transitions.push({
            ...combined.transition,
            target: targetState,
          } as AutomatonTransition)

          const targetKey = getPairKey(combined.targetA, combined.targetB)
          if (!processed.has(targetKey)) {
            worklist.push({
              stateId: targetState,
              sa: combined.targetA,
              sb: combined.targetB,
            })
          }
        }
      }
    }

    productStates[stateId] = {
      ...productStates[stateId],
      transitions,
    }
  }

  const acceptingStates = productStates.filter((s) => s.accepting).map((s) => s.id)

  return {
    states: productStates,
    initialState,
    acceptingStates,
    isDeterministic: a.isDeterministic && b.isDeterministic,
  }
}

type TransitionWithoutTarget =
  | { type: 'literal'; segment: string }
  | { type: 'wildcard'; pattern: RegExp | SegmentMatcher; patternSource: string }

interface CombinedTransition {
  transition: TransitionWithoutTarget
  targetA: number
  targetB: number
}

/**
 * Combine two transitions if they can fire on the same input.
 */
function combineTransitions(transA: AutomatonTransition, transB: AutomatonTransition): CombinedTransition | null {
  // Skip epsilon transitions in product (they're handled differently)
  if (transA.type === 'epsilon' || transB.type === 'epsilon') {
    return null
  }

  // Literal + Literal: must be same literal
  if (transA.type === 'literal' && transB.type === 'literal') {
    if (transA.segment === transB.segment) {
      return {
        transition: { type: 'literal', segment: transA.segment },
        targetA: transA.target,
        targetB: transB.target,
      }
    }
    return null
  }

  // Literal + Wildcard: literal must match wildcard pattern
  if (transA.type === 'literal' && transB.type === 'wildcard') {
    if (transB.pattern.test(transA.segment)) {
      return {
        transition: { type: 'literal', segment: transA.segment },
        targetA: transA.target,
        targetB: transB.target,
      }
    }
    return null
  }

  // Wildcard + Literal: literal must match wildcard pattern
  if (transA.type === 'wildcard' && transB.type === 'literal') {
    if (transA.pattern.test(transB.segment)) {
      return {
        transition: { type: 'literal', segment: transB.segment },
        targetA: transA.target,
        targetB: transB.target,
      }
    }
    return null
  }

  // Wildcard + Wildcard: compute intersection of patterns
  if (transA.type === 'wildcard' && transB.type === 'wildcard') {
    // Create a combined matcher that tests both patterns
    const combinedPattern = createIntersectionPattern(transA.pattern, transB.pattern)
    return {
      transition: {
        type: 'wildcard',
        pattern: combinedPattern,
        patternSource: `(${transA.patternSource})∩(${transB.patternSource})`,
      },
      targetA: transA.target,
      targetB: transB.target,
    }
  }

  // Globstar transitions
  if (transA.type === 'globstar' || transB.type === 'globstar') {
    return handleGlobstarProduct(transA, transB)
  }

  return null
}

/**
 * Create a pattern that matches the intersection of two patterns.
 *
 * Since true regex intersection is complex (undecidable in general),
 * we create a composite matcher that tests both patterns.
 *
 * @param patternA - First pattern to test
 * @param patternB - Second pattern to test
 * @returns A SegmentMatcher that matches if both patterns match
 */
function createIntersectionPattern(
  patternA: RegExp | SegmentMatcher,
  patternB: RegExp | SegmentMatcher,
): SegmentMatcher {
  return {
    test: (str: string) => patternA.test(str) && patternB.test(str),
    source: `(${patternA.source})∩(${patternB.source})`,
  }
}

/**
 * Handle product of globstar transitions.
 */
function handleGlobstarProduct(transA: AutomatonTransition, transB: AutomatonTransition): CombinedTransition | null {
  // Globstar matches any segment, so it can combine with anything

  if (transA.type === 'globstar' && transB.type === 'globstar') {
    // Both globstars: product stays in globstar state for both
    return {
      transition: {
        type: 'wildcard',
        pattern: /^.+$/,
        patternSource: '**',
      },
      targetA: transA.selfLoop,
      targetB: transB.selfLoop,
    }
  }

  if (transA.type === 'globstar') {
    // A is globstar, B is something else
    if (transB.type === 'literal') {
      return {
        transition: { type: 'literal', segment: transB.segment },
        targetA: transA.selfLoop, // Stay in globstar
        targetB: transB.target,
      }
    }
    if (transB.type === 'wildcard') {
      return {
        transition: {
          type: 'wildcard',
          pattern: transB.pattern,
          patternSource: transB.patternSource,
        },
        targetA: transA.selfLoop,
        targetB: transB.target,
      }
    }
  }

  if (transB.type === 'globstar') {
    // B is globstar, A is something else
    if (transA.type === 'literal') {
      return {
        transition: { type: 'literal', segment: transA.segment },
        targetA: transA.target,
        targetB: transB.selfLoop,
      }
    }
    if (transA.type === 'wildcard') {
      return {
        transition: {
          type: 'wildcard',
          pattern: transA.pattern,
          patternSource: transA.patternSource,
        },
        targetA: transA.target,
        targetB: transB.selfLoop,
      }
    }
  }

  return null
}
