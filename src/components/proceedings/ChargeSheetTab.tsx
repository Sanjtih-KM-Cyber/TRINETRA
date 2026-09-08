import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { proceedingsApi } from "../../services/api";
import { generateChargeSheetPdf, generateChargeSheetFilingXml, downloadTextFile, type CaseMeta } from "../../services/legalPdf";
import { DictationField } from "./DictationField";
import { SP_ELIGIBLE_CLIENT_ROLES } from "./roleGates";
import { FileText, Plus, Trash2, Download, Loader2, AlertCircle, Sparkles, Paperclip } from "lucide-react";

interface ChargeSheetTabProps {
  caseId: string;
  caseMeta: CaseMeta;
  onChanged: () => void;
  readOnly?: boolean;
}

export const ChargeSheetTab: React.FC<ChargeSheetTabProps> = ({ caseId, caseMeta, onChanged, readOnly = false }) => {
  const { user } = useAuth();
  const [sheets, setSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [meta, setMeta] = useState({ firNumber: "", policeStation: "", district: "", state: "", sections: "" });
  const [facts, setFacts] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [legalOpinion, setLegalOpinion] = useState("");
  const [accused, setAccused] = useState<any[]>([{ name: "", address: "", custodyStatus: "JUDICIAL_CUSTODY", chargeFramed: "" }]);
  const [witnesses, setWitnesses] = useState<any[]>([{ name: "", type: "PROSECUTION", address: "", statement: "" }]);
  const [annex, setAnnex] = useState({ title: "", docType: "", pages: "", exhibitRef: "" });
  const [filing, setFiling] = useState({ filedInCourt: "", filingDate: new Date().toISOString().slice(0, 10), cnrNumber: "" });
  const [llmAssist, setLlmAssist] = useState(true);

  const canSP = !!user && SP_ELIGIBLE_CLIENT_ROLES.includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      const res = await proceedingsApi.getChargeSheets(caseId);
      setSheets(res.chargeSheets || []);
    } catch (err: any) {
      setError(err.message || "Failed to load charge sheets.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      await load();
      onChanged();
      return res;
    } catch (err: any) {
      setError(err.message || "Operation failed.");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (cs: any) => {
    setEditing(cs);
    setMeta({ firNumber: cs.firNumber || "", policeStation: cs.policeStation || "", district: cs.district || "", state: cs.state || "", sections: (cs.sections || []).join(", ") });
    setFacts(cs.factsOfCase || "");
    setEvidenceSummary(cs.evidenceSummary || "");
    setLegalOpinion(cs.legalOpinion || "");
    setAccused(cs.accused?.length ? cs.accused : [{ name: "", address: "", custodyStatus: "JUDICIAL_CUSTODY", chargeFramed: "" }]);
    setWitnesses(cs.witnesses?.length ? cs.witnesses : [{ name: "", type: "PROSECUTION", address: "", statement: "" }]);
  };

  const saveEdits = () =>
    run(editing._id + "save", () =>
      proceedingsApi.updateChargeSheet(caseId, editing._id, {
        ...meta,
        sections: meta.sections.split(",").map((s) => s.trim()).filter(Boolean),
        factsOfCase: facts,
        evidenceSummary,
        legalOpinion,
        accused: accused.filter((a) => a.name.trim()),
        witnesses: witnesses.filter((w) => w.name.trim()),
      }).then((r) => {
        setEditing(r.chargeSheet);
        return r;
      })
    );

  const draftAssist = () =>
    run("draft", () =>
      proceedingsApi.draftChargeSheet(caseId, {
        firNumber: meta.firNumber || undefined,
        policeStation: meta.policeStation || undefined,
        district: meta.district || undefined,
        state: meta.state || undefined,
        sections: meta.sections.split(",").map((s) => s.trim()).filter(Boolean),
        ...(llmAssist ? { assist: "llm" } : {}),
      }).then((r) => {
        startEdit(r.chargeSheet);
        return r;
      })
    );

  const createManual = () =>
    run("new", () =>
      proceedingsApi.createChargeSheet(caseId, {
        ...meta,
        sections: meta.sections.split(",").map((s) => s.trim()).filter(Boolean),
        factsOfCase: facts,
        evidenceSummary,
        legalOpinion,
        accused: accused.filter((a) => a.name.trim()),
        witnesses: witnesses.filter((w) => w.name.trim()),
      }).then((r) => {
        setShowNew(false);
        startEdit(r.chargeSheet);
        return r;
      })
    );

  const setStatus = (cs: any, status: string, extra: any = {}) =>
    run(cs._id + status, () => proceedingsApi.updateChargeSheet(caseId, cs._id, { status, ...extra }).then((r) => {
      if (editing?._id === cs._id) setEditing(r.chargeSheet);
      return r;
    }));

  const addAnnexure = () =>
    run(editing._id + "anx", () =>
      proceedingsApi.addAnnexure(caseId, editing._id, {
        ...annex,
        pages: annex.pages ? Number(annex.pages) : undefined,
      }).then((r) => {
        setEditing(r.chargeSheet);
        setAnnex({ title: "", docType: "", pages: "", exhibitRef: "" });
        return r;
      })
    );

  const removeAnnexure = (annexId: string) =>
    run(editing._id + annexId, () =>
      proceedingsApi.removeAnnexure(caseId, editing._id, annexId).then((r) => {
        setEditing(r.chargeSheet);
        return r;
      })
    );

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";
  const statusColor = (s: string) =>
    s === "FILED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : s === "SP_APPROVED" ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
    : s === "IO_SIGNED" ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
    : "bg-slate-800 text-slate-400 border-slate-700";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" /> Charge Sheet Builder — Sec 173
          <span className="text-slate-500 font-mono text-xs">({sheets.length})</span>
        </h3>
        {!readOnly && (
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={draftAssist} disabled={busy === "draft"} className="btn-secondary !border-indigo-500/40 !text-indigo-300 disabled:opacity-50">
              {busy === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} SAHAYAK-Assisted Draft
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300" title="Polish narrative + draft legal opinion via live model when reachable; corpus opinion always included">
              <input type="checkbox" checked={llmAssist} onChange={(e) => setLlmAssist(e.target.checked)} className="accent-indigo-500" />
              LLM polish + legal opinion
            </label>
            <button onClick={() => { setShowNew(!showNew); setEditing(null); }} className="btn-primary">
              <Plus className="w-4 h-4" /> {showNew ? "Close" : "Manual Draft"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {(showNew || editing) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          {editing && (
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
              <span className="text-xs font-bold font-mono text-slate-100">
                {editing.csNo} · {editing.draftSource === "SAHAYAK_ASSIST" ? "SAHAYAK-assisted" : "Manual"}
                {editing.assistMeta && (
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${editing.assistMeta.llmUsed ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300" : "bg-slate-800 border-slate-700 text-slate-400"}`}>
                    {editing.assistMeta.llmUsed ? `LLM · ${editing.assistMeta.provider}` : `corpus · ${editing.assistMeta.provider}`}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${statusColor(editing.status)}`}>{editing.status}</span>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <input value={meta.firNumber} onChange={(e) => setMeta({ ...meta, firNumber: e.target.value })} placeholder="FIR No. *" className={`${inputCls} font-mono`} />
            <input value={meta.policeStation} onChange={(e) => setMeta({ ...meta, policeStation: e.target.value })} placeholder="Police station *" className={inputCls} />
            <input value={meta.district} onChange={(e) => setMeta({ ...meta, district: e.target.value })} placeholder="District" className={inputCls} />
            <input value={meta.state} onChange={(e) => setMeta({ ...meta, state: e.target.value })} placeholder="State" className={inputCls} />
            <input value={meta.sections} onChange={(e) => setMeta({ ...meta, sections: e.target.value })} placeholder="Sections (comma sep.)" className={inputCls} />
          </div>

          <DictationField label="Facts of the case (para-wise)" value={facts} onChange={setFacts} rows={6} required
            placeholder="Para 1: FIR… Para 2: investigation… Para 3: evidence… Para 4: conclusion…" />
          <DictationField label="Evidence summary" value={evidenceSummary} onChange={setEvidenceSummary} rows={4}
            placeholder="Exhibit-wise summary with hashes…" />
          <DictationField label="Legal opinion" value={legalOpinion} onChange={setLegalOpinion} rows={3}
            placeholder="PP opinion on sanction, sections, supplementary investigation…" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-200">Accused</div>
                <button type="button" onClick={() => setAccused([...accused, { name: "", address: "", custodyStatus: "JUDICIAL_CUSTODY", chargeFramed: "" }])} className="btn-secondary !py-1"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              {accused.map((a, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5">
                  <input value={a.name} onChange={(e) => { const x = [...accused]; x[i].name = e.target.value; setAccused(x); }} placeholder="Name" className={inputCls} />
                  <div className="flex gap-1">
                    <select value={a.custodyStatus} onChange={(e) => { const x = [...accused]; x[i].custodyStatus = e.target.value; setAccused(x); }} className={`${inputCls} flex-1`}>
                      {["POLICE_CUSTODY", "JUDICIAL_CUSTODY", "BAIL", "ABSCONDING", "NOT_ARRESTED"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                    </select>
                    {accused.length > 1 && <button type="button" onClick={() => setAccused(accused.filter((_, j) => j !== i))} className="btn-ghost"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <input value={a.address} onChange={(e) => { const x = [...accused]; x[i].address = e.target.value; setAccused(x); }} placeholder="Address" className={inputCls} />
                  <input value={a.chargeFramed} onChange={(e) => { const x = [...accused]; x[i].chargeFramed = e.target.value; setAccused(x); }} placeholder="Charge / role" className={inputCls} />
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-200">Witnesses</div>
                <button type="button" onClick={() => setWitnesses([...witnesses, { name: "", type: "PROSECUTION", address: "", statement: "" }])} className="btn-secondary !py-1"><Plus className="w-3.5 h-3.5" /></button>
              </div>
              {witnesses.map((w, i) => (
                <div key={i} className="grid grid-cols-2 gap-1.5">
                  <input value={w.name} onChange={(e) => { const x = [...witnesses]; x[i].name = e.target.value; setWitnesses(x); }} placeholder="Name" className={inputCls} />
                  <div className="flex gap-1">
                    <select value={w.type} onChange={(e) => { const x = [...witnesses]; x[i].type = e.target.value; setWitnesses(x); }} className={`${inputCls} flex-1`}>
                      <option value="PROSECUTION">Prosecution</option>
                      <option value="DEFENCE">Defence</option>
                      <option value="COURT">Court</option>
                    </select>
                    {witnesses.length > 1 && <button type="button" onClick={() => setWitnesses(witnesses.filter((_, j) => j !== i))} className="btn-ghost"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <input value={w.address} onChange={(e) => { const x = [...witnesses]; x[i].address = e.target.value; setWitnesses(x); }} placeholder="Address" className={inputCls} />
                  <input value={w.statement} onChange={(e) => { const x = [...witnesses]; x[i].statement = e.target.value; setWitnesses(x); }} placeholder="Gist of statement" className={inputCls} />
                </div>
              ))}
            </div>
          </div>

          {showNew && (
            <button onClick={createManual} disabled={busy === "new"} className="btn-primary w-full">
              {busy === "new" ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</> : "Open Manual Charge Sheet"}
            </button>
          )}

          {editing && (
            <>
              <button onClick={saveEdits} disabled={busy === editing._id + "save" || editing.status !== "DRAFT" || readOnly} className="btn-secondary w-full justify-center disabled:opacity-50">
                {busy === editing._id + "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save Draft {editing.status !== "DRAFT" ? "(frozen after signing)" : ""}
              </button>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5 text-amber-300" /> Annexure Manager (A–Z) — {(editing.annexures || []).length}/26</div>
                {(editing.annexures || []).length > 0 && (
                  <div className="space-y-1">
                    {(editing.annexures || []).map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
                        <span className="w-6 h-6 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center">{a.letter}</span>
                        <span className="flex-1 truncate">{a.title} <span className="text-slate-500">· {a.docType}{a.pages ? ` · ${a.pages}p` : ""}</span></span>
                        {editing.status !== "FILED" && !readOnly && (
                          <button onClick={() => removeAnnexure(a.id)} disabled={busy === editing._id + a.id} className="btn-ghost !p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {editing.status !== "FILED" && !readOnly && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    <input value={annex.title} onChange={(e) => setAnnex({ ...annex, title: e.target.value })} placeholder="Title *" className={`${inputCls} col-span-2`} />
                    <input value={annex.docType} onChange={(e) => setAnnex({ ...annex, docType: e.target.value })} placeholder="Type *" className={inputCls} />
                    <input value={annex.pages} onChange={(e) => setAnnex({ ...annex, pages: e.target.value })} placeholder="Pages" inputMode="numeric" className={inputCls} />
                    <button onClick={addAnnexure} disabled={busy === editing._id + "anx" || !annex.title || !annex.docType} className="btn-secondary justify-center disabled:opacity-50">
                      {busy === editing._id + "anx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Annex
                    </button>
                  </div>
                )}
              </div>

              {!readOnly && (
              <div className="flex gap-2 flex-wrap">
                {editing.status === "DRAFT" && (
                  <button onClick={() => setStatus(editing, "IO_SIGNED")} disabled={busy === editing._id + "IO_SIGNED"} className="btn-secondary">
                    {busy === editing._id + "IO_SIGNED" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} IO Sign
                  </button>
                )}
                {editing.status === "IO_SIGNED" && canSP && (
                  <button onClick={() => setStatus(editing, "SP_APPROVED")} disabled={busy === editing._id + "SP_APPROVED"} className="btn-secondary !border-indigo-500/40 !text-indigo-300">
                    {busy === editing._id + "SP_APPROVED" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} SP Approve
                  </button>
                )}
                {editing.status === "SP_APPROVED" && canSP && (
                  <div className="flex gap-1.5 flex-wrap items-center w-full">
                    <input value={filing.filedInCourt} onChange={(e) => setFiling({ ...filing, filedInCourt: e.target.value })} placeholder="Court *" className={`${inputCls} flex-1 min-w-[140px]`} />
                    <input type="date" value={filing.filingDate} onChange={(e) => setFiling({ ...filing, filingDate: e.target.value })} className={inputCls} />
                    <input value={filing.cnrNumber} onChange={(e) => setFiling({ ...filing, cnrNumber: e.target.value })} placeholder="CNR (optional)" className={`${inputCls} font-mono`} />
                    <button onClick={() => setStatus(editing, "FILED", filing)} disabled={busy === editing._id + "FILED" || !filing.filedInCourt || !filing.filingDate} className="btn-primary disabled:opacity-50">
                      {busy === editing._id + "FILED" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} File in Court
                    </button>
                  </div>
                )}
                <button onClick={() => generateChargeSheetPdf(caseMeta, editing)} className="btn-secondary">
                  <Download className="w-3.5 h-3.5" /> Sec 173 PDF
                </button>
              </div>
              )}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading charge sheets…</div>
      ) : sheets.length === 0 && !showNew ? (
        <div className="text-xs text-slate-500 py-8 text-center">No charge sheets yet. Generate a SAHAYAK-assisted draft from live case state, or open a manual draft.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sheets.map((cs: any) => (
            <div key={cs._id} className={`rounded-2xl bg-slate-900 border p-4 ${editing?._id === cs._id ? "border-amber-500/50" : "border-slate-800"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-100 font-mono">{cs.csNo}</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${statusColor(cs.status)}`}>{cs.status}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">FIR {cs.firNumber} · {cs.policeStation} · {(cs.sections || []).join(", ")}</div>
              <div className="text-[11px] text-slate-400">Accused: {(cs.accused || []).map((a: any) => a.name).join(", ") || "—"} · Annexures: {(cs.annexures || []).length} · {cs.draftSource === "SAHAYAK_ASSIST" ? "SAHAYAK-assisted" : "Manual"}</div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={() => startEdit(cs)} className="btn-secondary !py-1.5">Open / Edit</button>
                <button onClick={() => generateChargeSheetPdf(caseMeta, cs)} className="btn-secondary !py-1.5">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button
                  onClick={() => downloadTextFile(`eFiling_${cs.csNo}.xml`, generateChargeSheetFilingXml(caseMeta, cs))}
                  className="btn-secondary !py-1.5"
                  title="e-Courts CIS-compatible e-filing XML"
                >
                  <Download className="w-3.5 h-3.5" /> e-Filing XML
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChargeSheetTab;
