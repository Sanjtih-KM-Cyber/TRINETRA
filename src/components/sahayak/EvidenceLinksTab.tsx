import React, { useState } from "react";
import { sahayakApi, stagingApi } from "../../services/api";
import { Link2, Loader2, AlertCircle, Send, CheckCircle2, Scale } from "lucide-react";

interface EvidenceLinksTabProps {
  caseId: string;
  readOnly: boolean;
  onChanged: () => void;
}

export const EvidenceLinksTab: React.FC<EvidenceLinksTabProps> = ({ caseId, readOnly, onChanged }) => {
  const [proposals, setProposals] = useState<any[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await sahayakApi.linkEvidence(caseId, 40);
      setProposals(res.proposals || []);
      setGeneratedAt(res.generatedAt);
    } catch (err: any) {
      setError(err.message || "Linker failed.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (p: any) => {
    setSending(p.id);
    setError(null);
    try {
      // Endpoint labels may not exist yet — stage the pair as entities first via a mini-batch,
      // then stage the link itself. Both land in the Lead queue, never the graph.
      const res = await stagingApi.ingest(caseId, {
        source: "INTEL_REPORT",
        fileName: `SAHAYAK link proposal ${p.id}`,
        content: `SAHAYAK evidence-link proposal.\nSource entity: ${p.sourceLabel}\nTarget: ${p.targetLabel}\nRelation: ${p.relationType}\nBasis: ${p.basis}\nSuggested statutes: ${(p.statutes || []).map((s: any) => s.ref).join(", ")}`,
      });
      setSent((prev) => ({ ...prev, [p.id]: res.batchId }));
      onChanged();
    } catch (err: any) {
      setError(err.message || "Send to staging failed.");
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={run} disabled={busy} className="btn-primary w-full disabled:opacity-50">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Cross-referencing CDR · ledger · statements…</> : <><Link2 className="w-4 h-4" /> Run Evidence Linker</>}
      </button>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {generatedAt && (
        <div className="text-[10px] font-mono text-slate-500">Generated {new Date(generatedAt).toLocaleString("en-IN")} · {proposals.length} proposals</div>
      )}
      <div className="space-y-2">
        {proposals.map((p: any) => (
          <div key={p.id} className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <div className="text-xs text-slate-100">
              <b>{p.sourceLabel}</b> <span className="text-amber-300 font-mono text-[11px]">[{p.relationType}]</span> <b>{p.targetLabel}</b>
              {!p.sendable && <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">CONTEXT</span>}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{p.basis}</div>
            {(p.statutes || []).length > 0 && (
              <div className="mt-1.5 space-y-1">
                {(p.statutes || []).map((s: any) => (
                  <div key={s.id} className="text-[11px] text-slate-300 flex gap-1.5">
                    <Scale className="w-3 h-3 text-indigo-300 shrink-0 mt-0.5" />
                    <span><b className="font-mono">{s.ref}</b> — {s.title}: {s.snippet.slice(0, 120)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-mono text-slate-500">conf {Number(p.confidence).toFixed(2)}</span>
              {p.sendable && !readOnly && !sent[p.id] && (
                <button onClick={() => send(p)} disabled={sending === p.id} className="btn-secondary !py-1 ml-auto disabled:opacity-50">
                  {sending === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send to Staging
                </button>
              )}
              {sent[p.id] && (
                <span className="text-[10px] font-mono text-emerald-300 ml-auto flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> staged · {sent[p.id]}
                </span>
              )}
            </div>
          </div>
        ))}
        {!busy && proposals.length === 0 && (
          <div className="text-[11px] text-slate-500 text-center py-6">Run the linker to cross-reference CDR rows, ledger entries and statements against graph entities.</div>
        )}
      </div>
    </div>
  );
};

export default EvidenceLinksTab;
