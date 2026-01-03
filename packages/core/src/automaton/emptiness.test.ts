import { describe, it, expect } from 'vitest'
import { isEmpty, findWitness, countPaths } from './emptiness'
import { buildAutomaton } from '../compile/automaton-builder'
import { parsePattern } from '../parse'
import { compilePattern } from '../compile'
import { matchPath } from '../match'

describe('isEmpty', () => {
  describe('non-empty automata', () => {
    it('returns false for simple pattern', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      expect(isEmpty(automaton)).toBe(false)
    })

    it('returns false for wildcard pattern', () => {
      const pattern = parsePattern('*.ts')
      const automaton = buildAutomaton(pattern)

      expect(isEmpty(automaton)).toBe(false)
    })

    it('returns false for globstar pattern', () => {
      const pattern = parsePattern('**/*.ts')
      const automaton = buildAutomaton(pattern)

      expect(isEmpty(automaton)).toBe(false)
    })

    it('returns false for alternation pattern', () => {
      const pattern = parsePattern('{src,lib}/*.ts')
      const automaton = buildAutomaton(pattern)

      expect(isEmpty(automaton)).toBe(false)
    })
  })

  describe('empty automata', () => {
    // Note: isEmpty uses graph reachability, not semantic emptiness.
    // For automata with wildcard transitions, the intersection may have
    // reachable accepting states even if the language is semantically empty.
    // Full semantic emptiness would require checking satisfiability of
    // intersected wildcard patterns, which is beyond current implementation.

    it('returns true for automaton with no accepting states', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      // Create an automaton with no accepting states
      const emptyAutomaton = {
        ...automaton,
        acceptingStates: [],
        states: automaton.states.map((s) => ({ ...s, accepting: false })),
      }

      expect(isEmpty(emptyAutomaton)).toBe(true)
    })

    it('returns true for automaton with unreachable accepting state', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      // Remove all transitions from initial state to make accepting states unreachable
      const disconnectedAutomaton = {
        ...automaton,
        states: automaton.states.map((s, i) => (i === automaton.initialState ? { ...s, transitions: [] } : s)),
      }

      expect(isEmpty(disconnectedAutomaton)).toBe(true)
    })
  })
})

describe('findWitness', () => {
  describe('finding witnesses', () => {
    it('returns a matching path for simple pattern', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      const witness = findWitness(automaton)

      expect(witness).toBeDefined()
      expect(witness).toContain('src')
      expect(witness).toContain('index.ts')
    })

    it('returns a matching path for wildcard pattern', () => {
      const pattern = parsePattern('*.ts')
      const automaton = buildAutomaton(pattern)

      const witness = findWitness(automaton)

      expect(witness).toBeDefined()
      expect(witness).toMatch(/\.ts$/)
    })

    it('returns a matching path for globstar pattern', () => {
      const pattern = parsePattern('src/**/*.ts')
      const automaton = buildAutomaton(pattern)

      const witness = findWitness(automaton)

      expect(witness).toBeDefined()
      expect(witness).toMatch(/^\/src\//)
      expect(witness).toMatch(/\.ts$/)
    })

    it('returns undefined for automaton with no accepting states', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      // Create an automaton with no accepting states
      const emptyAutomaton = {
        ...automaton,
        acceptingStates: [],
        states: automaton.states.map((s) => ({ ...s, accepting: false })),
      }

      const witness = findWitness(emptyAutomaton)

      expect(witness).toBeUndefined()
    })
  })

  describe('witness validity', () => {
    it('witness actually matches the pattern', () => {
      const compiled = compilePattern(parsePattern('src/**/*.ts'))
      const witness = findWitness(compiled.automaton)

      expect(witness).toBeDefined()

      // The witness is already a path string, verify it matches
      expect(matchPath(witness!, compiled)).toBe(true)
    })
  })
})

describe('countPaths', () => {
  describe('bounded patterns', () => {
    it('returns correct count for single literal', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      const counts = countPaths(automaton, 5)

      // Exactly one path of length 2
      expect(counts.get(2)).toBe(1)
    })

    it('returns counts for multiple depths', () => {
      const pattern = parsePattern('src/*.ts')
      const automaton = buildAutomaton(pattern)

      const counts = countPaths(automaton, 5)

      // Should have paths at depth 2
      expect(counts.get(2)).toBeGreaterThanOrEqual(1)
    })
  })

  describe('unbounded patterns', () => {
    it('returns counts up to maxDepth for globstar', () => {
      const pattern = parsePattern('src/**')
      const automaton = buildAutomaton(pattern)

      const counts = countPaths(automaton, 5)

      // Should have paths at depths 1, 2, 3, 4, 5
      expect(counts.get(1)).toBeGreaterThanOrEqual(1)
      expect(counts.get(2)).toBeGreaterThanOrEqual(1)
    })
  })

  describe('empty patterns', () => {
    it('returns zero paths for automaton with no accepting states', () => {
      const pattern = parsePattern('src/index.ts')
      const automaton = buildAutomaton(pattern)

      // Create an automaton with no accepting states
      const emptyAutomaton = {
        ...automaton,
        acceptingStates: [],
        states: automaton.states.map((s) => ({ ...s, accepting: false })),
      }

      const counts = countPaths(emptyAutomaton, 5)

      // All counts should be 0 or map should be empty
      let total = 0
      for (const count of counts.values()) {
        total += count
      }
      expect(total).toBe(0)
    })
  })
})
