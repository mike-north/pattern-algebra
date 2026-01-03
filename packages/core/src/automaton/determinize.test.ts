import { describe, it, expect } from 'vitest'
import { determinize, DEFAULT_MAX_DFA_STATES } from './determinize'
import { buildAutomaton } from '../compile/automaton-builder'
import { parsePattern } from '../parse'
import { matchPath } from '../match'
import { compilePattern } from '../compile'
import { AutomatonLimitError } from '../types'

describe('determinize', () => {
  describe('basic conversion', () => {
    it('returns already deterministic automata unchanged (except completion)', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      // Mark as deterministic for testing
      const dfa = { ...automaton, isDeterministic: true }
      const result = determinize(dfa)

      // Should have same accepting behavior
      expect(result.isDeterministic).toBe(true)
    })

    it('converts simple NFA to DFA', () => {
      const pattern = parsePattern('src/*.ts')
      const nfa = buildAutomaton(pattern)

      expect(nfa.isDeterministic).toBe(false)

      const dfa = determinize(nfa)

      expect(dfa.isDeterministic).toBe(true)
      expect(dfa.states.length).toBeGreaterThan(0)
    })

    it('preserves matching semantics for literals', () => {
      const pattern = compilePattern(parsePattern('src/index.ts'))
      const dfa = determinize(pattern.automaton)
      const compiled = { ...pattern, automaton: dfa }

      expect(matchPath('/src/index.ts', compiled)).toBe(true)
      expect(matchPath('/src/other.ts', compiled)).toBe(false)
      expect(matchPath('/lib/index.ts', compiled)).toBe(false)
    })

    it('preserves matching semantics for wildcards', () => {
      const pattern = compilePattern(parsePattern('src/*.ts'))
      const dfa = determinize(pattern.automaton)
      const compiled = { ...pattern, automaton: dfa }

      expect(matchPath('/src/index.ts', compiled)).toBe(true)
      expect(matchPath('/src/utils.ts', compiled)).toBe(true)
      expect(matchPath('/src/index.js', compiled)).toBe(false)
    })

    it('preserves matching semantics for globstar', () => {
      const pattern = compilePattern(parsePattern('src/**/*.ts'))
      const dfa = determinize(pattern.automaton)
      const compiled = { ...pattern, automaton: dfa }

      expect(matchPath('/src/index.ts', compiled)).toBe(true)
      expect(matchPath('/src/utils/helper.ts', compiled)).toBe(true)
      expect(matchPath('/src/a/b/c/d.ts', compiled)).toBe(true)
      expect(matchPath('/lib/index.ts', compiled)).toBe(false)
    })
  })

  describe('epsilon closure', () => {
    it('correctly handles epsilon transitions', () => {
      // Patterns with alternation have epsilon transitions
      const pattern = compilePattern(parsePattern('{src,lib}/*.ts'))
      const dfa = determinize(pattern.automaton)
      const compiled = { ...pattern, automaton: dfa }

      expect(matchPath('/src/index.ts', compiled)).toBe(true)
      expect(matchPath('/lib/index.ts', compiled)).toBe(true)
      expect(matchPath('/test/index.ts', compiled)).toBe(false)
    })
  })

  describe('DFA completeness', () => {
    it('adds sink state for unhandled transitions', () => {
      const pattern = compilePattern(parsePattern('src/index.ts'))
      const dfa = determinize(pattern.automaton)

      // The DFA should have catch-all transitions to a sink state
      const hasCatchAll = dfa.states.some((state) =>
        state.transitions.some((t) => t.type === 'wildcard' && /^\^?\.\*\$?$/.test(t.pattern.source)),
      )
      expect(hasCatchAll).toBe(true)
    })

    it('sink state is non-accepting', () => {
      const pattern = compilePattern(parsePattern('src/index.ts'))
      const dfa = determinize(pattern.automaton)

      // Find the sink state (state with self-loop on catch-all)
      const sinkState = dfa.states.find(
        (state) =>
          !state.accepting &&
          state.transitions.some(
            (t) => t.type === 'wildcard' && /^\^?\.\*\$?$/.test(t.pattern.source) && t.target === state.id,
          ),
      )

      expect(sinkState).toBeDefined()
      expect(sinkState!.accepting).toBe(false)
    })
  })

  describe('state limit', () => {
    it('exports DEFAULT_MAX_DFA_STATES constant', () => {
      expect(DEFAULT_MAX_DFA_STATES).toBe(10_000)
    })

    it('accepts custom maxStates option', () => {
      const pattern = parsePattern('src/*.ts')
      const nfa = buildAutomaton(pattern)

      // Should work with high limit
      const dfa = determinize(nfa, { maxStates: 100 })
      expect(dfa.isDeterministic).toBe(true)
    })

    it('throws AutomatonLimitError when state limit exceeded', () => {
      const pattern = parsePattern('{a,b,c,d,e}/*.ts')
      const nfa = buildAutomaton(pattern)

      // With a very low limit, should throw
      expect(() => determinize(nfa, { maxStates: 2 })).toThrow(AutomatonLimitError)
    })

    it('AutomatonLimitError contains limit info', () => {
      const pattern = parsePattern('{a,b,c}/*.ts')
      const nfa = buildAutomaton(pattern)

      try {
        determinize(nfa, { maxStates: 2 })
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(AutomatonLimitError)
        const error = e as AutomatonLimitError
        expect(error.code).toBe('DFA_STATE_LIMIT')
        expect(error.limit).toBe(2)
        expect(error.actual).toBeGreaterThan(2)
      }
    })
  })

  describe('complex patterns', () => {
    it('handles multiple wildcards', () => {
      const pattern = compilePattern(parsePattern('src/**/test-*.spec.ts'))
      const dfa = determinize(pattern.automaton)
      const compiled = { ...pattern, automaton: dfa }

      expect(matchPath('/src/test-unit.spec.ts', compiled)).toBe(true)
      expect(matchPath('/src/utils/test-integration.spec.ts', compiled)).toBe(true)
      expect(matchPath('/src/unit.spec.ts', compiled)).toBe(false)
    })

    it('handles nested alternations', () => {
      const pattern = compilePattern(parsePattern('{src,lib}/{utils,helpers}/*.ts'))
      const dfa = determinize(pattern.automaton)
      const compiled = { ...pattern, automaton: dfa }

      expect(matchPath('/src/utils/foo.ts', compiled)).toBe(true)
      expect(matchPath('/lib/helpers/bar.ts', compiled)).toBe(true)
      expect(matchPath('/src/core/baz.ts', compiled)).toBe(false)
    })
  })
})
