import React, { useState } from "react";
import { proceedingsApi } from "../../services/api";
import { MO_CODES } from "../../data/moCodes";
import { generateHistorySheetPdf, type CaseMeta } from "../../services/legalPdf";
import { SP_ELIGIBLE_CLIENT_ROLES } from "./roleGates";
import { useAuth } from "../../context/AuthContext";
import { ScrollText, Plus, Trash2, Download, Loader2, AlertCircle } from "lucide-react";

interface HistorySheetTabProps {
  caseId: string;
  caseMeta: CaseMeta;
  onChanged: () => void;
  readOnly?: boolean;
}

export const HistorySheetTab: React.FC<HistorySheetTabProps> = ({ caseId, caseMeta, onChanged, readOnly = false }) => {
  const { user } = useAuth();
  const [sheets, setSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    subjectName: "", dob: "", address: "", policeStation: "", district: "",
    category: "B", village: "", beatNo: "", beatOfficer: "", villageRemarks: "",
    surveillanceLevel: "", checkIntervalDays: "",
  });
  const [aliases, setAliases] = useState("");
  const [moCodes, setMoCodes] = useState<string[]>([]);
  const [prevCases, setPrevCases] = useState<any[]>([{ firNumber: "", policeStation: "", sections: "", status: "PENDING_TRIAL" }]);
  const [associates, setAssociates] = useState<any[]>([{ name: "", relation: "" }]);

  const canClose = !!user && SP_ELIGIBLE_CLIENT_ROLES.includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      const res = await proceedingsApi.getHistorySheets(caseId);
      setSheets(res.sheets || []);
    } catch (err: any) {
      setError(err.message || "Failed to load history sheets.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const toggleMO = (code: string) =>
    setMoCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    setError(null);
    try {
      await proceedingsApi.createHistorySheet(caseId, {
        ...form,
        aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
        moCodes,
        previousCases: prevCases.filter((c) => c.firNumber.trim()),
        associates: associates.filter((a) => a.name.trim()),
        checkIntervalDays: form.checkIntervalDays ? Number(form.checkIntervalDays) : undefined,
      });
      setShowForm(false);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to open history sheet.");
    } finally {
      setBusy(null);
    }
  };

  const close = async (sheet: any) => {
    setBusy(sheet._id);
    setError(null);
    try {
      await proceedingsApi.updateHistorySheet(caseId, sheet._id, { status: "CLOSED" });
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Close failed.");
    } finally {
      setBusy(null);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-amber-400" /> History Sheets / Dossiers
          <span className="text-slate-500 font-mono text-xs">({sheets.length})</span>
        </h3>
        {!readOnly && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-4 h-4" /> {showForm ? "Close" : "Open Sheet"}
          </button>
        )}
      </div>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Subject name *</label>
              <input required value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">DOB</label>
              <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                <option value="A">A — Desperate criminal</option>
                <option value="B">B — Confirmed criminal</option>
                <option value="C">C — Suspect / budding</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address *" className={inputCls} />
            <input required value={form.policeStation} onChange={(e) => setForm({ ...form, policeStation: e.target.value })} placeholder="Police station *" className={inputCls} />
            <input required value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="District *" className={inputCls} />
          </div>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Aliases (comma separated)" className={inputCls} />

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs font-bold text-slate-200 mb-2">MO Codes * ({moCodes.length} selected)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {MO_CODES.map((m) => (
                <label key={m.code} className={`flex items-start gap-2 text-[11px] rounded-lg border px-2 py-1.5 cursor-pointer ${moCodes.includes(m.code) ? "border-amber-500/50 bg-amber-500/10 text-slate-100" : "border-slate-800 text-slate-400"}`}>
                  <input type="checkbox" checked={moCodes.includes(m.code)} onChange={() => toggleMO(m.code)} className="accent-amber-500 mt-0.5" />
                  <span><b className="font-mono">{m.code}</b> · {m.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-200">Previous Cases</div>
                <button type="button" onClick={() => setPrevCases([...prevCases, { firNumber: "", policeStation: "", sections: "", status: "PENDING_TRIAL" }])} className="btn-secondary !py-1"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              {prevCases.map((c, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5">
                  <input value={c.firNumber} onChange={(e) => { const x = [...prevCases]; x[i].firNumber = e.target.value; setPrevCases(x); }} placeholder="FIR No." className={`${inputCls} font-mono`} />
                  <input value={c.policeStation} onChange={(e) => { const x = [...prevCases]; x[i].policeStation = e.target.value; setPrevCases(x); }} placeholder="PS" className={inputCls} />
                  <input value={c.sections} onChange={(e) => { const x = [...prevCases]; x[i].sections = e.target.value; setPrevCases(x); }} placeholder="Sections" className={inputCls} />
                  <div className="flex gap-1">
                    <select value={c.status} onChange={(e) => { const x = [...prevCases]; x[i].status = e.target.value; setPrevCases(x); }} className={`${inputCls} flex-1`}>
                      <option value="PENDING_TRIAL">Pending trial</option>
                      <option value="CONVICTED">Convicted</option>
                      <option value="ACQUITTED">Acquitted</option>
                      <option value="APPEAL_PENDING">Appeal pending</option>
                    </select>
                    {prevCases.length > 1 && <button type="button" onClick={() => setPrevCases(prevCases.filter((_, j) => j !== i))} className="btn-ghost"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-200">Associates</div>
                <button type="button" onClick={() => setAssociates([...associates, { name: "", relation: "" }])} className="btn-secondary !py-1"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              {associates.map((a, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5">
                  <input value={a.name} onChange={(e) => { const x = [...associates]; x[i].name = e.target.value; setAssociates(x); }} placeholder="Name" className={inputCls} />
                  <div className="flex gap-1">
                    <input value={a.relation} onChange={(e) => { const x = [...associates]; x[i].relation = e.target.value; setAssociates(x); }} placeholder="Relation" className={`${inputCls} flex-1`} />
                    {associates.length > 1 && <button type="button" onClick={() => setAssociates(associates.filter((_, j) => j !== i))} className="btn-ghost"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2.5">
            <div className="text-xs font-bold text-emerald-200">Village Crime Notebook (Part II)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <input required value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} placeholder="Village *" className={inputCls} />
              <input value={form.beatNo} onChange={(e) => setForm({ ...form, beatNo: e.target.value })} placeholder="Beat No." className={inputCls} />
              <input value={form.beatOfficer} onChange={(e) => setForm({ ...form, beatOfficer: e.target.value })} placeholder="Beat officer" className={inputCls} />
              <input value={form.checkIntervalDays} onChange={(e) => setForm({ ...form, checkIntervalDays: e.target.value })} placeholder="Check days (auto by cat)" inputMode="numeric" className={inputCls} />
            </div>
            <textarea value={form.villageRemarks} onChange={(e) => setForm({ ...form, villageRemarks: e.target.value })} placeholder="VCN remarks — residence, movements, local contacts…" rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
            <input value={form.surveillanceLevel} onChange={(e) => setForm({ ...form, surveillanceLevel: e.target.value })} placeholder="Surveillance level (auto by category if blank)" className={inputCls} />
          </div>

          <button type="submit" disabled={busy === "create"} className="btn-primary w-full">
            {busy === "create" ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</> : <><ScrollText className="w-4 h-4" /> Open History Sheet</>}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading sheets…</div>
      ) : sheets.length === 0 ? (
        <div className="text-xs text-slate-500 py-8 text-center">No history sheets opened.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sheets.map((s: any) => (
            <div key={s._id} className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-100 font-mono">{s.sheetNo}</span>
                <div className="flex gap-1.5">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-amber-500/15 text-amber-300 border-amber-500/40">Cat {s.category}</span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${s.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "bg-slate-800 text-slate-400 border-slate-700"}`}>{s.status}</span>
                </div>
              </div>
              <div className="text-sm font-bold text-slate-100 mt-1">{s.subjectName}</div>
              <div className="text-[11px] text-slate-400">{s.address} · {s.policeStation} / {s.district}</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">MO: {(s.moCodes || []).join(", ")}</div>
              <div className="text-[11px] text-slate-400 mt-1">VCN {s.village}{s.beatNo ? ` · Beat ${s.beatNo}` : ""} · next check {s.nextCheck || "—"}</div>
              <div className="flex gap-2 mt-3">
                {s.status === "ACTIVE" && canClose && !readOnly && (
                  <button onClick={() => close(s)} disabled={busy === s._id} className="btn-secondary !py-1.5">
                    {busy === s._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Close (SP)
                  </button>
                )}
                <button onClick={() => generateHistorySheetPdf(caseMeta, s)} className="btn-secondary !py-1.5">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistorySheetTab;
