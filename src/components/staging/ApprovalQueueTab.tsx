import React, { useState } from "react";
import { stagingApi, sahayakApi } from "../../services/api";
import { LANGUAGES } from "../../services/i18n";
import { CheckCircle2, XCircle, Loader2, AlertCircle, Layers, FileText, Sparkles, X } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("PENDING");
  const [source, setSource] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [sourceBatch, setSourceBatch] = useState<any | null>(null);
  const [summary, setSummary] = useState<{ text: string; provider: string; llmUsed: boolean } | null>(null);
  const [summaryLang, setSummaryLang] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await stagingApi.getQueue(caseId, {
        status,
        ...(source ? { source } : {}),
      });
      setEntities(res.entities || []);
      setLinks(res.links || []);
      setBatches(res.batches || []);
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
  };

  const summarizeSource = async () => {
    if (!sourceBatch?.content) return;
    setSummarizing(true);
    setError(null);
    try {
      const lang = LANGUAGES.find((l) => l.code === summaryLang);
      const res = await sahayakApi.summarize(
        sourceBatch.content.slice(0, 12000),
        lang ? lang.label : undefined
      );
      setSummary({ text: res.summary, provider: res.provider, llmUsed: res.llmUsed });
    } catch (err: any) {
      setError(err.message || "Summarize failed.");
    } finally {
      setSummarizing(false);
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
                {(b.unresolved || []).length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300">
                    {(b.unresolved || []).length} unparsed
                  </span>
                )}
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
      {sourceBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80" onClick={() => setSourceBatch(null)} />
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="text-xs font-bold text-slate-100 font-mono truncate">
                {sourceBatch.fileName || sourceBatch.url || sourceBatch.source}
                <span className="text-slate-500 font-normal"> · raw source, unmodified</span>
              </div>
              <button onClick={() => setSourceBatch(null)} className="btn-ghost"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-64 overflow-y-auto">
                {sourceBatch.content || "(no retained content for this batch)"}
              </pre>
              {(sourceBatch.unresolved || []).length > 0 && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/30 p-3">
                  <div className="text-[11px] font-bold text-amber-300 mb-1.5">
                    Unparsed lines held for review ({sourceBatch.unresolved.length}) — nothing was dropped
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(sourceBatch.unresolved || []).map((u: string, i: number) => (
                      <div key={i} className="text-[10px] font-mono text-slate-400">{u}</div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-1.5 items-center flex-wrap">
                <select
                  value={summaryLang}
                  onChange={(e) => setSummaryLang(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-slate-200 focus:outline-none max-w-[150px]"
                  title="Summary language"
                >
                  <option value="">Source language</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.nativeLabel}</option>
                  ))}
                </select>
                <button onClick={summarizeSource} disabled={summarizing || !sourceBatch.content} className="btn-primary !py-2 disabled:opacity-50">
                  {summarizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Summarize with SAHAYAK
                </button>
                {summary && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${summary.llmUsed ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
                    {summary.llmUsed ? `LLM · ${summary.provider}` : "extractive offline"}
                  </span>
                )}
              </div>
              {summary && (
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-950 border border-slate-800 rounded-xl p-3">
                  {summary.text}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalQueueTab;
