---
'@pattern-algebra/core': minor
---

## New Features

### Pattern Algebra Operations

- Added `patternIntersect()`, `patternUnion()`, `patternComplement()`, and `patternDifference()` for set operations on compiled patterns
- Patterns can now be combined using standard set algebra

### Automaton Improvements

- Added DFA size limits to prevent exponential state blowup during determinization
- `determinize()` now accepts `DeterminizeOptions` with configurable `maxStates` (default: 10,000)
- Added `AutomatonLimitError` for handling state limit exceeded conditions
- Added `SegmentMatcher` interface for composite pattern matching without faking RegExp

### Path Utilities

- Added `PathContext` interface for path resolution operations
- Updated `normalizePath()` to properly handle `~`, relative paths, and project roots

## Bug Fixes

- Fixed `createIntersectionPattern` to use proper `SegmentMatcher` instead of fake RegExp object with invalid properties

## Documentation

- Added comprehensive JSDoc documentation to all interface properties in type definitions
- Documented `PathContext` usage in README
- Added examples for pattern algebra operations

## Tests

- Added 38 new tests for automaton operations:
  - 14 tests for `determinize()` including state limit handling
  - 15 tests for `isEmpty()`, `findWitness()`, and `countPaths()`
  - 9 tests for `complement()` operation
