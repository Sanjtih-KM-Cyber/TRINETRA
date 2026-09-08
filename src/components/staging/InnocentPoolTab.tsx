import React, { useState } from "react";
import { stagingApi } from "../../services/api";
import { Scale, Search, RotateCcw, Loader2, AlertCircle } from "lucide-react";

interface InnocentPoolTabProps {
  caseId: string;
  readOnly: boolean;
  signal: number;
  onChanged: () => void;
}

export const InnocentPoolTab: React.FC<InnocentPoolTabProps> = ({ caseId, readOnly, signal, onChanged }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async (query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await stagingApi.getInnocentPool(caseId, query);
      setItems(res.items || []);
    } catch (err: any) {
      setError(err.message || "Failed to load Innocent pool.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, signal]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    load(q);
  };

  const readd = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await stagingApi.readdFromPool(caseId, id);
      await load(q);
      onChanged();
    } catch (err: any) {
      setError(err.message || "Re-admission failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Scale className="w-4 h-4 text-emerald-400" /> Innocent Until Proven Guilty — Pool
          <span className="text-slate-500 font-mono text-xs">({items.length})</span>
        </h3>
        <form onSubmit={search} className="flex gap-1.5 ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search label, reason, source…"
              className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 w-56" />
          </div>
          <button type="submit" className="btn-secondary !py-1.5">Search</button>
        </form>
      </div>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Rejected items are preserved here with their rejection reasons — never deleted. Fresh evidence can send any item back to staging for re-review.
      </p>

      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading pool…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-slate-500 py-8 text-center">Pool is empty{q ? ` for "${q}"` : ""}.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {items.map((it: any) => (
            <div key={it._id} className="rounded-xl bg-slate-900 border border-slate-800 p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-100">{it.label}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{it.kind}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{it.source}</span>
                {it.readded && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">re-admitted</span>}
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5">
                <span className="font-semibold text-slate-300">Rejected by {it.rejectedBy}</span> ({String(it.rejectedAt).slice(0, 10)}): {it.rejectionReason}
              </div>
              {!readOnly && (
                <button onClick={() => readd(it._id)} disabled={busy === it._id} className="btn-secondary !py-1.5 mt-2.5">
                  {busy === it._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Re-admit to Staging
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InnocentPoolTab;
