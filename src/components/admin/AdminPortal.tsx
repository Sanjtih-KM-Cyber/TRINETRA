import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import { UserAccount, AccessRequest } from "../../types";
import { USER_ROLES, tenureKey } from "../../data/roles";
import { MigrationPanel } from "./MigrationPanel";
import { RegisterCaseInline, AssignLeadInline, StaffingRequisitions } from "./CaseAdminActions";
import {
  Shield,
  Users,
  UserCheck,
  FolderGit2,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  Fingerprint,
  Layers,
  ChevronRight,
  ArrowRightLeft,
} from "lucide-react";

export const AdminPortal: React.FC = () => {
  const { user, logout } = useAuth();
  // Changes.md Admin portal: Dashboard · Access Clearance · Cases · Migration Hub.
  const [activeSection, setActiveSection] = useState<
    "dashboard" | "requests" | "cases" | "migration"
  >("dashboard");

  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [caseRequests, setCaseRequests] = useState<any[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("case-garuda");
  const [caseFilter, setCaseFilter] = useState<"all" | "unassigned">("all");

  // Action status state
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignedRolesMap, setAssignedRolesMap] = useState<Record<string, string>>({});

  const loadData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [dashRes, reqsRes, caseReqsRes, usersRes, casesRes, reqRes] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getAccessRequests(),
        adminApi.getCaseAccessRequests(),
        adminApi.getUsers(),
        adminApi.getCases(),
        adminApi.getRequisitions().catch(() => ({ requisitions: [] })),
      ]);

      setMetrics(dashRes.metrics);
      setRequests(reqsRes.requests || []);
      setCaseRequests(caseReqsRes.requests || []);
      setUsers(usersRes.users || []);
      setCases(casesRes.cases || []);
      setRequisitions(reqRes.requisitions || []);

      if (casesRes.cases?.length > 0) {
        setSelectedCaseId(casesRes.cases[0].id);
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
    const assignedRole = assignedRolesMap[requestId] || requestedRole || "CBI_LEAD";
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
                TRINETRA OS • Administration Control Center
              </h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {user?.role || "ADMIN"}
                {(user as any)?.state ? ` · ${(user as any).state}` : ""}
              </span>
              {user && (
                <span
                  className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
                  style={{
                    borderColor: "color-mix(in srgb, var(--dept-accent) 45%, transparent)",
                    color: "var(--dept-accent)",
                  }}
                >
                  TENURE: {tenureKey(user.role, (user as any).state)}
                </span>
              )}
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

                <button
                  onClick={() => setActiveSection("migration")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeSection === "migration"
                      ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Handover & Migration</span>
                  </div>
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
              <div className="grid grid-cols-1 gap-6">
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
                                [req._id]: e.target.value,
                              }))
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-semibold focus:outline-none"
                          >
                            {USER_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
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

              <StaffingRequisitions
                requisitions={requisitions}
                onDecided={loadData}
                onNotice={(ok, text) => {
                  if (ok) {
                    setActionSuccess(text);
                    setActionError(null);
                  } else {
                    setActionError(text);
                    setActionSuccess(null);
                  }
                }}
              />

              {/* Sub-section: Locked accounts (wrong-OTP lockouts awaiting reactivation) */}
              <div className="pt-6 border-t border-slate-800 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-100">Locked Accounts ({users.filter((u) => u.status === "SUSPENDED").length})</h3>
                  <p className="text-xs text-slate-400">
                    Officers locked out by repeated wrong OTPs. Reactivate to restore login credentials.
                  </p>
                </div>
                {users.filter((u) => u.status === "SUSPENDED").length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
                    No locked accounts in your tenure.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {users.filter((u) => u.status === "SUSPENDED").map((u) => (
                      <div key={u._id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-100">{u.name}</div>
                          <div className="font-mono text-[11px] text-slate-400">{u.official_id} • {u.role}</div>
                        </div>
                        <button
                          onClick={() => handleStatusChange(u._id, "ACTIVE")}
                          className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold shrink-0"
                        >
                          Reactivate
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= 6. ALL CASES OVERVIEW ================= */}
          {/* ================= 6b. HANDOVER & MIGRATION (Phase 6 Req27/28) ================= */}
          {activeSection === "migration" && <MigrationPanel onChanged={loadData} />}

          {activeSection === "cases" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Registered Criminal Interdiction Operations
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Overview of all active multi-agency investigations. Transferred cases land in{" "}
                  <strong className="text-slate-200">Yet to be Assigned</strong> until a Lead Investigator is provisioned.
                </p>
              </div>

              <div className="flex gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 w-fit">
                {(["all", "unassigned"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setCaseFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      caseFilter === f ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f === "all" ? `All cases (${cases.length})` : `Yet to be Assigned (${cases.filter((c) => (c.leadCount || 0) === 0).length})`}
                  </button>
                ))}
              </div>

              <RegisterCaseInline onRegistered={loadData} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cases
                  .filter((c) => (caseFilter === "unassigned" ? (c.leadCount || 0) === 0 : true))
                  .map((c) => (
                  <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 uppercase">
                          {c.codeName}
                        </span>
                        {(c.leadCount || 0) === 0 && (
                          <span className="ml-1.5 font-mono text-[10px] font-bold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded border border-rose-500/40 uppercase">
                            Yet to be assigned
                          </span>
                        )}
                        <h3 className="font-bold text-sm text-slate-100 mt-2">{c.name}</h3>
                      </div>
                      <span className="text-xs font-mono text-slate-400">{c.date}</span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                      {c.description}
                    </p>

                    {(c.handover || c.migration || c.importedFrom) && (
                      <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/25 p-2.5 text-[11px] space-y-0.5">
                        <div className="text-slate-300">
                          <strong>Originating agency:</strong> {c.handover?.from || c.migration?.from || "Archive import"}
                        </div>
                        <div className="text-slate-400 font-mono text-[10px]">
                          {(c.handover || c.migration) && (
                            <>Memo/Order: {c.handover?.orderRef || c.migration?.orderRef}{c.handover?.reason ? ` — ${c.handover.reason}` : ""}</>
                          )}
                          {c.importedFrom && <>Imported from container {c.importedFrom}</>}
                        </div>
                      </div>
                    )}

                    <AssignLeadInline
                      caseId={c.id}
                      hasLead={(c.leadCount || 0) > 0}
                      leads={users.filter((u: any) => String(u.role).endsWith("_LEAD") && u.status === "ACTIVE")}
                      agency={c.leadAgency}
                      onAssigned={loadData}
                    />
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
