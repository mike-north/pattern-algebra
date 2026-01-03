import { describe, it, expect } from 'vitest'

import { parsePattern } from './parser'
import type { SegmentSequence, Alternation, LiteralSegment, WildcardSegment, CompositeSegment } from '../types'

describe('parsePattern', () => {
  describe('basic patterns', () => {
    it('parses literal path', () => {
      const pattern = parsePattern('src/index.ts')

      expect(pattern.source).toBe('src/index.ts')
      expect(pattern.isAbsolute).toBe(false)
      expect(pattern.isNegation).toBe(false)
      expect(pattern.errors).toBeUndefined()

      const root = pattern.root as SegmentSequence
      expect(root.type).toBe('sequence')
      expect(root.segments).toHaveLength(2)

      expect(root.segments[0].type).toBe('literal')
      expect((root.segments[0] as LiteralSegment).value).toBe('src')

      expect(root.segments[1].type).toBe('literal')
      expect((root.segments[1] as LiteralSegment).value).toBe('index.ts')
    })

    it('parses absolute path', () => {
      const pattern = parsePattern('/home/user/dev')

      expect(pattern.isAbsolute).toBe(true)
      expect(pattern.errors).toBeUndefined()

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(3)
      expect((root.segments[0] as LiteralSegment).value).toBe('home')
    })

    it('parses home-relative path', () => {
      const pattern = parsePattern('~/dev/project')

      expect(pattern.isAbsolute).toBe(true)
      expect(pattern.errors).toBeUndefined()

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(2)
      expect((root.segments[0] as LiteralSegment).value).toBe('dev')
    })

    it('parses negation pattern', () => {
      const pattern = parsePattern('!src/**/*.test.ts')

      expect(pattern.isNegation).toBe(true)
      expect(pattern.isAbsolute).toBe(false)
    })
  })

  describe('wildcards', () => {
    it('parses single-segment wildcard *', () => {
      const pattern = parsePattern('*.ts')

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(1)

      const seg = root.segments[0] as WildcardSegment
      expect(seg.type).toBe('wildcard')
      expect(seg.pattern).toBe('*.ts')
      expect(seg.parts).toEqual([{ type: 'star' }, { type: 'literal', value: '.ts' }])
    })

    it('parses complex wildcard pattern', () => {
      const pattern = parsePattern('test-*-spec.js')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as WildcardSegment
      expect(seg.type).toBe('wildcard')
      expect(seg.parts).toEqual([
        { type: 'literal', value: 'test-' },
        { type: 'star' },
        { type: 'literal', value: '-spec.js' },
      ])
    })

    it('parses ? wildcard', () => {
      const pattern = parsePattern('file?.txt')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as WildcardSegment
      expect(seg.type).toBe('wildcard')
      expect(seg.parts).toEqual([
        { type: 'literal', value: 'file' },
        { type: 'question' },
        { type: 'literal', value: '.txt' },
      ])
    })

    it('parses multiple wildcards', () => {
      const pattern = parsePattern('*-*-*.js')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as WildcardSegment
      expect(seg.parts).toEqual([
        { type: 'star' },
        { type: 'literal', value: '-' },
        { type: 'star' },
        { type: 'literal', value: '-' },
        { type: 'star' },
        { type: 'literal', value: '.js' },
      ])
    })
  })

  describe('globstar', () => {
    it('parses ** as globstar', () => {
      const pattern = parsePattern('src/**')

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(2)

      expect(root.segments[0].type).toBe('literal')
      expect(root.segments[1].type).toBe('globstar')
    })

    it('parses **/*.ts pattern', () => {
      const pattern = parsePattern('**/*.ts')

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(2)

      expect(root.segments[0].type).toBe('globstar')
      expect(root.segments[1].type).toBe('wildcard')
    })

    it('parses complex globstar pattern', () => {
      const pattern = parsePattern('src/**/lib/**/*.ts')

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(5)

      expect(root.segments[0].type).toBe('literal')
      expect(root.segments[1].type).toBe('globstar')
      expect(root.segments[2].type).toBe('literal')
      expect(root.segments[3].type).toBe('globstar')
      expect(root.segments[4].type).toBe('wildcard')
    })

    it('flags invalid globstar embedded in segment', () => {
      const pattern = parsePattern('src/**foo')

      expect(pattern.errors).toBeDefined()
      expect(pattern.errors?.some((e) => e.code === 'INVALID_GLOBSTAR')).toBe(true)
    })
  })

  describe('character classes', () => {
    it('parses simple character class', () => {
      const pattern = parsePattern('[abc]')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as CompositeSegment
      expect(seg.type).toBe('composite')
      expect(seg.parts).toHaveLength(1)
      expect(seg.parts[0].type).toBe('charclass')

      const charclass = (seg.parts[0] as { type: 'charclass'; spec: any }).spec
      expect(charclass.negated).toBe(false)
      expect(charclass.chars).toBe('abc')
      expect(charclass.ranges).toHaveLength(0)
    })

    it('parses character range', () => {
      const pattern = parsePattern('[a-z]')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as CompositeSegment
      const charclass = (seg.parts[0] as { type: 'charclass'; spec: any }).spec
      expect(charclass.ranges).toEqual([{ start: 'a', end: 'z' }])
    })

    it('parses negated character class', () => {
      const pattern = parsePattern('[!a-z]')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as CompositeSegment
      const charclass = (seg.parts[0] as { type: 'charclass'; spec: any }).spec
      expect(charclass.negated).toBe(true)
    })

    it('parses ^ as negation', () => {
      const pattern = parsePattern('[^0-9]')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as CompositeSegment
      const charclass = (seg.parts[0] as { type: 'charclass'; spec: any }).spec
      expect(charclass.negated).toBe(true)
    })

    it('parses complex character class', () => {
      const pattern = parsePattern('[a-zA-Z0-9_]')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as CompositeSegment
      const charclass = (seg.parts[0] as { type: 'charclass'; spec: any }).spec
      expect(charclass.ranges).toHaveLength(3)
      expect(charclass.chars).toBe('_')
    })

    it('parses composite segment with charclass', () => {
      const pattern = parsePattern('test-[0-9]*-spec.ts')

      const root = pattern.root as SegmentSequence
      const seg = root.segments[0] as CompositeSegment
      expect(seg.type).toBe('composite')
      expect(seg.parts).toHaveLength(4)
      expect(seg.parts[0]).toEqual({ type: 'literal', value: 'test-' })
      expect(seg.parts[1].type).toBe('charclass')
      expect(seg.parts[2]).toEqual({ type: 'star' })
      expect(seg.parts[3]).toEqual({ type: 'literal', value: '-spec.ts' })
    })

    it('flags unclosed bracket', () => {
      const pattern = parsePattern('[abc')

      expect(pattern.errors).toBeDefined()
      expect(pattern.errors?.some((e) => e.code === 'UNCLOSED_BRACKET')).toBe(true)
    })

    it('flags invalid range', () => {
      const pattern = parsePattern('[z-a]')

      expect(pattern.errors).toBeDefined()
      expect(pattern.errors?.some((e) => e.code === 'INVALID_RANGE')).toBe(true)
    })
  })

  describe('brace expansion', () => {
    it('parses simple brace expansion', () => {
      const pattern = parsePattern('{src,lib}')

      expect(pattern.root.type).toBe('alternation')
      const alt = pattern.root as Alternation
      expect(alt.branches).toHaveLength(2)
    })

    it('parses brace expansion with path suffix', () => {
      const pattern = parsePattern('{src,lib}/**/*.ts')

      expect(pattern.root.type).toBe('alternation')
      const alt = pattern.root as Alternation
      expect(alt.branches).toHaveLength(2)

      // Both branches should have the same suffix structure
      for (const branch of alt.branches) {
        expect(branch.type).toBe('sequence')
        const seq = branch as SegmentSequence
        expect(seq.segments).toHaveLength(3)
        expect(seq.segments[1].type).toBe('globstar')
      }
    })

    it('flags nested braces', () => {
      const pattern = parsePattern('{a,{b,c}}')

      expect(pattern.errors).toBeDefined()
      expect(pattern.errors?.some((e) => e.code === 'NESTED_BRACES')).toBe(true)
    })

    it('flags unclosed brace', () => {
      const pattern = parsePattern('{a,b')

      expect(pattern.errors).toBeDefined()
      expect(pattern.errors?.some((e) => e.code === 'UNCLOSED_BRACE')).toBe(true)
    })
  })

  describe('escape sequences', () => {
    it('escapes special characters in literals', () => {
      const pattern = parsePattern('file\\*.txt')

      const root = pattern.root as SegmentSequence
      expect(root.segments[0].type).toBe('literal')
      expect((root.segments[0] as LiteralSegment).value).toBe('file*.txt')
    })

    it('escapes brackets', () => {
      const pattern = parsePattern('file\\[1\\].txt')

      const root = pattern.root as SegmentSequence
      expect(root.segments[0].type).toBe('literal')
      expect((root.segments[0] as LiteralSegment).value).toBe('file[1].txt')
    })
  })

  describe('edge cases', () => {
    it('handles empty pattern', () => {
      const pattern = parsePattern('')

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(0)
    })

    it('handles single slash', () => {
      const pattern = parsePattern('/')

      expect(pattern.isAbsolute).toBe(true)
      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(0)
    })

    it('handles tilde only', () => {
      const pattern = parsePattern('~')

      expect(pattern.isAbsolute).toBe(true)
      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(0)
    })

    it('handles dotfiles', () => {
      const pattern = parsePattern('.gitignore')

      const root = pattern.root as SegmentSequence
      expect(root.segments[0].type).toBe('literal')
      expect((root.segments[0] as LiteralSegment).value).toBe('.gitignore')
    })

    it('handles double dots (..)', () => {
      const pattern = parsePattern('../parent')

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(2)
      expect((root.segments[0] as LiteralSegment).value).toBe('..')
      expect((root.segments[1] as LiteralSegment).value).toBe('parent')
    })

    it('handles consecutive slashes', () => {
      // Note: consecutive slashes create empty segments which are filtered
      const pattern = parsePattern('a//b')

      const root = pattern.root as SegmentSequence
      expect(root.segments).toHaveLength(2)
    })
  })
})
