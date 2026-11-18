import assert from "node:assert/strict";
import test from "node:test";
import { reviewFiles, toMarkdown } from "../src/scanner.js";

const base = [
  { path: "README.md", content: "# Demo" },
  { path: ".gitignore", content: ".env\nnode_modules\n" },
  { path: "test/app.test.js", content: "test('works', () => {});" },
];

test("finds and redacts a hard-coded secret", () => {
  const report = reviewFiles([...base, { path: "src/config.js", content: 'const API_TOKEN = "live_secret_123456";' }], "demo");
  const hit = report.findings.find((item) => item.rule === "secret-assignment");
  assert.equal(hit?.severity, "critical");
  assert.equal(hit?.evidence.includes("live_secret_123456"), false);
});

test("does not flag environment-backed secrets", () => {
  const report = reviewFiles([...base, { path: "src/config.js", content: "const API_TOKEN = process.env.API_TOKEN;" }], "demo");
  assert.equal(report.findings.some((item) => item.rule === "secret-assignment"), false);
});

test("finds empty error handling and unresolved work", () => {
  const report = reviewFiles([...base, { path: "src/pay.js", content: "try { pay(); } catch (error) {}\n// TODO: add idempotency" }], "demo");
  assert.deepEqual(report.findings.map((item) => item.rule), ["empty-catch", "todo-marker"]);
});

test("adds repository-level test coverage finding", () => {
  const files = ["a.js", "b.js", "c.js", "d.js"].map((path) => ({ path, content: "export default 1;" }));
  const report = reviewFiles([...files, { path: "README.md", content: "# Demo" }, { path: ".gitignore", content: "dist" }], "demo");
  assert.equal(report.findings.some((item) => item.rule === "missing-tests"), true);
});

test("exports an actionable Markdown report", () => {
  const report = reviewFiles([...base, { path: "src/app.js", content: "console.log('debug')" }], "demo");
  const markdown = toMarkdown(report);
  assert.match(markdown, /# LooseWire review: demo/);
  assert.match(markdown, /Suggested fix/);
});
