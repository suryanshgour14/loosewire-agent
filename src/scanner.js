const CODE_EXTENSIONS = new Set([
  "c", "cc", "cpp", "cs", "css", "go", "h", "hpp", "html", "java",
  "js", "jsx", "json", "kt", "kts", "md", "mjs", "php", "py", "rb",
  "rs", "scala", "sh", "sql", "swift", "toml", "ts", "tsx", "vue",
  "xml", "yaml", "yml",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git", ".next", ".venv", "build", "coverage", "dist", "node_modules",
  "target", "vendor", "venv",
]);

const TEST_PATH = /(^|\/)(test|tests|__tests__)(\/|$)|\.(spec|test)\.[^.]+$/i;
const SECRET_ASSIGNMENT = /\b[\w$]*(?:secret|token|password|passwd|api[_-]?key|private[_-]?key)[\w$]*\s*[:=]\s*["'`]([^"'`]{8,})["'`]/i;
const AWS_ACCESS_KEY = /\bAKIA[0-9A-Z]{16}\b/;
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const EMPTY_CATCH = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/;
const SHELL_EXECUTION = /(?:child_process\.)?(?:exec|execSync)\s*\(|\bos\.system\s*\(|subprocess\.[^(]+\([^)]*shell\s*=\s*True/;
const TLS_DISABLED = /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/;
const WILDCARD_CORS = /Access-Control-Allow-Origin["']?\s*[:,=]\s*["']\*["']/i;
const EVAL_USAGE = /\beval\s*\(|\bnew\s+Function\s*\(/;
const PLACEHOLDER = /NotImplementedError|throw\s+new\s+Error\s*\(\s*["'`](?:not implemented|todo)/i;
const TODO_MARKER = /\b(?:TODO|FIXME|HACK|XXX)\b/i;
const DEBUG_LOG = /\bconsole\.(?:log|debug)\s*\(|(^|\s)print\s*\(/;
const DISABLED_TEST = /\b(?:describe|it|test)\.skip\s*\(|\bx(?:it|describe)\s*\(|@Disabled\b/;
const AI_FILLER = /as an ai language model|certainly! here(?:'|’)s|this code (?:simply )?implements|below is the (?:updated|complete) code/i;
const PLACEHOLDER_VALUE = /example|sample|dummy|placeholder|changeme|your[-_ ]|test[-_ ]?(?:key|token)/i;

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const MAX_FILES = 4_000;
const MAX_FILE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 20_000_000;

function extension(path) {
  const name = path.split("/").at(-1) ?? "";
  return name.startsWith(".") ? name.slice(1).toLowerCase() : (name.split(".").at(-1) ?? "").toLowerCase();
}

function isScannable(path) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return CODE_EXTENSIONS.has(extension(path)) || ["dockerfile", "makefile", ".env"].includes(name);
}

function redact(value) {
  if (value.length < 8) return "[redacted]";
  return `${value.slice(0, 4)}…${value.slice(-3)}`;
}

function finding(rule, data) {
  return { id: `${rule}:${data.path}:${data.line ?? 0}`, rule, ...data };
}

function inspectLine(line, path, lineNumber) {
  const hits = [];
  const secret = line.match(SECRET_ASSIGNMENT);
  if (
    secret && !PLACEHOLDER_VALUE.test(secret[1]) &&
    !/process\.env|import\.meta\.env|os\.getenv|environ\[|getenv\(/.test(line)
  ) {
    hits.push(finding("secret-assignment", {
      severity: "critical", category: "security", title: "Hard-coded secret in source",
      path, line: lineNumber, evidence: line.trim().replace(secret[1], redact(secret[1])),
      why: "A committed credential can leak through clones, logs or build artifacts.",
      fix: "Move it to a secret store or environment variable, rotate it, and purge it from Git history.",
    }));
  }

  if (AWS_ACCESS_KEY.test(line) || PRIVATE_KEY.test(line)) {
    hits.push(finding("credential-signature", {
      severity: "critical", category: "security", title: "Credential signature in source",
      path, line: lineNumber, evidence: line.trim().replace(AWS_ACCESS_KEY, "AKIA…[redacted]"),
      why: "This resembles a deployable credential rather than configuration.",
      fix: "Revoke the credential, remove it from history, and load a replacement at runtime.",
    }));
  }

  const rules = [
    [SHELL_EXECUTION, "shell-execution", "high", "security", "Shell execution needs an input boundary", "Shell calls become injection paths when any argument is user-controlled.", "Use an argument-array API, allow-list inputs, and avoid shell mode."],
    [TLS_DISABLED, "tls-disabled", "high", "security", "TLS verification is disabled", "Disabling certificate checks permits man-in-the-middle attacks.", "Restore certificate verification and configure a trusted CA for local environments."],
    [EVAL_USAGE, "dynamic-eval", "high", "security", "Dynamic code execution", "Dynamic evaluation can turn data into executable code.", "Replace eval/new Function with parsing, explicit dispatch, or an allow-listed expression engine."],
    [WILDCARD_CORS, "wildcard-cors", "medium", "security", "Wildcard CORS policy", "A wildcard origin can expose browser APIs to untrusted sites.", "Allow only the origins that need access and keep credentials disabled by default."],
    [EMPTY_CATCH, "empty-catch", "high", "gaps", "Empty catch hides failures", "The operation can fail without a signal, log, retry, or user-facing error.", "Handle the expected error or rethrow it with context; record only non-sensitive diagnostics."],
    [PLACEHOLDER, "not-implemented", "high", "gaps", "Unimplemented production path", "A reachable placeholder moves failure from development into runtime.", "Implement the branch or fail earlier behind an explicit feature flag."],
    [DISABLED_TEST, "disabled-test", "medium", "gaps", "Disabled test remains in the suite", "Skipped coverage can hide a regression while the build still appears green.", "Repair and re-enable the test, or link the skip to a time-bounded issue."],
    [TODO_MARKER, "todo-marker", "medium", "loose ends", "Unresolved marker in code", "A TODO or FIXME in a live path often marks deferred correctness work.", "Resolve it, convert it into a tracked issue with context, or remove the stale marker."],
    [AI_FILLER, "ai-filler", "medium", "slop", "AI-style filler comment", "Narrative generation residue makes code noisier without explaining intent or constraints.", "Replace it with a short comment about the non-obvious decision, or remove it."],
    [DEBUG_LOG, "debug-log", "low", "slop", "Debug output left in source", "Ad-hoc logs can leak data and make production signals harder to read.", "Remove it or route structured, redacted context through the project logger."],
  ];

  for (const [pattern, rule, severity, category, title, why, fix] of rules) {
    if (pattern.test(line)) hits.push(finding(rule, { severity, category, title, path, line: lineNumber, evidence: line.trim(), why, fix }));
  }
  return hits;
}

function repositoryFindings(files) {
  const hits = [];
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  const codeFiles = files.filter((file) => isScannable(file.path) && !file.path.toLowerCase().endsWith(".md"));
  const hasTests = files.some((file) => TEST_PATH.test(file.path));

  if (codeFiles.length >= 4 && !hasTests) {
    hits.push(finding("missing-tests", {
      severity: "high", category: "gaps", title: "No test suite found", path: "repository", line: null,
      evidence: `${codeFiles.length} code files scanned; no test path or *.test / *.spec file found`,
      why: "Changes can regress silently when the repository has no executable safety net.",
      fix: "Add one focused test around the riskiest behavior and wire it into the default test command.",
    }));
  }
  if (!paths.has("readme.md")) {
    hits.push(finding("missing-readme", {
      severity: "medium", category: "loose ends", title: "README is missing", path: "repository", line: null,
      evidence: "No README.md at the repository root", why: "A reviewer cannot quickly learn how to run, test or evaluate the project.",
      fix: "Document the problem, quick start, test command, architecture, and known limitations.",
    }));
  }
  if (codeFiles.length >= 4 && !paths.has(".gitignore")) {
    hits.push(finding("missing-gitignore", {
      severity: "medium", category: "security", title: ".gitignore is missing", path: "repository", line: null,
      evidence: "No .gitignore at the repository root", why: "Local credentials, generated output and dependencies are easier to commit accidentally.",
      fix: "Add ignores for secrets, dependencies, build output, editor state and OS files.",
    }));
  }
  const packageFile = files.find((file) => file.path.toLowerCase() === "package.json");
  if (packageFile) {
    try {
      const pkg = JSON.parse(packageFile.content);
      const testScript = pkg.scripts?.test ?? "";
      if (!testScript || /no test specified/i.test(testScript)) {
        hits.push(finding("missing-test-command", {
          severity: "medium", category: "gaps", title: "Test command is not wired", path: "package.json", line: null,
          evidence: testScript ? `scripts.test: ${testScript}` : "scripts.test is missing",
          why: "CI and contributors need one predictable command to verify the project.",
          fix: "Point scripts.test at the real test runner and make failures return a non-zero exit code.",
        }));
      }
    } catch {
      hits.push(finding("invalid-package-json", {
        severity: "high", category: "gaps", title: "package.json cannot be parsed", path: "package.json", line: null,
        evidence: "Invalid JSON", why: "Install, build and test tooling cannot read the project manifest.", fix: "Correct the JSON syntax and validate it in CI.",
      }));
    }
  }
  return hits;
}

export function reviewFiles(files, repository = "local-repository") {
  const findings = [];
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) findings.push(...inspectLine(lines[index], file.path, index + 1));
  }
  findings.push(...repositoryFindings(files));
  const unique = [...new Map(findings.map((item) => [item.id, item])).values()]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.path.localeCompare(b.path)).slice(0, 100);
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of unique) summary[item.severity] += 1;
  return { repository, findings: unique, summary, filesScanned: files.length, completedAt: new Date().toISOString() };
}

export async function collectDirectory(handle) {
  const files = [];
  let bytes = 0;
  async function walk(directory, prefix = "") {
    for await (const [name, entry] of directory.entries()) {
      if (files.length >= MAX_FILES || bytes >= MAX_TOTAL_BYTES) return;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "directory") {
        if (!IGNORED_DIRECTORIES.has(name)) await walk(entry, path);
        continue;
      }
      if (!isScannable(path)) continue;
      const file = await entry.getFile();
      if (file.size > MAX_FILE_BYTES || bytes + file.size > MAX_TOTAL_BYTES) continue;
      files.push({ path, content: await file.text() });
      bytes += file.size;
    }
  }
  await walk(handle);
  return files;
}

export async function collectFileList(fileList) {
  const files = [];
  let bytes = 0;
  for (const file of fileList) {
    const path = file.webkitRelativePath || file.name;
    const segments = path.split("/");
    if (segments.some((segment) => IGNORED_DIRECTORIES.has(segment))) continue;
    if (!isScannable(path) || file.size > MAX_FILE_BYTES || bytes + file.size > MAX_TOTAL_BYTES) continue;
    files.push({ path: segments.slice(1).join("/") || file.name, content: await file.text() });
    bytes += file.size;
    if (files.length >= MAX_FILES) break;
  }
  return files;
}

export function toMarkdown(report) {
  const counts = Object.entries(report.summary).map(([key, value]) => `${key}: ${value}`).join(" · ");
  const sections = report.findings.map((item, index) => `### ${index + 1}. ${item.title}\n\n- **Severity:** ${item.severity}\n- **Category:** ${item.category}\n- **Location:** ${item.path}${item.line ? `:${item.line}` : ""}\n- **Evidence:** \`${item.evidence.replace(/`/g, "'")}\`\n- **Why it matters:** ${item.why}\n- **Suggested fix:** ${item.fix}`);
  return `# LooseWire review: ${report.repository}\n\n${counts}\n\nFiles scanned: ${report.filesScanned}\n\n${sections.join("\n\n---\n\n") || "No findings. This does not prove the repository is vulnerability-free."}\n\n---\nGenerated locally by LooseWire. Review findings before acting.\n`;
}
