import React, { useState } from "react";
import { SuspiciousPattern, CrimeNetworkNode } from "../types";
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
  onSelectPattern: (pattern: SuspiciousPattern) => void;
  onFocusNode: (node: CrimeNetworkNode) => void;
  onSwitchToGraph: () => void;
}

export const PatternAlerts: React.FC<PatternAlertsProps> = ({
  patterns,
  nodes,
  onSelectPattern,
  onFocusNode,
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
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
          CRITICAL ALERT
        </span>
      );
    }
    if (sev === "HIGH") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          HIGH PRIORITY
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
        MODERATE
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Automated Suspicious Pattern Detection Center
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Machine-driven discovery of burner phone swapping, Hawala money layering, geo-convergence, and kingpin shielding.
            </p>
          </div>
        </div>

        {/* Severity Filters */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setSeverityFilter("ALL")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              severityFilter === "ALL" ? "bg-slate-800 text-slate-200" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({patterns.length})
          </button>
          <button
            onClick={() => setSeverityFilter("CRITICAL")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              severityFilter === "CRITICAL" ? "bg-rose-500/20 text-rose-300 font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Critical
          </button>
          <button
            onClick={() => setSeverityFilter("HIGH")}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              severityFilter === "HIGH" ? "bg-amber-500/20 text-amber-300 font-bold" : "text-slate-400 hover:text-slate-200"
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
            className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 shadow-lg transition-all flex flex-col justify-between group"
          >
            <div>
              {/* Card Top */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    {getPatternIcon(pattern.type)}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                      {pattern.title}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">
                      PATTERN ID: {pattern.id}
                    </span>
                  </div>
                </div>
                {getSeverityBadge(pattern.severity)}
              </div>

              {/* Description */}
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                {pattern.description}
              </p>

              {/* Involved Entities Pill list */}
              {pattern.involvedNodeIds.length > 0 && (
                <div className="mb-4">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                    Involved Suspects / Terminals:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {pattern.involvedNodeIds.map((nodeId) => {
                      const matchedNode = nodes.find((n) => n.id === nodeId);
                      return (
                        <button
                          key={nodeId}
                          onClick={() => matchedNode && onFocusNode(matchedNode)}
                          className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500 rounded text-[11px] font-mono text-slate-300 hover:text-amber-300 transition-colors flex items-center gap-1"
                        >
                          <span>{matchedNode?.label || nodeId}</span>
                          <ArrowUpRight className="w-3 h-3 text-slate-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actionable Intelligence Lead Box */}
              <div className="bg-slate-950 border border-amber-500/30 rounded-lg p-3 text-xs">
                <span className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Actionable Tactical Lead for Investigators:
                </span>
                <p className="text-slate-300 text-[11px] leading-normal">
                  {pattern.actionableLead}
                </p>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-mono">
                Detected: {new Date(pattern.detectedAt).toLocaleTimeString()}
              </span>

              <button
                onClick={() => {
                  onSelectPattern(pattern);
                  onSwitchToGraph();
                }}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-md border border-amber-500/20 transition-colors"
              >
                <span>Isolate & View on Canvas</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
