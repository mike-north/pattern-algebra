# @pattern-algebra/core

A TypeScript library for path pattern algebra - parsing, compiling, matching, and performing set operations on glob patterns. Designed for policy systems, build tools, and any application that needs to reason about path patterns mathematically.

## Features

- **Pattern Parsing**: Parse glob patterns with support for `*`, `**`, `?`, `[...]`, `{a,b}`, and negation
- **Pattern Matching**: Efficiently match file paths against compiled patterns
- **Pattern Algebra**: Perform set operations (intersection, union, complement, difference) on patterns
- **Containment Checking**: Determine if one pattern contains, overlaps with, or is disjoint from another
- **Path Utilities**: Normalize paths, extract segments, and perform common path operations
- **Type-Safe**: Written in TypeScript with comprehensive type definitions

## Installation

```bash
# pnpm
pnpm add @pattern-algebra/core

# npm
npm install @pattern-algebra/core

# yarn
yarn add @pattern-algebra/core
```

## Quick Start

```typescript
import {
  parsePattern,
  compilePattern,
  matchPath,
  patternIntersect,
  patternUnion,
  checkContainment,
} from '@pattern-algebra/core'

// Parse and compile a pattern
const pattern = compilePattern(parsePattern('src/**/*.ts'))

// Match paths against the pattern
matchPath('/src/index.ts', pattern) // true
matchPath('/src/utils/helper.ts', pattern) // true
matchPath('/lib/index.ts', pattern) // false

// Combine patterns with set operations
const srcFiles = compilePattern(parsePattern('src/**'))
const tsFiles = compilePattern(parsePattern('**/*.ts'))

// Intersection: files matching BOTH patterns
const srcTsFiles = patternIntersect(srcFiles, tsFiles)
matchPath('/src/index.ts', srcTsFiles) // true
matchPath('/lib/index.ts', srcTsFiles) // false

// Union: files matching EITHER pattern
const combined = patternUnion(compilePattern(parsePattern('**/*.js')), compilePattern(parsePattern('**/*.ts')))
matchPath('/src/index.js', combined) // true
matchPath('/src/index.ts', combined) // true

// Check containment relationships
const result = checkContainment(compilePattern(parsePattern('src/index.ts')), compilePattern(parsePattern('src/*.ts')))
result.isSubset // true
result.relationship // 'subset'
```

## Pattern Syntax

### Basic Wildcards

- `*` - Matches any characters within a single path segment (does not cross `/`)

  ```typescript
  '*.ts' // matches: index.ts, helper.ts
  // does NOT match: src/index.ts

  'test-*-spec.js' // matches: test-unit-spec.js, test-integration-spec.js
  ```

- `?` - Matches exactly one character

  ```typescript
  'file?.ts' // matches: file1.ts, fileA.ts
  // does NOT match: file10.ts
  ```

- `**` - Globstar: matches zero or more path segments

  ```typescript
  'src/**/*.ts' // matches: src/index.ts, src/lib/util/helper.ts

  '**/*.test.ts' // matches: foo.test.ts, src/bar.test.ts, a/b/c/baz.test.ts
  ```

### Character Classes

- `[abc]` - Matches any character in the set

  ```typescript
  '[aeiou]*.txt' // matches: apple.txt, index.txt
  ```

- `[a-z]` - Matches any character in the range

  ```typescript
  'file[0-9].ts' // matches: file1.ts, file9.ts
  ```

- `[!abc]` - Matches any character NOT in the set
  ```typescript
  '[!.]*.ts' // matches files not starting with a dot
  ```

### Brace Expansion

- `{a,b,c}` - Matches any of the comma-separated alternatives

  ```typescript
  '*.{js,ts}' // matches: index.js, helper.ts

  'src/{lib,test}/**' // matches: src/lib/*, src/test/*
  ```

### Negation

- `!pattern` - Negates a pattern (typically used in arrays of patterns)
  ```typescript
  const pattern = parsePattern('!node_modules/**')
  ```

## API Reference

### Parsing

#### `parsePattern(source: string): PathPattern`

Parses a pattern string into an Abstract Syntax Tree (AST).

```typescript
import { parsePattern } from '@pattern-algebra/core'

const ast = parsePattern('src/**/*.ts')
// Returns AST representation of the pattern
```

#### `validatePattern(source: string): PatternError[]`

Validates a pattern and returns any errors found.

