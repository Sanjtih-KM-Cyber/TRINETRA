import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { proceedingsApi } from "../../services/api";
import { generateCaseDiaryPdf, type CaseMeta } from "../../services/legalPdf";
import { DictationField } from "./DictationField";
import { BookOpen, PenLine, ShieldCheck, Download, Loader2, AlertCircle, Link2 } from "lucide-react";
import { SP_ELIGIBLE_CLIENT_ROLES } from "./roleGates";

interface CaseDiaryTabProps {
  caseId: string;
  caseMeta: CaseMeta;
  onChanged: () => void;
  readOnly?: boolean;
}

export const CaseDiaryTab: React.FC<CaseDiaryTabProps> = ({ caseId, caseMeta, onChanged, readOnly = false }) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), time: "", place: "", firRef: "", proceedings: "", actionTaken: "" });

  const canCountersign = !!user && SP_ELIGIBLE_CLIENT_ROLES.includes(user.role);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await proceedingsApi.getDiary(caseId);
      setEntries(res.entries || []);
    } catch (err: any) {
      setError(err.message || "Failed to load case diary.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    setError(null);
    try {
      await proceedingsApi.createDiaryEntry(caseId, form);
      setForm({ date: new Date().toISOString().slice(0, 10), time: "", place: "", firRef: "", proceedings: "", actionTaken: "" });
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to record entry.");
    } finally {
      setBusy(null);
    }
  };

  const act = async (entryId: string, kind: "sign" | "countersign") => {
    setBusy(entryId + kind);
    setError(null);
    try {
      if (kind === "sign") await proceedingsApi.signDiary(caseId, entryId);
      else await proceedingsApi.countersignDiary(caseId, entryId);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const statusColor = (s: string) =>
    s === "COUNTERSIGNED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : s === "SIGNED" ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
    : "bg-slate-800 text-slate-400 border-slate-700";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <form onSubmit={submit} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3.5 h-fit">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <PenLine className="w-4 h-4 text-amber-400" /> New Sec 172 Entry
        </h3>
        {error && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Date *</label>
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Time</label>
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
            <input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} required placeholder="PS / field location"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">FIR ref</label>
            <input value={form.firRef} onChange={(e) => setForm({ ...form, firRef: e.target.value })} placeholder="FIR No. 209/2026"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
        </div>
        <DictationField label="Proceedings (daily investigation record)" value={form.proceedings}
          onChange={(v) => setForm({ ...form, proceedings: v })} required rows={5}
          placeholder="Dictate or type the day's proceedings — searches, interrogations, evidence collected…" />
        <DictationField label="Action taken / proposed" value={form.actionTaken}
          onChange={(v) => setForm({ ...form, actionTaken: v })} rows={3}
          placeholder="Follow-up action, remand sought, notices issued…" />
        <button type="submit" disabled={busy === "create" || readOnly} className="btn-primary w-full disabled:opacity-50">
          {busy === "create" ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording…</> : <><BookOpen className="w-4 h-4" /> Record Entry (hash-chained)</>}
        </button>
      </form>

      <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Diary Register <span className="text-slate-500 font-mono text-xs">({entries.length})</span></h3>
          <button onClick={() => generateCaseDiaryPdf(caseMeta, entries)} disabled={entries.length === 0}
            className="btn-secondary disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Sec 172 PDF
          </button>
        </div>
        {loading ? (
          <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading register…</div>
        ) : entries.length === 0 ? (
          <div className="text-xs text-slate-500 py-8 text-center">No entries yet. Graph reviews, evidence commits and custody events auto-log here.</div>
        ) : (
          <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
            {entries.map((e: any) => (
              <div key={e._id} className="rounded-xl bg-slate-950 border border-slate-800 p-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-100">No.{e.diaryNo} · {e.date}{e.time ? ` ${e.time}` : ""}</span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${statusColor(e.status)}`}>{e.status}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">{e.place}{e.firRef ? ` · FIR ${e.firRef}` : ""}</div>
                <p className="text-xs text-slate-200 mt-2 leading-relaxed whitespace-pre-wrap">{e.proceedings}</p>
                {e.actionTaken && <p className="text-[11px] text-slate-400 mt-1.5"><span className="font-semibold text-slate-300">Action:</span> {e.actionTaken}</p>}
                <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-slate-500 flex-wrap">
                  {e.autoLogged && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300"><Link2 className="w-3 h-3" /> AUTO · {e.sourceAction}</span>}
                  <span>IO: {e.ioName}</span>
                  {e.ioSignature && <span className="text-cyan-300">✓ signed {e.ioSignature.signedAt.slice(0, 10)}</span>}
                  {e.countersign && <span className="text-emerald-300">✓ countersigned by {e.countersign.name}</span>}
                </div>
                <div className="flex gap-2 mt-2.5">
                  {e.status === "DRAFT" && !readOnly && (
                    <button onClick={() => act(e._id, "sign")} disabled={busy === e._id + "sign"} className="btn-secondary !py-1.5">
                      {busy === e._id + "sign" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />} IO Sign
                    </button>
                  )}
                  {e.status === "SIGNED" && canCountersign && !readOnly && (
                    <button onClick={() => act(e._id, "countersign")} disabled={busy === e._id + "countersign"} className="btn-secondary !py-1.5 !border-emerald-500/40 !text-emerald-300">
                      {busy === e._id + "countersign" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} SP Countersign
                    </button>
                  )}
                  {e.status === "SIGNED" && !canCountersign && (
                    <span className="text-[10px] font-mono text-slate-500">Awaiting SP countersign</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CaseDiaryTab;
