import React, { useState } from "react";
import {
  SuspiciousPattern,
  CrimeNetworkNode,
  CrimeNetworkLink,
  SyndicateCommunity,
  ShortestPathResult,
  AuditLogEntry,
} from "../types";
import { PathFinder } from "./PathFinder";
import { InvestigativePlaybook } from "./InvestigativePlaybook";
import { InvestigativeStep } from "../services/actionableIntelEngine";
import {
  Flame,
  ShieldAlert,
  Smartphone,
  Landmark,
  MapPin,
  Crown,
  Radio,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Search,
} from "lucide-react";

interface PatternAlertsProps {
  patterns: SuspiciousPattern[];
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  communities: SyndicateCommunity[];
  cutVertices: string[];
  caseId: string;
  auditLogs: AuditLogEntry[];
  onSelectPattern: (pattern: SuspiciousPattern) => void;
  onFocusNode: (node: CrimeNetworkNode) => void;
  onSelectNode: (node: CrimeNetworkNode) => void;
  onSetShortestPath: (path: ShortestPathResult | null) => void;
  onRecordAction: (step: InvestigativeStep) => void;
  onSwitchToGraph: () => void;
}

export const PatternAlerts: React.FC<PatternAlertsProps> = ({
  patterns,
  nodes,
  links,
  communities,
  cutVertices,
  caseId,
  auditLogs,
  onSelectPattern,
  onFocusNode,
  onSelectNode,
  onSetShortestPath,
  onRecordAction,
  onSwitchToGraph,
}) => {
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "CRITICAL" | "HIGH" | "MEDIUM">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPatterns = patterns.filter((p) => {
    if (severityFilter !== "ALL" && p.severity !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.actionableLead.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getPatternIcon = (type: string) => {
    switch (type) {
      case "BURNER_SWAP":
        return <Smartphone className="w-5 h-5 text-sky-400" />;
      case "HAWALA_LAYERING":
        return <Landmark className="w-5 h-5 text-emerald-400" />;
      case "GEO_CONVERGENCE":
        return <MapPin className="w-5 h-5 text-purple-400" />;
      case "KINGPIN_SHIELD":
        return <Crown className="w-5 h-5 text-amber-400" />;
      default:
        return <Radio className="w-5 h-5 text-rose-400" />;
    }
  };

  const getSeverityBadge = (sev: string) => {
    if (sev === "CRITICAL") {
      return (
        <span className="badge badge-error">
          <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
          CRITICAL ALERT
        </span>
      );
    }
    if (sev === "HIGH") {
      return (
        <span className="badge badge-amber">
          HIGH PRIORITY
        </span>
      );
    }
    return (
      <span className="badge badge-sky">
        MODERATE
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-error-container/30 rounded-xl text-error border border-error/20">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
              Automated Suspicious Pattern Detection Center
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Machine-driven discovery of burner phone swapping, Hawala money layering, geo-convergence, and kingpin shielding.
            </p>
          </div>
        </div>

        {/* Severity Filters */}
        <div className="flex items-center gap-2 bg-surface-container-lowest/80 p-1.5 rounded-xl border border-white/5 text-xs shadow-inner">
          <button
            onClick={() => setSeverityFilter("ALL")}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${severityFilter === "ALL" ? "bg-surface-container-high text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            All ({patterns.length})
          </button>
          <button
            onClick={() => setSeverityFilter("CRITICAL")}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${severityFilter === "CRITICAL" ? "bg-error-container text-on-error-container shadow-sm" : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            Critical
          </button>
          <button
            onClick={() => setSeverityFilter("HIGH")}
            className={`px-3 py-1 rounded-lg font-bold transition-all ${severityFilter === "HIGH" ? "bg-primary-container text-on-primary-container shadow-sm" : "text-on-surface-variant hover:text-on-surface"
              }`}
          >
            High
          </button>
        </div>
      </div>

      {/* Pattern Alert Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredPatterns.map((pattern) => (
          <div
            key={pattern.id}
            className="card-hover p-5 flex flex-col justify-between group"
          >
            <div>
              {/* Card Top */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-surface-container-highest rounded-xl border border-white/5 shadow-inner">
                    {getPatternIcon(pattern.type)}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                      {pattern.title}
                    </h3>
                    <span className="text-[10px] font-mono text-on-surface-variant/70 uppercase">
                      PATTERN ID: {pattern.id}
                    </span>
                  </div>
                </div>
                {getSeverityBadge(pattern.severity)}
              </div>

              {/* Description */}
              <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
                {pattern.description}
              </p>

              {/* Involved Entities Pill list */}
              {pattern.involvedNodeIds.length > 0 && (
                <div className="mb-5">
                  <span className="text-[11px] font-semibold text-on-surface-variant block mb-2">
                    Involved Suspects / Terminals:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {pattern.involvedNodeIds.map((nodeId) => {
                      const matchedNode = nodes.find((n) => n.id === nodeId);
                      return (
                        <button
                          key={nodeId}
                          onClick={() => matchedNode && onFocusNode(matchedNode)}
                          className="px-2.5 py-1 bg-surface-container hover:bg-surface-container-highest border border-white/5 hover:border-primary/50 rounded-lg text-[11px] font-mono text-on-surface hover:text-primary transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <span>{matchedNode?.label || nodeId}</span>
                          <ArrowUpRight className="w-3 h-3 opacity-50" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actionable Intelligence Lead Box */}
              <div className="bg-surface-container-lowest border border-primary/20 rounded-xl p-3.5 text-xs shadow-inner">
                <span className="font-bold text-primary flex items-center gap-1.5 mb-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Actionable Tactical Lead for Investigators:
                </span>
                <p className="text-on-surface-variant font-medium leading-normal">
                  {pattern.actionableLead}
                </p>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-on-surface-variant font-mono uppercase tracking-wider">
                Detected: {new Date(pattern.detectedAt).toLocaleTimeString()}
              </span>

              <button
                onClick={() => {
                  onSelectPattern(pattern);
                  onSwitchToGraph();
                }}
                className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1 text-primary border-primary/20 hover:border-primary/50"
              >
                <span>Isolate & View on Canvas</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Intermediary Link & Money Mule Path Finder */}
      <PathFinder
        nodes={nodes}
        links={links}
        onSelectNode={onSelectNode}
        onSetShortestPath={onSetShortestPath}
        onSwitchToGraph={onSwitchToGraph}
      />

      {/* Investigative Playbook — prioritized legal directives */}
      <InvestigativePlaybook
        caseId={caseId}
        nodes={nodes}
        links={links}
        patterns={patterns}
        communities={communities}
        cutVertices={cutVertices}
        auditLogs={auditLogs}
        onRecordAction={onRecordAction}
      />
    </div>
  );
};
