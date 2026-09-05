import React, { useState, useMemo } from "react";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SyndicateCommunity,
  ShortestPathResult,
  SuspiciousPattern,
  AuditLogEntry,
} from "../types";
import { findShortestPath } from "../services/graphEngine";
import { generatePlaybook, playbookSummary, InvestigativeStep } from "../services/actionableIntelEngine";
import {
  Crown,
  Share2,
  Scissors,
  Users,
  ShieldAlert,
  Search,
  ArrowRight,
  TrendingUp,
  Award,
  AlertTriangle,
  FileCheck,
  Gavel,
  ClipboardCheck,
  CheckCircle2,
} from "lucide-react";

interface AnalyticsDashboardProps {
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  communities: SyndicateCommunity[];
  cutVertices: string[];
  onSelectNode: (node: CrimeNetworkNode) => void;
  onSetShortestPath: (path: ShortestPathResult | null) => void;
  onSwitchToGraph: () => void;
  patterns?: SuspiciousPattern[];
  caseId?: string;
  auditLogs?: AuditLogEntry[];
  onRecordAction?: (step: InvestigativeStep) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  nodes,
  links,
  communities,
  cutVertices,
  onSelectNode,
  onSetShortestPath,
  onSwitchToGraph,
  patterns = [],
  caseId = "case",
  auditLogs = [],
  onRecordAction,
}) => {
  const [sourceSuspectId, setSourceSuspectId] = useState<string>("");
  const [targetSuspectId, setTargetSuspectId] = useState<string>("");
  const [trailPreference, setTrailPreference] = useState<"ALL" | "HAWALA_FINANCIAL" | "TELECOM_CDR">("ALL");
  const [pathResult, setPathResult] = useState<ShortestPathResult | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"betweenness" | "degree" | "pageRank" | "riskScore">("betweenness");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "IMMEDIATE" | "HIGH" | "MEDIUM" | "LOW">("ALL");

  const playbookSteps = useMemo(
    () =>
      generatePlaybook({
        caseId,
        nodes,
        links,
        patterns,
        communities,
        cutVertices,
        recentAuditLogs: auditLogs,
      }),
    [caseId, nodes, links, patterns, communities, cutVertices, auditLogs]
  );

  const visibleSteps = useMemo(
    () => (priorityFilter === "ALL" ? playbookSteps : playbookSteps.filter((s) => s.priority === priorityFilter)),
    [playbookSteps, priorityFilter]
  );

  // Sorted list of nodes by chosen centrality metric
  const sortedInfluencers = [...nodes].sort((a, b) => {
    if (sortBy === "betweenness") return (b.betweenness || 0) - (a.betweenness || 0);
    if (sortBy === "degree") return (b.degree || 0) - (a.degree || 0);
    if (sortBy === "pageRank") return (b.pageRank || 0) - (a.pageRank || 0);
    return b.riskScore - a.riskScore;
  });

  const handleCalculatePath = () => {
    if (!sourceSuspectId || !targetSuspectId) return;
    setPathError(null);
    const res = findShortestPath(sourceSuspectId, targetSuspectId, nodes, links, trailPreference);
    if (!res) {
      setPathError("No connected intermediary route was found between the selected entities under current constraints.");
      setPathResult(null);
      onSetShortestPath(null);
      return;
    }
    setPathResult(res);
    onSetShortestPath(res);
  };

  const handleClearPath = () => {
    setPathResult(null);
    setPathError(null);
    onSetShortestPath(null);
  };

  const handleQuickSelect = (srcId: string, tgtId: string, mode: "ALL" | "HAWALA_FINANCIAL" | "TELECOM_CDR" = "ALL") => {
    setSourceSuspectId(srcId);
    setTargetSuspectId(tgtId);
    setTrailPreference(mode);
    setPathError(null);
    const res = findShortestPath(srcId, tgtId, nodes, links, mode);
    setPathResult(res);
    onSetShortestPath(res);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Identified Kingpins</span>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Crown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100">
              {nodes.filter((n) => n.isKingpinCandidate).length}
            </span>
            <span className="text-xs text-amber-400 font-medium">High Betweenness Centrality</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Syndicate Factions</span>
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100">{communities.length}</span>
            <span className="text-xs text-indigo-400 font-medium">Louvain Modularity Clusters</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Critical Cut-Vertices</span>
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400">
              <Scissors className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400">{cutVertices.length}</span>
            <span className="text-xs text-rose-400/80 font-medium">Single Points of Failure</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Network Density</span>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100">
              {nodes.length > 1 ? ((2 * links.length) / (nodes.length * (nodes.length - 1))).toFixed(3) : "0.00"}
            </span>
            <span className="text-xs text-emerald-400 font-medium">Clustered Operations</span>
          </div>
        </div>
      </div>

      {/* Intermediary Path Finder (Shortest Path & Money Mule Conduits) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Intermediary Link & Money Mule Path Finder
              </h2>
              <p className="text-xs text-slate-400">
                Trace shortest communication links, hawala transfers, and proxy messengers connecting any two suspects.
              </p>
            </div>
          </div>

          {/* Trail Preference Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => {
                setTrailPreference("ALL");
                if (sourceSuspectId && targetSuspectId) {
                  const res = findShortestPath(sourceSuspectId, targetSuspectId, nodes, links, "ALL");
                  setPathResult(res);
                  onSetShortestPath(res);
                }
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                trailPreference === "ALL"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Relational
            </button>
            <button
              onClick={() => {
                setTrailPreference("HAWALA_FINANCIAL");
                if (sourceSuspectId && targetSuspectId) {
                  const res = findShortestPath(sourceSuspectId, targetSuspectId, nodes, links, "HAWALA_FINANCIAL");
                  setPathResult(res);
                  onSetShortestPath(res);
                }
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                trailPreference === "HAWALA_FINANCIAL"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Hawala / Money Trail
            </button>
            <button
              onClick={() => {
                setTrailPreference("TELECOM_CDR");
                if (sourceSuspectId && targetSuspectId) {
                  const res = findShortestPath(sourceSuspectId, targetSuspectId, nodes, links, "TELECOM_CDR");
                  setPathResult(res);
                  onSetShortestPath(res);
                }
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                trailPreference === "TELECOM_CDR"
                  ? "bg-amber-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Telecom / CDR Bridge
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Suspect A (Origin):</label>
            <select
              value={sourceSuspectId}
              onChange={(e) => setSourceSuspectId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            >
              <option value="">-- Select Origin Entity --</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label} ({n.role || n.type})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 flex justify-center pt-4">
            <ArrowRight className="w-5 h-5 text-slate-600 hidden sm:block" />
          </div>

          <div className="sm:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Suspect B (Target):</label>
            <select
              value={targetSuspectId}
              onChange={(e) => setTargetSuspectId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            >
              <option value="">-- Select Target Entity --</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label} ({n.role || n.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick presets for rapid investigation */}
        {nodes.length >= 2 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500">Quick Test Pairs:</span>
            {nodes.slice(0, 3).map((n1, idx) => {
              const n2 = nodes[(idx + 2) % nodes.length];
              if (!n2 || n1.id === n2.id) return null;
              return (
                <button
                  key={`${n1.id}-${n2.id}`}
                  onClick={() => handleQuickSelect(n1.id, n2.id, trailPreference)}
                  className="px-2 py-0.5 bg-slate-800/80 hover:bg-slate-800 text-[11px] text-slate-300 rounded border border-slate-700"
                >
                  {n1.label} ➔ {n2.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleCalculatePath}
            disabled={!sourceSuspectId || !targetSuspectId}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow"
          >
            <Search className="w-4 h-4" />
            <span>Discover Intermediary Path</span>
          </button>

          {pathResult && (
            <button
              onClick={handleClearPath}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 rounded border border-slate-700"
            >
              Clear
            </button>
          )}
        </div>

        {/* Path Error Box */}
        {pathError && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{pathError}</span>
          </div>
        )}

        {/* Path Result Box */}
        {pathResult && (
          <div className="mt-4 p-4 bg-slate-950 border border-amber-500/40 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4" />
                Intermediary Chain ({pathResult.totalHops} Hops) &bull; {pathResult.trailType || "Relational"}
              </span>
              <button
                onClick={onSwitchToGraph}
                className="text-xs text-amber-400 hover:text-amber-300 hover:underline font-semibold flex items-center gap-1"
              >
                Highlight on Canvas →
              </button>
            </div>
            <p className="text-xs text-slate-300">{pathResult.summary}</p>
            
            {/* Visual Node Flow */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {pathResult.path.map((nodeId, idx) => {
                const node = nodes.find((n) => n.id === nodeId);
                return (
                  <React.Fragment key={nodeId}>
                    <button
                      onClick={() => node && onSelectNode(node)}
                      className="px-2.5 py-1 bg-slate-900 border border-slate-700 hover:border-amber-500 rounded text-xs text-slate-200 font-mono font-medium hover:text-amber-300 transition-colors"
                    >
                      {node?.label || nodeId}
                      <span className="ml-1 text-[10px] text-slate-500">[{node?.role || node?.type}]</span>
                    </button>
                    {idx < pathResult.path.length - 1 && (
                      <ArrowRight className="w-3.5 h-3.5 text-amber-500/70" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Step-by-step breakdown */}
            {pathResult.steps && pathResult.steps.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Conduit Breakdown:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pathResult.steps.map((step, sIdx) => (
                    <div key={sIdx} className="p-2 rounded bg-slate-900/90 border border-slate-800 text-xs">
                      <div className="flex items-center justify-between text-slate-300 font-medium">
                        <span className="text-amber-400 font-mono">Step {sIdx + 1}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {step.relationType}
                        </span>
                      </div>
                      <div className="text-slate-300 mt-1 text-[11px]">
                        {step.fromLabel} ➔ <span className="text-amber-300">{step.toLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Investigative Playbook: Prioritized Legal Directives */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Investigative Playbook — Prioritized Legal Directives
              </h2>
              <p className="text-xs text-slate-400">
                Deterministic rules over graph analytics. {playbookSummary(playbookSteps)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            {(["ALL", "IMMEDIATE", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  priorityFilter === p
                    ? "bg-amber-500 text-slate-950 font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {p === "ALL" ? "All" : p.charAt(0) + p.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {visibleSteps.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
            No playbook steps match this filter. The network shows no actionable gaps under current constraints.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleSteps.map((step, idx) => (
              <div
                key={step.id}
                className={`p-4 rounded-xl border space-y-2.5 ${
                  step.completed
                    ? "bg-slate-950/60 border-emerald-500/30"
                    : step.priority === "IMMEDIATE"
                    ? "bg-rose-500/5 border-rose-500/30"
                    : step.priority === "HIGH"
                    ? "bg-amber-500/5 border-amber-500/30"
                    : "bg-slate-950 border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${
                      step.completed
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    }`}>
                      {step.completed ? <CheckCircle2 className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-100">
                          {idx + 1}. {step.title}
                        </span>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          step.priority === "IMMEDIATE" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                          step.priority === "HIGH" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                          step.priority === "MEDIUM" ? "bg-sky-500/20 text-sky-300 border-sky-500/40" :
                          "bg-slate-700/40 text-slate-300 border-slate-600"
                        }`}>
                          {step.priority}
                        </span>
                        {step.completed && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            DONE{step.completedBy ? ` • ${step.completedBy}` : ""}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                  {!step.completed && onRecordAction && (
                    <button
                      onClick={() => onRecordAction(step)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors"
                    >
                      Mark Complete
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">Legal Basis</div>
                    <div className="font-bold text-slate-200">{step.legalBasis.statute}</div>
                    <div className="text-slate-400 mt-0.5">{step.legalBasis.provision}</div>
                    <div className="text-slate-500 mt-0.5 font-mono text-[10px]">Authority: {step.legalBasis.authority}</div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">Execution</div>
                    <div className="text-slate-300">Responsible: <strong>{step.responsibleRole}</strong></div>
                    <div className="text-slate-300">Deadline: <strong>+{step.deadlineDays} day(s)</strong></div>
                    <div className="text-rose-300 mt-1">Risk if delayed: {step.riskIfDelayed}</div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400">
                  <strong className="text-slate-300">Evidence to collect:</strong> {step.evidenceToCollect.join(" • ")}
                </div>
                <div className="text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2">
                  <strong>Expected outcome:</strong> {step.expectedOutcome}
                </div>
                {step.prerequisites.length > 0 && (
                  <div className="text-[10px] text-slate-500">
                    Prerequisites: {step.prerequisites.join(" • ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Section: Key Influencers & Kingpins Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100">
                Network Centrality & Key Influencers Ranking
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Rank suspects by structural influence, kingpin delegation metrics, and bottleneck bridges.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400 px-2 font-medium">Rank by:</span>
            <button
              onClick={() => setSortBy("betweenness")}
              className={`px-2.5 py-1 rounded font-medium ${
                sortBy === "betweenness" ? "bg-amber-500/20 text-amber-300 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Betweenness (Kingpin)
            </button>
            <button
              onClick={() => setSortBy("degree")}
              className={`px-2.5 py-1 rounded font-medium ${
                sortBy === "degree" ? "bg-amber-500/20 text-amber-300 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Degree (Hubs)
            </button>
            <button
              onClick={() => setSortBy("pageRank")}
              className={`px-2.5 py-1 rounded font-medium ${
                sortBy === "pageRank" ? "bg-amber-500/20 text-amber-300 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              PageRank
            </button>
            <button
              onClick={() => setSortBy("riskScore")}
              className={`px-2.5 py-1 rounded font-medium ${
                sortBy === "riskScore" ? "bg-amber-500/20 text-amber-300 font-semibold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Risk Score
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Rank</th>
                <th className="px-5 py-3">Entity Name</th>
                <th className="px-5 py-3">Role / Classification</th>
                <th className="px-5 py-3">Betweenness</th>
                <th className="px-5 py-3">Degree</th>
                <th className="px-5 py-3">PageRank</th>
                <th className="px-5 py-3">Risk Gauge</th>
                <th className="px-5 py-3">Vulnerability</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedInfluencers.map((node, index) => {
                const isCut = cutVertices.includes(node.id);
                return (
                  <tr
                    key={node.id}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    onClick={() => onSelectNode(node)}
                  >
                    <td className="px-5 py-3.5 font-mono text-slate-500 font-semibold">
                      #{index + 1}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 group-hover:text-amber-400 transition-colors">
                          {node.label}
                        </span>
                        {node.isKingpinCandidate && (
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] rounded font-mono font-bold flex items-center gap-1">
                            <Crown className="w-2.5 h-2.5" /> KINGPIN
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">
                      <span>{node.role || node.type}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-200">
                      <span className="font-semibold text-amber-400">{node.betweenness || "0.000"}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-300">
                      {node.degree || 0} links
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-300">
                      {node.pageRank || "0.000"}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              node.riskScore >= 85
                                ? "bg-rose-500"
                                : node.riskScore >= 70
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                            style={{ width: `${node.riskScore}%` }}
                          ></div>
                        </div>
                        <span className="font-mono text-slate-300 font-bold">{node.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {isCut ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 font-semibold font-mono">
                          <Scissors className="w-3 h-3" /> CUT VERTEX
                        </span>
                      ) : (
                        <span className="text-slate-600 font-mono text-[10px]">Redundant</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(node);
                        }}
                        className="text-amber-400 hover:text-amber-300 font-semibold text-xs underline"
                      >
                        Inspect Dossier
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Syndicate Factions / Sub-Communities Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-slate-100">
            Syndicate Sub-Factions & Functional Cells (Louvain Modularity)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {communities.map((comm) => {
            const leaderNode = nodes.find((n) => n.id === comm.keyLeaderId);
            return (
              <div
                key={comm.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: comm.color }}
                  ></span>
                  <span className="text-[10px] font-mono font-bold bg-slate-900 px-2 py-0.5 rounded text-slate-400">
                    {comm.nodeIds.length} ENTITIES
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100">{comm.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{comm.role}</p>

                {leaderNode && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Key Coordinator:</span>
                    <button
                      onClick={() => onSelectNode(leaderNode)}
                      className="text-xs font-semibold text-amber-400 hover:underline"
                    >
                      {leaderNode.label}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
