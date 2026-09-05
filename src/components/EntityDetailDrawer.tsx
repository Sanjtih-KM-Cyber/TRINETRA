import React, { useState } from "react";
import { CrimeNetworkNode, CrimeNetworkLink, ReviewState, SourceSnippet, ShortestPathResult, CriminalRecord, CriminalHistoryQuery, IntelligenceClassification } from "../types";
import { useAuth } from "../context/AuthContext";
import { canAccessIntel, getUserClearance, sanitizeIntelText } from "../services/accessControl";
import {
  X,
  ShieldAlert,
  Crown,
  Phone,
  Landmark,
  MapPin,
  Truck,
  FileText,
  Activity,
  Share2,
  AlertTriangle,
  Radio,
  Scissors,
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Quote,
  User,
  Send,
  GitMerge,
  ExternalLink,
  Scan,
  Search,
  Target,
  Route,
  Shield,
  Database,
  AlertCircle,
} from "lucide-react";
import { DocumentPreviewer } from "./DocumentPreviewer";
import { createCCTNSAdapter } from "../services/cctnsAdapter";

interface EntityDetailDrawerProps {
  node: CrimeNetworkNode | null;
  allNodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  onClose: () => void;
  onSelectNeighbor: (node: CrimeNetworkNode) => void;
  onInitiatePathFind: (sourceNodeId: string, targetNodeId?: string, shortestPath?: ShortestPathResult) => void;
  onUpdateReviewState?: (nodeId: string, newState: ReviewState) => void;
  onAddNote?: (nodeId: string, noteText: string) => void;
  onSelectLink?: (link: CrimeNetworkLink) => void;
}

