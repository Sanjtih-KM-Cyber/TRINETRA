import React, { useState, useEffect } from "react";
import { DepartmentIdentity } from "../../data/departments";
import { DEPT_WIDGETS, EMPTY_PIPELINE, type PipelineSnapshot } from "../../data/departmentDashboards";
import { matrixFor } from "../../data/roleMatrices";
import { orgOf, functionalOf } from "../../data/roles";
import { DepartmentLayout } from "./DepartmentLayout";
import { DepartmentLogo } from "./DepartmentLogo";
import { UserAccount, CrimeNetworkNode, CrimeNetworkLink, IntelRecord } from "../../types";
import { proceedingsApi, stagingApi, caseApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { Shield, ArrowRight, LogOut, Radio, IndianRupee } from "lucide-react";

interface AgencyDashboardProps {
  department: DepartmentIdentity;
  user: UserAccount;
  stats: { cases: number; nodes: number; links: number; patterns: number };
  graph: { nodes: CrimeNetworkNode[]; links: CrimeNetworkLink[]; intels: IntelRecord[] };
  onEnterWorkstation: () => void;
  onLogout: () => void;
}

function inr(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

export const AgencyDashboard: React.FC<AgencyDashboardProps> = ({
  department,
  user,
  stats,
  graph,
  onEnterWorkstation,
  onLogout,
}) => {
  const { authorizedCases } = useAuth();
  const [pipeline, setPipeline] = useState<PipelineSnapshot>(EMPTY_PIPELINE);

  useEffect(() => {
    let cancelled = false;
    const caseId = authorizedCases[0]?.id || authorizedCases[0]?.case_id;
    if (!caseId) return;
    (async () => {
      try {
        const [diary, memos, custody, alerts, cs, staging, pool, xfers, state] = await Promise.all([
          proceedingsApi.getDiary(caseId).catch(() => ({ entries: [] })),
          proceedingsApi.getMemos(caseId).catch(() => ({ memos: [] })),
          proceedingsApi.getCustody(caseId).catch(() => ({ records: [] })),
          proceedingsApi.getCustodyAlerts(caseId).catch(() => ({ alerts: [] })),
          proceedingsApi.getChargeSheets(caseId).catch(() => ({ chargeSheets: [] })),
          stagingApi.getQueue(caseId, { status: "PENDING" }).catch(() => ({ entities: [], links: [], batches: [] })),
          stagingApi.getInnocentPool(caseId).catch(() => ({ items: [] })),
          stagingApi.getTransfers(caseId).catch(() => ({ transfers: [] })),
          caseApi.getCaseState(caseId).catch(() => null),
        ]);
        if (cancelled) return;
        setPipeline({
          diary: diary.entries.length,
          memos: memos.memos.length,
          custody: custody.records.length,
          custodyCritical: alerts.alerts.filter((a: any) => a.severity === "CRITICAL").length,
          chargeSheets: cs.chargeSheets.length,
          exhibits: state?.evidenceFiles?.length ?? 0,
          stagedPending: staging.entities.length + staging.links.length,
          batches: staging.batches.length,
          pool: pool.items.length,
          transfers: xfers.transfers.length,
          intel: graph.intels.length,
        });
      } catch {
        /* dashboard degrades to graph stats */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedCases, graph.intels.length]);

  const transferValue = graph.links
    .filter((l) => l.relationType === "FUNDS_TRANSFER")
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const valueFor = (key: string): { display: string; sub: string } => {
    switch (key) {
      case "cases": return { display: String(stats.cases), sub: "authorised" };
      case "entities": return { display: String(stats.nodes), sub: "live graph" };
      case "links": return { display: String(stats.links), sub: "live graph" };
      case "patterns": return { display: String(stats.patterns), sub: "detections" };
      case "persons": return { display: String(graph.nodes.filter((n) => n.type === "PERSON").length), sub: "of interest" };
      case "phones": return { display: String(graph.nodes.filter((n) => n.type === "PHONE").length), sub: "IMEI + SIM" };
      case "financialEntities": return { display: String(graph.nodes.filter((n) => n.type === "FINANCIAL").length), sub: "accounts/VPAs" };
      case "transferValue": return { display: inr(transferValue), sub: "FUNDS_TRANSFER" };
      case "transferLinks": return { display: String(graph.links.filter((l) => l.relationType === "FUNDS_TRANSFER").length), sub: "trails" };
      case "highValueTrails": return { display: String(graph.links.filter((l) => l.relationType === "FUNDS_TRANSFER" && Number(l.amount) >= 1000000).length), sub: "≥ ₹10L STR-grade" };
      case "diary": return { display: String(pipeline.diary), sub: "Sec 172" };
      case "memos": return { display: String(pipeline.memos), sub: "Sec 41/102" };
      case "custody": return { display: String(pipeline.custody), sub: "clocks" };
      case "custodyCritical": return { display: String(pipeline.custodyCritical), sub: "act today" };
      case "chargeSheets": return { display: String(pipeline.chargeSheets), sub: "Sec 173" };
      case "exhibits": return { display: String(pipeline.exhibits), sub: "committed" };
      case "stagedPending": return { display: String(pipeline.stagedPending), sub: "awaiting review" };
      case "batches": return { display: String(pipeline.batches), sub: "ingested" };
      case "pool": return { display: String(pipeline.pool), sub: "preserved" };
      case "transfers": return { display: String(pipeline.transfers), sub: "ledger" };
      case "intel": return { display: String(pipeline.intel), sub: "reports" };
      default: return { display: "—", sub: "" };
    }
  };

  const widgets = DEPT_WIDGETS[department.code] ?? DEPT_WIDGETS.STATE_POLICE;
  const matrix = matrixFor(orgOf(user.role));
  const mandate =
    functionalOf(user.role) === "ADMIN"
      ? matrix.admin
      : functionalOf(user.role) === "LEAD"
      ? matrix.lead
      : functionalOf(user.role) === "CYBER"
      ? matrix.cyber
      : functionalOf(user.role) === "FORENSIC"
      ? matrix.forensic
      : matrix.field;
  const userRank = department.ranks.find(
    (r) => user.designation.toLowerCase().includes(r.full.toLowerCase().split(" ")[0])
  );

  return (
    <DepartmentLayout department={department} officerName={user.name} officerRank={user.designation}>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <DepartmentLogo department={department} size={52} />
                <div>
                  <h1 className="text-lg font-bold tracking-tight">{department.fullName}</h1>
                  <p className="text-xs text-slate-400">{department.jurisdiction} · {department.headquarters}</p>
                </div>
              </div>
              <button onClick={onLogout} className="btn-secondary" title="Secure logout">
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-300 border-l-2 pl-3" style={{ borderColor: department.accentColor }}>
              “{department.motto}” <span className="text-slate-500">· {department.mottoHindi}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-mono">
              <span className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 inline-flex items-center gap-1.5">
                <Radio className="w-3 h-3" style={{ color: department.accentColor }} /> {department.gateway}
              </span>
              <span className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 inline-flex items-center gap-1.5">
                <Shield className="w-3 h-3" style={{ color: department.accentColor }} /> {department.clearance}
              </span>
              {userRank && (
                <span className="px-2 py-1 rounded-lg border font-bold" style={{ borderColor: department.accentColor + "66", color: department.accentColor, backgroundColor: department.primaryColor + "33" }}>
                  {userRank.full} · Band L{userRank.level} of {department.ranks.length}
                </span>
              )}
            </div>
            <button onClick={onEnterWorkstation} className="btn-primary mt-4">
              Enter Investigation Workstation <ArrowRight className="w-4 h-4" />
            </button>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: department.accentColor }}>
                {mandate.title} · staff: {mandate.staffingPrefix}*
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{mandate.mandate}</p>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              {department.shortName} command strip
            </h2>
            <p className="text-[10px] font-mono text-slate-500 mb-3">Live graph + pipeline values</p>
            <div className="grid grid-cols-2 gap-2.5">
              {widgets.map((w) => {
                const v = valueFor(w.key);
                return (
                  <div key={w.key} className="rounded-xl bg-slate-950 border border-slate-800 p-3" title={w.hint}>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      {w.money && <IndianRupee className="w-3.5 h-3.5" />}
                      <span className="text-[10px] font-mono uppercase">{w.label}</span>
                    </div>
                    <div className="text-xl font-bold font-mono mt-1 truncate" style={{ color: department.accentColor }}>{v.display}</div>
                    <div className="text-[9px] font-mono text-slate-500 truncate">{v.sub || w.hint}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Sanctioned rank structure — {department.shortName} ({department.ranks.length} bands)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {department.ranks.map((r) => {
              const isMine = userRank?.level === r.level;
              return (
                <div
                  key={r.short + r.level}
                  className="rounded-lg bg-slate-950 border px-2.5 py-2"
                  style={isMine ? { borderColor: department.accentColor, backgroundColor: department.primaryColor + "44" } : { borderColor: "#1e293b" }}
                  title={isMine ? "Your rank band" : undefined}
                >
                  <div className="text-[10px] font-mono font-bold" style={{ color: department.accentColor }}>
                    {r.short}{isMine ? " ★" : ""}
                  </div>
                  <div className="text-[11px] text-slate-300 leading-tight">{r.full}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DepartmentLayout>
  );
};

export default AgencyDashboard;