```typescript
import { validatePattern } from '@pattern-algebra/core'

const errors = validatePattern('src/[invalid')
if (errors.length > 0) {
  console.error('Invalid pattern:', errors)
}
```

#### `isValidPattern(source: string): boolean`

Checks if a pattern is valid.

```typescript
import { isValidPattern } from '@pattern-algebra/core'

if (isValidPattern('src/**/*.ts')) {
  // Pattern is valid
}
```

#### `expandBraces(source: string): string[]`

Expands brace patterns into multiple patterns.

```typescript
import { expandBraces } from '@pattern-algebra/core'

expandBraces('*.{js,ts}')
// Returns: ['*.js', '*.ts']

expandBraces('src/{lib,test}/**')
// Returns: ['src/lib/**', 'src/test/**']
```

### Compilation

#### `compilePattern(ast: PathPattern): CompiledPattern`

Compiles a parsed pattern into an efficient matching automaton.

```typescript
import { parsePattern, compilePattern } from '@pattern-algebra/core'

const pattern = compilePattern(parsePattern('src/**/*.ts'))
// Pattern is now ready for matching
```

### Matching

#### `matchPath(path: string, pattern: CompiledPattern): boolean`

Matches a file path against a compiled pattern.

```typescript
import { parsePattern, compilePattern, matchPath } from '@pattern-algebra/core'

const pattern = compilePattern(parsePattern('src/**/*.ts'))

matchPath('/src/index.ts', pattern) // true
matchPath('/lib/index.ts', pattern) // false
```

**Note:** Paths should be normalized (use forward slashes, no leading `./`). Use `normalizePath()` if needed.

### Path Utilities

#### `PathContext`

The `PathContext` interface provides context for path resolution operations. It is used with `normalizePath()` to handle home directory expansion, relative path resolution, and project-relative paths.

```typescript
import type { PathContext } from '@pattern-algebra/core'

const context: PathContext = {
  homeDir: '/home/user', // User's home directory (for ~ expansion)
  cwd: '/home/user/project', // Current working directory
  projectRoot: '/home/user/project', // Optional: project root for project-relative patterns
}
```

**Properties:**

- `homeDir` (required): The user's home directory, used to expand `~` in paths
- `cwd` (required): The current working directory, used to resolve relative paths
- `projectRoot` (optional): The project root directory for project-relative pattern resolution

#### `normalizePath(path: string, context: PathContext): string`

Normalizes a file path by resolving `~`, `.`, and `..` segments, converting backslashes to forward slashes, and handling relative paths.

```typescript
import { normalizePath } from '@pattern-algebra/core'

const context = {
  homeDir: '/home/user',
  cwd: '/home/user/project',
}

normalizePath('./src/../lib/index.ts', context) // '/home/user/project/lib/index.ts'
normalizePath('src\\utils\\helper.ts', context) // '/home/user/project/src/utils/helper.ts'
normalizePath('~/Documents/file.txt', context) // '/home/user/Documents/file.txt'
```

#### `pathToSegments(path: string): string[]`

Splits a path into segments.

```typescript
import { pathToSegments } from '@pattern-algebra/core'

pathToSegments('/src/lib/index.ts') // ['src', 'lib', 'index.ts']
```

#### `segmentsToPath(segments: string[]): string`

Joins segments into a path.

```typescript
import { segmentsToPath } from '@pattern-algebra/core'

segmentsToPath(['src', 'lib', 'index.ts']) // 'src/lib/index.ts'
```

### Pattern Algebra (Set Operations)

#### `patternIntersect(a: CompiledPattern, b: CompiledPattern): CompiledPattern`

Creates a pattern matching paths that match BOTH input patterns.

```typescript
import { parsePattern, compilePattern, patternIntersect, matchPath } from '@pattern-algebra/core'

const srcFiles = compilePattern(parsePattern('src/**'))
const tsFiles = compilePattern(parsePattern('**/*.ts'))
const srcTsFiles = patternIntersect(srcFiles, tsFiles)

matchPath('/src/index.ts', srcTsFiles) // true (matches both)
matchPath('/lib/index.ts', srcTsFiles) // false (only matches tsFiles)
matchPath('/src/index.js', srcTsFiles) // false (only matches srcFiles)
```

#### `patternUnion(a: CompiledPattern, b: CompiledPattern): CompiledPattern`

Creates a pattern matching paths that match EITHER input pattern.

