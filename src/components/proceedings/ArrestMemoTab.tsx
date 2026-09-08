import React, { useState } from "react";
import { proceedingsApi } from "../../services/api";
import { validateAadhaar, maskAadhaar } from "../../services/aadhaar";
import { generateArrestMemoPdf, type CaseMeta } from "../../services/legalPdf";
import { DictationField } from "./DictationField";
import { Gavel, Plus, Trash2, Download, Loader2, AlertCircle, Fingerprint } from "lucide-react";

interface ArrestMemoTabProps {
  caseId: string;
  caseMeta: CaseMeta;
  onChanged: () => void;
  readOnly?: boolean;
}

const STATUTES = ["CRPC_41", "CRPC_41A", "CRPC_102", "BNSS_35", "BNSS_35_3", "BNSS_185"];
const EMPTY_ARTICLE = { description: "", quantity: "1", value: "", identificationMark: "", sealed: false, sealNo: "" };
const EMPTY_WITNESS = { name: "", address: "", relation: "", signed: false };

export const ArrestMemoTab: React.FC<ArrestMemoTabProps> = ({ caseId, caseMeta, onChanged, readOnly = false }) => {
  const [memos, setMemos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [aadhaarMsg, setAadhaarMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    memoType: "ARREST",
    statute: "CRPC_41",
    date: new Date().toISOString().slice(0, 10),
    time: "",
    place: "",
    firNumber: "",
    sections: "",
    accusedName: "",
    accusedAge: "",
    accusedGender: "",
    accusedAddress: "",
    accusedIdType: "",
    accusedIdNumber: "",
    groundsOfArrest: "",
    rightsRead: true,
    intimationName: "",
    intimationRelation: "",
    intimationPhone: "",
    aadhaarNumber: "",
    esignName: "",
  });
  const [articles, setArticles] = useState<any[]>([{ ...EMPTY_ARTICLE }]);
  const [witnesses, setWitnesses] = useState<any[]>([{ ...EMPTY_WITNESS }, { ...EMPTY_WITNESS }]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await proceedingsApi.getMemos(caseId);
      setMemos(res.memos || []);
    } catch (err: any) {
      setError(err.message || "Failed to load memos.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const checkAadhaar = (v: string) => {
    if (!v) {
      setAadhaarMsg(null);
      return;
    }
    const r = validateAadhaar(v);
    setAadhaarMsg(`${r.ok ? "✓" : "✗"} ${r.reason}${r.ok ? ` → ${maskAadhaar(v)}` : ""}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const payload: any = {
        memoType: form.memoType,
        statute: form.statute,
        date: form.date,
        time: form.time || undefined,
        place: form.place,
        firNumber: form.firNumber,
        sections: form.sections.split(",").map((s) => s.trim()).filter(Boolean),
        rightsRead: form.rightsRead,
        intimationName: form.intimationName || undefined,
        intimationRelation: form.intimationRelation || undefined,
        intimationPhone: form.intimationPhone || undefined,
        aadhaarNumber: form.aadhaarNumber || undefined,
        esignName: form.esignName || undefined,
      };
      if (form.memoType !== "SEIZURE") {
        payload.accused = {
          name: form.accusedName,
          age: form.accusedAge ? Number(form.accusedAge) : undefined,
          gender: form.accusedGender || undefined,
          address: form.accusedAddress,
          idType: form.accusedIdType || undefined,
          idNumber: form.accusedIdNumber || undefined,
        };
        payload.groundsOfArrest = form.groundsOfArrest;
      }
      if (form.memoType !== "ARREST") {
        payload.articles = articles
          .filter((a) => a.description.trim())
          .map((a) => ({ ...a, value: a.value ? Number(a.value) : undefined }));
      }
      payload.witnesses = witnesses.filter((w) => w.name.trim() && w.address.trim());
      await proceedingsApi.createMemo(caseId, payload);
      setShowForm(false);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to draw memo.");
    } finally {
      setBusy(null);
    }
  };

  const advance = async (memo: any, status: string) => {
    setBusy(memo._id + status);
    setError(null);
    try {
      await proceedingsApi.updateMemo(caseId, memo._id, { status });
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Status change failed.");
    } finally {
      setBusy(null);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Gavel className="w-4 h-4 text-amber-400" /> Arrest / Seizure Memos
          <span className="text-slate-500 font-mono text-xs">({memos.length})</span>
        </h3>
        {!readOnly && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-4 h-4" /> {showForm ? "Close Builder" : "Draw Memo"}
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
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Memo type *</label>
              <select value={form.memoType} onChange={(e) => setForm({ ...form, memoType: e.target.value })} className={inputCls}>
                <option value="ARREST">Arrest</option>
                <option value="SEIZURE">Seizure</option>
                <option value="ARREST_CUM_SEIZURE">Arrest-cum-Seizure</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Statute *</label>
              <select value={form.statute} onChange={(e) => setForm({ ...form, statute: e.target.value })} className={inputCls}>
                {STATUTES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Date *</label>
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Time</label>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Place *</label>
              <input required value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="PS / spot of arrest/seizure" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">FIR No. *</label>
              <input required value={form.firNumber} onChange={(e) => setForm({ ...form, firNumber: e.target.value })} placeholder="FIR No. 209/2026" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Sections (comma separated)</label>
              <input value={form.sections} onChange={(e) => setForm({ ...form, sections: e.target.value })} placeholder="NDPS Sec 21, BNS Sec 111" className={inputCls} />
            </div>
          </div>

          {form.memoType !== "SEIZURE" && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
              <div className="text-xs font-bold text-slate-200">Person Arrested</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <input required value={form.accusedName} onChange={(e) => setForm({ ...form, accusedName: e.target.value })} placeholder="Full name *" className={inputCls} />
                <input value={form.accusedAge} onChange={(e) => setForm({ ...form, accusedAge: e.target.value })} placeholder="Age" inputMode="numeric" className={inputCls} />
                <input value={form.accusedGender} onChange={(e) => setForm({ ...form, accusedGender: e.target.value })} placeholder="Gender" className={inputCls} />
                <input value={form.accusedIdType} onChange={(e) => setForm({ ...form, accusedIdType: e.target.value })} placeholder="ID type (Aadhaar/PAN)" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input required value={form.accusedAddress} onChange={(e) => setForm({ ...form, accusedAddress: e.target.value })} placeholder="Residential address *" className={inputCls} />
                <input value={form.accusedIdNumber} onChange={(e) => setForm({ ...form, accusedIdNumber: e.target.value })} placeholder="ID number" className={`${inputCls} font-mono`} />
              </div>
              <DictationField label="Grounds of arrest (read over to accused)" value={form.groundsOfArrest}
                onChange={(v) => setForm({ ...form, groundsOfArrest: v })} required rows={3}
                placeholder="Specific grounds u/s 41 — what, where, why arrest is necessary…" />
            </div>
          )}

          {form.memoType !== "ARREST" && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-200">Articles Seized</div>
                <button type="button" onClick={() => setArticles([...articles, { ...EMPTY_ARTICLE }])} className="btn-secondary !py-1"><Plus className="w-3.5 h-3.5" /> Article</button>
              </div>
              {articles.map((a, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center">
                  <input value={a.description} onChange={(e) => { const c = [...articles]; c[i].description = e.target.value; setArticles(c); }} placeholder="Description *" className={`${inputCls} col-span-2`} />
                  <input value={a.quantity} onChange={(e) => { const c = [...articles]; c[i].quantity = e.target.value; setArticles(c); }} placeholder="Qty" className={inputCls} />
                  <input value={a.value} onChange={(e) => { const c = [...articles]; c[i].value = e.target.value; }} placeholder="Value ₹" inputMode="numeric" className={inputCls} />
                  <input value={a.identificationMark} onChange={(e) => { const c = [...articles]; c[i].identificationMark = e.target.value; setArticles(c); }} placeholder="ID mark" className={inputCls} />
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-[11px] text-slate-300">
                      <input type="checkbox" checked={a.sealed} onChange={(e) => { const c = [...articles]; c[i].sealed = e.target.checked; setArticles(c); }} className="accent-amber-500" /> Sealed
                    </label>
                    {articles.length > 1 && (
                      <button type="button" onClick={() => setArticles(articles.filter((_, j) => j !== i))} className="btn-ghost"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-200">Independent Witnesses {form.memoType === "ARREST" ? "(min 1)" : "(min 2, Sec 100(4))"}</div>
              <button type="button" onClick={() => setWitnesses([...witnesses, { ...EMPTY_WITNESS }])} className="btn-secondary !py-1"><Plus className="w-3.5 h-3.5" /> Witness</button>
            </div>
            {witnesses.map((w, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                <input value={w.name} onChange={(e) => { const c = [...witnesses]; c[i].name = e.target.value; setWitnesses(c); }} placeholder={`Witness ${i + 1} name`} className={inputCls} />
                <input value={w.address} onChange={(e) => { const c = [...witnesses]; c[i].address = e.target.value; setWitnesses(c); }} placeholder="Address" className={`${inputCls} sm:col-span-2`} />
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1 text-[11px] text-slate-300">
                    <input type="checkbox" checked={w.signed} onChange={(e) => { const c = [...witnesses]; c[i].signed = e.target.checked; setWitnesses(c); }} className="accent-emerald-500" /> Signed
                  </label>
                  {witnesses.length > 1 && (
                    <button type="button" onClick={() => setWitnesses(witnesses.filter((_, j) => j !== i))} className="btn-ghost"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
              <input type="checkbox" checked={form.rightsRead} onChange={(e) => setForm({ ...form, rightsRead: e.target.checked })} className="accent-emerald-500" />
              Rights & grounds read over (41C/50A)
            </label>
            <input value={form.intimationName} onChange={(e) => setForm({ ...form, intimationName: e.target.value })} placeholder="Intimation: person informed" className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.intimationRelation} onChange={(e) => setForm({ ...form, intimationRelation: e.target.value })} placeholder="Relation" className={inputCls} />
              <input value={form.intimationPhone} onChange={(e) => setForm({ ...form, intimationPhone: e.target.value })} placeholder="Phone" className={`${inputCls} font-mono`} />
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-2.5">
            <div className="text-xs font-bold text-indigo-200 flex items-center gap-1.5"><Fingerprint className="w-4 h-4" /> Aadhaar e-Sign (optional, Verhoeff-validated)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input value={form.aadhaarNumber} onChange={(e) => { setForm({ ...form, aadhaarNumber: e.target.value.replace(/\D/g, "").slice(0, 12) }); checkAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12)); }}
                placeholder="12-digit Aadhaar" inputMode="numeric" className={`${inputCls} font-mono tracking-widest`} />
              <input value={form.esignName} onChange={(e) => setForm({ ...form, esignName: e.target.value })} placeholder="Signer name (defaults to IO)" className={inputCls} />
            </div>
            {aadhaarMsg && <div className={`text-[11px] font-mono ${aadhaarMsg.startsWith("✓") ? "text-emerald-300" : "text-rose-300"}`}>{aadhaarMsg}</div>}
          </div>

          <button type="submit" disabled={busy === "create"} className="btn-primary w-full">
            {busy === "create" ? <><Loader2 className="w-4 h-4 animate-spin" /> Drawing…</> : <><Gavel className="w-4 h-4" /> Draw Memo (server-validated)</>}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading memos…</div>
      ) : memos.length === 0 ? (
        <div className="text-xs text-slate-500 py-8 text-center">No memos drawn yet.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {memos.map((m: any) => (
            <div key={m._id} className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-100 font-mono">{m.memoNo}</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-700">{m.status}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">{m.memoType.replace(/_/g, " ")} · {m.statute.replace(/_/g, " ")} · {m.date} · {m.place}</div>
              <div className="text-[11px] font-mono text-slate-400">FIR {m.firNumber} · {(m.sections || []).join(", ")}</div>
              {m.accused && <div className="text-xs text-slate-200 mt-1.5">Accused: <b>{m.accused.name}</b> — {m.accused.address}</div>}
              <div className="text-[11px] text-slate-400 mt-1">Articles: {m.articles?.length || 0} · Witnesses: {(m.witnesses || []).map((w: any) => w.name).join(", ") || "—"}</div>
              {m.esign && <div className="text-[11px] font-mono text-indigo-300 mt-1">e-signed: {m.esign.signerName} · {m.esign.aadhaarMasked}</div>}
              <div className="flex gap-2 mt-3 flex-wrap">
                {m.status === "DRAFT" && !readOnly && (
                  <button onClick={() => advance(m, "SIGNED")} disabled={busy === m._id + "SIGNED"} className="btn-secondary !py-1.5">
                    {busy === m._id + "SIGNED" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} IO Sign
                  </button>
                )}
                {m.status === "SIGNED" && !readOnly && (
                  <button onClick={() => advance(m, "FILED")} disabled={busy === m._id + "FILED"} className="btn-secondary !py-1.5">
                    {busy === m._id + "FILED" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} File with Case
                  </button>
                )}
                <button onClick={() => generateArrestMemoPdf(caseMeta, m)} className="btn-secondary !py-1.5">
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

export default ArrestMemoTab;
