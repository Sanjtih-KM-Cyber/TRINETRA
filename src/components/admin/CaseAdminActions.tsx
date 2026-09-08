import React, { useState } from "react";
import { adminApi, caseApi } from "../../services/api";
import { CheckCircle2, AlertTriangle, FolderPlus, UserPlus } from "lucide-react";

/** Staffing requisition decisions — rendered inside the Access Clearance Queue
 * (Admin "Approve/Reject Personnel"). */
export const StaffingRequisitions: React.FC<{
  requisitions: any[];
  onDecided: () => void;
  onNotice: (ok: boolean, text: string) => void;
}> = ({ requisitions, onDecided, onNotice }) => {
  const decide = async (id: string, approve: boolean) => {
    try {
      await adminApi.decideRequisition(id, approve);
      onNotice(true, approve ? "Requisition approved." : "Requisition rejected.");
      onDecided();
    } catch (err: any) {
      onNotice(false, err.message || "Decision failed.");
    }
  };

  return (
    <div className="pt-6 border-t border-slate-800 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-100">Staffing Requisitions ({requisitions.length})</h3>
        <p className="text-xs text-slate-400">
          Formal personnel allocation requests from Lead Investigators within your tenure.
        </p>
      </div>
      <div className="space-y-3">
        {requisitions.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
            No personnel requisitions lodged in your tenure.
          </div>
        ) : (
          requisitions.map((r) => (
            <div key={r._id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold">
                    {r.case_code}
                  </span>
                  <span className="font-mono text-xs text-slate-200 font-bold">
                    {r.count}× {r.functional}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${r.status === "PENDING" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : r.status === "APPROVED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-rose-500/20 text-rose-300 border-rose-500/40"}`}>
                    {r.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Requested by <strong className="text-slate-200">{r.requested_by}</strong> ({r.requested_by_role})
                </div>
                <p className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">{r.justification}</p>
                <div className="text-[11px] font-mono text-slate-500">
                  {new Date(r.requested_at).toLocaleString()}
                  {r.reviewed_by && ` • ${r.reviewed_by}`}
                </div>
              </div>
              {r.status === "PENDING" && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => decide(r._id, true)}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide(r._id, false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 text-xs font-semibold border border-slate-700"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

/** Admin inline case registration (Case Title, Docket/FIR no., Synopsis, Statutory Sections). */
export const RegisterCaseInline: React.FC<{ onRegistered: () => void }> = ({ onRegistered }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [docket, setDocket] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [sections, setSections] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const description = [synopsis.trim(), sections.trim() ? `Statutory Sections: ${sections.trim()}` : ""].filter(Boolean).join("\n");
      await caseApi.createCase({ name: title.trim(), codeName: docket.trim(), description });
      setMsg({ ok: true, text: `Case ${docket.trim()} registered — assign its Lead below.` });
      setTitle("");
      setDocket("");
      setSynopsis("");
      setSections("");
      onRegistered();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Registration failed." });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all w-fit"
      >
        <FolderPlus className="w-4 h-4" /> Register New Case
      </button>
    );
  }

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100">Register New Case Container</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
      </div>
      {msg && (
        <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Case Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Operation Garuda Follow-on" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Formal Docket / FIR Number *</span>
          <input value={docket} onChange={(e) => setDocket(e.target.value)} required placeholder="e.g. OP-GARUDA-2027" className={`${inputCls} font-mono`} />
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-300">Incident Synopsis</span>
        <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={2} placeholder="Incident title, facts, jurisdiction…" className={inputCls} />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-300">Relevant Statutory Sections (BNS, BNSS, UAPA…)</span>
        <input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="e.g. Sec 21 NDPS; Sec 17 UAPA; Sec 302 BNS" className={`${inputCls} font-mono`} />
      </label>
      <button type="submit" disabled={busy || !title.trim() || !docket.trim()} className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40">
        {busy ? "Registering…" : "Register Case"}
      </button>
    </form>
  );
};

/** Inline Lead provisioning for Yet-to-be-Assigned (incl. transferred) cases. */
export const AssignLeadInline: React.FC<{
  caseId: string;
  hasLead: boolean;
  leads: any[];
  agency?: string;
  onAssigned: () => void;
}> = ({ caseId, hasLead, leads, agency, onAssigned }) => {
  const [leadId, setLeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const assign = async () => {
    if (!leadId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminApi.assignCaseMember(caseId, leadId);
      setLeadId("");
      setMsg({ ok: true, text: "Lead Investigator provisioned." });
      onAssigned();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Assignment failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-3 border-t border-slate-800/80 space-y-2">
      {!hasLead && (
        <div className="flex gap-2">
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Select Lead Investigator…</option>
            {leads.map((l: any) => (
              <option key={l._id} value={l._id}>
                {l.name} ({l.role} · {l.official_id})
              </option>
            ))}
          </select>
          <button
            onClick={assign}
            disabled={!leadId || busy}
            className="px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs flex items-center gap-1 shrink-0 disabled:opacity-40"
          >
            <UserPlus className="w-3.5 h-3.5" /> Assign Lead
          </button>
        </div>
      )}
      {msg && (
        <div className={`text-[11px] flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          <span>{msg.text}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Agency: <strong className="text-slate-300">{agency || "—"}</strong></span>
        {hasLead && <span className="font-mono text-[10px] text-emerald-300">Lead provisioned ✓</span>}
      </div>
    </div>
  );
};

export default RegisterCaseInline;
