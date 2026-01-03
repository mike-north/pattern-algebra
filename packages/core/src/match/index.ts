/**
 * Path matching utilities.
 * @packageDocumentation
 */

export {
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

export { matchPath, matchPathWithContext, matchPathDirect } from './matcher'

export { matchSegment, segmentToRegex } from './segment-matcher'
