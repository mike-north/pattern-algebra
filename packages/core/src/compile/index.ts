/**
 * Pattern compilation utilities.
 * @packageDocumentation
 */

export { compilePattern } from './compiler'
export { buildAutomaton, getMinSegments, getMaxSegments, isUnbounded } from './automaton-builder'
export { buildQuickRejectFilter, applyQuickReject } from './quick-reject'
