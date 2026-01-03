/**
 * NFA to DFA conversion using subset construction.
 * @packageDocumentation
 */

import type { SegmentAutomaton, AutomatonState, AutomatonTransition, SegmentMatcher } from '../types'
import { AutomatonLimitError } from '../types'

/**
 * Default maximum number of DFA states before throwing an error.
 * This prevents exponential blowup from patterns with many alternations.
 *
 * @public
 */
export const DEFAULT_MAX_DFA_STATES = 10_000

/**
 * Options for DFA construction.
 *
 * @public
 */
export interface DeterminizeOptions {
  /**
   * Maximum number of DFA states to create before throwing an error.
   * Set to `Infinity` to disable the limit (not recommended).
   * @defaultValue 10000
   */
  maxStates?: number
}

/**
 * Symbol types for the automaton alphabet.
 */
type AlphabetSymbol =
  | { type: 'literal'; value: string }
  | { type: 'wildcard'; pattern: RegExp | SegmentMatcher; patternSource: string }
  | { type: 'any' } // Represents any segment (for globstar transitions)

/**
 * Convert an NFA to a DFA using subset construction.
 *
 * The resulting DFA has states that correspond to sets of NFA states.
 * Globstar transitions are handled by treating them as transitions
 * that can match any segment.
 *
 * @param nfa - The NFA to determinize
 * @param options - Optional configuration for the conversion
 * @returns An equivalent DFA
 * @throws AutomatonLimitError if DFA state count exceeds the configured limit
 *
 * @public
 */
export function determinize(nfa: SegmentAutomaton, options: DeterminizeOptions = {}): SegmentAutomaton {
  const maxStates = options.maxStates ?? DEFAULT_MAX_DFA_STATES

  // Already deterministic? Just ensure it's complete.
  if (nfa.isDeterministic) {
    return makeComplete(nfa)
  }

  // Map from state set (as string key) to DFA state ID
  const stateSetMap = new Map<string, number>()
  const dfaStates: AutomatonState[] = []

  // Helper to get or create a DFA state for an NFA state set
  const getOrCreateState = (nfaStateSet: Set<number>): number => {
    const key = serializeStateSet(nfaStateSet)
    let dfaStateId = stateSetMap.get(key)

    if (dfaStateId === undefined) {
      // Check state limit before creating new state
      if (dfaStates.length >= maxStates) {
        throw new AutomatonLimitError(
          'DFA_STATE_LIMIT',
          `DFA construction exceeded limit of ${maxStates} states. ` +
            `The pattern may be too complex (e.g., many alternations or wildcards). ` +
            `Consider simplifying the pattern or increasing the maxStates limit.`,
          maxStates,
          dfaStates.length + 1,
        )
      }

      dfaStateId = dfaStates.length
      stateSetMap.set(key, dfaStateId)

      // Check if any NFA state in the set is accepting
      const accepting = [...nfaStateSet].some((s) => nfa.states[s].accepting)

      dfaStates.push({
        id: dfaStateId,
        transitions: [], // Will be filled later
        accepting,
      })
    }

    return dfaStateId
  }

  // Start with epsilon closure of initial state
  const initialClosure = epsilonClosure(nfa, new Set([nfa.initialState]))
  const initialDfaState = getOrCreateState(initialClosure)

  // Worklist of DFA states to process
  const worklist: { dfaStateId: number; nfaStateSet: Set<number> }[] = [
    { dfaStateId: initialDfaState, nfaStateSet: initialClosure },
  ]
  const processed = new Set<number>()

  // Collect all alphabet symbols from the NFA
  const alphabet = collectAlphabet(nfa)

  while (worklist.length > 0) {
    const { dfaStateId, nfaStateSet } = worklist.pop()!

    if (processed.has(dfaStateId)) continue
    processed.add(dfaStateId)

    const transitions: AutomatonTransition[] = []

    // For each symbol in the alphabet, compute the target state set
    for (const symbol of alphabet) {
      const targetNfaSet = computeTransition(nfa, nfaStateSet, symbol)

      if (targetNfaSet.size > 0) {
        const targetDfaState = getOrCreateState(targetNfaSet)

        // Add transition
        if (symbol.type === 'literal') {
          transitions.push({
            type: 'literal',
            segment: symbol.value,
            target: targetDfaState,
          })
        } else if (symbol.type === 'wildcard') {
          transitions.push({
            type: 'wildcard',
            pattern: symbol.pattern,
            patternSource: symbol.patternSource,
            target: targetDfaState,
          })
        }
        // 'any' symbols are handled specially - they become catch-all wildcard

        // Add to worklist if not processed
        if (!processed.has(targetDfaState)) {
          worklist.push({ dfaStateId: targetDfaState, nfaStateSet: targetNfaSet })
        }
      }
    }

    // Handle "any segment" transitions (from globstar)
    const anyTarget = computeAnyTransition(nfa, nfaStateSet)
    if (anyTarget.size > 0) {
      const targetDfaState = getOrCreateState(anyTarget)
      transitions.push({
        type: 'wildcard',
        pattern: /^.+$/,
        patternSource: '*',
        target: targetDfaState,
      })

      if (!processed.has(targetDfaState)) {
        worklist.push({ dfaStateId: targetDfaState, nfaStateSet: anyTarget })
      }
    }

    // Update state with transitions
    dfaStates[dfaStateId] = {
      ...dfaStates[dfaStateId],
      transitions,
    }
  }

  const acceptingStates = dfaStates.filter((s) => s.accepting).map((s) => s.id)

  const dfa: SegmentAutomaton = {
    states: dfaStates,
    initialState: initialDfaState,
    acceptingStates,
    isDeterministic: true,
  }

  // Make the DFA complete for complement operation
  return makeComplete(dfa)
}

