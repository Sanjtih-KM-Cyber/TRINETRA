import React, { useState } from "react";
import {
  InvestigatorProfile,
  AuditLogEntry,
  UserRole,
} from "../types";
import {
  INITIAL_AUDIT_LOGS,
} from "../data/mockDatasets";
import {
  Shield,
  Users,
  Lock,
  CheckCircle2,
  Search,
  Key,
  Clock,
  Radio,
  FileText,
  BadgeCheck,
  ShieldAlert,
} from "lucide-react";

interface InvestigatorRbacHubProps {
  currentOfficer: InvestigatorProfile;
  auditLogs?: AuditLogEntry[];
}

export const InvestigatorRbacHub: React.FC<InvestigatorRbacHubProps> = ({
  currentOfficer,
  auditLogs = INITIAL_AUDIT_LOGS,
}) => {
  const [activeTab, setActiveTab] = useState<"profiles" | "audit" | "matrix">("profiles");
  const [auditSearch, setAuditSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");

  const filteredLogs = auditLogs.filter((log) => {
    if (roleFilter !== "ALL" && log.officerRole !== roleFilter) return false;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      return (
        (log.officerName || "").toLowerCase().includes(q) ||
        (log.actionType || log.action || "").toLowerCase().includes(q) ||
        (log.details || "").toLowerCase().includes(q) ||
        (log.targetLabel || "").toLowerCase().includes(q) ||
        (log.digitalHash || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getRoleBadge = (role?: UserRole) => {
    switch (role) {
      case "ADMIN":
        return { label: "System Administrator", color: "bg-purple-500/20 text-purple-300 border-purple-500/40" };
      case "LEAD_INVESTIGATOR":
        return { label: "Lead Investigator", color: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
      case "FORENSIC_INVESTIGATOR":
        return { label: "Forensic Investigator", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
      default:
        return { label: role || "Officer", color: "bg-slate-500/20 text-slate-300 border-slate-500/40" };
    }
  };

  const activeOfficerBadge = getRoleBadge(currentOfficer.role);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                CASE ACCESS GOVERNANCE & RBAC
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                IMMUTABLE CHAIN-OF-CUSTODY AUDIT
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-100 mt-0.5">
              Investigator Credentials & Security Authorization
            </h2>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab("profiles")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "profiles"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Active Session Profile</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "audit"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Digital Audit Log ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("matrix")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === "matrix"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>RBAC Matrix</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Active Officer Profile & Cryptographic Privileges */}
      {activeTab === "profiles" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Authenticated Identity Card */}
            <div className="md:col-span-1 bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between mb-4">
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${activeOfficerBadge.color}`}>
                  {activeOfficerBadge.label}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  AUTHENTICATED
                </span>
              </div>

              <div className="flex items-center gap-3.5 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-slate-950 font-mono text-base border-2 border-slate-700 shadow-md"
                  style={{ backgroundColor: currentOfficer.avatarColor || "#f59e0b" }}
                >
                  {currentOfficer.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                    {currentOfficer.name}
                    <BadgeCheck className="w-4 h-4 text-amber-400" />
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">{currentOfficer.rank}</p>
                </div>
              </div>

              <div className="text-xs font-mono text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Official ID:</span>
                  <span className="text-slate-200 font-semibold">{currentOfficer.badgeNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Agency:</span>
                  <span className="text-slate-200">{currentOfficer.agency || "National Investigation Agency (NIA)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Department:</span>
                  <span className="text-slate-200">{currentOfficer.department}</span>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-amber-300/90 font-mono bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                <div className="text-[9px] text-amber-500 font-bold uppercase mb-0.5">Active Mission Role:</div>
                {currentOfficer.role === "LEAD_INVESTIGATOR"
                  ? "Full syndicate graph analysis, AI copilot queries, node sanctioning, and chargesheet signing."
                  : currentOfficer.role === "FORENSIC_INVESTIGATOR"
                  ? "Digital evidence intake, CDR triangulation, IMEI correlation, and forensic validation."
                  : "National security platform administration and case membership governance."}
              </div>
            </div>

            {/* Cryptographic Privileges & Scope */}
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-400" />
                  Active Cryptographic Privileges & Authority Matrix
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Privileges are cryptographically bound to your authenticated session token under statutory National Security guidelines.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Sign Court Dossiers", granted: currentOfficer.permissions.canSignDossier },
                    { label: "Confirm Evidence Nodes", granted: currentOfficer.permissions.canConfirmEvidence },
                    { label: "Reject / Strike Node", granted: currentOfficer.permissions.canRejectEvidence },
                    { label: "Add Hypotheses", granted: currentOfficer.permissions.canAddHypothesis },
                    { label: "Bulk 15GB Ingestion", granted: currentOfficer.permissions.canIngestData },
                    { label: "Export Case Intel", granted: currentOfficer.permissions.canExportData },
                  ].map((perm, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex flex-col justify-between ${
                        perm.granted
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-slate-950/60 border-slate-800 text-slate-500 opacity-60"
                      }`}
                    >
                      <span className="text-xs font-semibold">{perm.label}</span>
                      <span className="mt-2 text-[10px] font-mono font-bold flex items-center gap-1">
                        {perm.granted ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>AUTHORIZED</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3 text-slate-500" />
                            <span>RESTRICTED</span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span>Session Security: Level-4 LEA Encrypted</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Secured via JWT & Role Enforcement
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Digital Audit Log */}
      {activeTab === "audit" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search audit trail, SHA-256 hash, officer..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-full"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">System Administrator</option>
                <option value="LEAD_INVESTIGATOR">Lead Investigator</option>
                <option value="FORENSIC_INVESTIGATOR">Forensic Investigator</option>
              </select>
            </div>
          </div>

          {/* Audit Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Officer / Role</th>
                  <th className="py-2.5 px-3">Action Type</th>
                  <th className="py-2.5 px-3">Target Entity</th>
                  <th className="py-2.5 px-3">Cryptographic Digest (SHA-256)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => {
                  const badge = getRoleBadge(log.officerRole);
                  return (
                    <tr key={log.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="py-3 px-3">
                        <strong className="text-slate-200 block font-sans text-xs">{log.officerName || log.user || "System"}</strong>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300 font-bold text-[10px]">
                          {log.actionType || log.action}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-200 font-sans text-xs">{log.targetLabel || "Case Artifact"}</div>
                        <div className="text-slate-500 text-[10px] truncate max-w-xs">{log.details}</div>
                      </td>
                      <td className="py-3 px-3 text-sky-400 font-mono text-[10px]">
                        <span className="bg-sky-950/40 border border-sky-800/60 px-2 py-0.5 rounded">
                          {(log.digitalHash || "sha256:7f8e9a4b2c1d").slice(0, 24)}...
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Statutory RBAC Matrix (3 Real Roles Only) */}
      {activeTab === "matrix" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
              Statutory Law Enforcement Access Control Matrix (CRIM-INTEL Standard)
            </h3>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
              3 AUTHORIZED ROLES ONLY
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Role Designation</th>
                  <th className="py-3 px-4 text-center">Manage Users & Cases</th>
                  <th className="py-3 px-4 text-center">AI Copilot Reasoning</th>
                  <th className="py-3 px-4 text-center">Confirm / Sanction Nodes</th>
                  <th className="py-3 px-4 text-center">Forensic Evidence Ingest</th>
                  <th className="py-3 px-4 text-center">Sign Charge-Sheet Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[
                  {
                    role: "ADMIN",
                    desc: "System & User Access Controller",
                    manageUsers: true,
                    copilot: true,
                    confirmNodes: true,
                    ingest: true,
                    signDossier: true,
                  },
                  {
                    role: "LEAD_INVESTIGATOR",
                    desc: "Superintendent / IO Lead",
                    manageUsers: false,
                    copilot: true,
                    confirmNodes: true,
                    ingest: true,
                    signDossier: true,
                  },
                  {
                    role: "FORENSIC_INVESTIGATOR",
                    desc: "Digital Evidence & CDR Tech",
                    manageUsers: false,
                    copilot: false,
                    confirmNodes: false,
                    ingest: true,
                    signDossier: false,
                  },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-850">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-200">{row.role}</div>
                      <div className="text-[10px] text-slate-500">{row.desc}</div>
                    </td>
                    <td className="py-3.5 px-4 text-center">{row.manageUsers ? "🟢 YES" : "🔴 NO"}</td>
                    <td className="py-3.5 px-4 text-center">{row.copilot ? "🟢 YES" : "🔴 NO"}</td>
                    <td className="py-3.5 px-4 text-center">{row.confirmNodes ? "🟢 YES" : "🔴 NO"}</td>
                    <td className="py-3.5 px-4 text-center">{row.ingest ? "🟢 YES" : "🔴 NO"}</td>
                    <td className="py-3.5 px-4 text-center">{row.signDossier ? "🟢 YES" : "🔴 NO"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
