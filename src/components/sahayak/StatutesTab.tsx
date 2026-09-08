import React, { useState } from "react";
import { sahayakApi } from "../../services/api";
import { Scale, Search, Loader2, AlertCircle, Landmark, Gavel, BookOpen } from "lucide-react";

export const StatutesTab: React.FC = () => {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (e?: React.FormEvent, preset?: string) => {
    e?.preventDefault();
    const query = preset || q;
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sahayakApi.statutes(query, 10);
      setHits(res.hits || []);
    } catch (err: any) {
      setError(err.message || "Lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  const kindIcon = (k: string) =>
    k === "constitution" ? <Landmark className="w-3.5 h-3.5 text-amber-300" />
    : k === "caselaw" ? <Gavel className="w-3.5 h-3.5 text-indigo-300" />
    : <BookOpen className="w-3.5 h-3.5 text-emerald-300" />;

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => search(e)} className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Section or keyword — 167, 65B, NDPS 21, anticipatory bail…"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-2.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary !px-3 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </form>
      <div className="flex gap-1.5 flex-wrap">
        {["167 remand", "65B certificate", "41A notice", "NDPS 21", "anticipatory bail", "PMLA", "organised crime"].map((p) => (
          <button key={p} onClick={() => { setQ(p); search(undefined, p); }}
            className="text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/40">
            {p}
          </button>
        ))}
      </div>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      <div className="space-y-2">
        {hits.map((h: any) => (
          <div key={h.id} className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
              {kindIcon(h.kind)} {h.title}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">{h.kind.toUpperCase()} · {h.ref}</div>
            <div className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">{h.snippet}</div>
          </div>
        ))}
        {!busy && hits.length === 0 && (
          <div className="text-[11px] text-slate-500 text-center py-6 flex flex-col items-center gap-2">
            <Scale className="w-5 h-5 text-slate-600" />
            Local corpus: Constitution safeguards, BNS/BNSS/BSA provisions with CrPC mappings, NDPS/UAPA/PMLA/IT Act, 12 binding precedents.
          </div>
        )}
      </div>
    </div>
  );
};

export default StatutesTab;
