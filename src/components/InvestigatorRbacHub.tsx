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
    if (!role) return { label: "Officer", color: "bg-slate-500/20 text-slate-300 border-slate-500/40" };
    if (role.endsWith("_ADMIN"))
      return { label: `${role} · Dept Admin`, color: "bg-purple-500/20 text-purple-300 border-purple-500/40" };
    if (role.endsWith("_LEAD"))
      return { label: `${role} · Lead`, color: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
    if (role.endsWith("_CYBER"))
      return { label: `${role} · Cyber`, color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" };
    if (role.endsWith("_FORENSIC"))
      return { label: `${role} · Forensic`, color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
    if (role.endsWith("_FIELD"))
      return { label: `${role} · Field`, color: "bg-blue-500/20 text-blue-300 border-blue-500/40" };
    return { label: role, color: "bg-slate-500/20 text-slate-300 border-slate-500/40" };
  };

  const activeOfficerBadge = getRoleBadge(currentOfficer.role);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="glass-panel border-white/10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl glass-panel text-primary border border-primary/30 shadow-[0_0_15px_rgba(var(--color-primary),0.3)]">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/20 text-on-surface border border-primary/30">
                CASE ACCESS GOVERNANCE & RBAC
              </span>
              <span className="text-[10px] font-mono text-on-surface-variant">
                IMMUTABLE CHAIN-OF-CUSTODY AUDIT
              </span>
            </div>
            <h2 className="text-base font-bold text-on-surface mt-0.5">
              Investigator Credentials & Security Authorization
            </h2>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 glass-strong p-1.5 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab("profiles")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${activeTab === "profiles"
              ? "glass-panel text-primary border border-primary/30 shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Active Session Profile</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${activeTab === "audit"
              ? "glass-panel text-primary border border-primary/30 shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Digital Audit Log ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("matrix")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${activeTab === "matrix"
              ? "glass-panel text-primary border border-primary/30 shadow-sm"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
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
            <div className="md:col-span-1 glass-panel border-primary/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between mb-4">
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${activeOfficerBadge.color}`}>
                  {activeOfficerBadge.label}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-success">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  AUTHENTICATED
                </span>
              </div>

              <div className="flex items-center gap-3.5 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-surface-container font-mono text-base border-2 border-white/10 shadow-md"
                  style={{ backgroundColor: currentOfficer.avatarColor || "#f59e0b" }}
                >
                  {currentOfficer.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface flex items-center gap-1.5">
                    {currentOfficer.name}
                    <BadgeCheck className="w-4 h-4 text-primary" />
                  </h3>
                  <p className="text-xs text-on-surface-variant font-mono">{currentOfficer.rank}</p>
                </div>
              </div>

              <div className="text-xs font-mono text-on-surface-variant glass-strong p-3 rounded-xl border border-white/5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant/70">Official ID:</span>
                  <span className="text-on-surface font-semibold">{currentOfficer.badgeNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant/70">Agency:</span>
                  <span className="text-on-surface">{currentOfficer.agency || "National Investigation Agency (NIA)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant/70">Department:</span>
                  <span className="text-on-surface">{currentOfficer.department}</span>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-on-surface font-mono glass-panel border border-primary/20 shadow-[0_0_10px_rgba(var(--color-primary),0.1)] p-3 rounded-xl">
                <div className="text-[9px] text-primary font-bold uppercase mb-0.5">Active Mission Role:</div>
                {currentOfficer.role === "LEAD_INVESTIGATOR"
                  ? "Full syndicate graph analysis, AI copilot queries, node sanctioning, and chargesheet signing."
                  : currentOfficer.role === "FORENSIC_INVESTIGATOR"
                    ? "Digital evidence intake, CDR triangulation, IMEI correlation, and forensic validation."
                    : "National security platform administration and case membership governance."}
              </div>
            </div>

            {/* Cryptographic Privileges & Scope */}
            <div className="md:col-span-2 glass-panel border-white/10 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-mono font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  Active Cryptographic Privileges & Authority Matrix
                </h3>
                <p className="text-xs text-on-surface-variant mb-4">
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
                      className={`p-3 rounded-xl border flex flex-col justify-between ${perm.granted
                        ? "glass-strong border-success/30 text-success"
                        : "glass-strong border-white/5 text-on-surface-variant opacity-60"
                        }`}
                    >
                      <span className="text-xs font-semibold">{perm.label}</span>
                      <span className="mt-2 text-[10px] font-mono font-bold flex items-center gap-1">
                        {perm.granted ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-success" />
                            <span>AUTHORIZED</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3 text-on-surface-variant" />
                            <span>RESTRICTED</span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                <span>Session Security: Level-4 LEA Encrypted</span>
                <span className="text-success flex items-center gap-1">
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
        <div className="glass-panel border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search audit trail, SHA-256 hash, officer..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="glass-strong border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-primary w-full"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant font-mono">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="glass-strong border border-white/10 rounded-xl px-3 py-1.5 text-xs text-on-surface font-mono focus:outline-none focus:border-primary"
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
              <thead className="glass-strong text-on-surface-variant border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Officer / Role</th>
                  <th className="py-2.5 px-3">Action Type</th>
                  <th className="py-2.5 px-3">Target Entity</th>
                  <th className="py-2.5 px-3">Cryptographic Digest (SHA-256)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.map((log) => {
                  const badge = getRoleBadge(log.officerRole);
                  return (
                    <tr key={log.id} className="hover:bg-surface-container transition-colors">
                      <td className="py-3 px-3 text-on-surface-variant whitespace-nowrap">
                        {new Date(log.timestamp).toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="py-3 px-3">
                        <strong className="text-on-surface block font-sans text-xs">{log.officerName || log.user || "System"}</strong>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded glass-panel border border-white/5 text-primary font-bold text-[10px]">
                          {log.actionType || log.action}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-on-surface font-sans text-xs">{log.targetLabel || "Case Artifact"}</div>
                        <div className="text-on-surface-variant text-[10px] truncate max-w-xs">{log.details}</div>
                      </td>
                      <td className="py-3 px-3 text-sky-400 font-mono text-[10px]">
                        <span className="glass-panel border-sky-500/30 px-2 py-0.5 rounded">
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

      {/* Tab 3: Statutory RBAC Matrix (canonical functionals × dept tenants) */}
      {activeTab === "matrix" && (
        <div className="glass-panel border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-on-surface uppercase tracking-wider">
              Statutory Law Enforcement Access Control Matrix (TRINETRA Standard)
            </h3>
            <span className="text-[10px] font-mono text-primary glass-panel border border-primary/20 px-2 py-0.5 rounded">
              CBI / NIA / CID / POLICE × ADMIN-LEAD-CYBER-FORENSIC-FIELD
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="glass-strong text-on-surface-variant border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">Role Designation</th>
                  <th className="py-3 px-4 text-center">Manage Users & Cases</th>
                  <th className="py-3 px-4 text-center">AI Copilot Reasoning</th>
                  <th className="py-3 px-4 text-center">Confirm / Sanction Nodes</th>
                  <th className="py-3 px-4 text-center">Forensic Evidence Ingest</th>
                  <th className="py-3 px-4 text-center">Sign Charge-Sheet Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  {
                    role: "*_ADMIN (dept-scoped)",
                    desc: "CBI/NIA/CID/POLICE(STATE) Admin · same-tenure only",
                    manageUsers: true,
                    copilot: true,
                    confirmNodes: true,
                    ingest: false,
                    signDossier: false,
                  },
                  {
                    role: "*_LEAD",
                    desc: "DySP/Inspector/SHO command · SAHAYAK, no ingest",
                    manageUsers: false,
                    copilot: true,
                    confirmNodes: true,
                    ingest: false,
                    signDossier: true,
                  },
                  {
                    role: "*_CYBER",
                    desc: "Digital forensics / OSINT / crypto trails",
                    manageUsers: false,
                    copilot: true,
                    confirmNodes: false,
                    ingest: true,
                    signDossier: false,
                  },
                  {
                    role: "*_FORENSIC",
                    desc: "CFSL/FSL uploads only · minimal portal",
                    manageUsers: false,
                    copilot: false,
                    confirmNodes: false,
                    ingest: true,
                    signDossier: false,
                  },
                  {
                    role: "POLICE_FIELD / *_FIELD",
                    desc: "Beat/station field capture · mobile uploads",
                    manageUsers: false,
                    copilot: false,
                    confirmNodes: false,
                    ingest: true,
                    signDossier: false,
                  },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-surface-container">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-on-surface">{row.role}</div>
                      <div className="text-[10px] text-on-surface-variant">{row.desc}</div>
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
