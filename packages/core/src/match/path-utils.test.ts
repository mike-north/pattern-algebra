import { describe, it, expect } from 'vitest'

import {
  normalizePath,
  pathToSegments,
  segmentsToPath,
  isAbsolutePath,
  getExtension,
  getBasename,
  getDirname,
  isAncestorPath,
  commonPrefix,
  type PathContext,
} from './path-utils'

const defaultContext: PathContext = {
  homeDir: '/home/user',
  cwd: '/home/user/projects',
}

describe('normalizePath', () => {
  it('expands ~ to home directory', () => {
    expect(normalizePath('~', defaultContext)).toBe('/home/user')
    expect(normalizePath('~/dev', defaultContext)).toBe('/home/user/dev')
    expect(normalizePath('~/dev/project', defaultContext)).toBe('/home/user/dev/project')
  })

  it('resolves relative paths against cwd', () => {
    expect(normalizePath('src', defaultContext)).toBe('/home/user/projects/src')
    expect(normalizePath('src/index.ts', defaultContext)).toBe('/home/user/projects/src/index.ts')
  })

  it('leaves absolute paths unchanged (except normalization)', () => {
    expect(normalizePath('/etc/passwd', defaultContext)).toBe('/etc/passwd')
    expect(normalizePath('/home/other/file', defaultContext)).toBe('/home/other/file')
  })

  it('resolves . (current directory)', () => {
    expect(normalizePath('./src', defaultContext)).toBe('/home/user/projects/src')
    expect(normalizePath('src/./lib', defaultContext)).toBe('/home/user/projects/src/lib')
    expect(normalizePath('/a/./b/./c', defaultContext)).toBe('/a/b/c')
  })

  it('resolves .. (parent directory)', () => {
    expect(normalizePath('../other', defaultContext)).toBe('/home/user/other')
    expect(normalizePath('src/../lib', defaultContext)).toBe('/home/user/projects/lib')
    expect(normalizePath('/a/b/c/../d', defaultContext)).toBe('/a/b/d')
    expect(normalizePath('/a/b/../c/../d', defaultContext)).toBe('/a/d')
  })

  it('handles .. at root (becomes no-op)', () => {
    expect(normalizePath('/..', defaultContext)).toBe('/')
    expect(normalizePath('/../a', defaultContext)).toBe('/a')
    expect(normalizePath('/a/../../b', defaultContext)).toBe('/b')
  })

  it('removes trailing slashes', () => {
    expect(normalizePath('/home/user/', defaultContext)).toBe('/home/user')
    expect(normalizePath('~/dev/', defaultContext)).toBe('/home/user/dev')
  })

  it('removes duplicate slashes', () => {
    expect(normalizePath('/home//user///dev', defaultContext)).toBe('/home/user/dev')
  })

  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('/home\\user\\dev', defaultContext)).toBe('/home/user/dev')
    expect(normalizePath('src\\lib\\file.ts', defaultContext)).toBe('/home/user/projects/src/lib/file.ts')
  })

  it('handles empty path', () => {
    expect(normalizePath('', defaultContext)).toBe('/home/user/projects')
  })
})

