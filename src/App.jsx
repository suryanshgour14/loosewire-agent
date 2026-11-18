import { useMemo, useRef, useState } from "react";
import { collectDirectory, collectFileList, reviewFiles, toMarkdown } from "./scanner.js";
import { SAMPLE_FILES } from "./sampleRepo.js";

const FILTERS = ["all", "security", "slop", "gaps", "loose ends"];
const TRAIL = ["Discovering files", "Checking security", "Tracing loose ends", "Prioritising evidence"];

function Icon({ name, size = 20 }) {
  const paths = {
    folder: <><path d="M3 6.5h6l2 2h10v10H3z" /><path d="M3 6.5v12" /></>,
    play: <path d="m8 5 10 7-10 7z" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 20h16" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg aria-hidden="true" className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function FindingRow({ finding, open, onToggle }) {
  return <article className={`finding ${open ? "is-open" : ""}`}>
    <button className="finding-summary" type="button" onClick={onToggle} aria-expanded={open}>
      <span className="disclosure"><Icon name="chevron" /></span>
      <span className="finding-title"><strong>{finding.title}</strong><span>{finding.path}{finding.line ? ` · line ${finding.line}` : ""}</span></span>
      <span className="finding-kind">{finding.category}</span>
      <span className={`severity severity-${finding.severity}`}>{finding.severity}</span>
    </button>
    {open ? <div className="finding-detail">
      <div><strong>Evidence</strong><code>{finding.evidence}</code></div>
      <div><strong>Why it matters</strong><p>{finding.why}</p></div>
      <div><strong>Suggested fix</strong><p>{finding.fix}</p></div>
    </div> : null}
  </article>;
}

export default function App() {
  const initial = useMemo(() => reviewFiles(SAMPLE_FILES, "sample-checkout"), []);
  const [report, setReport] = useState(initial);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(initial.findings[0]?.id ?? null);
  const [progress, setProgress] = useState(TRAIL.length);
  const [status, setStatus] = useState("ready");
  const [message, setMessage] = useState("");
  const fileInput = useRef(null);
  const findings = report.findings.filter((item) => filter === "all" || item.category === filter);

  async function animateScan(files, repository) {
    setStatus("scanning"); setMessage(""); setProgress(1);
    await sleep(180); setProgress(2);
    await sleep(220); setProgress(3);
    await sleep(180);
    const next = reviewFiles(files, repository);
    setProgress(4); setReport(next); setFilter("all"); setExpanded(next.findings[0]?.id ?? null); setStatus("ready");
  }

  async function chooseRepository() {
    try {
      if (!("showDirectoryPicker" in window)) { fileInput.current?.click(); return; }
      setStatus("scanning"); setProgress(0);
      const handle = await window.showDirectoryPicker({ mode: "read" });
      const files = await collectDirectory(handle);
      if (!files.length) throw new Error("No supported text files were found in that folder.");
      await animateScan(files, handle.name);
    } catch (error) {
      if (error?.name === "AbortError") { setStatus("ready"); return; }
      setStatus("error"); setMessage(error?.message || "The folder could not be read.");
    }
  }

  async function handleFileList(event) {
    try {
      const list = event.target.files;
      if (!list?.length) return;
      const files = await collectFileList(list);
      if (!files.length) throw new Error("No supported text files were found in that folder.");
      const repository = list[0].webkitRelativePath?.split("/")[0] || "local-repository";
      await animateScan(files, repository);
    } catch (error) {
      setStatus("error"); setMessage(error?.message || "The selected files could not be read.");
    } finally { event.target.value = ""; }
  }

  function exportReport() {
    const blob = new Blob([toMarkdown(report)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${report.repository.replace(/[^a-z0-9-_]/gi, "-")}-loosewire-review.md`; link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#main" aria-label="LooseWire home">
        <svg className="brand-mark" viewBox="0 0 48 32" aria-hidden="true"><path d="M3 25c15 0 20-20 10-20-10 0-8 22 6 22 9 0 15-7 23-16" /><path d="M39 13h5" /></svg>
        <strong>LooseWire</strong><span>Repository review agent</span>
      </a>
      <p className="privacy"><Icon name="lock" size={18} /> Runs locally. Your code never leaves this tab.</p>
    </header>

    <main id="main">
      <aside className="workbench">
        <div>
          <h1>Find the work hiding behind ‘done’.</h1>
          <p>A private, architecture-agnostic second pass for security risks, AI slop and loose ends.</p>
          <div className="primary-actions">
            <button type="button" className="button button-primary" onClick={chooseRepository} disabled={status === "scanning"}><Icon name="folder" />Choose repository</button>
            <button type="button" className="button button-secondary" onClick={() => animateScan(SAMPLE_FILES, "sample-checkout")} disabled={status === "scanning"}><Icon name="play" />Try sample scan</button>
            <input ref={fileInput} className="visually-hidden" type="file" webkitdirectory="" multiple onChange={handleFileList} />
          </div>
          {message ? <p className="error-message" role="alert">{message}</p> : null}
        </div>
        <section className="agent-trail" aria-labelledby="trail-title">
          <h2 id="trail-title">Agent trail</h2>
          <ol>{TRAIL.map((step, index) => {
            const complete = progress > index;
            const active = status === "scanning" && progress === index;
            return <li key={step} className={active ? "active" : ""}><span className={complete ? "trail-check complete" : "trail-check"}>{complete ? <Icon name="check" size={16} /> : index + 1}</span><span>{step}</span><small>{complete ? ["0.2s", "0.4s", "0.3s", "0.1s"][index] : active ? "…" : "—"}</small></li>;
          })}</ol>
        </section>
      </aside>

      <section className="report" aria-live="polite">
        <div className="report-header">
          <div><h2>{status === "scanning" ? "Reviewing repository…" : "Review complete"}</h2><p><span aria-hidden="true">&lt;/&gt;</span> {report.repository}</p></div>
          <button type="button" className="export-button" onClick={exportReport} disabled={!report.findings.length || status === "scanning"}><Icon name="download" />Export report</button>
        </div>
        <div className="summary" aria-label="Findings by severity">
          {Object.entries(report.summary).map(([label, count]) => <div key={label}><span>{label}</span><strong className={count ? "has-findings" : ""}>{count}</strong></div>)}
        </div>
        <div className="filters" role="group" aria-label="Filter findings">
          {FILTERS.map((item) => <button key={item} type="button" className={filter === item ? "selected" : ""} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <div className="findings-list">
          {findings.length ? findings.map((item) => <FindingRow key={item.id} finding={item} open={expanded === item.id} onToggle={() => setExpanded(expanded === item.id ? null : item.id)} />) : <div className="empty-result"><h3>No findings in this view.</h3><p>That is a useful signal, not a proof that the repository is vulnerability-free.</p></div>}
        </div>
      </section>
    </main>
    <footer className="statusbar"><span className="status-check"><Icon name="check" size={18} /></span><span>{status === "scanning" ? "Scan in progress" : "Scan complete"}</span><span>•</span><span>{report.findings.length} findings</span><span>•</span><span>{report.filesScanned} files</span><span>•</span><span>{report.repository}</span></footer>
  </div>;
}