```typescript
import { parsePattern, compilePattern, patternUnion, matchPath } from '@pattern-algebra/core'

const jsFiles = compilePattern(parsePattern('**/*.js'))
const tsFiles = compilePattern(parsePattern('**/*.ts'))
const scriptFiles = patternUnion(jsFiles, tsFiles)

matchPath('/src/index.js', scriptFiles) // true
matchPath('/src/index.ts', scriptFiles) // true
matchPath('/src/style.css', scriptFiles) // false
```

#### `patternComplement(pattern: CompiledPattern): CompiledPattern`

Creates a pattern matching paths that do NOT match the input pattern.

```typescript
import { parsePattern, compilePattern, patternComplement, matchPath } from '@pattern-algebra/core'

const testFiles = compilePattern(parsePattern('**/*.test.ts'))
const nonTestFiles = patternComplement(testFiles)

matchPath('/src/index.ts', nonTestFiles) // true
matchPath('/src/index.test.ts', nonTestFiles) // false
```

**Note:** Complement patterns may have infinite representations. Use with care.

#### `patternDifference(a: CompiledPattern, b: CompiledPattern): CompiledPattern`

Creates a pattern matching paths that match pattern A but NOT pattern B.

```typescript
import { parsePattern, compilePattern, patternDifference, matchPath } from '@pattern-algebra/core'

const allTs = compilePattern(parsePattern('**/*.ts'))
const testTs = compilePattern(parsePattern('**/*.test.ts'))
const nonTestTs = patternDifference(allTs, testTs)

matchPath('/src/index.ts', nonTestTs) // true
matchPath('/src/index.test.ts', nonTestTs) // false
```

### Containment Checking

#### `checkContainment(a: CompiledPattern, b: CompiledPattern): ContainmentResult`

Determines the relationship between two patterns.

```typescript
import { parsePattern, compilePattern, checkContainment } from '@pattern-algebra/core'

const specific = compilePattern(parsePattern('src/index.ts'))
const general = compilePattern(parsePattern('src/*.ts'))

const result = checkContainment(specific, general)

result.isSubset // true (every path matching specific also matches general)
result.isSuperset // false
result.isEqual // false
result.relationship // 'subset'
```

**Possible relationships:**

- `'equal'` - Patterns match exactly the same set of paths
- `'subset'` - Pattern A matches a subset of pattern B's paths
- `'superset'` - Pattern A matches a superset of pattern B's paths
- `'overlap'` - Patterns have some common paths but neither contains the other
- `'disjoint'` - Patterns have no common paths

#### `areEquivalent(a: CompiledPattern, b: CompiledPattern): boolean`

Checks if two patterns match exactly the same set of paths.

```typescript
import { parsePattern, compilePattern, areEquivalent } from '@pattern-algebra/core'

const p1 = compilePattern(parsePattern('src/**/*.ts'))
const p2 = compilePattern(parsePattern('src/**/*.ts'))

areEquivalent(p1, p2) // true
```

#### `hasOverlap(a: CompiledPattern, b: CompiledPattern): boolean`

Checks if two patterns have any common paths.

```typescript
import { parsePattern, compilePattern, hasOverlap } from '@pattern-algebra/core'

const ts = compilePattern(parsePattern('**/*.ts'))
const js = compilePattern(parsePattern('**/*.js'))

hasOverlap(ts, js) // false (disjoint file extensions)
```

#### `areDisjoint(a: CompiledPattern, b: CompiledPattern): boolean`

Checks if two patterns have no common paths.

```typescript
import { parsePattern, compilePattern, areDisjoint } from '@pattern-algebra/core'

const src = compilePattern(parsePattern('src/**'))
const lib = compilePattern(parsePattern('lib/**'))

areDisjoint(src, lib) // true (different directories)
```

#### `analyzePatterns(patterns: CompiledPattern[]): PatternAnalysis`

Analyzes multiple patterns to find overlaps, redundancies, and gaps.

```typescript
import { parsePattern, compilePattern, analyzePatterns } from '@pattern-algebra/core'

const patterns = [
  compilePattern(parsePattern('src/**/*.ts')),
  compilePattern(parsePattern('src/**/*.js')),
  compilePattern(parsePattern('lib/**')),
]

const analysis = analyzePatterns(patterns)
// Returns detailed analysis of pattern relationships
```

## Advanced Usage

### Working with Automata

For advanced use cases, you can work directly with the underlying automaton operations:

