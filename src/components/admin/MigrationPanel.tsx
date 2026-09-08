import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { adminApi, migrationApi } from "../../services/api";
import { ArrowRightLeft, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Phase 6 Req27/28 — instant administrative handover + migration router.
 * - Handover (any Admin): re-keys the case to the incoming agency tenure instantly.
 * - Path A (CID_ADMIN): state escalation, pulls POLICE cases into CID workspace.
 * - Path B (CBI_ADMIN): federal override, locks out state personnel.
 */
export const MigrationPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { user } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);

  const [hCase, setHCase] = useState("");
  const [hOrg, setHOrg] = useState("CBI");
  const [hState, setHState] = useState("MAHARASHTRA");
  const [hAdmin, setHAdmin] = useState("");
  const [hOrder, setHOrder] = useState("");
  const [hReason, setHReason] = useState("");

  const [mCase, setMCase] = useState("");
  const [mOrder, setMOrder] = useState("");
  const [mLead, setMLead] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, a, u] = await Promise.all([
          adminApi.getCases(),
          adminApi.getAdmins().catch(() => ({ admins: [] })),
          adminApi.getUsers().catch(() => ({ users: [] })),
        ]);
        setCases(c.cases || []);
        setAdmins(a.admins || []);
        setLeads((u.users || []).filter((x: any) => String(x.role).endsWith("_LEAD")));
      } catch {
        /* panel degrades */
      }
    })();
  }, []);

  const role = user?.role || "";
  const isCidAdmin = role === "CID_ADMIN";
  const isCbiAdmin = role === "CBI_ADMIN";

  const targetTenure = hOrg === "POLICE" ? `POLICE:${hState}` : hOrg;
  const candidateAdmins = admins.filter((a) => a.tenure === targetTenure && a._id !== user?._id);
  const policeCases = cases.filter((c: any) => c.org === "POLICE");

  const runHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await migrationApi.handover({
        caseId: hCase,
        toOrg: hOrg,
        toState: hOrg === "POLICE" ? hState : undefined,
        toAdminId: hAdmin,
        orderRef: hOrder,
        reason: hReason,
      });
      setMsg({ ok: true, text: `Handed over ${res.from} → ${res.to} (order ${res.orderRef}). Incoming agency has full case data instantly.` });
      onChanged?.();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Handover failed." });
    } finally {
      setBusy(false);
    }
  };

  const runMigration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (isCidAdmin) {
        await migrationApi.escalate({ caseId: mCase, orderRef: mOrder, cidLeadId: mLead || undefined });
        setMsg({ ok: true, text: `Path A escalation executed — case pulled into CID workspace (order ${mOrder}).` });
      } else {
        await migrationApi.takeover({ caseId: mCase, orderRef: mOrder, cbiLeadId: mLead || undefined });
        setMsg({ ok: true, text: `Path B federal override executed — state personnel locked out (order ${mOrder}).` });
      }
      onChanged?.();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Migration failed." });
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-amber-400" /> Case Handover & Migration
        </h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Instant re-keying to an incoming agency (Req27) · CID escalation / CBI takeover router (Req28).
        </p>
      </div>

      {msg && (
        <div className={`p-3.5 rounded-xl text-xs flex items-start gap-2 border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Req27 — handover */}
      <form onSubmit={runHandover} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Instant administrative handover — any department Admin
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">Case</span>
            <select value={hCase} onChange={(e) => setHCase(e.target.value)} required className={inputCls}>
              <option value="">Select case…</option>
              {cases.map((c: any) => (
                <option key={c.id} value={c.id}>{c.codeName} · {c.org}{c.state ? `/${c.state}` : ""}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">Incoming agency</span>
            <select value={hOrg} onChange={(e) => setHOrg(e.target.value)} className={inputCls}>
              <option value="CBI">CBI</option>
              <option value="NIA">NIA</option>
              <option value="CID">CID</option>
              <option value="POLICE">State Police</option>
            </select>
          </label>
          {hOrg === "POLICE" && (
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">Incoming state</span>
              <select value={hState} onChange={(e) => setHState(e.target.value)} className={inputCls}>
                <option value="MAHARASHTRA">MAHARASHTRA</option>
                <option value="KARNATAKA">KARNATAKA</option>
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">Incoming Admin ({targetTenure})</span>
            <select value={hAdmin} onChange={(e) => setHAdmin(e.target.value)} required className={inputCls}>
              <option value="">Select incoming admin…</option>
              {candidateAdmins.map((a: any) => (
                <option key={a._id} value={a._id}>{a.name} ({a.official_id})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">Transfer order / mandate ref *</span>
            <input value={hOrder} onChange={(e) => setHOrder(e.target.value)} required placeholder="e.g. GOI-2026/441" className={inputCls} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-semibold text-slate-400">Reason</span>
            <input value={hReason} onChange={(e) => setHReason(e.target.value)} placeholder="Court / executive directive summary" className={inputCls} />
          </label>
        </div>
        <button type="submit" disabled={busy || !hCase || !hAdmin || hOrder.trim().length < 6} className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40">
          Execute instant handover
        </button>
      </form>

      {/* Req28 — migration router */}
      {(isCidAdmin || isCbiAdmin) ? (
        <form onSubmit={runMigration} className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            {isCidAdmin ? "Path A — State escalation: POLICE → CID" : "Path B — Federal override: → CBI (locks out state)"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">Case</span>
              <select value={mCase} onChange={(e) => setMCase(e.target.value)} required className={inputCls}>
                <option value="">Select case…</option>
                {(isCidAdmin ? policeCases : cases.filter((c: any) => c.org !== "CBI")).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.codeName} · {c.org}{c.state ? `/${c.state}` : ""}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">
                {isCidAdmin ? "State Executive / High Court directive ref *" : "Central / Supreme Court mandate ref *"}
              </span>
              <input value={mOrder} onChange={(e) => setMOrder(e.target.value)} required placeholder={isCidAdmin ? "e.g. HC-BOM/2026/ES-18" : "e.g. SC/2026/FED-07"} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">Designated {isCidAdmin ? "CID" : "CBI"} Lead (optional)</span>
              <select value={mLead} onChange={(e) => setMLead(e.target.value)} className={inputCls}>
                <option value="">Assign later</option>
                {leads.filter((l: any) => (isCidAdmin ? l.role === "CID_LEAD" : l.role === "CBI_LEAD")).map((l: any) => (
                  <option key={l._id} value={l._id}>{l.name} ({l.official_id})</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy || !mCase || mOrder.trim().length < 6} className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40">
            Execute {isCidAdmin ? "escalation" : "takeover"}
          </button>
        </form>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
          The migration router is controlled by CID Admins (Path A escalation) and CBI Admins (Path B federal override) only.
        </div>
      )}
    </div>
  );
};

export default MigrationPanel;
