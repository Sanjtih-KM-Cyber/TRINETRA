import React, { useState, useRef, useEffect } from "react";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  ShortestPathResult,
} from "../types";
import { findShortestPath } from "../services/graphEngine";
import {
  Share2,
  ArrowRight,
  Search,
  AlertTriangle,
  FileCheck,
  Expand,
  Minimize2,
} from "lucide-react";

interface PathFinderProps {
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  onSelectNode: (node: CrimeNetworkNode) => void;
  onSetShortestPath: (path: ShortestPathResult | null) => void;
  onSwitchToGraph: () => void;
}

/**
 * Intermediary Link & Money Mule Path Finder — trace shortest
 * communication links, hawala transfers, and proxy messengers between
 * any two suspects. (Relocated here from the retired analytics tab.)
 */
export const PathFinder: React.FC<PathFinderProps> = ({
  nodes,
  links,
  onSelectNode,
  onSetShortestPath,
  onSwitchToGraph,
}) => {
  const [sourceSuspectId, setSourceSuspectId] = useState<string>("");
  const [targetSuspectId, setTargetSuspectId] = useState<string>("");
  const [trailPreference, setTrailPreference] = useState<"ALL" | "HAWALA_FINANCIAL" | "TELECOM_CDR">("ALL");
  const [pathResult, setPathResult] = useState<ShortestPathResult | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  // Phase 7 Req31 — link-graph viewport expansion.
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      viewRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  };

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

  const runPreference = (mode: "ALL" | "HAWALA_FINANCIAL" | "TELECOM_CDR") => {
    setTrailPreference(mode);
    if (sourceSuspectId && targetSuspectId) {
      const res = findShortestPath(sourceSuspectId, targetSuspectId, nodes, links, mode);
      setPathResult(res);
      onSetShortestPath(res);
    }
  };

  return (
    <div ref={viewRef} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
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
          <button
            onClick={toggleFullscreen}
            className={`p-1.5 rounded-lg border transition-colors ${isFullscreen ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "text-slate-400 hover:text-slate-200 border-slate-800"}`}
            title={isFullscreen ? "Exit full screen" : "Expand link-graph full screen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
        </div>

        {/* Trail Preference Selector */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => runPreference("ALL")}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              trailPreference === "ALL"
                ? "bg-amber-500 text-slate-950 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Relational
          </button>
          <button
            onClick={() => runPreference("HAWALA_FINANCIAL")}
            className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
              trailPreference === "HAWALA_FINANCIAL"
                ? "bg-amber-500 text-slate-950 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Hawala / Money Trail
          </button>
          <button
            onClick={() => runPreference("TELECOM_CDR")}
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
  );
};
