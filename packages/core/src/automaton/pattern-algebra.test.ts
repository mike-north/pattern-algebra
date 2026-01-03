import { describe, it, expect } from 'vitest'
import { patternIntersect, patternUnion, patternComplement, patternDifference } from './pattern-algebra'
import { compilePattern } from '../compile'
import { parsePattern } from '../parse'
import { matchPath } from '../match'

/**
 * Helper to compile a pattern from source string.
 */
function compile(source: string) {
  return compilePattern(parsePattern(source))
}

describe('patternIntersect', () => {
  it('should match paths matching both patterns', () => {
    const srcFiles = compile('src/**')
    const tsFiles = compile('**/*.ts')
    const result = patternIntersect(srcFiles, tsFiles)

    // Should match TypeScript files in src
    expect(matchPath('/src/index.ts', result)).toBe(true)
    expect(matchPath('/src/utils/helper.ts', result)).toBe(true)

    // Should NOT match TypeScript files outside src
    expect(matchPath('/lib/index.ts', result)).toBe(false)

    // Should NOT match non-TypeScript files in src
    expect(matchPath('/src/index.js', result)).toBe(false)
  })

  it('should create synthetic source string', () => {
    const a = compile('src/**')
    const b = compile('**/*.ts')
    const result = patternIntersect(a, b)

    expect(result.source).toBe('(src/**) ∩ (**/*.ts)')
  })

  it('should compute depth constraints correctly', () => {
    const shallow = compile('src/*') // exactly 2 segments
    const deep = compile('**/*.ts') // at least 1 segment
    const result = patternIntersect(shallow, deep)

    // Intersection should use max of minSegments
    expect(result.minSegments).toBe(2)
  })

  it('should handle intersection of literals', () => {
    const exact = compile('src/index.ts')
    const pattern = compile('src/*.ts')
    const result = patternIntersect(exact, pattern)

    expect(matchPath('/src/index.ts', result)).toBe(true)
    expect(matchPath('/src/other.ts', result)).toBe(false)
  })

  it('should return empty for disjoint patterns', () => {
    const js = compile('**/*.js')
    const ts = compile('**/*.ts')
    const result = patternIntersect(js, ts)

    // These patterns have no overlap
    expect(matchPath('/foo.js', result)).toBe(false)
    expect(matchPath('/foo.ts', result)).toBe(false)
  })
})

describe('patternUnion', () => {
  it('should match paths matching either pattern', () => {
    const jsFiles = compile('**/*.js')
    const tsFiles = compile('**/*.ts')
    const result = patternUnion(jsFiles, tsFiles)

    expect(matchPath('/src/index.js', result)).toBe(true)
    expect(matchPath('/src/index.ts', result)).toBe(true)
    expect(matchPath('/lib/utils.js', result)).toBe(true)

    // Should NOT match other extensions
    expect(matchPath('/src/index.css', result)).toBe(false)
  })

  it('should create synthetic source string', () => {
    const a = compile('*.js')
    const b = compile('*.ts')
    const result = patternUnion(a, b)

    expect(result.source).toBe('(*.js) ∪ (*.ts)')
  })

  it('should be unbounded if either pattern is unbounded', () => {
    const bounded = compile('src/*.ts')
    const unbounded = compile('**/*.ts')
    const result = patternUnion(bounded, unbounded)

    expect(result.isUnbounded).toBe(true)
  })

  it('should compute depth constraints correctly', () => {
    const shallow = compile('*.ts') // 1 segment
    const deep = compile('src/**/*.ts') // at least 2 segments
    const result = patternUnion(shallow, deep)

    // Union should use min of minSegments
    expect(result.minSegments).toBe(1)
  })
})

describe('patternComplement', () => {
  it('should match paths NOT matching original pattern (simple case)', () => {
    // Use a simpler pattern without globstar for complement test
    const srcIndex = compile('src/index.ts')
    const notSrcIndex = patternComplement(srcIndex)

    // Should NOT match the exact file
    expect(matchPath('/src/index.ts', notSrcIndex)).toBe(false)

    // Should match other files
    expect(matchPath('/src/index.js', notSrcIndex)).toBe(true)
    expect(matchPath('/src/other.ts', notSrcIndex)).toBe(true)
  })

  it('should create synthetic source string', () => {
    const a = compile('**/*.ts')
    const result = patternComplement(a)

    expect(result.source).toBe('¬(**/*.ts)')
  })

  it('should always be unbounded', () => {
    const bounded = compile('src/*.ts')
    const result = patternComplement(bounded)

    expect(result.isUnbounded).toBe(true)
    expect(result.maxSegments).toBeUndefined()
  })

  it('should have empty quick-reject filter', () => {
    const pattern = compile('src/**/*.ts')
    const result = patternComplement(pattern)

    expect(result.quickReject).toEqual({})
  })
})

