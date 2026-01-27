# AI Test Generation - Smart Test Creation

AI-powered test generation supporting multiple frameworks and languages for Theia IDE.

## Features

- **Multi-Framework Support**: Jest, Vitest, Mocha, pytest, JUnit, Go Test, and more
- **Intelligent Detection**: Auto-detects best framework for language
- **Edge Case Generation**: Automatic edge case and error tests
- **Mock Generation**: Smart mock creation for dependencies
- **Coverage Estimation**: Estimate test coverage before running

## Supported Frameworks

| Framework | Language | Features |
|-----------|----------|----------|
| Jest | TypeScript/JavaScript | Full support, mocking |
| Vitest | TypeScript/JavaScript | Fast, ESM native |
| Mocha | TypeScript/JavaScript | Flexible, Chai assertions |
| pytest | Python | Fixtures, parametrize |
| unittest | Python | Standard library |
| JUnit | Java | Annotations, assertions |
| TestNG | Java | Advanced features |
| Go Test | Go | Table-driven tests |
| RSpec | Ruby | BDD style |
| PHPUnit | PHP | Standard PHP testing |

## Keybindings

| Shortcut | Command | Description |
|----------|---------|-------------|
| `Ctrl+Shift+T` | Generate Tests | Generate tests for file |
| `Ctrl+Alt+T` | Generate for Function | Test specific function |

## Commands

| Command | Description |
|---------|-------------|
| `ai-test-gen.generate` | Generate tests for entire file |
| `ai-test-gen.generate-for-function` | Generate tests for selected function |
| `ai-test-gen.select-framework` | Choose test framework |
| `ai-test-gen.preview` | Preview generated tests |
| `ai-test-gen.insert` | Insert tests to file |
| `ai-test-gen.coverage` | Show coverage estimate |

## Test Types

| Type | Description |
|------|-------------|
| Unit | Basic function tests |
| Edge Case | Boundary conditions |
| Error | Exception handling |
| Async | Async/await behavior |

## Generated Test Structure

### TypeScript/Vitest Example

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('myFunction', () => {
    it('should handle basic input', () => {
        const result = myFunction('test');
        expect(result).toBeDefined();
    });

    it('should handle null input', () => {
        expect(() => myFunction(null)).toThrow();
    });

    it('should handle empty input', () => {
        const result = myFunction('');
        expect(result).toBeDefined();
    });
});
```

### Python/pytest Example

```python
import pytest

class TestMyFunction:
    def test_basic_input(self):
        result = my_function('test')
        assert result is not None

    def test_none_input(self):
        with pytest.raises(Exception):
            my_function(None)
```

## API

```typescript
interface AITestGenService {
    generateTests(request: TestGenRequest): Promise<TestGenResult>;
    generateTestsForFunction(uri, content, functionName): Promise<TestGenResult>;
    detectFramework(uri, language): Promise<TestFramework>;
    extractFunctions(content, language): Promise<FunctionInfo[]>;
    generateMock(dependency, type, framework): Promise<MockDefinition>;
    getTestFilePath(sourceUri, framework): string;
    estimateCoverage(source, tests, language): Promise<CoverageInfo>;
}
```

## Coverage Estimation

The service estimates coverage based on:
- Number of basic tests (50% base)
- Edge case tests (+10% each)
- Error case tests (+10% each)

Grades:
- **Excellent**: 80%+
- **Good**: 60-79%
- **Fair**: 40-59%
- **Needs improvement**: <40%

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