```typescript
import {
  parsePattern,
  compilePattern,
  buildAutomaton,
  determinize,
  intersect,
  union,
  complement,
  isEmpty,
  findWitness,
} from '@pattern-algebra/core'

const pattern = compilePattern(parsePattern('src/**/*.ts'))

// Build NFA (Non-deterministic Finite Automaton)
const nfa = buildAutomaton(pattern.ast)

// Convert to DFA for faster matching
const dfa = determinize(nfa)

// Check if a pattern matches nothing
const empty = compilePattern(parsePattern('*.{js,ts}'))
const intersection = intersect(empty.automaton, compilePattern(parsePattern('*.css')).automaton)
isEmpty(intersection) // true (no files can be both .js/.ts AND .css)

// Find a witness path (example matching path)
const witness = findWitness(pattern.automaton)
// Returns a path that matches the pattern, or null if none exists
```

### Quick Reject Filters

Compiled patterns include quick-reject filters for fast path elimination:

```typescript
import { compilePattern, parsePattern, applyQuickReject } from '@pattern-algebra/core'

const pattern = compilePattern(parsePattern('src/**/*.ts'))

// Quick check before full automaton matching
const path = '/lib/index.js'
if (applyQuickReject(path, pattern.quickReject)) {
  // Path rejected - definitely doesn't match
} else {
  // Path might match - use full matching
}
```

Quick reject checks:

- Minimum/maximum segment count
- Required file extensions
- Required prefixes/suffixes
- Required path segments

## Use Cases

### Policy Systems

```typescript
// Define access control policies as patterns
const readPolicy = compilePattern(parsePattern('public/**'))
const writePolicy = compilePattern(parsePattern('public/{uploads,temp}/**'))

// Check if a path is allowed
function canRead(path: string): boolean {
  return matchPath(path, readPolicy)
}

function canWrite(path: string): boolean {
  return matchPath(path, writePolicy)
}

// Find overlapping permissions
const overlap = patternIntersect(readPolicy, writePolicy)
```

### Build Systems

```typescript
// Define source patterns
const sourceFiles = patternUnion(
  compilePattern(parsePattern('src/**/*.ts')),
  compilePattern(parsePattern('lib/**/*.ts')),
)

const testFiles = compilePattern(parsePattern('**/*.test.ts'))

// Production files = source files - test files
const prodFiles = patternDifference(sourceFiles, testFiles)

// Check which files to include in build
function shouldBuild(path: string): boolean {
  return matchPath(path, prodFiles)
}
```

### Linter Configuration Analysis

```typescript
// Check if .eslintignore patterns overlap with lint targets
const lintTargets = compilePattern(parsePattern('src/**/*.{js,ts}'))
const ignored = compilePattern(parsePattern('src/generated/**'))

const result = checkContainment(ignored, lintTargets)

if (result.relationship === 'subset') {
  console.log('Some lint targets are ignored')
} else if (result.relationship === 'disjoint') {
  console.log('No overlap between targets and ignored files')
}
```

## How It Works

@pattern-algebra/core uses segment-level automata to efficiently represent and operate on path patterns:

1. **Parsing**: Patterns are parsed into an Abstract Syntax Tree (AST)
2. **Compilation**: The AST is compiled into a Non-deterministic Finite Automaton (NFA) that operates on path segments (not characters)
3. **Matching**: Paths are split into segments and matched against the NFA
4. **Set Operations**: Automata are combined using standard automaton operations (intersection, union, complement)
5. **Containment**: Patterns are determinized into DFAs and compared to determine subset/superset relationships

### Performance Optimizations

- **Lazy Determinization**: DFAs are only constructed when needed for containment checking
- **Quick Reject Filters**: Fast pre-filtering eliminates non-matching paths without full automaton traversal
- **Segment-Level Operations**: Operating on path segments (not characters) reduces state space
- **Epsilon Transition Elimination**: NFA-to-DFA conversion eliminates epsilon transitions for faster matching

## License

MIT

## Contributing

Contributions are welcome! Please see the [repository](https://github.com/mike-north/pattern-algebra) for guidelines.

## Related Projects

- [@pattern-algebra/cli](https://github.com/mike-north/pattern-algebra) - Command-line interface for pattern operations
- [@pattern-algebra/policy](https://github.com/mike-north/pattern-algebra) - Policy evaluation engine built on @pattern-algebra/core
