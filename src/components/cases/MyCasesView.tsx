import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { caseApi } from "../../services/api";
import { CaseDataset } from "../../types";
import { RequestCaseAccessModal } from "./RequestCaseAccessModal";
import {
  Shield,
  FolderGit2,
  Lock,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  Users,
  FileText,
  Building,
  Calendar,
  LogOut,
  Sparkles,
  AlertTriangle,
  Layers,
  ChevronRight,
  Search,
} from "lucide-react";

interface MyCasesViewProps {
  onSelectCase: (caseDataset: CaseDataset) => void;
  allSystemCases: CaseDataset[];
  onCreateNewCase?: () => void;
  onClose?: () => void;
  activeCaseId?: string;
}

export const MyCasesView: React.FC<MyCasesViewProps> = ({
  onSelectCase,
  allSystemCases,
  onCreateNewCase,
  onClose,
  activeCaseId,
}) => {
  const { user, logout, refreshAuthorizedCases } = useAuth();

  const [availableCases, setAvailableCases] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [preselectedCaseId, setPreselectedCaseId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [availRes, reqRes] = await Promise.all([
        caseApi.getAvailableCases(),
        caseApi.getMyAccessRequests(),
      ]);
      setAvailableCases(availRes.cases || []);
      setMyRequests(reqRes.requests || []);
      await refreshAuthorizedCases();
    } catch (err: any) {
      setError(err.message || "Failed to load case workspaces.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenRequestModal = (caseId?: string) => {
    setPreselectedCaseId(caseId);
    setIsRequestModalOpen(true);
  };

  const handleOpenCase = (caseId: string) => {
    // Find matching case dataset from allSystemCases or construct it
    const targetCase = allSystemCases.find((c) => c.id === caseId);
    if (targetCase) {
      onSelectCase(targetCase);
    } else {
      // Fallback
      const avail = availableCases.find((c) => c.id === caseId);
      if (avail) {
        onSelectCase({
          id: avail.id,
          name: avail.name,
          codeName: avail.codeName,
          description: avail.description,
          date: avail.date,
          leadAgency: avail.leadAgency,
          nodes: [],
          links: [],
          firs: [],
          cdrs: [],
          financials: [],
          intels: [],
          evidenceFiles: [],
          hypotheses: [],
          auditLogs: [],
        });
      }
    }
  };

  const authorizedList = availableCases.filter((c) => c.hasAccess);
  const otherCasesList = availableCases.filter((c) => !c.hasAccess);

  const filteredAuthorized = authorizedList.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.codeName.toLowerCase().includes(q) ||
      c.leadAgency.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Command Bar */}
      <header className="h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider text-amber-400">
                CRIM-INTEL OS
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono border border-amber-500/20">
                v4.2 SECURE
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight">
              Case Workspaces & Membership Console
            </h1>
          </div>
        </div>

        {/* Right: Officer Profile & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end text-right">
            <div className="text-xs font-bold text-slate-200 font-mono">{user?.name}</div>
            <div className="text-[10px] text-slate-400 font-mono">
              Badge: <span className="text-amber-400">{user?.official_id}</span> | {user?.agency}
            </div>
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
              user?.role === "LEAD_INVESTIGATOR"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : user?.role === "FORENSIC_INVESTIGATOR"
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                : "bg-purple-500/10 text-purple-400 border-purple-500/30"
            }`}
          >
            {user?.role === "LEAD_INVESTIGATOR"
              ? "LEAD IO"
              : user?.role === "FORENSIC_INVESTIGATOR"
              ? "FORENSIC"
              : "ADMIN"}
          </div>

          {onCreateNewCase && (
            <button
              onClick={onCreateNewCase}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10 active:scale-95"
              title="Create New Case Operation"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>+ New Case</span>
            </button>
          )}

          <button
            onClick={() => handleOpenRequestModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3] text-amber-400" />
            <span className="hidden sm:inline">Request Case Access</span>
            <span className="sm:hidden">Request</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              <span>Back to Case</span>
            </button>
          )}

          <button
            onClick={logout}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Section 1: Authorized Cases */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-slate-100 font-mono tracking-wide">
                  MY AUTHORIZED CASES
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-amber-400">
                  {authorizedList.length}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Shared investigation workspaces where you hold active security clearance
              </p>
            </div>

            {/* Search Filter */}
            {authorizedList.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter cases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-56 rounded-2xl bg-slate-900/60 border border-slate-800/80 animate-pulse p-5"
                />
              ))}
            </div>
          ) : filteredAuthorized.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-2xl bg-slate-900/50 border border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-sm font-bold text-slate-200 font-mono">
                  No Active Case Clearance
                </h3>
                <p className="text-xs text-slate-400 mt-1.5">
                  Your officer account is active, but you have not yet been granted membership to any
                  case workspaces. Request access to begin contributing evidence or conducting
                  investigations.
                </p>
              </div>
              <button
                onClick={() => handleOpenRequestModal()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Request Case Access</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredAuthorized.map((c) => (
                <div
                  key={c.id}
                  className="group relative rounded-2xl bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition-all p-5 flex flex-col justify-between shadow-lg hover:shadow-amber-500/5"
                >
                  <div className="space-y-3">
                    {/* Top Row: Code and Role */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold tracking-wider">
                        {c.codeName}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          c.userRoleInCase === "LEAD_INVESTIGATOR" || c.userRole === "LEAD_INVESTIGATOR"
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                            : c.userRoleInCase === "FORENSIC_INVESTIGATOR" || c.userRole === "FORENSIC_INVESTIGATOR"
                            ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                            : "bg-purple-500/10 text-purple-300 border-purple-500/20"
                        }`}
                      >
                        {c.userRoleInCase === "LEAD_INVESTIGATOR" || c.userRole === "LEAD_INVESTIGATOR"
                          ? "LEAD IO"
                          : c.userRoleInCase === "FORENSIC_INVESTIGATOR" || c.userRole === "FORENSIC_INVESTIGATOR"
                          ? "FORENSIC"
                          : "ADMIN"}
                      </span>
                    </div>

                    {/* Case Title & Agency */}
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2">
                        {c.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                        <Building className="w-3 h-3 text-slate-500" />
                        <span className="truncate">{c.leadAgency}</span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {c.description}
                    </p>
                  </div>

                  {/* Footer: Metadata + Open Button */}
                  <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <div className="flex items-center gap-1.5" title="Active Case Members">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>{c.memberCount || 1} Members</span>
                      </div>
                      <div className="flex items-center gap-1.5" title="Evidence Exhibits">
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{c.evidenceCount || 0} Exhibits</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Calendar className="w-3 h-3" />
                        <span>{c.date}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenCase(c.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-amber-500 group-hover:bg-gradient-to-r group-hover:from-amber-500 group-hover:to-amber-600 text-slate-300 group-hover:text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
                    >
                      <span>Open Case Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Pending Case Access Requests */}
        {myRequests.length > 0 && (
          <section className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-wide">
                MY PENDING CASE ACCESS REQUESTS
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-amber-400">
                {myRequests.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myRequests.map((req) => (
                <div
                  key={req._id}
                  className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {req.case_code}
                      </span>
                      <h4 className="text-xs font-bold text-slate-200 mt-0.5">{req.case_name}</h4>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                        req.status === "PENDING"
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                          : req.status === "APPROVED"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60 italic">
                    "{req.reason_for_access}"
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Requested: {new Date(req.requested_at).toLocaleDateString()}</span>
                    <span>Role: {req.user_role}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 3: Available System Operations Directory */}
        {otherCasesList.length > 0 && (
          <section className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-slate-400" />
                  <h2 className="text-base font-bold text-slate-100 font-mono tracking-wide">
                    OTHER REGISTERED CASE OPERATIONS
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Operations currently active in the secure precinct network
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherCasesList.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-slate-400">{c.codeName}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {c.memberCount} Members
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-300">{c.name}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{c.description}</p>
                  </div>

                  {c.hasPendingRequest ? (
                    <div className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Pending Admin Approval</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleOpenRequestModal(c.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-xs font-semibold transition-colors border border-slate-700/60"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Request Case Access</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Request Case Access Modal */}
      <RequestCaseAccessModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={loadData}
        preselectedCaseId={preselectedCaseId}
        availableCases={availableCases}
      />
    </div>
  );
};