describe('pathToSegments', () => {
  it('splits path into segments', () => {
    expect(pathToSegments('/home/user/dev')).toEqual(['home', 'user', 'dev'])
    expect(pathToSegments('/a/b/c/d')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('handles root path', () => {
    expect(pathToSegments('/')).toEqual([])
  })

  it('handles empty string', () => {
    expect(pathToSegments('')).toEqual([])
  })

  it('handles single segment', () => {
    expect(pathToSegments('/file')).toEqual(['file'])
  })

  it('handles paths without leading slash', () => {
    expect(pathToSegments('a/b/c')).toEqual(['a', 'b', 'c'])
  })

  it('handles trailing slash', () => {
    expect(pathToSegments('/home/user/')).toEqual(['home', 'user'])
  })
})

describe('segmentsToPath', () => {
  it('joins segments into path', () => {
    expect(segmentsToPath(['home', 'user', 'dev'])).toBe('/home/user/dev')
    expect(segmentsToPath(['a', 'b', 'c'])).toBe('/a/b/c')
  })

  it('handles empty segments array', () => {
    expect(segmentsToPath([])).toBe('/')
  })

  it('handles single segment', () => {
    expect(segmentsToPath(['file'])).toBe('/file')
  })

  it('round-trips with pathToSegments', () => {
    const paths = ['/home/user/dev', '/a/b/c/d', '/file', '/']
    for (const path of paths) {
      expect(segmentsToPath(pathToSegments(path))).toBe(path)
    }
  })
})

describe('isAbsolutePath', () => {
  it('returns true for paths starting with /', () => {
    expect(isAbsolutePath('/home/user')).toBe(true)
    expect(isAbsolutePath('/etc/passwd')).toBe(true)
    expect(isAbsolutePath('/')).toBe(true)
  })

  it('returns true for paths starting with ~', () => {
    expect(isAbsolutePath('~')).toBe(true)
    expect(isAbsolutePath('~/dev')).toBe(true)
    expect(isAbsolutePath('~/.config')).toBe(true)
  })

  it('returns false for relative paths', () => {
    expect(isAbsolutePath('src')).toBe(false)
    expect(isAbsolutePath('src/index.ts')).toBe(false)
    expect(isAbsolutePath('./file')).toBe(false)
    expect(isAbsolutePath('../parent')).toBe(false)
  })
})

describe('getExtension', () => {
  it('extracts file extension', () => {
    expect(getExtension('file.ts')).toBe('.ts')
    expect(getExtension('file.test.ts')).toBe('.ts')
    expect(getExtension('archive.tar.gz')).toBe('.gz')
  })

  it('returns empty for files without extension', () => {
    expect(getExtension('Makefile')).toBe('')
    expect(getExtension('README')).toBe('')
  })

  it('returns empty for dotfiles (starting with dot)', () => {
    expect(getExtension('.gitignore')).toBe('')
    expect(getExtension('.env')).toBe('')
    expect(getExtension('.bashrc')).toBe('')
  })

  it('handles dotfiles with extensions', () => {
    expect(getExtension('.eslintrc.json')).toBe('.json')
    expect(getExtension('.prettierrc.yaml')).toBe('.yaml')
  })

  it('handles full paths', () => {
    expect(getExtension('/home/user/file.ts')).toBe('.ts')
    expect(getExtension('/home/user/.gitignore')).toBe('')
  })
})

describe('getBasename', () => {
  it('returns the final segment', () => {
    expect(getBasename('/home/user/file.ts')).toBe('file.ts')
    expect(getBasename('/a/b/c')).toBe('c')
  })

  it('handles root path', () => {
    expect(getBasename('/')).toBe('')
  })

  it('handles single segment', () => {
    expect(getBasename('/file')).toBe('file')
  })
})

describe('getDirname', () => {
  it('returns the directory portion', () => {
    expect(getDirname('/home/user/file.ts')).toBe('/home/user')
    expect(getDirname('/a/b/c/d')).toBe('/a/b/c')
  })

  it('handles paths at root level', () => {
    expect(getDirname('/file')).toBe('/')
    expect(getDirname('/')).toBe('/')
  })
})

describe('isAncestorPath', () => {
  it('returns true for ancestor paths', () => {
    expect(isAncestorPath('/home', '/home/user/dev')).toBe(true)
    expect(isAncestorPath('/home/user', '/home/user/dev/file.ts')).toBe(true)
  })

  it('returns true for same path', () => {
    expect(isAncestorPath('/home/user', '/home/user')).toBe(true)
  })

  it('returns false for non-ancestors', () => {
    expect(isAncestorPath('/home/user', '/home/other')).toBe(false)
    expect(isAncestorPath('/home/user/dev', '/home/user')).toBe(false)
  })

  it('handles root', () => {
    expect(isAncestorPath('/', '/home/user')).toBe(true)
    expect(isAncestorPath('/', '/')).toBe(true)
  })

  // Negative test: partial segment matches should fail
  it('does not match partial segments', () => {
    // '/home/user' is NOT an ancestor of '/home/username'
    expect(isAncestorPath('/home/user', '/home/username')).toBe(false)
  })
})

describe('commonPrefix', () => {
  it('finds common prefix', () => {
    expect(commonPrefix('/home/user/a/b', '/home/user/c/d')).toBe('/home/user')
    expect(commonPrefix('/a/b/c', '/a/b/d')).toBe('/a/b')
  })

  it('returns root when no common prefix', () => {
    expect(commonPrefix('/home/user', '/etc/passwd')).toBe('/')
  })

  it('returns full path when identical', () => {
    expect(commonPrefix('/home/user', '/home/user')).toBe('/home/user')
  })

  it('handles one path being prefix of another', () => {
    expect(commonPrefix('/home/user', '/home/user/dev')).toBe('/home/user')
    expect(commonPrefix('/home/user/dev', '/home/user')).toBe('/home/user')
  })
})
