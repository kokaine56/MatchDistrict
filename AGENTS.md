# MANDATORY PRE-IMPLEMENTATION CODEBASE AUDIT PROTOCOL

This protocol is mandatory before every implementation task, bug fix, refactoring, feature addition, or database change.

## 1. Understand Before Editing

Before modifying any code, the agent MUST investigate the existing implementation thoroughly.

1. Identify the application's architecture, framework, entry points, module boundaries, and data flow.
2. Locate every file, function, API endpoint, database table, service, component, hook, utility, and configuration that may affect the requested change.
3. Read the complete contents of all relevant source files, not merely filenames, search snippets, or isolated code fragments.
4. Trace function calls, imports, shared state, API requests, database relationships, validation, authorization, and downstream consumers.
5. Inspect existing tests and related documentation to understand intended behavior.
6. Search for duplicate implementations, legacy systems, deprecated code paths, and competing sources of truth.
7. Identify potential regressions and compatibility requirements before selecting an implementation approach.

## 2. Expand the Audit When Necessary

Do not stop at the first file that appears to contain the bug.

Continue investigating until the relevant execution path and its dependencies are understood.

If a relevant function calls another service, inspect that service. If a database field is read or written elsewhere, inspect those usages. If a shared component is modified, inspect its other consumers.

Read additional files whenever the initial investigation reveals unresolved dependencies or uncertainty.

## 3. Establish an Implementation Plan

Before editing, establish:

- Root cause of the problem.
- Relevant files and database entities.
- Existing behavior and intended behavior.
- Proposed changes and why they are necessary.
- Potential side effects and regression risks.
- Tests required to verify the solution.

For complex changes involving multiple modules, provide a concise plan before implementation.

Do not modify code while the root cause or essential dependencies remain unclear.

## 4. Implement Only After Sufficient Investigation

Once the relevant system is understood:

1. Make the smallest coherent change that solves the root cause.
2. Reuse existing services, utilities, validation, and database relationships wherever appropriate.
3. Avoid duplicating business logic or introducing competing architectures.
4. Preserve unrelated functionality and backward compatibility.
5. Update all affected consumers and tests, not just the initial file where the bug was discovered.

## 5. Verify the Actual Result

After implementation:

- Inspect the final changes.
- Run relevant tests, type checks, linting, and builds where available.
- Verify API and database behavior when affected.
- Check important regression paths.
- Report successful checks and failures accurately.

Never claim a feature is fixed solely because code was edited.

## 6. Prevent Unnecessary Full-Repository Rereading

Perform a complete repository inventory when first entering an unfamiliar project or when major architectural changes make the previous understanding unreliable.

For subsequent tasks, reuse a verified architectural map and prior investigation where applicable, but re-open and verify relevant source files against their current contents before editing.

Do not assume previously inspected code remains unchanged. Check the current working tree, recent changes, and relevant dependencies.

Do not reread every unrelated file merely to satisfy a superficial audit requirement.

---

### Non-negotiable Rule
Never edit code based on guesses, incomplete snippets, or an unverified understanding of the affected system. Investigate until the implementation path and relevant dependencies are sufficiently understood to make a safe change.
