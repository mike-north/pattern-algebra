import { describe, it, expect } from 'vitest'

import { parsePattern } from './parser'
import { expandBraces, countBraceExpansions } from './brace-expansion'

describe('expandBraces', () => {
  it('expands simple brace expression', () => {
    const pattern = parsePattern('{src,lib}')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(2)
    expect(expanded[0].source).toBe('src')
    expect(expanded[1].source).toBe('lib')
  })

  it('expands braces with suffix', () => {
    const pattern = parsePattern('{src,lib}/**/*.ts')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(2)
    expect(expanded[0].source).toBe('src/**/*.ts')
    expect(expanded[1].source).toBe('lib/**/*.ts')
  })

  it('expands braces with prefix', () => {
    const pattern = parsePattern('packages/{core,cli}')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(2)
    expect(expanded[0].source).toBe('packages/core')
    expect(expanded[1].source).toBe('packages/cli')
  })

  it('expands multiple braces', () => {
    const pattern = parsePattern('{a,b}/{x,y}')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(4)
    const sources = expanded.map((p) => p.source)
    expect(sources).toContain('a/x')
    expect(sources).toContain('a/y')
    expect(sources).toContain('b/x')
    expect(sources).toContain('b/y')
  })

  it('expands numeric range', () => {
    const pattern = parsePattern('file{1..5}.txt')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(5)
    expect(expanded[0].source).toBe('file1.txt')
    expect(expanded[4].source).toBe('file5.txt')
  })

  it('expands descending numeric range', () => {
    const pattern = parsePattern('v{3..1}')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(3)
    expect(expanded[0].source).toBe('v3')
    expect(expanded[1].source).toBe('v2')
    expect(expanded[2].source).toBe('v1')
  })

  it('returns pattern unchanged if no braces', () => {
    const pattern = parsePattern('src/**/*.ts')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(1)
    expect(expanded[0].source).toBe('src/**/*.ts')
  })

  it('preserves negation', () => {
    const pattern = parsePattern('!{node_modules,dist}/**')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(2)
    expect(expanded[0].source).toBe('!node_modules/**')
    expect(expanded[1].source).toBe('!dist/**')
  })

  it('limits expansion count', () => {
    const pattern = parsePattern('{a,b,c,d,e}')
    const expanded = expandBraces(pattern, 3)

    expect(expanded.length).toBeLessThanOrEqual(3)
    expect(expanded.some((p) => p.errors?.some((e) => e.code === 'EXPANSION_LIMIT'))).toBe(true)
  })

  it('limits numeric range', () => {
    const pattern = parsePattern('{1..100}')
    const expanded = expandBraces(pattern)

    // Should error because range exceeds 50
    expect(expanded.some((p) => p.errors?.some((e) => e.code === 'EXPANSION_LIMIT'))).toBe(true)
  })

  it('errors on nested braces', () => {
    const pattern = parsePattern('{a,{b,c}}')
    const expanded = expandBraces(pattern)

    expect(expanded.some((p) => p.errors?.some((e) => e.code === 'NESTED_BRACES'))).toBe(true)
  })

  it('handles braces inside brackets (treated as literal)', () => {
    // {a,b} inside [] is not brace expansion
    const pattern = parsePattern('[{a,b}]')
    const expanded = expandBraces(pattern)

    expect(expanded).toHaveLength(1)
  })
})

describe('countBraceExpansions', () => {
  it('counts simple expansion', () => {
    expect(countBraceExpansions('{a,b}')).toBe(2)
    expect(countBraceExpansions('{a,b,c}')).toBe(3)
  })

  it('counts multiple braces as multiplication', () => {
    expect(countBraceExpansions('{a,b}/{x,y}')).toBe(4)
    expect(countBraceExpansions('{a,b}/{x,y}/{1,2}')).toBe(8)
  })

  it('returns 1 for no braces', () => {
    expect(countBraceExpansions('src/**/*.ts')).toBe(1)
  })

  it('returns Infinity for excessive expansion', () => {
    // Create a pattern that would expand to > 10000 (10^5 = 100,000)
    expect(
      countBraceExpansions(
        `{a,b,c,d,e,f,g,h,i,j}{a,b,c,d,e,f,g,h,i,j}{a,b,c,d,e,f,g,h,i,j}{a,b,c,d,e,f,g,h,i,j}{a,b,c,d,e,f,g,h,i,j}`,
      ),
    ).toBe(Infinity)
  })
})
