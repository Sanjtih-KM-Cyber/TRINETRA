import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { stagingApi } from "../../services/api";
import { DEPARTMENTS, DEPARTMENT_LIST } from "../../data/departments";
import { ArrowRightLeft, Plus, Loader2, AlertCircle, CheckCircle2, XCircle, Eye, PenLine, ChevronDown, Fingerprint } from "lucide-react";

interface TransferTabProps {
  caseId: string;
  caseLeadAgency: string;
  readOnly: boolean;
  canPropose: boolean;
  canDecide: boolean;
  signal: number;
  onChanged: () => void;
}

export const TransferTab: React.FC<TransferTabProps> = ({
  caseId, caseLeadAgency, readOnly, canPropose, canDecide, signal, onChanged,
}) => {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ toAgency: "National Investigation Agency (NIA)", toDepartment: "", reason: "" });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await stagingApi.getTransfers(caseId);
      setTransfers(res.transfers || []);
    } catch (err: any) {
      setError(err.message || "Failed to load transfers.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, signal]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("new");
    setError(null);
    try {
      const dept = DEPARTMENTS[DEPARTMENT_LIST.find((d) => d.fullName === form.toAgency)?.code || "STATE_POLICE"];
      await stagingApi.proposeTransfer(caseId, {
        toAgency: form.toAgency,
        toDepartment: form.toDepartment || dept.headquarters,
        reason: form.reason,
      });
      setShowForm(false);
      setForm({ toAgency: form.toAgency, toDepartment: "", reason: "" });
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Proposal failed.");
    } finally {
      setBusy(null);
    }
  };

  const decide = async (id: string, decision: "accept" | "reject") => {
    setBusy(id + decision);
    setError(null);
    try {
      await stagingApi.decideTransfer(caseId, id, decision);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Decision failed.");
    } finally {
      setBusy(null);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";
  const statusColor = (s: string) =>
    s === "ACCEPTED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : s === "REJECTED" ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
    : "bg-amber-500/15 text-amber-300 border-amber-500/40";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-amber-400" /> Inter-Department Transfer
        </h3>
        {canPropose && !readOnly && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-4 h-4" /> {showForm ? "Close" : "Propose Transfer"}
          </button>
        )}
      </div>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-3.5 text-[11px] text-slate-400 flex items-start gap-2">
        <Eye className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
        <span>
          Currently held by <b className="text-slate-200">{caseLeadAgency}</b>. On accept, the source team drops to
          <b className="text-cyan-300"> VIEW_ONLY </b> (read-only, mutations return 403) and the receiving officer gets
          <b className="text-emerald-300"> FULL_EDIT</b>. Every flip is SHA-256 audited. Admin oversight always retains FULL_EDIT.
        </span>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Receiving agency *</label>
              <select value={form.toAgency} onChange={(e) => setForm({ ...form, toAgency: e.target.value })} className={inputCls}>
                {DEPARTMENT_LIST.filter((d) => d.fullName !== caseLeadAgency).map((d) => (
                  <option key={d.code} value={d.fullName}>{d.shortName} — {d.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Receiving unit</label>
              <input value={form.toDepartment} onChange={(e) => setForm({ ...form, toDepartment: e.target.value })}
                placeholder="Unit / branch (defaults to agency HQ)" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Reason (min 10 chars) *</label>
            <textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3}
              placeholder="Jurisdiction, specialisation, or workload grounds for transfer…"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <button type="submit" disabled={busy === "new"} className="btn-primary w-full">
            {busy === "new" ? <><Loader2 className="w-4 h-4 animate-spin" /> Proposing…</> : <><PenLine className="w-4 h-4" /> Propose (hashed + audited)</>}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading transfer ledger…</div>
      ) : transfers.length === 0 ? (
        <div className="text-xs text-slate-500 py-8 text-center">No transfers proposed for this case.</div>
      ) : (
        <div className="space-y-2.5">
          {transfers.map((t: any) => (
            <div key={t._id} className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-300">{t.fromAgency}</span>
                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold text-slate-100">{t.toAgency}</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ml-auto ${statusColor(t.status)}`}>{t.status}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5">Reason: {t.reason}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">
                Proposed by {t.requestedBy} ({t.requestedByRank}) · {String(t.requestedAt).slice(0, 10)}
                {t.decidedBy && <span> · Decided by {t.decidedBy} ({String(t.decidedAt).slice(0, 10)})</span>}
              </div>
              <button onClick={() => setExpanded(expanded === t._id ? null : t._id)}
                className="mt-1.5 text-[10px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1">
                <Fingerprint className="w-3 h-3" /> Audit trail
                <ChevronDown className={`w-3 h-3 transition-transform ${expanded === t._id ? "rotate-180" : ""}`} />
              </button>
              {expanded === t._id && (
                <div className="mt-1.5 rounded-lg bg-slate-950 border border-slate-800 p-2.5 text-[10px] font-mono text-slate-400 space-y-1.5">
                  <div><span className="text-slate-500">Proposal SHA-256:</span> <span className="text-slate-300 break-all">{t.proposalHash || "—"}</span></div>
                  {t.executionHash && (
                    <div><span className="text-slate-500">Execution SHA-256:</span> <span className="text-emerald-300 break-all">{t.executionHash}</span></div>
                  )}
                  <div>
                    <span className="text-slate-500">Permission diff on accept:</span>
                    {(t.affectedMembers || []).length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {(t.affectedMembers || []).map((m: string, i: number) => (
                          <li key={i} className={m.includes("VIEW_ONLY") ? "text-cyan-300" : "text-emerald-300"}>• {m}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-500"> recorded at execution (pending transfers show diff after accept)</span>
                    )}
                  </div>
                  {t.decisionNote && <div><span className="text-slate-500">Decision note:</span> {t.decisionNote}</div>}
                </div>
              )}
              {t.status === "PENDING" && canDecide && !readOnly && user && (
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => decide(t._id, "accept")} disabled={busy === t._id + "accept"} className="btn-secondary !border-emerald-500/40 !text-emerald-300 !py-1.5">
                    {busy === t._id + "accept" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Accept & Execute
                  </button>
                  <button onClick={() => decide(t._id, "reject")} disabled={busy === t._id + "reject"} className="btn-secondary !py-1.5">
                    {busy === t._id + "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TransferTab;
