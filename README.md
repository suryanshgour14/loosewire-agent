# LooseWire

LooseWire is a small repository review agent for the awkward last pass before code is called “done”. It scans a local folder for security risks, AI-shaped filler, coding gaps, and loose ends, then turns each signal into evidence and a practical next step.

The important constraint is privacy: the scan runs entirely in the browser. Source files are read locally, never uploaded, and no API key is required.

## Try it

```bash
npm install
npm run dev
```

Open the local URL and choose **Try sample scan**. In Chromium-based browsers, **Choose repository** opens a read-only folder picker. Other browsers fall back to a directory upload control; the files still stay in the tab.

```bash
npm test
npm run build
```

## What the agent does

1. Discovers supported text files while skipping dependencies, generated output, Git data, and large files.
2. Runs focused checks for credentials, unsafe execution, disabled TLS, permissive CORS, swallowed errors, unfinished paths, disabled tests, debug output, AI filler, and unresolved markers.
3. Adds repository-level checks for missing tests, documentation, ignore rules, and a usable test command.
4. De-duplicates and ranks findings by severity, then exports the review as Markdown.

Every finding contains a location, redacted evidence, why it matters, and a suggested fix. The rules are deterministic on purpose: results are fast, explainable, offline, and repeatable across languages and frameworks.

## Project shape

```text
src/App.jsx       product UI and agent workflow
src/scanner.js    file discovery, rules, ranking, export
src/sampleRepo.js safe built-in demo repository
test/             scanner behavior and redaction tests
```

There is no backend and no database. `arena.json` gives the grader one install, test, and start contract.

## Boundaries

LooseWire is a triage tool, not a replacement for Semgrep, dependency auditing, secret rotation, or a human security review. Pattern matching can produce false positives and cannot prove that a repository is safe. The browser scan is capped at 4,000 supported files, 500 KB per file, and 20 MB total so an accidental monorepo selection does not freeze the tab.

The next sensible extension would be a rule-pack interface: teams could add project-specific checks without changing the agent loop.
