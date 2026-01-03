import { describe, it, expect } from 'vitest'

import { parsePattern } from './parser'
import { validatePattern, isValidPattern } from './validator'

describe('validatePattern', () => {
  it('returns empty array for valid patterns', () => {
    const valid = ['src/**/*.ts', '*.js', '[a-z]', '{src,lib}/*.ts', '~/dev/**', '/etc/passwd', '!node_modules/**']

    for (const src of valid) {
      const pattern = parsePattern(src)
      const errors = validatePattern(pattern)
      expect(errors, `Expected no errors for ${src}`).toEqual([])
    }
  })

  it('includes parsing errors', () => {
    const pattern = parsePattern('[abc')
    const errors = validatePattern(pattern)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.code === 'UNCLOSED_BRACKET')).toBe(true)
  })

  it('detects invalid globstar', () => {
    const pattern = parsePattern('src/**foo')
    const errors = validatePattern(pattern)

    expect(errors.some((e) => e.code === 'INVALID_GLOBSTAR')).toBe(true)
  })

  it('detects invalid range in character class', () => {
    const pattern = parsePattern('[z-a]')
    const errors = validatePattern(pattern)

    expect(errors.some((e) => e.code === 'INVALID_RANGE')).toBe(true)
  })

  it('detects nested braces', () => {
    const pattern = parsePattern('{a,{b,c}}')
    const errors = validatePattern(pattern)

    expect(errors.some((e) => e.code === 'NESTED_BRACES')).toBe(true)
  })
})

describe('isValidPattern', () => {
  it('returns true for valid patterns', () => {
    expect(isValidPattern(parsePattern('src/**/*.ts'))).toBe(true)
    expect(isValidPattern(parsePattern('[a-z]'))).toBe(true)
  })

  it('returns false for invalid patterns', () => {
    expect(isValidPattern(parsePattern('[abc'))).toBe(false)
    expect(isValidPattern(parsePattern('[z-a]'))).toBe(false)
  })
})
