/**
 * Automaton operations for pattern containment checking.
 * @packageDocumentation
 */

export { determinize, DEFAULT_MAX_DFA_STATES, type DeterminizeOptions } from './determinize'
export { complement } from './complement'
export { intersect, union } from './intersect'
export { isEmpty, findWitness, countPaths } from './emptiness'

// Pattern-level set operations
export { patternIntersect, patternUnion, patternComplement, patternDifference } from './pattern-algebra'
