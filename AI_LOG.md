# AI assistance log

Codex was used as a pair programmer for this submission. The request was to turn the AntiSlop brief into a small, architecture-agnostic agent without adding unnecessary code.

## Where AI helped

- Compared a few product directions and helped narrow the scope to a private browser-based repository scanner.
- Produced an early visual concept for the split workbench/report interface.
- Drafted the first pass of the React UI, deterministic scanner rules, tests, README, and Arena configuration.
- Helped check the public Arena submission contract and the role description supplied with the assignment.

## Decisions kept explicit

- No hosted model or source-code upload. A local deterministic pass is easier to explain, test, and trust for this task.
- Evidence is redacted before display or export.
- Findings explain both impact and a next step; the tool does not invent a single “code quality score”.
- Limits and false-positive risk are documented instead of presenting the scanner as a complete security product.

No private grader tests, credentials, personal data, or proprietary company source code were used. The built-in sample repository is synthetic and intentionally contains three safe-to-demonstrate issues.
