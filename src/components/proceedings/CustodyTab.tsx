import React, { useState } from "react";
import { proceedingsApi } from "../../services/api";
import { Timer, Plus, Loader2, AlertCircle, AlertTriangle, Scale, Gavel } from "lucide-react";

interface CustodyTabProps {
  caseId: string;
  onChanged: () => void;
  readOnly?: boolean;
}

const BAIL_LABELS: Record<string, string> = {
  REGULAR_437: "Regular — Sec 437 CrPC",
  ANTICIPATORY_438: "Anticipatory — Sec 438 CrPC",
  SESSIONS_439: "Sessions/HC — Sec 439 CrPC",
  DEFAULT_167_2: "Default — Sec 167(2) CrPC",
};

export const CustodyTab: React.FC<CustodyTabProps> = ({ caseId, onChanged, readOnly = false }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [reg, setReg] = useState({ accusedName: "", firNumber: "", sections: "", arrestDate: new Date().toISOString().slice(0, 10), arrestMemoId: "", offencePunishmentYears: "7" });
  const [remand, setRemand] = useState({ orderDate: new Date().toISOString().slice(0, 10), court: "", daysGranted: "5", custodyType: "PC", producedViaVC: false, orderRef: "" });
  const [bail, setBail] = useState({ bailType: "REGULAR_437", filedDate: new Date().toISOString().slice(0, 10), court: "" });
  const [decision, setDecision] = useState({ applicationId: "", status: "GRANTED", decidedDate: new Date().toISOString().slice(0, 10), conditions: "", suretyAmount: "" });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, a] = await Promise.all([proceedingsApi.getCustody(caseId), proceedingsApi.getCustodyAlerts(caseId)]);
      setRecords(r.records || []);
      setAlerts(a.alerts || []);
    } catch (err: any) {
      setError(err.message || "Failed to load custody tracker.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Operation failed.");
    } finally {
      setBusy(null);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";

  const sevColor = (s: string) =>
    s === "CRITICAL" ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
    : s === "HIGH" ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
    : s === "MEDIUM" ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-200"
    : "bg-slate-800/50 border-slate-700 text-slate-300";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-400" /> Arrest / Bail / Remand Tracker
          <span className="text-slate-500 font-mono text-xs">({records.length})</span>
        </h3>
        {!readOnly && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-4 h-4" /> {showForm ? "Close" : "Register Arrest"}
          </button>
        )}
      </div>
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Auto-Alerts ({alerts.length})
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {alerts.map((a: any, i: number) => (
              <div key={i} className={`text-[11px] rounded-lg border px-2.5 py-2 ${sevColor(a.severity)}`}>
                <b className="font-mono">[{a.severity}]</b> {a.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); run("reg", async () => {
          await proceedingsApi.registerCustody(caseId, {
            ...reg,
            sections: reg.sections.split(",").map((s) => s.trim()).filter(Boolean),
            arrestMemoId: reg.arrestMemoId || undefined,
            offencePunishmentYears: Number(reg.offencePunishmentYears),
          });
          setShowForm(false);
        }); }} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <input required value={reg.accusedName} onChange={(e) => setReg({ ...reg, accusedName: e.target.value })} placeholder="Accused name *" className={inputCls} />
          <input required value={reg.firNumber} onChange={(e) => setReg({ ...reg, firNumber: e.target.value })} placeholder="FIR No. *" className={`${inputCls} font-mono`} />
          <input required type="date" value={reg.arrestDate} onChange={(e) => setReg({ ...reg, arrestDate: e.target.value })} className={inputCls} />
          <input required value={reg.offencePunishmentYears} onChange={(e) => setReg({ ...reg, offencePunishmentYears: e.target.value })} placeholder="Max punishment (years)" inputMode="decimal" title="Gravest section's max punishment — decides 60 vs 90-day limit" className={inputCls} />
          <input value={reg.sections} onChange={(e) => setReg({ ...reg, sections: e.target.value })} placeholder="Sections (comma separated)" className={`${inputCls} col-span-2`} />
          <input value={reg.arrestMemoId} onChange={(e) => setReg({ ...reg, arrestMemoId: e.target.value })} placeholder="Arrest memo _id (optional link)" className={`${inputCls} font-mono col-span-2`} />
          <button type="submit" disabled={busy === "reg"} className="btn-primary col-span-2 sm:col-span-4">
            {busy === "reg" ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening custody clock…</> : "Open Custody Clock"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">Loading custody records…</div>
      ) : records.length === 0 ? (
        <div className="text-xs text-slate-500 py-8 text-center">No custody records. Register an arrest to start the 15/60/90-day clocks.</div>
      ) : (
        <div className="space-y-3">
          {records.map((r: any) => {
            const c = r.computed || {};
            const open = expanded === r._id;
            return (
              <div key={r._id} className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-sm font-bold text-slate-100">{r.accusedName}</span>
                    <span className="text-[11px] font-mono text-slate-400 ml-2">FIR {r.firNumber} · arrested {r.arrestDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-700">{r.status.replace(/_/g, " ")}</span>
                    {!readOnly && (
                      <button onClick={() => setExpanded(open ? null : r._id)} className="btn-secondary !py-1.5">{open ? "Collapse" : "Remand / Bail"}</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 text-center">
                    <div className="text-lg font-bold font-mono text-cyan-300">{c.pcUsed ?? 0}/15</div>
                    <div className="text-[9px] font-mono text-slate-500">PC DAYS USED</div>
                  </div>
                  <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 text-center">
                    <div className={`text-lg font-bold font-mono ${c.daysToDue !== undefined && c.daysToDue <= 7 ? "text-rose-300" : "text-emerald-300"}`}>
                      {c.daysToDue ?? "—"}d
                    </div>
                    <div className="text-[9px] font-mono text-slate-500">{c.limitDays || 60}-DAY CS LIMIT</div>
                  </div>
                  <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 text-center">
                    <div className="text-[11px] font-bold font-mono text-slate-200">{c.dueDate ? c.dueDate.slice(0, 10) : "—"}</div>
                    <div className="text-[9px] font-mono text-slate-500">CS DUE DATE</div>
                  </div>
                  <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 text-center">
                    <div className="text-[11px] font-bold font-mono text-slate-200">
                      {c.lastRemandExpiry ? `${c.lastRemandExpiry.slice(0, 10)} (${c.daysToRemandExpiry}d)` : "—"}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500">REMAND EXPIRY</div>
                  </div>
                </div>

                {(r.bailApplications || []).length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {(r.bailApplications || []).map((b: any) => (
                      <div key={b.id} className="text-[11px] font-mono text-slate-400 flex items-center gap-2 flex-wrap">
                        <Scale className="w-3.5 h-3.5 text-indigo-300" />
                        {BAIL_LABELS[b.bailType] || b.bailType} · filed {b.filedDate} · {b.court} ·
                        <b className={b.status === "GRANTED" ? "text-emerald-300" : b.status === "PENDING" ? "text-amber-300" : "text-rose-300"}>{b.status}</b>
                        {b.suretyAmount ? <span>· ₹{b.suretyAmount}</span> : null}
                      </div>
                    ))}
                  </div>
                )}

                {open && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-800">
                    <form onSubmit={(e) => { e.preventDefault(); run(r._id + "rem", () => proceedingsApi.addRemand(caseId, r._id, { ...remand, daysGranted: Number(remand.daysGranted) }).then(() => undefined)); }}
                      className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-2">
                      <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5"><Gavel className="w-3.5 h-3.5 text-cyan-300" /> Record Remand Order</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input required type="date" value={remand.orderDate} onChange={(e) => setRemand({ ...remand, orderDate: e.target.value })} className={inputCls} />
                        <select value={remand.custodyType} onChange={(e) => setRemand({ ...remand, custodyType: e.target.value })} className={inputCls}>
                          <option value="PC">Police Custody</option>
                          <option value="JC">Judicial Custody</option>
                        </select>
                      </div>
                      <input required value={remand.court} onChange={(e) => setRemand({ ...remand, court: e.target.value })} placeholder="Court *" className={inputCls} />
                      <div className="grid grid-cols-2 gap-2">
                        <input required value={remand.daysGranted} onChange={(e) => setRemand({ ...remand, daysGranted: e.target.value })} placeholder="Days (1–15)" inputMode="numeric" className={inputCls} />
                        <input value={remand.orderRef} onChange={(e) => setRemand({ ...remand, orderRef: e.target.value })} placeholder="Order ref" className={`${inputCls} font-mono`} />
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-slate-300">
                        <input type="checkbox" checked={remand.producedViaVC} onChange={(e) => setRemand({ ...remand, producedViaVC: e.target.checked })} className="accent-cyan-500" /> Produced via video-conference
                      </label>
                      <button type="submit" disabled={busy === r._id + "rem"} className="btn-secondary w-full justify-center">
                        {busy === r._id + "rem" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Extend Remand (PC ceiling enforced)
                      </button>
                    </form>

                    <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-2">
                      <div className="text-xs font-bold text-slate-200">Bail — File & Decide (437 / 438 / 439 / 167(2))</div>
                      <form onSubmit={(e) => { e.preventDefault(); run(r._id + "bail", () => proceedingsApi.fileBail(caseId, r._id, bail).then(() => undefined)); }} className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select value={bail.bailType} onChange={(e) => setBail({ ...bail, bailType: e.target.value })} className={inputCls}>
                            {Object.entries(BAIL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          <input required type="date" value={bail.filedDate} onChange={(e) => setBail({ ...bail, filedDate: e.target.value })} className={inputCls} />
                        </div>
                        <input required value={bail.court} onChange={(e) => setBail({ ...bail, court: e.target.value })} placeholder="Court *" className={inputCls} />
                        <button type="submit" disabled={busy === r._id + "bail"} className="btn-secondary w-full justify-center">
                          {busy === r._id + "bail" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} File Bail Application
                        </button>
                      </form>
                      {(r.bailApplications || []).some((b: any) => b.status === "PENDING") && (
                        <form onSubmit={(e) => { e.preventDefault(); run(r._id + "dec", () => proceedingsApi.fileBail(caseId, r._id, {
                          applicationId: decision.applicationId || (r.bailApplications || []).find((b: any) => b.status === "PENDING")?.id,
                          status: decision.status, decidedDate: decision.decidedDate, conditions: decision.conditions || undefined,
                          suretyAmount: decision.suretyAmount ? Number(decision.suretyAmount) : undefined,
                        }).then(() => undefined)); }} className="space-y-2 pt-2 border-t border-slate-800">
                          <select value={decision.applicationId} onChange={(e) => setDecision({ ...decision, applicationId: e.target.value })} className={inputCls}>
                            <option value="">Pending: latest</option>
                            {(r.bailApplications || []).filter((b: any) => b.status === "PENDING").map((b: any) => (
                              <option key={b.id} value={b.id}>{b.bailType} · {b.court}</option>
                            ))}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <select value={decision.status} onChange={(e) => setDecision({ ...decision, status: e.target.value })} className={inputCls}>
                              <option value="GRANTED">Granted</option>
                              <option value="REJECTED">Rejected</option>
                              <option value="WITHDRAWN">Withdrawn</option>
                            </select>
                            <input type="date" value={decision.decidedDate} onChange={(e) => setDecision({ ...decision, decidedDate: e.target.value })} className={inputCls} />
                          </div>
                          <input value={decision.conditions} onChange={(e) => setDecision({ ...decision, conditions: e.target.value })} placeholder="Conditions (if granted)" className={inputCls} />
                          <input value={decision.suretyAmount} onChange={(e) => setDecision({ ...decision, suretyAmount: e.target.value })} placeholder="Surety ₹" inputMode="numeric" className={inputCls} />
                          <button type="submit" disabled={busy === r._id + "dec"} className="btn-secondary w-full justify-center">
                            {busy === r._id + "dec" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Record Court Decision
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustodyTab;