describe('patternDifference', () => {
  it('should match paths in A but not in B (simple case)', () => {
    // Use simpler patterns that don't rely on complex globstar complement
    const srcFiles = compile('src/*')
    const indexFiles = compile('src/index.ts')
    const result = patternDifference(srcFiles, indexFiles)

    // Should match src files that aren't index.ts
    expect(matchPath('/src/other.ts', result)).toBe(true)
    expect(matchPath('/src/utils.js', result)).toBe(true)

    // Should NOT match index.ts specifically
    expect(matchPath('/src/index.ts', result)).toBe(false)

    // Should NOT match files outside src
    expect(matchPath('/lib/index.ts', result)).toBe(false)
  })

  it('should create synthetic source string', () => {
    const a = compile('src/**')
    const b = compile('**/*.test.ts')
    const result = patternDifference(a, b)

    expect(result.source).toBe('(src/**) \\ (**/*.test.ts)')
  })

  it('should preserve unbounded status from first pattern', () => {
    const unbounded = compile('**/*.ts')
    const bounded = compile('test/*.ts')
    const result = patternDifference(unbounded, bounded)

    expect(result.isUnbounded).toBe(true)
  })

  it('should preserve quick-reject from first pattern', () => {
    const a = compile('src/**/*.ts')
    const b = compile('**/*.test.ts')
    const result = patternDifference(a, b)

    // Should inherit A's prefix requirement
    expect(result.quickReject.requiredPrefix).toBe('/src')
  })
})

describe('quick-reject filter merging', () => {
  describe('intersection (AND semantics)', () => {
    it('should take longer prefix when one is substring of other', () => {
      const a = compile('src/**')
      const b = compile('src/utils/**')
      const result = patternIntersect(a, b)

      expect(result.quickReject.requiredPrefix).toBe('/src/utils')
    })

    it('should combine required literals', () => {
      const a = compile('src/**/index.ts')
      const b = compile('**/utils/**/index.ts')
      const result = patternIntersect(a, b)

      const literals = result.quickReject.requiredLiterals ?? []
      expect(literals).toContain('src')
      expect(literals).toContain('index.ts')
      expect(literals).toContain('utils')
    })
  })

  describe('union (OR semantics)', () => {
    it('should take common prefix only', () => {
      const a = compile('src/utils/**')
      const b = compile('src/lib/**')
      const result = patternUnion(a, b)

      expect(result.quickReject.requiredPrefix).toBe('/src/')
    })

    it('should take intersection of required literals', () => {
      const a = compile('src/**/index.ts')
      const b = compile('lib/**/index.ts')
      const result = patternUnion(a, b)

      const literals = result.quickReject.requiredLiterals ?? []
      expect(literals).toContain('index.ts')
      // 'src' and 'lib' should NOT be required since they differ
      expect(literals).not.toContain('src')
      expect(literals).not.toContain('lib')
    })
  })
})

describe('composition of operations', () => {
  it('should support chained operations (simple case)', () => {
    // Use simpler patterns to test composition
    const srcJs = compile('src/*.js')
    const srcTs = compile('src/*.ts')
    const libJs = compile('lib/*.js')

    // Union of srcJs and srcTs
    const srcAll = patternUnion(srcJs, srcTs)
    expect(matchPath('/src/index.js', srcAll)).toBe(true)
    expect(matchPath('/src/index.ts', srcAll)).toBe(true)
    expect(matchPath('/lib/index.js', srcAll)).toBe(false)

    // Intersection of srcAll and libJs should be empty (different directories)
    const srcAndLib = patternIntersect(srcJs, libJs)
    expect(matchPath('/src/index.js', srcAndLib)).toBe(false)
    expect(matchPath('/lib/index.js', srcAndLib)).toBe(false)
  })

  it('should satisfy A ∩ B = A - (A - B) identity', () => {
    const a = compile('src/**')
    const b = compile('**/*.ts')

    const intersection = patternIntersect(a, b)
    const viaIdentity = patternDifference(a, patternDifference(a, b))

    // Both should produce equivalent behavior
    const testPaths = ['/src/index.ts', '/src/foo.js', '/lib/bar.ts']
    for (const path of testPaths) {
      expect(matchPath(path, intersection)).toBe(matchPath(path, viaIdentity))
    }
  })

  it('should support nested unions', () => {
    // Test union of unions
    const js = compile('*.js')
    const ts = compile('*.ts')
    const css = compile('*.css')

    const scriptsAndStyles = patternUnion(patternUnion(js, ts), css)
    expect(matchPath('/index.js', scriptsAndStyles)).toBe(true)
    expect(matchPath('/index.ts', scriptsAndStyles)).toBe(true)
    expect(matchPath('/style.css', scriptsAndStyles)).toBe(true)
    expect(matchPath('/readme.md', scriptsAndStyles)).toBe(false)
  })
})
