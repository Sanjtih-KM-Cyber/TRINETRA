import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import { UserAccount, AccessRequest, CaseMember } from "../../types";
import {
  Shield,
  Users,
  UserCheck,
  UserX,
  FileText,
  Clock,
  FolderGit2,
  Lock,
  LogOut,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Building,
  KeyRound,
  Fingerprint,
  Layers,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";

export const AdminPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<
    "dashboard" | "requests" | "users" | "case_access" | "audit" | "cases"
  >("dashboard");

  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [caseRequests, setCaseRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("case-garuda");
  const [caseMembers, setCaseMembers] = useState<CaseMember[]>([]);

  // Action status state
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedUserToAssign, setSelectedUserToAssign] = useState<string>("");
  const [assignedRolesMap, setAssignedRolesMap] = useState<Record<string, "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR">>({});

  const loadData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [dashRes, reqsRes, caseReqsRes, usersRes, casesRes, auditRes] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getAccessRequests(),
        adminApi.getCaseAccessRequests(),
        adminApi.getUsers(),
        adminApi.getCases(),
        adminApi.getAuditLogs(),
      ]);

      setMetrics(dashRes.metrics);
      setRequests(reqsRes.requests || []);
      setCaseRequests(caseReqsRes.requests || []);
      setUsers(usersRes.users || []);
      setCases(casesRes.cases || []);
      setAuditLogs(auditRes.logs || []);

      if (casesRes.cases?.length > 0) {
        const defaultCase = casesRes.cases[0].id;
        setSelectedCaseId(defaultCase);
        const membersRes = await adminApi.getCaseMembers(defaultCase);
        setCaseMembers(membersRes.members || []);
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to load admin data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCaseChange = async (caseId: string) => {
    setSelectedCaseId(caseId);
    try {
      const membersRes = await adminApi.getCaseMembers(caseId);
      setCaseMembers(membersRes.members || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to load case members.");
    }
  };

  const handleApproveCaseRequest = async (requestId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminApi.approveCaseAccessRequest(requestId, "Approved by System Administrator");
      setActionSuccess("Case access request approved. Investigator added to case workspace.");
      loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to approve case access request.");
    }
  };

  const handleRejectCaseRequest = async (requestId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminApi.rejectCaseAccessRequest(requestId, "Declined per administrative review.");
      setActionSuccess("Case access request declined.");
      loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to decline case access request.");
    }
  };

  const handleApproveRequest = async (requestId: string, requestedRole?: string) => {
    setActionError(null);
    setActionSuccess(null);
    const assignedRole = assignedRolesMap[requestId] || (requestedRole === "FORENSIC_INVESTIGATOR" ? "FORENSIC_INVESTIGATOR" : "LEAD_INVESTIGATOR");
    try {
      await adminApi.approveRequest(requestId, "Approved by System Administrator", selectedCaseId, assignedRole);
      setActionSuccess(`Access request approved and user activated with role ${assignedRole}.`);
      loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to approve access request.");
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminApi.rejectRequest(requestId, "Access denied per security review.");
      setActionSuccess("Access request rejected.");
      loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to reject access request.");
    }
  };

  const handleStatusChange = async (userId: string, newStatus: "ACTIVE" | "SUSPENDED" | "REJECTED") => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminApi.updateUserStatus(userId, newStatus);
      setActionSuccess(`User status updated to ${newStatus}.`);
      loadData();
    } catch (err: any) {
      setActionError(err.message || "Failed to update user status.");
    }
  };

  const handleAssignMember = async () => {
    if (!selectedUserToAssign || !selectedCaseId) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminApi.assignCaseMember(selectedCaseId, selectedUserToAssign);
      setActionSuccess("Investigator assigned to case successfully.");
      setSelectedUserToAssign("");
      const membersRes = await adminApi.getCaseMembers(selectedCaseId);
      setCaseMembers(membersRes.members || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to assign investigator.");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedCaseId) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await adminApi.removeCaseMember(selectedCaseId, userId);
      setActionSuccess("Investigator removed from case.");
      const membersRes = await adminApi.getCaseMembers(selectedCaseId);
      setCaseMembers(membersRes.members || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to remove member.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Admin Top Header */}
      <header className="h-16 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base text-slate-100">
                CRIM-INTEL OS • Administration Control Center
              </h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                ADMIN
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Multi-Agency Access Governance, Authorization & Case Membership
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end text-xs">
            <span className="font-semibold text-slate-200">{user?.name}</span>
            <span className="text-[10px] text-slate-400 font-mono">{user?.agency}</span>
          </div>

          <button
            onClick={loadData}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-all active:scale-95"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all active:scale-95"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Admin Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-slate-900/70 border-r border-slate-800/80 p-3 sm:p-4 flex md:flex-col justify-between shrink-0">
          <div className="w-full space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-2 font-bold">
                ADMINISTRATION
              </span>
              <nav className="mt-2 space-y-1">
                <button
                  onClick={() => setActiveSection("dashboard")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeSection === "dashboard"
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-4 h-4" />
                    <span>Dashboard</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveSection("requests")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeSection === "requests"
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4" />
                    <span>Access Requests</span>
                  </div>
                  {metrics?.pendingRequests > 0 && (
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950">
                      {metrics.pendingRequests}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveSection("users")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeSection === "users"
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4" />
                    <span>Users & Clearance</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{users.length}</span>
                </button>

                <button
                  onClick={() => setActiveSection("case_access")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeSection === "case_access"
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="w-4 h-4" />
                    <span>Case Membership</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveSection("audit")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeSection === "audit"
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Fingerprint className="w-4 h-4" />
                    <span>System Audit Trail</span>
                  </div>
                </button>
              </nav>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-2 font-bold">
                INVESTIGATIONS
              </span>
              <nav className="mt-2 space-y-1">
                <button
                  onClick={() => setActiveSection("cases")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeSection === "cases"
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FolderGit2 className="w-4 h-4" />
                    <span>All Registered Cases</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{cases.length}</span>
                </button>
              </nav>
            </div>
          </div>

          <div className="hidden md:block p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
            <span className="block font-semibold text-slate-300 mb-1">Zero-Trust Enforcement</span>
            <span>All operations cryptographically sealed with SHA-256 audit digest.</span>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl">
          {/* Action Notifications */}
          {actionSuccess && (
            <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
              <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
                ✕
              </button>
            </div>
          )}

          {actionError && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
              <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-200">
                ✕
              </button>
            </div>
          )}

          {/* ================= 1. DASHBOARD ================= */}
          {activeSection === "dashboard" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Security & Access Governance Overview
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  National security user clearance status, case assignments, and audit logs.
                </p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold">Total Users</span>
                    <Users className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">
                    {metrics?.totalUsers || 0}
                  </div>
                  <span className="text-[11px] text-emerald-400 mt-1 block">
                    {metrics?.activeUsers || 0} Active Officers
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold">Pending Requests</span>
                    <UserCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400">
                    {metrics?.pendingRequests || 0}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Requires Admin review</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold">Active Cases</span>
                    <FolderGit2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">
                    {metrics?.activeCases || 0}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Under interdiction</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-semibold">Audit Logs</span>
                    <Fingerprint className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">
                    {metrics?.auditLogCount || 0}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Cryptographically sealed</span>
                </div>
              </div>

              {/* Pending Requests & Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Access Requests */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-amber-400" />
                      <span>Pending Clearance Requests</span>
                    </h3>
                    <button
                      onClick={() => setActiveSection("requests")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                    >
                      <span>View All</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {requests.filter((r) => r.status === "PENDING").length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                        No pending access requests. All officer profiles reviewed.
                      </div>
                    ) : (
                      requests
                        .filter((r) => r.status === "PENDING")
                        .slice(0, 3)
                        .map((req) => (
                          <div
                            key={req._id}
                            className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-slate-100">{req.full_name}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  {req.requested_role}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {req.official_id} • {req.agency}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1 italic line-clamp-1">
                                "{req.reason_for_access}"
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleApproveRequest(req._id)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-sm"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req._id)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-all border border-slate-700 hover:border-rose-500/30"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Recent System Audits */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-rose-400" />
                      <span>Recent Cryptographic Audit Records</span>
                    </h3>
                    <button
                      onClick={() => setActiveSection("audit")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                    >
                      <span>View All</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {auditLogs.slice(0, 4).map((log) => (
                      <div
                        key={log._id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="font-semibold text-slate-200">{log.user_name || log.officerName || "SYSTEM"}</span>
                            <span className="text-slate-400">({log.user_role || log.officerRole || "SYSTEM"})</span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-indigo-300 border border-slate-800 text-[10px]">
                              {log.action || log.actionType}
                            </span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-1">{log.details}</p>
                          <span className="font-mono text-[10px] text-slate-400 block mt-1">
                            Digest: {log.digital_hash?.slice(0, 24)}...
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= 2. ACCESS REQUESTS ================= */}
          {activeSection === "requests" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Officer Access Clearance Requests
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Approve or reject incoming investigative officer registration requests.
                </p>
              </div>

              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req._id}
                    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-bold text-sm text-slate-100">{req.full_name}</h3>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                            req.status === "PENDING"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : req.status === "APPROVED"
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          }`}
                        >
                          {req.status}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-indigo-300 border border-slate-800 font-semibold">
                          Role: {req.requested_role}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                        <span>Badge: <strong className="text-slate-300 font-mono">{req.official_id}</strong></span>
                        <span>Email: <strong className="text-slate-300 font-mono">{req.official_email}</strong></span>
                        <span>Agency: <strong className="text-slate-300">{req.agency}</strong></span>
                        <span>Dept: <strong className="text-slate-300">{req.department}</strong></span>
                      </div>

                      <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                        <strong className="text-slate-300">Justification:</strong> {req.reason_for_access}
                      </p>

                      <div className="text-[11px] font-mono text-slate-400">
                        Submitted: {new Date(req.submitted_at).toLocaleString()}
                        {req.reviewed_by && ` • Reviewed by ${req.reviewed_by} on ${new Date(req.reviewed_at || "").toLocaleString()}`}
                      </div>
                    </div>

                    {req.status === "PENDING" && (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-700">
                          <span className="text-[10px] text-slate-400 font-semibold px-2">Assign:</span>
                          <select
                            value={assignedRolesMap[req._id] || req.requested_role}
                            onChange={(e) =>
                              setAssignedRolesMap((prev) => ({
                                ...prev,
                                [req._id]: e.target.value as "LEAD_INVESTIGATOR" | "FORENSIC_INVESTIGATOR" | "INVESTIGATOR",
                              }))
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-semibold focus:outline-none"
                          >
                            <option value="LEAD_INVESTIGATOR">LEAD_INVESTIGATOR</option>
                            <option value="FORENSIC_INVESTIGATOR">FORENSIC_INVESTIGATOR</option>
                            <option value="INVESTIGATOR">INVESTIGATOR</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApproveRequest(req._id, assignedRolesMap[req._id] || req.requested_role)}
                            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectRequest(req._id)}
                            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-all border border-slate-700 hover:border-rose-500/30 active:scale-95"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Sub-section: Case-Specific Access Requests */}
              <div className="pt-6 border-t border-slate-800 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span>Case Operation Access Requests ({caseRequests.length})</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Requests by authorized personnel to access specific investigation workspaces.
                  </p>
                </div>

                <div className="space-y-3">
                  {caseRequests.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
                      No case workspace access requests lodged at this time.
                    </div>
                  ) : (
                    caseRequests.map((cr) => (
                      <div
                        key={cr._id}
                        className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold">
                              {cr.case_code}
                            </span>
                            <h4 className="font-bold text-sm text-slate-100">{cr.case_name}</h4>
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                cr.status === "PENDING"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : cr.status === "APPROVED"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                              }`}
                            >
                              {cr.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                            <span>Officer: <strong className="text-slate-200">{cr.user_name}</strong></span>
                            <span>Badge: <strong className="text-slate-300 font-mono">{cr.official_id}</strong></span>
                            <span>Role: <strong className="text-amber-400 font-mono">{cr.user_role}</strong></span>
                            <span>Agency: <strong className="text-slate-300">{cr.agency}</strong></span>
                          </div>

                          <p className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                            <strong className="text-slate-400">Operational Justification:</strong> {cr.reason_for_access}
                          </p>

                          <div className="text-[11px] font-mono text-slate-400">
                            Requested: {new Date(cr.requested_at).toLocaleString()}
                            {cr.reviewed_by && ` • Reviewed by ${cr.reviewed_by} on ${new Date(cr.reviewed_at || "").toLocaleString()}`}
                          </div>
                        </div>

                        {cr.status === "PENDING" && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleApproveCaseRequest(cr._id)}
                              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
                            >
                              Grant Case Access
                            </button>
                            <button
                              onClick={() => handleRejectCaseRequest(cr._id)}
                              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-all border border-slate-700 hover:border-rose-500/30 active:scale-95"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= 3. USERS & CLEARANCE ================= */}
          {activeSection === "users" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  User Clearance & Authorization Directory
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Manage active officer profiles, suspension, and authorization levels.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                      <tr>
                        <th className="py-3.5 px-4">Officer Name & ID</th>
                        <th className="py-3.5 px-4">Agency & Dept</th>
                        <th className="py-3.5 px-4">Role</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Last Activity</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {users.map((u) => (
                        <tr key={u._id} className="hover:bg-slate-850/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-100">{u.name}</div>
                            <div className="font-mono text-[11px] text-slate-400">{u.official_id} • {u.email}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-slate-300">{u.agency}</div>
                            <div className="text-slate-400 text-[11px]">{u.designation}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                                u.role === "ADMIN"
                                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                                  : u.role === "LEAD_INVESTIGATOR"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                                u.status === "ACTIVE"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : u.status === "PENDING"
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-rose-500/20 text-rose-400"
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                            {u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {u.role !== "ADMIN" && (
                              <div className="flex items-center justify-end gap-1.5">
                                {u.status === "ACTIVE" ? (
                                  <button
                                    onClick={() => handleStatusChange(u._id, "SUSPENDED")}
                                    className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold"
                                  >
                                    Suspend
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleStatusChange(u._id, "ACTIVE")}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold"
                                  >
                                    Activate
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= 4. CASE MEMBERSHIP GOVERNANCE ================= */}
          {activeSection === "case_access" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Case Assignment & Multi-Officer Membership
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Assign Lead and Forensic Investigators to specific interdiction operations.
                </p>
              </div>

              {/* Case Picker & Add Member Row */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Select Target Case / Operation:
                    </label>
                    <select
                      value={selectedCaseId}
                      onChange={(e) => handleCaseChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-amber-400 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {cases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.codeName} • {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Assign New Investigator to Case:
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedUserToAssign}
                        onChange={(e) => setSelectedUserToAssign(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Select an active officer...</option>
                        {users
                          .filter((u) => u.status === "ACTIVE" && u.role !== "ADMIN")
                          .filter((u) => !caseMembers.some((m) => m.user_id === u._id))
                          .map((u) => (
                            <option key={u._id} value={u._id}>
                              {u.name} ({u.role} - {u.agency})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleAssignMember}
                        disabled={!selectedUserToAssign}
                        className="px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Assign</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Members Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Assigned SIT Personnel ({caseMembers.length})
                  </h3>
                  <span className="font-mono text-[10px] text-slate-400">
                    Operation: {selectedCaseId}
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {caseMembers.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No investigators currently assigned to this case.
                    </div>
                  ) : (
                    caseMembers.map((m) => (
                      <div
                        key={m._id}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-slate-850/40 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-100">{m.user_name}</span>
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.2 rounded border ${
                                m.role === "LEAD_INVESTIGATOR"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              }`}
                            >
                              {m.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {m.official_id} • {m.agency}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-1">
                            Assigned on: {new Date(m.assigned_at).toLocaleDateString()}
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveMember(m.user_id)}
                          className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1 transition-all"
                          title="Revoke Case Access"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Revoke Access</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= 5. SYSTEM AUDIT TRAIL ================= */}
          {activeSection === "audit" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Cryptographic System-Wide Audit Log
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Immutable forensic audit trail compliant with Section 65B Indian Evidence Act.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-800">
                  {auditLogs.map((log) => (
                    <div key={log._id} className="p-4 hover:bg-slate-850/40 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-100">{log.user_name || log.officerName || "SYSTEM"}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-amber-400 border border-slate-800">
                            {log.user_role || log.officerRole || "SYSTEM"}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {log.action || log.actionType}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mb-1">{log.details}</p>
                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                        <span>Fingerprint: <strong className="text-slate-400">{log.digital_hash || log.digitalHash}</strong></span>
                        {log.case_id && <span>Case: {log.case_id}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= 6. ALL CASES OVERVIEW ================= */}
          {activeSection === "cases" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Registered Criminal Interdiction Operations
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Overview of all active multi-agency investigations.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cases.map((c) => (
                  <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 uppercase">
                          {c.codeName}
                        </span>
                        <h3 className="font-bold text-sm text-slate-100 mt-2">{c.name}</h3>
                      </div>
                      <span className="text-xs font-mono text-slate-400">{c.date}</span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                      {c.description}
                    </p>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <span>Agency: <strong className="text-slate-300">{c.leadAgency}</strong></span>
                      <button
                        onClick={() => {
                          setSelectedCaseId(c.id);
                          setActiveSection("case_access");
                        }}
                        className="text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Manage Team →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
