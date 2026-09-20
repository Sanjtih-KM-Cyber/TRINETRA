import React, { useState } from "react";
import { stagingApi, sahayakApi, caseApi } from "../../services/api";
import { LANGUAGES } from "../../services/i18n";
import { CheckCircle2, XCircle, Loader2, AlertCircle, Layers, FileText, Sparkles, X, Maximize2, Download, BookOpen } from "lucide-react";

/** Split clean text into ~page-sized chunks on paragraph boundaries. */
function paginateText(text: string, pageChars = 2600): string[] {
  const paras = String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 0) return [];
  const pages: string[] = [];
  let page = "";
  for (const p of paras) {
    if (page && page.length + p.length + 2 > pageChars) {
      pages.push(page);
      page = "";
    }
    page += (page ? "\n\n" : "") + p;
  }
  if (page) pages.push(page);
  return pages;
}

function escHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tiny markdown renderer for SAHAYAK briefs: ## headings, **bold**, lists, paragraphs. */
function renderBriefMarkdown(md: string): React.ReactNode[] {
  const lines = String(md || "").split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length > 0) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-1 my-2">
          {list.map((li, j) => (
            <li key={j}>{renderInline(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  const renderInline = (t: string): React.ReactNode => {
    const parts = t.split(/(\*\*[^*]+\*\*)/g);
    return (
      <>
        {parts.map((p, k) =>
          p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
            <strong key={k} className="font-bold text-slate-100">{p.slice(2, -2)}</strong>
          ) : (
            <span key={k}>{p}</span>
          )
        )}
      </>
    );
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line.startsWith("### ")) {
      flushList();
      out.push(<h4 key={i} className="text-sm font-bold text-amber-200 mt-3 mb-1">{renderInline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(<h3 key={i} className="text-base font-bold text-amber-300 mt-4 mb-1.5 border-b border-amber-500/30 pb-1">{renderInline(line.slice(3))}</h3>);
    } else if (/^([-*]|\d+[.)])\s+/.test(line)) {
      list.push(line.replace(/^([-*]|\d+[.)])\s+/, ""));
    } else {
      flushList();
      out.push(<p key={i} className="my-1.5">{renderInline(line)}</p>);
    }
  });
  flushList();
  return out;
}

/** Same brief as printable notebook HTML for the Download button. */
function briefToNotebookHtml(title: string, meta: string, md: string): string {
  const body = String(md || "")
    .split("\n")
    .map((raw) => {
      const line = raw.trim();
      if (!line) return "";
      if (line.startsWith("### ")) return `<h4>${escHtml(line.slice(4))}</h4>`;
      if (line.startsWith("## ")) return `<h3>${escHtml(line.slice(3))}</h3>`;
      if (/^([-*]|\d+[.)])\s+/.test(line)) return `<li>${escHtml(line.replace(/^([-*]|\d+[.)])\s+/, ""))}</li>`;
      return `<p>${escHtml(line).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  return `<!DOCTYPE html><html><head><title>${escHtml(title)} — SAHAYAK brief</title><style>
@page { size: A4; margin: 20mm; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1c1917; line-height: 1.7; font-size: 12pt;
  background-image: repeating-linear-gradient(#fff 0, #fff 30px, #e7e5e4 30px, #e7e5e4 31px); }
.sheet { max-width: 700px; margin: 0 auto; background: rgba(255,255,255,.85); padding: 8px 4px; }
h1 { font-size: 18pt; border-bottom: 2px solid #92400e; padding-bottom: 6px; }
h3 { font-size: 13.5pt; color: #92400e; margin-top: 18px; }
h4 { font-size: 12pt; margin-top: 14px; }
.meta { font-size: 9.5pt; color: #57534e; margin-bottom: 12px; }
p { text-align: justify; }
</style></head><body><div class="sheet"><h1>${escHtml(title)}</h1><div class="meta">${escHtml(meta)}</div>${body}
<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></div></body></html>`;
}

interface ApprovalQueueTabProps {
  caseId: string;
  readOnly: boolean;
  canReview: boolean;
  signal: number;
  onChanged: () => void;
}

export const ApprovalQueueTab: React.FC<ApprovalQueueTabProps> = ({ caseId, readOnly, canReview, signal, onChanged }) => {
  const [entities, setEntities] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  // Raw exhibits awaiting Lead triage (fresh uploads from Field/Forensic/Cyber).
  const [triage, setTriage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("PENDING");
  const [source, setSource] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [sourceBatch, setSourceBatch] = useState<any | null>(null);
  // Lead file-content viewer: raw exhibit as sealed (rawText/summary/hash).
  // Triage list already reloads on `signal`, which App.tsx bumps on every
  // STAGING_/EVIDENCE_UPLOADED WS event — so this view is real-time.
  const [viewExhibit, setViewExhibit] = useState<any | null>(null);
  const [summary, setSummary] = useState<{ text: string; provider: string; llmUsed: boolean; language?: string } | null>(null);
  const [summaryLang, setSummaryLang] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  // Document workspace: source reader + SAHAYAK brief, each fullscreen-expandable.
  const [readerTab, setReaderTab] = useState<"source" | "brief">("source");
  const [readerPage, setReaderPage] = useState(0);
  const [expanded, setExpanded] = useState<null | "source" | "brief">(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, st] = await Promise.all([
        stagingApi.getQueue(caseId, {
          status,
          ...(source ? { source } : {}),
        }),
        caseApi.getCaseState(caseId).catch(() => ({ evidenceFiles: [] as any[] })),
      ]);
      const uniqueEntities = Array.from(
        new Map((res.entities || []).map((e: any) => [`${e.label}-${e.type}`, e])).values()
      );
      const uniqueLinks = Array.from(
        new Map((res.links || []).map((l: any) => [`${l.sourceLabel}-${l.relationType}-${l.targetLabel}`, l])).values()
      );
      setEntities(uniqueEntities as any[]);
      setLinks(uniqueLinks as any[]);
      setBatches(res.batches || []);
      setTriage(((st as any).evidenceFiles || []).filter((e: any) =>
        ["UPLOADED", "PROCESSING", "PENDING"].includes(e.lifecycleStatus || e.processingStatus || "UPLOADED")
      ));
    } catch (err: any) {
      setError(err.message || "Failed to load approval queue.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, status, source, signal]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Review failed.");
    } finally {
      setBusy(null);
    }
  };

  const reviewEntity = (id: string, decision: "APPROVE" | "REJECT") =>
    run(id + decision, () => stagingApi.reviewEntity(caseId, id, decision, note[id]).then(() => undefined));

  const reviewLink = (id: string, decision: "APPROVE" | "REJECT") =>
    run(id + decision, () => stagingApi.reviewLink(caseId, id, decision, note[id]).then(() => undefined));

  const triageExhibit = (evidenceId: string, decision: "APPROVE" | "REJECT") =>
    run(evidenceId + decision, () => caseApi.triageEvidence(caseId, evidenceId, decision).then(() => undefined));

  const reviewBatch = (batchId: string, decision: "APPROVE" | "REJECT") =>
    run(batchId + decision, () =>
      stagingApi.reviewBatch(caseId, batchId, decision, decision === "REJECT" ? note[batchId] || "Bulk reject" : note[batchId]).then((r) => {
        if (r.skipped.length > 0) setError(`Batch reviewed. Held for entity approval: ${r.skipped.join("; ")}`);
      })
    );

  const openSource = (batch: any) => {
    setSourceBatch(batch);
    setSummary(null);
    setSummaryLang("");
    setReaderTab(batch?.aiBrief ? "brief" : "source");
    setReaderPage(0);
    setExpanded(null);
  };

  const summarizeSource = async () => {
    const text = sourceBatch?.readableContent || sourceBatch?.content;
    if (!text) return;
    setSummarizing(true);
    setError(null);
    try {
      const lang = LANGUAGES.find((l) => l.code === summaryLang);
      const res = await sahayakApi.summarize(
        text.slice(0, 12000),
        lang ? lang.label : undefined
      );
      setSummary({ text: res.summary, provider: res.provider, llmUsed: res.llmUsed, language: (res as any).language });
      setReaderTab("brief");
    } catch (err: any) {
      setError(err.message || "Summarize failed.");
    } finally {
      setSummarizing(false);
    }
  };

  const downloadBrief = (title: string, meta: string, text: string) => {
    try {
      const w = window.open("", "_blank");
      if (!w) {
        setError("Popup blocked — allow popups to download the brief.");
        return;
      }
      w.document.open();
      w.document.write(briefToNotebookHtml(title, meta, text));
      w.document.close();
    } catch (err: any) {
      setError(err?.message || "Download failed.");
    }
  };

  const btn = "p-1.5 rounded-lg border transition-colors disabled:opacity-50";
  const noteInput = (id: string, placeholder: string) => (
    <input
      value={note[id] || ""}
      onChange={(e) => setNote({ ...note, [id]: e.target.value })}
      placeholder={placeholder}
      disabled={readOnly || !canReview}
      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
    />
  );

  const pendingCount = entities.filter((e) => e.status === "PENDING").length + links.filter((l) => l.status === "PENDING").length;

  return (
    <div className="space-y-4">
      {/* Raw Exhibit Triage — fresh uploads awaiting Lead approve/reject */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" /> Incoming Exhibit Triage ({triage.length})
          </h3>
          {triage.length > 0 && <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />}
        </div>
        {triage.length === 0 ? (
          <p className="text-[11px] text-slate-500">No fresh uploads waiting — field, forensic and cyber intake appears here in real time.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {triage.map((ev: any) => (
              <div key={ev.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono font-bold text-slate-200 truncate">{ev.fileName}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">
                    {ev.fileType} · {ev.sourceAuthority} · by {ev.uploadedBy} ({ev.uploaderRole})
                  </div>
                </div>
                <span className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setViewExhibit(ev)}
                    className={`${btn} bg-cyan-500/10 border-cyan-500/40 text-cyan-300 text-[11px] font-bold px-2.5 hover:bg-cyan-500/20 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
                    title="View file contents as sealed — raw text, summary, hash"
                  >
                    View
                  </button>
                  <button
                    onClick={() => triageExhibit(ev.id, "APPROVE")}
                    disabled={!!busy || readOnly || !canReview}
                    className={`${btn} bg-emerald-500/15 border-emerald-500/40 text-emerald-300 text-[11px] font-bold px-2.5`}
                    title="Approve: extract + stage for graph review"
                  >
                    {busy === ev.id + "APPROVE" ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => triageExhibit(ev.id, "REJECT")}
                    disabled={!!busy || readOnly || !canReview}
                    className={`${btn} bg-rose-500/15 border-rose-500/40 text-rose-300 text-[11px] font-bold px-2.5`}
                    title="Reject: remove from triage"
                  >
                    {busy === ev.id + "REJECT" ? "…" : "Reject"}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" /> Approval Queue
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">{pendingCount} pending</span>
        </h3>
        <div className="flex gap-1.5 ml-auto">
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none">
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none">
            <option value="">All sources</option>
            {["FIR", "CDR_CSV", "FINANCIAL_CSV", "OSINT_URL", "INTEL_REPORT", "CYBER_LOG"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {!canReview && (
        <div className="text-[11px] font-mono text-slate-500">Your role submits to staging; approval authority rests with the Lead Investigator / deputed agency officer.</div>
      )}

      {batches.length > 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Batches ({batches.length})</div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {batches.map((b: any) => (
              <div key={b._id} className="flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 flex-wrap">
                <span className="font-bold text-slate-100">{b.source}</span>
                <span className="text-slate-500">{b.fileName || b.url || "direct"}</span>
                <span className="text-emerald-300">{b.approvedCount}✓</span>
                <span className="text-rose-300">{b.rejectedCount}✗</span>
                <span className="text-amber-300">{b.pendingCount}…</span>
                {b.enrichment && (
                  <span className={`px-1.5 py-0.5 rounded border ${b.enrichment === "LLM_ASSIST" ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
                    {b.enrichment === "LLM_ASSIST" ? "LLM-enriched" : "rules"}
                  </span>
                )}
                {b.aiBrief ? (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/40 text-indigo-300" title="SAHAYAK pre-read the full document before review">
                    AI brief ready
                  </span>
                ) : b.briefPending ? (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400" title="SAHAYAK is reading the full document">
                    AI reading…
                  </span>
                ) : null}
                {b.content && (
                  <button onClick={() => openSource(b)} title="Read file as-is + SAHAYAK summary"
                    className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Source
                  </button>
                )}
                <span className="text-slate-500 ml-auto">{b.status}</span>
                {b.pendingCount > 0 && canReview && !readOnly && (
                  <>
                    <button disabled={busy === b._id + "APPROVE"} onClick={() => reviewBatch(b._id, "APPROVE")}
                      className={`${btn} bg-emerald-500/15 border-emerald-500/40 text-emerald-300`}>
                      {busy === b._id + "APPROVE" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Approve all"}
                    </button>
                    <button disabled={busy === b._id + "REJECT"} onClick={() => reviewBatch(b._id, "REJECT")}
                      className={`${btn} bg-rose-500/15 border-rose-500/40 text-rose-300`}>
                      {busy === b._id + "REJECT" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reject all"}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading queue…</div>
      ) : entities.length === 0 && links.length === 0 ? (
        <div className="text-xs text-slate-500 py-8 text-center">Queue is clear for this filter.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Entities ({entities.length})</div>
            {entities.map((e: any) => (
              <div key={e._id} className="rounded-xl bg-slate-900 border border-slate-800 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-100">{e.label}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{e.type}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{e.source}</span>
                  {e.duplicateOf && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/40 text-indigo-300">dup → {e.duplicateOf}</span>}
                  <span className="text-[10px] font-mono text-slate-500 ml-auto">conf {e.confidence}</span>
                </div>
                {e.locator && <div className="text-[11px] font-mono text-slate-500 mt-1">◈ {e.locator}</div>}
                {e.reviewedBy && <div className="text-[11px] text-slate-500 mt-1">{e.status} by {e.reviewedBy}{e.reviewNote ? ` — ${e.reviewNote}` : ""}</div>}
                {e.status === "PENDING" && canReview && !readOnly && (
                  <div className="flex gap-1.5 mt-2">
                    <div className="flex-1">{noteInput(e._id, "Review note (required to reject)…")}</div>
                    <button disabled={busy === e._id + "APPROVE"} onClick={() => reviewEntity(e._id, "APPROVE")}
                      title="Admit to main graph" className={`${btn} bg-emerald-500/15 border-emerald-500/40 text-emerald-300`}>
                      {busy === e._id + "APPROVE" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                    <button disabled={busy === e._id + "REJECT"} onClick={() => reviewEntity(e._id, "REJECT")}
                      title="Reject to Innocent pool" className={`${btn} bg-rose-500/15 border-rose-500/40 text-rose-300`}>
                      {busy === e._id + "REJECT" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Links ({links.length})</div>
            {links.map((l: any) => (
              <div key={l._id} className="rounded-xl bg-slate-900 border border-slate-800 p-3">
                <div className="text-xs text-slate-100">
                  <b>{l.sourceLabel}</b> <span className="text-amber-300 font-mono text-[11px]">[{l.relationType}]</span> <b>{l.targetLabel}</b>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {l.details || "—"}{l.amount ? ` · ₹${Number(l.amount).toLocaleString("en-IN")}` : ""}{l.frequency ? ` · ×${l.frequency}` : ""}
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">{l.source}{l.locator ? ` · ◈ ${l.locator}` : ""}</div>
                {l.reviewedBy && <div className="text-[11px] text-slate-500 mt-1">{l.status} by {l.reviewedBy}{l.reviewNote ? ` — ${l.reviewNote}` : ""}</div>}
                {l.status === "PENDING" && canReview && !readOnly && (
                  <div className="flex gap-1.5 mt-2">
                    <div className="flex-1">{noteInput(l._id, "Review note (required to reject)…")}</div>
                    <button disabled={busy === l._id + "APPROVE"} onClick={() => reviewLink(l._id, "APPROVE")}
                      title="Admit to main graph" className={`${btn} bg-emerald-500/15 border-emerald-500/40 text-emerald-300`}>
                      {busy === l._id + "APPROVE" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    </button>
                    <button disabled={busy === l._id + "REJECT"} onClick={() => reviewLink(l._id, "REJECT")}
                      title="Reject to Innocent pool" className={`${btn} bg-rose-500/15 border-rose-500/40 text-rose-300`}>
                      {busy === l._id + "REJECT" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch source reader: raw file as-is + SAHAYAK summary in any language */}
      {viewExhibit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Exhibit contents: ${viewExhibit.fileName}`}>
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setViewExhibit(null)} />
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-100 font-mono truncate">{viewExhibit.fileName}</div>
                <div className="text-[10px] font-mono text-slate-500 truncate">
                  {viewExhibit.fileType} · {viewExhibit.sourceAuthority} · by {viewExhibit.uploadedBy} ({viewExhibit.uploaderRole})
                  {viewExhibit.uploadedAt ? ` · ${String(viewExhibit.uploadedAt).slice(0, 16).replace("T", " ")}` : ""}
                </div>
              </div>
              <span className="flex gap-1 shrink-0">
                <button
                  onClick={() => { triageExhibit(viewExhibit.id, "APPROVE"); setViewExhibit(null); }}
                  disabled={!!busy || readOnly || !canReview}
                  className={`${btn} bg-emerald-500/15 border-emerald-500/40 text-emerald-300 text-[11px] font-bold px-2.5 disabled:opacity-50`}
                  title="Approve from the viewer"
                >
                  Approve
                </button>
                <button
                  onClick={() => { triageExhibit(viewExhibit.id, "REJECT"); setViewExhibit(null); }}
                  disabled={!!busy || readOnly || !canReview}
                  className={`${btn} bg-rose-500/15 border-rose-500/40 text-rose-300 text-[11px] font-bold px-2.5 disabled:opacity-50`}
                  title="Reject from the viewer"
                >
                  Reject
                </button>
                <button onClick={() => setViewExhibit(null)} className="btn-ghost" aria-label="Close exhibit viewer">
                  <X className="w-4 h-4" />
                </button>
              </span>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {viewExhibit.summary && (
                <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-950 border border-slate-800 rounded-xl p-3">
                  {viewExhibit.summary}
                </div>
              )}
              <div>
                <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  File contents as sealed {viewExhibit.rawText ? `· ${(String(viewExhibit.rawText).length / 1024).toFixed(1)} KB` : ""}
                </div>
                <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-72 overflow-y-auto">
                  {viewExhibit.rawText || "(No extractable text — sealed container: photo / audio / video / large binary. Metadata + summary above; officer narrative carries the extractable intel.)"}
                </pre>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                {viewExhibit.fileHash && (
                  <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                    SHA-256: {String(viewExhibit.fileHash).slice(0, 32)}…
                  </span>
                )}
                {viewExhibit.fileSizeFormatted && (
                  <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                    {viewExhibit.fileSizeFormatted}
                  </span>
                )}
                {viewExhibit.lifecycleStatus && (
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">
                    {viewExhibit.lifecycleStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {sourceBatch && (() => {
        const docTitle = sourceBatch.fileName || sourceBatch.url || sourceBatch.source;
        const readable = sourceBatch.readableContent || sourceBatch.content || "";
        const pages = paginateText(readable);
        const page = Math.min(readerPage, Math.max(0, pages.length - 1));
        const briefText: string | null = summary?.text || sourceBatch.aiBrief || null;
        const briefMeta = summary
          ? `${summary.llmUsed ? `SAHAYAK · ${summary.provider}` : "Offline extract"}${summary.language ? ` · ${summary.language}` : ""}`
          : sourceBatch.aiBrief
            ? `SAHAYAK pre-read · ${sourceBatch.briefProvider || "model"}${sourceBatch.briefAt ? ` · ${String(sourceBatch.briefAt).slice(0, 16).replace("T", " ")}` : ""}`
            : "";

        const sourcePane = (fs: boolean) => (
          <div className={fs ? "flex-1 overflow-y-auto px-6 sm:px-12 py-6" : ""}>
            {pages.length === 0 ? (
              <div className="text-[11px] text-slate-500 text-center py-8">No readable text retained for this batch (structured rows only).</div>
            ) : (
              <>
                <div className="max-w-2xl mx-auto bg-[#fafaf9] text-stone-800 rounded-lg shadow-xl px-6 sm:px-10 py-8 font-serif">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 border-b border-stone-200 pb-2 mb-4">
                    {docTitle} · page {page + 1} of {pages.length}
                  </div>
                  {pages[page].split(/\n{2,}/).map((para, i) => (
                    <p key={i} className="text-[13px] leading-[1.75] text-justify mb-3 last:mb-0">{para}</p>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button
                    onClick={() => setReaderPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs disabled:opacity-40"
                  >
                    ◀ Prev
                  </button>
                  <span className="text-[11px] font-mono text-slate-400">{page + 1} / {pages.length}</span>
                  <button
                    onClick={() => setReaderPage(Math.min(pages.length - 1, page + 1))}
                    disabled={page >= pages.length - 1}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs disabled:opacity-40"
                  >
                    Next ▶
                  </button>
                  {!fs && (
                    <button
                      onClick={() => setExpanded("source")}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs flex items-center gap-1"
                      title="Expand to fullscreen"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Expand
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );

        const briefPane = (fs: boolean) => (
          <div className={fs ? "flex-1 overflow-y-auto px-4 sm:px-10 py-6" : ""}>
            {briefText ? (
              <>
                <div
                  className="max-w-2xl mx-auto rounded-lg shadow-xl px-6 sm:px-10 py-8 font-serif text-stone-800 text-[13px] leading-[1.75]"
                  style={{ backgroundImage: "repeating-linear-gradient(#fffdf5 0, #fffdf5 30px, #e7e5e4 30px, #e7e5e4 31px)" }}
                >
                  <div className="text-[10px] font-mono uppercase tracking-widest text-amber-700 border-b border-amber-700/40 pb-2 mb-3">
                    SAHAYAK brief · {docTitle}
                  </div>
                  <div className="text-[10px] font-mono text-stone-500 mb-2">{briefMeta}</div>
                  {renderBriefMarkdown(briefText)}
                </div>
                <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                  {!fs && (
                    <button
                      onClick={() => setExpanded("brief")}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs flex items-center gap-1"
                      title="Expand to fullscreen"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Expand
                    </button>
                  )}
                  <button
                    onClick={() => downloadBrief(docTitle, briefMeta, briefText)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-1"
                    title="Download as printable notebook (save as PDF)"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </>
            ) : sourceBatch.briefPending ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-slate-300">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
                SAHAYAK is reading the full document — the brief lands here the moment it is ready.
              </div>
            ) : (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
                <div className="text-[12px] text-slate-300 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-300" />
                  No brief yet for this document. Generate an exhaustive narrative brief below.
                </div>
                <div className="flex gap-1.5 items-center flex-wrap">
                  <select
                    value={summaryLang}
                    onChange={(e) => setSummaryLang(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-slate-200 focus:outline-none max-w-[150px]"
                    title="Brief language — the entire brief is written in the selected language"
                  >
                    <option value="">Source language</option>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.nativeLabel}</option>
                    ))}
                  </select>
                  <button onClick={summarizeSource} disabled={summarizing || !readable} className="btn-primary !py-2 disabled:opacity-50">
                    {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate brief with SAHAYAK
                  </button>
                </div>
              </div>
            )}
          </div>
        );

        return (
          <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-950/80" onClick={() => { setSourceBatch(null); setExpanded(null); }} />
              <div className="relative w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 gap-2">
                  <div className="text-xs font-bold text-slate-100 font-mono truncate">
                    {docTitle}
                    {sourceBatch.aiBrief && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/40 text-indigo-300">AI brief ready</span>}
                    {sourceBatch.briefPending && !sourceBatch.aiBrief && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">AI reading…</span>}
                  </div>
                  <button onClick={() => { setSourceBatch(null); setExpanded(null); }} className="btn-ghost shrink-0" aria-label="Close document workspace"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex gap-1.5 px-4 pt-3">
                  {(["source", "brief"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setReaderTab(t)}
                      className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${readerTab === t
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                        }`}
                    >
                      {t === "source" ? `Source document${pages.length > 1 ? ` · ${pages.length} pages` : ""}` : "SAHAYAK brief"}
                    </button>
                  ))}
                </div>
                <div className="overflow-y-auto p-4">
                  {readerTab === "source" ? sourcePane(false) : briefPane(false)}
                </div>
              </div>
            </div>
            {expanded && (
              <div className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur flex flex-col">
                <div className="flex items-center justify-between px-4 sm:px-8 py-3 border-b border-slate-800">
                  <div className="text-xs font-bold text-slate-100 font-mono truncate">
                    {docTitle} · {expanded === "source" ? "Source document" : "SAHAYAK brief"}
                  </div>
                  <button onClick={() => setExpanded(null)} className="btn-ghost shrink-0" aria-label="Exit fullscreen">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {expanded === "source" ? sourcePane(true) : briefPane(true)}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
};

export default ApprovalQueueTab;
