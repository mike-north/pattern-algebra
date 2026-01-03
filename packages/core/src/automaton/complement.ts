/**
 * DFA complement operation.
 * @packageDocumentation
 */

import type { SegmentAutomaton, AutomatonState } from '../types'
import { determinize } from './determinize'

/**
 * Complement a DFA by swapping accepting and non-accepting states.
 *
 * The complemented automaton accepts exactly the strings that the
 * original automaton rejects, and vice versa.
 *
 * Note: Input must be deterministic. NFAs are automatically converted.
 *
 * @param automaton - The automaton to complement
 * @returns Complemented automaton
 *
 * @public
 */
export function complement(automaton: SegmentAutomaton): SegmentAutomaton {
  // Ensure the automaton is deterministic
  const dfa = automaton.isDeterministic ? automaton : determinize(automaton)

  // Swap accepting and non-accepting states
  const complementedStates: AutomatonState[] = dfa.states.map((state) => ({
    ...state,
    accepting: !state.accepting,
  }))

  // New accepting states are the old non-accepting states
  const acceptingStates = complementedStates.filter((s) => s.accepting).map((s) => s.id)

  return {
    states: complementedStates,
    initialState: dfa.initialState,
    acceptingStates,
    isDeterministic: true,
  }
}
