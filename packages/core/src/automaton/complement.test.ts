import { describe, it, expect } from 'vitest'
import { complement } from './complement'
import { buildAutomaton } from '../compile/automaton-builder'
import { parsePattern } from '../parse'
import { determinize } from './determinize'
import { compilePattern } from '../compile'

describe('complement', () => {
  describe('basic complement', () => {
    it('swaps accepting states', () => {
      const pattern = parsePattern('src/index.ts')
      const nfa = buildAutomaton(pattern)
      const dfa = determinize(nfa)

      const original = dfa
      const complemented = complement(original)

      // Accepting states should differ
      // Originally accepting states become non-accepting
      const originalAccepting = new Set(original.acceptingStates)
      const complementedAccepting = new Set(complemented.acceptingStates)

      // They should not be the same
      expect(complementedAccepting).not.toEqual(originalAccepting)
    })

    it('preserves state count', () => {
      const pattern = parsePattern('src/*.ts')
      const nfa = buildAutomaton(pattern)
      const dfa = determinize(nfa)

      const complemented = complement(dfa)

      expect(complemented.states.length).toBe(dfa.states.length)
    })

    it('preserves deterministic property', () => {
      const pattern = parsePattern('src/*.ts')
      const nfa = buildAutomaton(pattern)
      const dfa = determinize(nfa)

      expect(dfa.isDeterministic).toBe(true)

      const complemented = complement(dfa)
      expect(complemented.isDeterministic).toBe(true)
    })
  })

  describe('accepting state inversion', () => {
    // Note: These tests verify the automaton structure after complement.
    // Testing actual matching behavior with complemented automata requires
    // proper integration with matchPath, which may need additional work.

    it('originally non-accepting states become accepting after complement', () => {
      const pattern = parsePattern('src/index.ts')
      const nfa = buildAutomaton(pattern)
      const dfa = determinize(nfa)

      const complemented = complement(dfa)

      // Find states that were NOT accepting in original
      const originalNonAccepting = dfa.states.filter((s) => !s.accepting).map((s) => s.id)

      // Those states should now be accepting in complemented
      for (const id of originalNonAccepting) {
        const complementedState = complemented.states.find((s) => s.id === id)
        expect(complementedState?.accepting).toBe(true)
      }
    })

    it('originally accepting states become non-accepting after complement', () => {
      const pattern = parsePattern('src/index.ts')
      const nfa = buildAutomaton(pattern)
      const dfa = determinize(nfa)

      const complemented = complement(dfa)

      // Find states that WERE accepting in original
      const originalAccepting = dfa.states.filter((s) => s.accepting).map((s) => s.id)

      // Those states should now be non-accepting in complemented
      for (const id of originalAccepting) {
        const complementedState = complemented.states.find((s) => s.id === id)
        expect(complementedState?.accepting).toBe(false)
      }
    })
  })

  describe('double complement', () => {
    it('double complement is equivalent to original (literal)', () => {
      const original = compilePattern(parsePattern('src/index.ts'))
      const dfa = determinize(original.automaton)

      const complemented = complement(dfa)
      const doubleComplemented = complement(complemented)

      // Double complement should have same accepting states as original
      expect(new Set(doubleComplemented.acceptingStates)).toEqual(new Set(dfa.acceptingStates))
    })

    it('double complement has same state accepting flags as original', () => {
      const original = compilePattern(parsePattern('src/*.ts'))
      const dfa = determinize(original.automaton)

      const doubleComplemented = complement(complement(dfa))

      // Each state should have same accepting flag as original
      for (let i = 0; i < dfa.states.length; i++) {
        expect(doubleComplemented.states[i].accepting).toBe(dfa.states[i].accepting)
      }
    })
  })

  describe('edge cases', () => {
    it('handles automaton with wildcard pattern', () => {
      const pattern = parsePattern('*')
      const nfa = buildAutomaton(pattern)
      const dfa = determinize(nfa)

      const complemented = complement(dfa)
      expect(complemented.states.length).toBe(dfa.states.length)
    })

    it('handles complex globstar pattern', () => {
      const pattern = parsePattern('src/**/*.ts')
      const nfa = buildAutomaton(pattern)
      const dfa = determinize(nfa)

      const complemented = complement(dfa)

      // Complement should preserve structure
      expect(complemented.states.length).toBe(dfa.states.length)
      expect(complemented.isDeterministic).toBe(true)

      // Accepting states should be inverted
      const originalAcceptingSet = new Set(dfa.acceptingStates)
      const complementedAcceptingSet = new Set(complemented.acceptingStates)

      // No state should be in both sets
      for (const id of originalAcceptingSet) {
        expect(complementedAcceptingSet.has(id)).toBe(false)
      }
    })
  })
})