/**
 * Serialize a state set to a string key for map lookup.
 */
function serializeStateSet(stateSet: Set<number>): string {
  return [...stateSet].sort((a, b) => a - b).join(',')
}

/**
 * Compute epsilon closure of a state set.
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
        // Globstar's exit is an epsilon transition (can match zero segments)
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
 * Collect all symbols from the NFA alphabet.
 */
function collectAlphabet(automaton: SegmentAutomaton): AlphabetSymbol[] {
  const symbols: AlphabetSymbol[] = []
  const literalSet = new Set<string>()
  const wildcardSet = new Map<string, RegExp | SegmentMatcher>()

  for (const state of automaton.states) {
    for (const transition of state.transitions) {
      if (transition.type === 'literal') {
        if (!literalSet.has(transition.segment)) {
          literalSet.add(transition.segment)
          symbols.push({ type: 'literal', value: transition.segment })
        }
      } else if (transition.type === 'wildcard') {
        const key = transition.patternSource || transition.pattern.source
        if (!wildcardSet.has(key)) {
          wildcardSet.set(key, transition.pattern)
          symbols.push({
            type: 'wildcard',
            pattern: transition.pattern,
            patternSource: transition.patternSource,
          })
        }
      }
      // Globstar contributes an implicit "any" symbol
    }
  }

  return symbols
}

/**
 * Compute the set of NFA states reachable from a state set on a symbol.
 */
function computeTransition(nfa: SegmentAutomaton, fromStates: Set<number>, symbol: AlphabetSymbol): Set<number> {
  const reached = new Set<number>()

  for (const stateId of fromStates) {
    const state = nfa.states[stateId]

    for (const transition of state.transitions) {
      if (matchesSymbol(transition, symbol)) {
        reached.add(getTarget(transition))
      }
    }
  }

  // Return epsilon closure of reached states
  return epsilonClosure(nfa, reached)
}

/**
 * Compute transitions on "any segment" (from globstar self-loops).
 */
function computeAnyTransition(nfa: SegmentAutomaton, fromStates: Set<number>): Set<number> {
  const reached = new Set<number>()

  for (const stateId of fromStates) {
    const state = nfa.states[stateId]

    for (const transition of state.transitions) {
      if (transition.type === 'globstar') {
        // Self-loop: consuming any segment stays in same state
        reached.add(transition.selfLoop)
      }
    }
  }

  return epsilonClosure(nfa, reached)
}

/**
 * Check if a transition matches a symbol.
 */
function matchesSymbol(transition: AutomatonTransition, symbol: AlphabetSymbol): boolean {
  if (transition.type === 'literal' && symbol.type === 'literal') {
    return transition.segment === symbol.value
  }
  if (transition.type === 'wildcard' && symbol.type === 'wildcard') {
    // Match if same pattern source
    return transition.patternSource === symbol.patternSource
  }
  return false
}

/**
 * Get target state from a transition.
 */
function getTarget(transition: AutomatonTransition): number {
  switch (transition.type) {
    case 'literal':
    case 'wildcard':
      return transition.target
    case 'globstar':
      return transition.selfLoop
    case 'epsilon':
      return transition.target
  }
}

/**
 * Make a DFA complete by adding a sink state for missing transitions.
 *
 * A complete DFA has exactly one transition for each symbol from each state.
 * This is required for complement operation.
 *
 * For segment automata with an infinite alphabet, we add a "catch-all"
 * wildcard transition to a sink state for any segment not explicitly handled.
 */
function makeComplete(dfa: SegmentAutomaton): SegmentAutomaton {
  // Create a sink state (non-accepting, transitions to self on any input)
  const sinkStateId = dfa.states.length
  const sinkState: AutomatonState = {
    id: sinkStateId,
    accepting: false,
    transitions: [
      {
        type: 'wildcard',
        pattern: /^.*$/,
        patternSource: '*',
        target: sinkStateId,
      },
    ],
  }

  // For each state, add a catch-all transition to sink for unhandled inputs
  const completedStates: AutomatonState[] = dfa.states.map((state) => {
    // Check if state already has a catch-all wildcard (pattern that matches everything)
    const hasCatchAll = state.transitions.some((t) => t.type === 'wildcard' && /^\^?\.\*\$?$/.test(t.pattern.source))

    if (hasCatchAll) {
      return state
    }

    // Add catch-all transition to sink state
    return {
      ...state,
      transitions: [
        ...state.transitions,
        {
          type: 'wildcard' as const,
          pattern: /^.*$/,
          patternSource: '*',
          target: sinkStateId,
        },
      ],
    }
  })

  // Add sink state
  completedStates.push(sinkState)

  return {
    states: completedStates,
    initialState: dfa.initialState,
    acceptingStates: dfa.acceptingStates,
    isDeterministic: true,
  }
}
