/**
 * Path normalization and manipulation utilities.
 * @packageDocumentation
 */

/**
 * Context for path resolution operations.
 * @public
 */
export interface PathContext {
  /** User's home directory for ~ expansion */
  readonly homeDir: string

  /** Current working directory for relative path resolution */
  readonly cwd: string

  /** Optional project root for project-relative patterns */
  readonly projectRoot?: string
}

/**
 * Normalize a path to absolute form for consistent matching.
 *
 * Handles:
 * - ~ expansion to home directory
 * - Relative path resolution against cwd
 * - . and .. resolution
 * - Trailing slash normalization (removed)
 * - Duplicate slash removal
 * - Backslash to forward slash conversion (Windows compatibility)
 *
 * @param path - Input path (may be relative or contain ~)
 * @param context - Context for resolution
 * @returns Absolute, normalized path
 *
 * @public
 */
export function normalizePath(path: string, context: PathContext): string {
  let normalized = path

  // Convert backslashes to forward slashes for cross-platform compatibility
  normalized = normalized.replace(/\\/g, '/')

  // Expand ~ to home directory
  if (normalized === '~') {
    normalized = context.homeDir
  } else if (normalized.startsWith('~/')) {
    normalized = context.homeDir + normalized.slice(1)
  }

  // Handle relative paths
  if (!normalized.startsWith('/')) {
    normalized = context.cwd + '/' + normalized
  }

  // Split into segments and resolve . and ..
  const segments = normalized.split('/').filter((s) => s !== '')
  const resolved: string[] = []

  for (const segment of segments) {
    if (segment === '.') {
      // Current directory - skip
      continue
    } else if (segment === '..') {
      // Parent directory - pop if possible
      if (resolved.length > 0) {
        resolved.pop()
      }
      // At root, .. is a no-op
    } else {
      resolved.push(segment)
    }
  }

  // Reconstruct path with leading slash
  return '/' + resolved.join('/')
}

/**
 * Split a normalized path into segments.
 *
 * @param path - A normalized absolute path (starting with /)
 * @returns Array of path segments (excluding the root)
 *
 * @example
 * pathToSegments('/home/user/dev/file.ts')
 * // => ['home', 'user', 'dev', 'file.ts']
 *
 * @public
 */
export function pathToSegments(path: string): readonly string[] {
  // Handle edge cases
  if (path === '' || path === '/') {
    return []
  }

  // Remove leading slash and split
  const withoutLeadingSlash = path.startsWith('/') ? path.slice(1) : path

  // Remove trailing slash if present
  const withoutTrailingSlash = withoutLeadingSlash.endsWith('/')
    ? withoutLeadingSlash.slice(0, -1)
    : withoutLeadingSlash

  if (withoutTrailingSlash === '') {
    return []
  }

  return withoutTrailingSlash.split('/')
}

/**
 * Join segments back into a path.
 *
 * @param segments - Array of path segments
 * @returns Absolute path string
 *
 * @example
 * segmentsToPath(['home', 'user', 'dev', 'file.ts'])
 * // => '/home/user/dev/file.ts'
 *
 * @public
 */
export function segmentsToPath(segments: readonly string[]): string {
  if (segments.length === 0) {
    return '/'
  }
  return '/' + segments.join('/')
}

/**
 * Check if a path is absolute (starts with / or ~).
 *
 * @param path - Path to check
 * @returns true if the path is absolute
 *
 * @public
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('~')
}

/**
 * Get the file extension from a path segment or full path.
 *
 * @param pathOrSegment - A path or segment to extract extension from
 * @returns The extension including the dot, or empty string if none
 *
 * @example
 * getExtension('file.ts') // => '.ts'
 * getExtension('file.test.ts') // => '.ts'
 * getExtension('.gitignore') // => '' (dotfiles have no extension)
 * getExtension('Makefile') // => ''
 *
 * @public
 */
export function getExtension(pathOrSegment: string): string {
  // Get the last segment if this is a full path
  const lastSlash = pathOrSegment.lastIndexOf('/')
  const segment = lastSlash >= 0 ? pathOrSegment.slice(lastSlash + 1) : pathOrSegment

  // Find the last dot that's not at the start (dotfiles don't count)
  const lastDot = segment.lastIndexOf('.')
  if (lastDot <= 0) {
    return ''
  }

  return segment.slice(lastDot)
}

/**
 * Get the basename (final segment) from a path.
 *
 * @param path - Path to extract basename from
 * @returns The final segment of the path
 *
 * @public
 */
export function getBasename(path: string): string {
  const segments = pathToSegments(path)
  return segments.length > 0 ? segments[segments.length - 1] : ''
}

/**
 * Get the directory portion of a path (everything except the last segment).
 *
 * @param path - Path to extract directory from
 * @returns The directory path
 *
 * @public
 */
export function getDirname(path: string): string {
  const segments = pathToSegments(path)
  if (segments.length <= 1) {
    return '/'
  }
  return segmentsToPath(segments.slice(0, -1))
}

/**
 * Check if path A is a prefix of path B (A is an ancestor directory of B).
 *
 * @param ancestor - Potential ancestor path
 * @param descendant - Potential descendant path
 * @returns true if ancestor is a prefix of descendant
 *
 * @example
 * isAncestorPath('/home/user', '/home/user/dev/file.ts') // => true
 * isAncestorPath('/home/user', '/home/user') // => true (same path)
 * isAncestorPath('/home/user', '/home/other') // => false
 *
 * @public
 */
export function isAncestorPath(ancestor: string, descendant: string): boolean {
  const ancestorSegments = pathToSegments(ancestor)
  const descendantSegments = pathToSegments(descendant)

  if (ancestorSegments.length > descendantSegments.length) {
    return false
  }

  for (let i = 0; i < ancestorSegments.length; i++) {
    if (ancestorSegments[i] !== descendantSegments[i]) {
      return false
    }
  }

  return true
}

/**
 * Find the common prefix path between two paths.
 *
 * @param pathA - First path
 * @param pathB - Second path
 * @returns The longest common ancestor path
 *
 * @example
 * commonPrefix('/home/user/a/b', '/home/user/c/d')
 * // => '/home/user'
 *
 * @public
 */
export function commonPrefix(pathA: string, pathB: string): string {
  const segmentsA = pathToSegments(pathA)
  const segmentsB = pathToSegments(pathB)

  const common: string[] = []
  const minLength = Math.min(segmentsA.length, segmentsB.length)

  for (let i = 0; i < minLength; i++) {
    if (segmentsA[i] === segmentsB[i]) {
      common.push(segmentsA[i])
    } else {
      break
    }
  }

  return segmentsToPath(common)
}
