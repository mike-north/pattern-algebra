import { describe, it, expect } from 'vitest'

import { parsePattern } from '../parse'
import { compilePattern } from '../compile'
import { matchPath, matchPathDirect } from './matcher'

describe('matchPath', () => {
  describe('literal patterns', () => {
    it('matches exact path', () => {
      const pattern = compilePattern(parsePattern('src/index.ts'))

      expect(matchPath('/src/index.ts', pattern)).toBe(true)
      expect(matchPath('/src/other.ts', pattern)).toBe(false)
      expect(matchPath('/lib/index.ts', pattern)).toBe(false)
    })

    it('matches multi-segment path', () => {
      const pattern = compilePattern(parsePattern('a/b/c/d'))

      expect(matchPath('/a/b/c/d', pattern)).toBe(true)
      expect(matchPath('/a/b/c', pattern)).toBe(false)
      expect(matchPath('/a/b/c/d/e', pattern)).toBe(false)
    })
  })

  describe('single wildcard (*)', () => {
    it('matches any single segment with *', () => {
      const pattern = compilePattern(parsePattern('src/*'))

      expect(matchPath('/src/foo', pattern)).toBe(true)
      expect(matchPath('/src/bar', pattern)).toBe(true)
      expect(matchPath('/src/foo/bar', pattern)).toBe(false)
      expect(matchPath('/lib/foo', pattern)).toBe(false)
    })

    it('matches file extension pattern', () => {
      const pattern = compilePattern(parsePattern('*.ts'))

      expect(matchPath('/index.ts', pattern)).toBe(true)
      expect(matchPath('/foo.ts', pattern)).toBe(true)
      expect(matchPath('/foo.js', pattern)).toBe(false)
      expect(matchPath('/src/foo.ts', pattern)).toBe(false)
    })

    it('matches complex wildcard', () => {
      const pattern = compilePattern(parsePattern('test-*-spec.js'))

      expect(matchPath('/test-unit-spec.js', pattern)).toBe(true)
      expect(matchPath('/test-integration-spec.js', pattern)).toBe(true)
      expect(matchPath('/test-spec.js', pattern)).toBe(false) // Missing middle part? Actually * can match zero chars
    })

    it('matches prefix wildcard', () => {
      const pattern = compilePattern(parsePattern('*-config.json'))

      expect(matchPath('/app-config.json', pattern)).toBe(true)
      expect(matchPath('/db-config.json', pattern)).toBe(true)
      expect(matchPath('/config.json', pattern)).toBe(false)
    })
  })

  describe('globstar (**)', () => {
    it('matches zero segments', () => {
      const pattern = compilePattern(parsePattern('src/**/*.ts'))

      expect(matchPath('/src/foo.ts', pattern)).toBe(true)
    })

    it('matches one segment', () => {
      const pattern = compilePattern(parsePattern('src/**/*.ts'))

      expect(matchPath('/src/lib/foo.ts', pattern)).toBe(true)
    })

    it('matches multiple segments', () => {
      const pattern = compilePattern(parsePattern('src/**/*.ts'))

      expect(matchPath('/src/a/b/c/foo.ts', pattern)).toBe(true)
    })

    it('matches at end', () => {
      const pattern = compilePattern(parsePattern('src/**'))

      expect(matchPath('/src', pattern)).toBe(false) // Need at least one segment? Actually ** matches zero
      expect(matchPath('/src/foo', pattern)).toBe(true)
      expect(matchPath('/src/a/b/c', pattern)).toBe(true)
    })

    it('matches at start', () => {
      const pattern = compilePattern(parsePattern('**/*.ts'))

      expect(matchPath('/foo.ts', pattern)).toBe(true)
      expect(matchPath('/src/foo.ts', pattern)).toBe(true)
      expect(matchPath('/a/b/c/foo.ts', pattern)).toBe(true)
    })

    it('matches in middle', () => {
      const pattern = compilePattern(parsePattern('src/**/test/*.ts'))

      expect(matchPath('/src/test/foo.ts', pattern)).toBe(true)
      expect(matchPath('/src/lib/test/foo.ts', pattern)).toBe(true)
      expect(matchPath('/src/a/b/test/foo.ts', pattern)).toBe(true)
    })

    it('matches multiple globstars', () => {
      const pattern = compilePattern(parsePattern('**/node_modules/**'))

      expect(matchPath('/node_modules/foo', pattern)).toBe(true)
      expect(matchPath('/src/node_modules/bar', pattern)).toBe(true)
      expect(matchPath('/a/b/node_modules/c/d', pattern)).toBe(true)
    })
  })

  describe('question mark (?)', () => {
    it('matches single character', () => {
      const pattern = compilePattern(parsePattern('file?.txt'))

      expect(matchPath('/file1.txt', pattern)).toBe(true)
      expect(matchPath('/fileA.txt', pattern)).toBe(true)
      expect(matchPath('/file.txt', pattern)).toBe(false)
      expect(matchPath('/file12.txt', pattern)).toBe(false)
    })

    it('matches multiple question marks', () => {
      const pattern = compilePattern(parsePattern('???.md'))

      expect(matchPath('/abc.md', pattern)).toBe(true)
      expect(matchPath('/xyz.md', pattern)).toBe(true)
      expect(matchPath('/ab.md', pattern)).toBe(false)
      expect(matchPath('/abcd.md', pattern)).toBe(false)
    })
  })

  describe('character classes', () => {
    it('matches character set', () => {
      const pattern = compilePattern(parsePattern('file[abc].txt'))

      expect(matchPath('/filea.txt', pattern)).toBe(true)
      expect(matchPath('/fileb.txt', pattern)).toBe(true)
      expect(matchPath('/filec.txt', pattern)).toBe(true)
      expect(matchPath('/filed.txt', pattern)).toBe(false)
    })

    it('matches character range', () => {
      const pattern = compilePattern(parsePattern('file[0-9].txt'))

      expect(matchPath('/file0.txt', pattern)).toBe(true)
      expect(matchPath('/file5.txt', pattern)).toBe(true)
      expect(matchPath('/file9.txt', pattern)).toBe(true)
      expect(matchPath('/filea.txt', pattern)).toBe(false)
    })

    it('matches negated class', () => {
      const pattern = compilePattern(parsePattern('file[!0-9].txt'))

      expect(matchPath('/filea.txt', pattern)).toBe(true)
      expect(matchPath('/filez.txt', pattern)).toBe(true)
      expect(matchPath('/file5.txt', pattern)).toBe(false)
    })

    it('matches complex class', () => {
      const pattern = compilePattern(parsePattern('[a-zA-Z0-9_].txt'))

      expect(matchPath('/a.txt', pattern)).toBe(true)
      expect(matchPath('/Z.txt', pattern)).toBe(true)
      expect(matchPath('/5.txt', pattern)).toBe(true)
      expect(matchPath('/_.txt', pattern)).toBe(true)
      expect(matchPath('/-.txt', pattern)).toBe(false)
    })
  })

  describe('brace expansion', () => {
    it('matches alternatives', () => {
      const pattern = compilePattern(parsePattern('{src,lib}/**/*.ts'))

      expect(matchPath('/src/foo.ts', pattern)).toBe(true)
      expect(matchPath('/lib/bar.ts', pattern)).toBe(true)
      expect(matchPath('/test/foo.ts', pattern)).toBe(false)
    })

    it('matches file extensions', () => {
      const pattern = compilePattern(parsePattern('*.{js,ts,jsx,tsx}'))

      expect(matchPath('/foo.js', pattern)).toBe(true)
      expect(matchPath('/foo.ts', pattern)).toBe(true)
      expect(matchPath('/foo.jsx', pattern)).toBe(true)
      expect(matchPath('/foo.tsx', pattern)).toBe(true)
      expect(matchPath('/foo.css', pattern)).toBe(false)
    })
  })

  describe('negation', () => {
    it('inverts match result', () => {
      const pattern = compilePattern(parsePattern('!*.test.ts'))

      expect(matchPath('/foo.test.ts', pattern)).toBe(false)
      expect(matchPath('/foo.ts', pattern)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('handles empty pattern', () => {
      const pattern = compilePattern(parsePattern(''))

      expect(matchPath('/', pattern)).toBe(true)
      expect(matchPath('/foo', pattern)).toBe(false)
    })

    it('handles dotfiles', () => {
      const pattern = compilePattern(parsePattern('.gitignore'))

      expect(matchPath('/.gitignore', pattern)).toBe(true)
      expect(matchPath('/gitignore', pattern)).toBe(false)
    })

    it('handles hidden directories', () => {
      const pattern = compilePattern(parsePattern('**/.git/**'))

      expect(matchPath('/.git/config', pattern)).toBe(true)
      expect(matchPath('/src/.git/HEAD', pattern)).toBe(true)
    })

    it('handles paths with special characters', () => {
      const pattern = compilePattern(parsePattern('file-name_123.txt'))

      expect(matchPath('/file-name_123.txt', pattern)).toBe(true)
    })
  })
})

describe('matchPathDirect', () => {
  it('matches without compilation', () => {
    const pattern = parsePattern('src/**/*.ts')

    expect(matchPathDirect('/src/foo.ts', pattern)).toBe(true)
    expect(matchPathDirect('/src/lib/bar.ts', pattern)).toBe(true)
    expect(matchPathDirect('/lib/foo.ts', pattern)).toBe(false)
  })
})
