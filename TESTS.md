# Test Plan for Minishake

This document outlines the strategy for unit and integration testing of the minishake project.

## 1. Unit Tests

Unit tests will focus on individual modules in isolation, mocking dependencies where necessary.

### 1.1 Core Modules
*   **`graph.ts`**:
    *   Test adding nodes and edges.
    *   Test cycle detection.
    *   Test topological sorting.
    *   Test evaluating graph dependencies.
*   **`hash.ts`**:
    *   Test hashing of strings, files, and directories.
    *   Verify hash stability and collision resistance.
*   **`rule.ts`**:
    *   Test rule creation and validation.
    *   Test input/output path resolution.
*   **`context.ts` / `env.ts`**:
    *   Test environment variable injection and resolution.
    *   Test variable interpolation within context.
*   **`paths.ts`**:
    *   Test path normalization, joining, and relative path calculation.
    *   Test glob matching for inputs.

### 1.2 Execution & State
*   **`build.ts`**:
    *   Test task execution order.
    *   Test determining if a task needs to run based on input/output hashes.
    *   Test handling of task failures.
*   **`persist.ts`**:
    *   Test reading and writing the build cache (.minishake/cache).
    *   Test serialization/deserialization of build state.
*   **`loader.ts`**:
    *   Test loading and parsing of `build.shk` files.
    *   Test variable and rule extraction from build definitions.

### 1.3 Utilities
*   **`errors.ts`**:
    *   Test correct formatting and formatting of custom error types.
*   **`log.ts`**:
    *   Test log levels (debug, info, warn, error).
*   **`explain.ts` / `mermaid.ts`**:
    *   Test generation of explanation outputs.
    *   Test mermaid diagram generation from a given dependency graph.

## 2. Integration Tests

Integration tests will verify the interaction between multiple modules and the system as a whole.

### 2.1 CLI Interface
*   **`shk.ts`**:
    *   Test parsing of command-line arguments (targets, flags like `--dry-run`, `--explain`).
    *   Test end-to-end execution of a simple build script.
    *   Test error handling and exit codes for invalid inputs or failed builds.

### 2.2 End-to-End Scenarios (Using `example/**`)
All end-to-end and integration tests will be executed against the `example/**` project directory to ensure real-world scenarios work as expected.

*   **Basic Build**: Run the build script in `example/build.shk`. Verify that all expected outputs (e.g., compiled JS files from `example/src/**`) are created.
*   **Incremental Build**: Run `example/build.shk`, modify an input file like `example/src/core.ts`, run again. Verify only the affected rules are re-executed.
*   **No-op Build**: Run `example/build.shk` twice without changes. Verify nothing is executed the second time.
*   **Circular Dependencies**: Temporarily modify `example/build.shk` or create a variant to introduce a cycle. Verify the execution fails gracefully with a meaningful error message.
*   **Cache Corruption**: Manually modify the persist cache created in `example/.minishake/cache`. Verify the system detects it and falls back to a clean build or errors correctly.

## 3. Test Framework & Tooling
*   **Testing Library**: Jest or Vitest (recommended for TypeScript projects).
*   **Mocks**: Use framework built-in mocking for file system (`fs`) and process (`child_process`) interactions during unit tests.
*   **Test Environment**: Use a temporary directory for integration tests to avoid polluting the workspace.

## 4. Execution
*   Tests should be runnable via `npm test`.
*   CI should be configured to run tests on every push/PR.