export const EntityDetailDrawer: React.FC<EntityDetailDrawerProps> = ({
  node,
  allNodes,
  links,
  onClose,
  onSelectNeighbor,
  onInitiatePathFind,
  onUpdateReviewState,
  onAddNote,
  onSelectLink,
}) => {
  const [newNoteText, setNewNoteText] = useState("");
  const [showDocPreview, setShowDocPreview] = useState(false);
  const { user } = useAuth();

  if (!node) return null;

  const currentReview = node.reviewState || "NEEDS_REVIEW";

  // Find all direct 1-hop links
  const connectedLinks = links.filter((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return s === node.id || t === node.id;
  });

  const neighbors = connectedLinks.map((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    const otherId = s === node.id ? t : s;
    const otherNode = allNodes.find((n) => n.id === otherId);
    return {
      node: otherNode,
      link: l,
      direction: s === node.id ? "OUT" : "IN",
    };
  });

  // Path finding state
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [computedPath, setComputedPath] = useState<ShortestPathResult | null>(null);
  const [isFindingPath, setIsFindingPath] = useState(false);

  // Criminal History state
  const [criminalHistory, setCriminalHistory] = useState<CriminalRecord | null>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Fetch criminal history from CCTNS
  const handleFetchCriminalHistory = async () => {
    if (!node.details?.aadhaarLast4 && !node.details?.pan && !node.label) return;
    
    setIsFetchingHistory(true);
    setHistoryError(null);
    try {
      const adapter = createCCTNSAdapter();
      let query: CriminalHistoryQuery;
      
      if (node.details?.aadhaarLast4) {
        query = {
          identifier: { type: "AADHAAR", value: node.details.aadhaarLast4 },
          purpose: "PRIOR_CONVICTION",
          requestingOfficer: { id: "current-user", rank: "Inspector", station: "Cyber Crime" },
          legalAuthority: "Section 91 CrPC",
        };
      } else if (node.details?.pan) {
        query = {
          identifier: { type: "PAN", value: node.details.pan },
          purpose: "PRIOR_CONVICTION",
          requestingOfficer: { id: "current-user", rank: "Inspector", station: "Cyber Crime" },
          legalAuthority: "Section 91 CrPC",
        };
      } else {
        query = {
          identifier: { type: "NAME_DOB", value: node.label },
          purpose: "PRIOR_CONVICTION",
          requestingOfficer: { id: "current-user", rank: "Inspector", station: "Cyber Crime" },
          legalAuthority: "Section 91 CrPC",
        };
      }
      
      const record = await adapter.queryHistory(query);
      setCriminalHistory(record);
    } catch (err: any) {
      setHistoryError(err.message || "Failed to fetch criminal history");
    } finally {
      setIsFetchingHistory(false);
    }
  };

  // Intelligence classification + sanitized view
  const intelClassification = (node.details as any)?.intelClassification as IntelligenceClassification | undefined;
  const intelCompartment = (node.details as any)?.intelCompartment;
  const intelCaveats = ((node.details as any)?.intelCaveats || []) as string[];
  const intelSanitized = (node.details as any)?.intelSanitized as string | undefined;
  const intelAccess = intelClassification && intelClassification !== "UNCLASSIFIED"
    ? canAccessIntel(getUserClearance(user), {
        classification: intelClassification,
        compartment: intelCompartment,
        caveats: intelCaveats as any,
      })
    : { allowed: true, reason: "Unclassified." };
  const displaySnippets = (node.sourceSnippets || []).map((snippet) => ({
    ...snippet,
    snippet: intelAccess.allowed
      ? snippet.snippet
      : sanitizeIntelText(snippet.snippet, intelSanitized, false, intelClassification || "CONFIDENTIAL"),
  }));
  const displayNotes = intelAccess.allowed
    ? node.details?.notes || "Entity recorded in active investigative dossier."
    : sanitizeIntelText(
        node.details?.notes || "Entity recorded in active investigative dossier.",
        intelSanitized,
        false,
        intelClassification || "CONFIDENTIAL"
      );

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !onAddNote) return;
    onAddNote(node.id, newNoteText.trim());
    setNewNoteText("");
  };

  const getReviewBadge = (state: ReviewState) => {
    switch (state) {
      case "CONFIRMED":
        return {
          label: "CONFIRMED EVIDENCE",
          color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          icon: CheckCircle2,
        };
      case "REJECTED":
        return {
          label: "REJECTED LEAD",
          color: "bg-rose-500/20 text-rose-300 border-rose-500/40",
          icon: XCircle,
        };
      case "UNCERTAIN":
        return {
          label: "UNCERTAIN / PENDING",
          color: "bg-purple-500/20 text-purple-300 border-purple-500/40",
          icon: HelpCircle,
        };
      case "NEEDS_REVIEW":
      default:
        return {
          label: "REVIEW REQUIRED",
          color: "bg-amber-500/20 text-amber-300 border-amber-500/40",
          icon: AlertTriangle,
        };
    }
  };

  const badgeInfo = getReviewBadge(currentReview);
  const BadgeIcon = badgeInfo.icon;

  // Handle finding shortest path to target
  const handleFindPath = async (targetId: string) => {
    setTargetNodeId(targetId);
    setIsFindingPath(true);
    try {
      // Import findShortestPath dynamically to avoid circular dependencies
      const { findShortestPath } = await import("../services/graphEngine");
      const path = findShortestPath(node.id, targetId, allNodes, links, "ALL");
      setComputedPath(path);
      if (path) {
        onInitiatePathFind(node.id, targetId, path);
      }
    } catch (err) {
      console.error("Path finding failed:", err);
    } finally {
      setIsFindingPath(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] bg-slate-900/98 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div>
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/80">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-amber-400 mt-0.5">
                {node.isKingpinCandidate ? (
                  <Crown className="w-6 h-6 text-amber-400" />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                    {node.type}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${badgeInfo.color}`}>
                    <BadgeIcon className="w-3 h-3" />
                    <span>{badgeInfo.label}</span>
                  </span>
                  {node.category === "INVESTIGATOR_KNOWLEDGE" && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      INVESTIGATOR HYPOTHESIS
                    </span>
                  )}
                  {node.isKingpinCandidate && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      KINGPIN CANDIDATE
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-100">{node.label}</h2>
                <p className="text-xs text-slate-400">{node.role || "Unclassified Network Entity"}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-4 sm:p-5 space-y-5 text-xs">
            {/* Review Decision Controller */}
            {onUpdateReviewState && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Investigator Review Decision
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => onUpdateReviewState(node.id, "CONFIRMED")}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                      currentReview === "CONFIRMED"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 ring-1 ring-emerald-500/30"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-emerald-300"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm</span>
                  </button>

                  <button
                    onClick={() => onUpdateReviewState(node.id, "NEEDS_REVIEW")}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                      currentReview === "NEEDS_REVIEW"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/60 ring-1 ring-amber-500/30"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-300"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Review</span>
                  </button>

                  <button
                    onClick={() => onUpdateReviewState(node.id, "UNCERTAIN")}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                      currentReview === "UNCERTAIN"
                        ? "bg-purple-500/20 text-purple-300 border-purple-500/60 ring-1 ring-purple-500/30"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-purple-300"
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Uncertain</span>
                  </button>

                  <button
                    onClick={() => onUpdateReviewState(node.id, "REJECTED")}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                      currentReview === "REJECTED"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/60 ring-1 ring-rose-500/30"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-300"
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            )}

            {/* Possible Duplicates / Resolution Alert */}
            {node.possibleDuplicates && node.possibleDuplicates.length > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>Potential Same-Entity Duplicate Detected</span>
                </div>
                <div className="space-y-1.5">
                  {node.possibleDuplicates.map((dup, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-200">{dup.candidateLabel}</div>
                        <div className="text-[10px] text-slate-400">{dup.matchReason}</div>
                      </div>
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">
                        {Math.round(dup.similarityScore * 100)}% Match
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION A: VERIFIED EVIDENCE-DERIVED FACTS (Exact Document Snippets) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Quote className="w-3.5 h-3.5" />
                  <span>Evidence-Derived Source Citations</span>
                </span>
                <button
                  onClick={() => setShowDocPreview(!showDocPreview)}
                  className="text-[10px] font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 transition-colors"
                >
                  <Scan className="w-3 h-3" />
                  <span>{showDocPreview ? "Hide Original PDF" : "Inspect Raw Scanned Doc"}</span>
                </button>
              </div>

              {intelClassification && intelClassification !== "UNCLASSIFIED" && (
                <div className={`p-2.5 rounded-xl border text-[10px] font-mono flex items-center justify-between gap-2 ${
                  intelAccess.allowed
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}>
                  <span>
                    {intelClassification}{intelCompartment ? ` // ${intelCompartment}` : ""}{intelCaveats.length > 0 ? ` // ${intelCaveats.join(" ")}` : ""} • {(node.details as any)?.intelSourceAgency || "INTEL"}
                  </span>
                  <span>{intelAccess.allowed ? "ACCESS GRANTED" : "RESTRICTED"}</span>
                </div>
              )}
              {!intelAccess.allowed && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[10px] text-rose-300">
                  {intelAccess.reason} Showing {intelSanitized ? "sanitized version" : "redacted placeholders"}.
                </div>
              )}

              {showDocPreview && intelAccess.allowed && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <DocumentPreviewer
                    sourceSnippet={node.sourceSnippets?.[0]}
                    fallbackDocumentName={node.sourceSnippets?.[0]?.docName || "FIR_209_SpecialCell_CrimeBranch.pdf"}
                    excerptText={node.sourceSnippets?.[0]?.snippet || node.details?.notes}
                    locator={node.sourceSnippets?.[0]?.locator || `Page ${node.sourceSnippets?.[0]?.page || 1}`}
                    onClose={() => setShowDocPreview(false)}
                  />
                </div>
              )}

              <div className="space-y-2">
                {displaySnippets && displaySnippets.length > 0 ? (
                  displaySnippets.map((snippet, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-slate-300 flex items-center gap-1 truncate">
                          <FileText className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="truncate">{snippet.docName}</span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
                            {snippet.locator || `Page ${snippet.page || 1}`}
                          </span>
                          {intelAccess.allowed && (
                            <button
                              onClick={() => setShowDocPreview(true)}
                              className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors flex items-center gap-1"
                              title="Inspect original document at this location"
                            >
                              <Search className="w-3 h-3" />
                              <span className="text-[10px] font-mono">Inspect</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <blockquote className="pl-2.5 border-l-2 border-amber-500/50 text-slate-300 text-[11px] italic bg-amber-500/5 p-1.5 rounded-r">
                        "{snippet.snippet}"
                      </blockquote>
                    </div>
                  ))
                ) : (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-300 flex items-center gap-1 truncate">
                        <FileText className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Case File Documentation</span>
                      </span>
                      <span className="font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        Primary Record
                      </span>
                    </div>
                    <blockquote className="pl-2.5 border-l-2 border-amber-500/50 text-slate-300 text-[11px] italic bg-amber-500/5 p-1.5 rounded-r">
                      "{displayNotes}"
                    </blockquote>
                  </div>
                )}
              </div>
            </div>

            {/* Risk Gauge & Metrics */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">Criminal Threat Risk:</span>
                <span className="font-mono text-xs font-bold text-amber-400">
                  {node.riskScore} / 100
                </span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full ${
                    node.riskScore >= 85
                      ? "bg-rose-500"
                      : node.riskScore >= 70
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${node.riskScore}%` }}
                />
              </div>
            </div>

            {/* Graph Topology Matrix */}
            <div>
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                <span>Graph Topology & Centrality</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">Betweenness</span>
                  <strong className="text-xs font-mono text-amber-400">{node.betweenness || "0.0000"}</strong>
                  <p className="text-[9px] text-slate-400 mt-0.5">Bridge bottleneck score</p>
                </div>

                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">Connections</span>
                  <strong className="text-xs font-mono text-slate-200">{node.degree || neighbors.length} Links</strong>
                  <p className="text-[9px] text-slate-400 mt-0.5">Direct contact volume</p>
                </div>

                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">PageRank</span>
                  <strong className="text-xs font-mono text-slate-200">{node.pageRank || "0.0000"}</strong>
                  <p className="text-[9px] text-slate-400 mt-0.5">Structural influence</p>
                </div>

                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">Syndicate Faction</span>
                  <strong className="text-xs font-bold text-indigo-400 truncate block">
                    {node.communityName || "Cell #1"}
                  </strong>
                  <p className="text-[9px] text-slate-400 mt-0.5">Louvain cluster</p>
                </div>
              </div>
            </div>

            {/* Technical Identifiers */}
            <div>
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                Technical Identifiers & Intelligence
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs text-slate-300">
                {node.aliases && node.aliases.length > 0 && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Aliases:</span>
                    <span className="font-semibold text-slate-200">{node.aliases.join(", ")}</span>
                  </div>
                )}

                {node.details?.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono font-semibold text-sky-400">{node.details.phone}</span>
                  </div>
                )}

                {node.details?.imei && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">IMEI:</span>
                    <span className="font-mono font-semibold text-sky-300">{node.details.imei}</span>
                  </div>
                )}

                {node.details?.accountNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Account / VPA:</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {node.details.accountNumber}
                    </span>
                  </div>
                )}

                {node.details?.vehiclePlate && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Plate:</span>
                    <span className="font-mono font-semibold text-yellow-400">
                      {node.details.vehiclePlate}
                    </span>
                  </div>
                )}

                {node.details?.address && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400">Base / Geo:</span>
                    <span className="text-right text-slate-300 max-w-[200px]">{node.details.address}</span>
                  </div>
                )}

                {intelClassification && intelClassification !== "UNCLASSIFIED" && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Classification:</span>
                    <span className="font-mono font-semibold text-rose-300">
                      {intelClassification}{intelCompartment ? ` // ${intelCompartment}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* CRIMINAL HISTORY / CCTNS INTEGRATION */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  <span>Criminal History (CCTNS/ICJS)</span>
                </span>
                <button
                  onClick={handleFetchCriminalHistory}
                  disabled={isFetchingHistory}
                  className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg text-[10px] font-mono font-bold border border-rose-500/30 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isFetchingHistory ? (
                    <>
                      <span className="animate-spin">⟳</span>
                      <span>Fetching...</span>
                    </>
                  ) : criminalHistory ? (
                    <>
                      <Shield className="w-3.5 h-3.5" />
                      <span>Refresh</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3.5 h-3.5" />
                      <span>Fetch History</span>
                    </>
                  )}
                </button>
              </div>

              {historyError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-[10px] text-rose-300">
                  <AlertCircle className="w-3.5 h-3.5 inline-block mr-1" />
                  {historyError}
                </div>
              )}

              {criminalHistory && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Subject Header */}
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-100">{criminalHistory.subject.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {criminalHistory.historySheet && (
                              <>
                                History Sheet: <span className="font-mono text-rose-300">Cat-{criminalHistory.historySheet.category}</span> • Opened: {criminalHistory.historySheet.openedDate.split("T")[0]}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {criminalHistory.historySheet && (
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          criminalHistory.historySheet.category === "A" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                          criminalHistory.historySheet.category === "B" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                          "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        }`}>
                          HS Cat-{criminalHistory.historySheet.category}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg">
                        <span className="text-[10px] text-slate-400 block">Aliases</span>
                        <span className="font-semibold text-slate-200 truncate block">{criminalHistory.subject.aliases.join(", ") || "None"}</span>
                      </div>
                      <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg">
                        <span className="text-[10px] text-slate-400 block">Aadhaar (Last 4)</span>
                        <span className="font-mono font-semibold text-sky-400">{criminalHistory.subject.aadhaarLast4 || "Not on record"}</span>
                      </div>
                      <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg">
                        <span className="text-[10px] text-slate-400 block">PAN</span>
                        <span className="font-mono font-semibold text-emerald-400">{criminalHistory.subject.pan || "Not on record"}</span>
                      </div>
                      <div className="p-2 bg-slate-900/90 border border-slate-800 rounded-lg">
                        <span className="text-[10px] text-slate-400 block">DOB / Gender</span>
                        <span className="font-semibold text-slate-200">{criminalHistory.subject.dob || "Unknown"} / {criminalHistory.subject.gender || "Unknown"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cases */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider">
                      Cases ({criminalHistory.cases.length})
                    </div>
                    <div className="space-y-1.5">
                      {criminalHistory.cases.map((c, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-slate-100">{c.firNumber}</span>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              c.status === "CONVICTED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
                              c.status === "PENDING_TRIAL" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                              c.status === "ACQUITTED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
                              "bg-rose-500/20 text-rose-300 border-rose-500/40"
                            }`}>
                              {c.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex flex-wrap gap-2">
                            <span>{c.policeStation}, {c.year}</span>
                            <span>{c.sections.join(", ")}</span>
                            <span>Role: {c.role}</span>
                          </div>
                          {c.convictionDate && (
                            <div className="text-[10px] text-emerald-300">
                              Convicted: {c.convictionDate.split("T")[0]} • {c.sentence}
                            </div>
                          )}
                          {c.courtName && (
                            <div className="text-[10px] text-slate-400">{c.courtName} • {c.caseNumber}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Associates */}
                  {criminalHistory.associates.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider">
                        Known Associates ({criminalHistory.associates.length})
                      </div>
                      <div className="space-y-1.5">
                        {criminalHistory.associates.map((a, idx) => (
                          <div key={idx} className="p-2 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-slate-200">{a.name}</div>
                              <div className="text-[10px] text-slate-400">{a.relation} • FIRs: {a.firNumbers.join(", ")}</div>
                            </div>
                            <button
                              onClick={() => {
                                const associateNode = allNodes.find(n => n.label.toLowerCase().includes(a.name.toLowerCase()));
                                if (associateNode) onSelectNeighbor(associateNode);
                              }}
                              className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded text-[10px] font-mono border border-indigo-500/30"
                            >
                              View in Graph
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* History Sheet Remarks */}
                  {criminalHistory.historySheet?.remarks && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                      <div className="text-[10px] font-mono font-bold text-rose-400 mb-1">History Sheet Remarks:</div>
                      <div className="text-[11px] text-slate-300 italic">{criminalHistory.historySheet.remarks}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECTION B: INVESTIGATOR NOTES & WORKING HYPOTHESES (Non-Evidence) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>Investigator Notes & Leads (Non-Evidence)</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {node.investigatorNotesList?.length || 0} Entries
                </span>
              </div>

              <div className="space-y-1.5">
                {node.investigatorNotesList && node.investigatorNotesList.length > 0 ? (
                  node.investigatorNotesList.map((note) => (
                    <div
                      key={note.id}
                      className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="font-bold text-cyan-400">{note.author}</span>
                        <span>{new Date(note.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-200 text-xs">{note.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-2.5 bg-slate-950/60 border border-dashed border-slate-800 rounded-xl text-center text-slate-400 text-[11px]">
                    No officer hypotheses or informant leads logged yet.
                  </div>
                )}

                {onAddNote && (
                  <form onSubmit={handleAddNote} className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Add investigator note or working lead..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={!newNoteText.trim()}
                      className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl disabled:opacity-40 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* 1-Hop Connected Entities */}
            <div>
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Direct Link Connections ({neighbors.length})</span>
                <span className="text-[9px] text-slate-400 font-normal">Click edge to inspect evidence</span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {neighbors.map(({ node: otherNode, link }, idx) => {
                  if (!otherNode) return null;
                  return (
                    <div
                      key={idx}
                      className="p-2 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-lg flex items-center justify-between cursor-pointer transition-colors group"
                    >
                      <div
                        onClick={() => onSelectNeighbor(otherNode)}
                        className="flex-1 truncate"
                      >
                        <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-400 truncate block">
                          {otherNode.label}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {link.details || link.relationType}
                        </span>
                      </div>
                      {onSelectLink && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectLink(link);
                          }}
                          className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded text-[10px] font-mono border border-indigo-500/30 shrink-0 ml-2"
                        >
                          Evidence Trace
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Bottom Actions - Path Finding */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 space-y-3">
          {/* Target Selection */}
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span>Select Target Entity for Path Trace</span>
            </label>
            <select
              value={targetNodeId || ""}
              onChange={(e) => handleFindPath(e.target.value)}
              disabled={isFindingPath}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-amber-500 focus:outline-none"
            >
              <option value="">-- Choose Target Suspect --</option>
              {allNodes
                .filter((n) => n.id !== node.id && (n.type === "PERSON" || n.isKingpinCandidate || n.riskScore >= 60))
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label} ({n.type}) - Risk: {n.riskScore}
                  </option>
                ))}
            </select>
          </div>

          {/* Computed Path Summary */}
          {computedPath && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-1.5">
                  <Route className="w-3.5 h-3.5" />
                  <span>Shortest Path Found</span>
                </span>
                <span className="text-[10px] font-mono text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/20">
                  {computedPath.totalHops} Hops
                </span>
              </div>
              <p className="text-xs text-slate-300">{computedPath.summary}</p>
              {computedPath.steps && computedPath.steps.length > 0 && (
                <div className="text-[10px] font-mono text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">
                  {computedPath.steps.slice(0, 5).map((step, idx) => (
                    <div key={idx} className="flex items-center gap-1 text-slate-300">
                      <span>{step.fromLabel}</span>
                      <span className="text-amber-400">→</span>
                      <span>{step.relationType.replace(/_/g, " ")}</span>
                      <span className="text-amber-400">→</span>
                      <span>{step.toLabel}</span>
                    </div>
                  ))}
                  {computedPath.steps.length > 5 && (
                    <div className="text-slate-500">...and {computedPath.steps.length - 5} more hops</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={() => targetNodeId && computedPath && onInitiatePathFind(node.id, targetNodeId, computedPath)}
            disabled={!targetNodeId || !computedPath || isFindingPath}
            className={`w-full py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg ${
              targetNodeId && computedPath && !isFindingPath
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            {isFindingPath ? (
              <>
                <span className="animate-spin">⟳</span>
                <span>Computing Path...</span>
              </>
            ) : targetNodeId && computedPath ? (
              <>
                <Share2 className="w-4 h-4" />
                <span>Activate Path on Graph ({computedPath.totalHops} hops)</span>
              </>
            ) : (
              <>
                <Target className="w-4 h-4" />
                <span>Select Target to Trace Path</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};
