import React, { useState } from "react";
import {
  X,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ExternalLink,
  CheckCircle2,
  HelpCircle,
  XCircle,
  CornerDownRight,
  Plus,
  Send,
  User,
  Quote,
  Layers,
  Sparkles,
  Scan,
  Search,
} from "lucide-react";
import { CrimeNetworkLink, CrimeNetworkNode, ReviewState, InvestigatorNote } from "../types";
import { DocumentPreviewer } from "./DocumentPreviewer";

interface RelationshipDetailDrawerProps {
  link: CrimeNetworkLink;
  sourceNode: CrimeNetworkNode;
  targetNode: CrimeNetworkNode;
  onClose: () => void;
  onUpdateReviewState: (linkId: string, newState: ReviewState) => void;
  onAddNote: (linkId: string, noteText: string) => void;
}

export const RelationshipDetailDrawer: React.FC<RelationshipDetailDrawerProps> = ({
  link,
  sourceNode,
  targetNode,
  onClose,
  onUpdateReviewState,
  onAddNote,
}) => {
  const [newNoteText, setNewNoteText] = useState("");
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const currentReview = link.reviewState || "NEEDS_REVIEW";

  const handleAddNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    onAddNote(link.id, newNoteText.trim());
    setNewNoteText("");
  };

  const getReviewBadge = (state: ReviewState) => {
    switch (state) {
      case "CONFIRMED":
        return {
          label: "CONFIRMED BY INVESTIGATOR",
          color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          icon: CheckCircle2,
        };
      case "REJECTED":
        return {
          label: "REJECTED / UNFOUNDED",
          color: "bg-rose-500/20 text-rose-300 border-rose-500/40",
          icon: XCircle,
        };
      case "UNCERTAIN":
        return {
          label: "UNCERTAIN / UNCORROBORATED",
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

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/80 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                RELATIONSHIP EVIDENCE
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                ID: {link.id}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-100 mt-0.5">
              Evidence-Backed Connection Trace
            </h3>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
        {/* Connected Entities Banner */}
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            Connected Network Entities
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 p-2 bg-slate-900 border border-slate-800 rounded-lg">
              <div className="text-[10px] text-amber-400 font-mono font-bold">
                {sourceNode?.type || "ENTITY"}
              </div>
              <div className="font-bold text-slate-100 truncate">
                {sourceNode?.label || (typeof link.source === "string" ? link.source : link.source.label)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {sourceNode?.role || "Source Node"}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center shrink-0 px-2">
              <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
                {link.relationType.replace(/_/g, " ")}
              </span>
              <span className="text-[9px] text-slate-400 mt-0.5">
                Weight: {link.weight}/10
              </span>
            </div>

            <div className="flex-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-right">
              <div className="text-[10px] text-cyan-400 font-mono font-bold">
                {targetNode?.type || "ENTITY"}
              </div>
              <div className="font-bold text-slate-100 truncate">
                {targetNode?.label || (typeof link.target === "string" ? link.target : link.target.label)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {targetNode?.role || "Target Node"}
              </div>
            </div>
          </div>
        </div>

        {/* Human-in-the-Loop Review State Controller */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
              Investigator Review Decision
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${badgeInfo.color}`}>
              <BadgeIcon className="w-3 h-3" />
              <span>{badgeInfo.label}</span>
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 pt-1">
            <button
              onClick={() => onUpdateReviewState(link.id, "CONFIRMED")}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                currentReview === "CONFIRMED"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60 ring-1 ring-emerald-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-emerald-300 hover:bg-slate-800"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm</span>
            </button>

            <button
              onClick={() => onUpdateReviewState(link.id, "NEEDS_REVIEW")}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                currentReview === "NEEDS_REVIEW"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/60 ring-1 ring-amber-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-800"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Review</span>
            </button>

            <button
              onClick={() => onUpdateReviewState(link.id, "UNCERTAIN")}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                currentReview === "UNCERTAIN"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/60 ring-1 ring-purple-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-purple-300 hover:bg-slate-800"
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Uncertain</span>
            </button>

            <button
              onClick={() => onUpdateReviewState(link.id, "REJECTED")}
              className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 border ${
                currentReview === "REJECTED"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/60 ring-1 ring-rose-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-300 hover:bg-slate-800"
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
          </div>
        </div>

        {/* Section 1: SOURCE EVIDENCE & DOCUMENT SNIPPET CITATION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Quote className="w-3.5 h-3.5" />
              <span>Verified Source Document Excerpt</span>
            </span>
            <button
              onClick={() => setShowDocumentPreview(!showDocumentPreview)}
              className="text-[10px] font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 transition-colors"
            >
              <Scan className="w-3 h-3" />
              <span>{showDocumentPreview ? "Hide Original PDF" : "Inspect Raw Scanned Doc"}</span>
            </button>
          </div>

          {showDocumentPreview && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <DocumentPreviewer
                evidenceDetail={link.evidenceDetail}
                fallbackDocumentName={link.sourceDocumentId}
                excerptText={link.evidenceDetail?.excerpt || link.details}
                locator={link.evidenceDetail?.locator}
                onClose={() => setShowDocumentPreview(false)}
              />
            </div>
          )}

          <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-[11px] pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold truncate">
                <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">
                  {link.evidenceDetail?.sourceDocumentName || link.sourceDocumentId || "FIR / Case File Narrative"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 shrink-0">
                  {link.evidenceDetail?.locator || "Case Narrative"}
                </span>
                <button
                  onClick={() => setShowDocumentPreview(true)}
                  className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors flex items-center gap-1"
                  title="Inspect original document at this location"
                >
                  <Search className="w-3 h-3" />
                  <span className="text-[10px] font-mono">Inspect</span>
                </button>
              </div>
            </div>

            {/* Quoted Text Excerpt */}
            <blockquote className="pl-3 border-l-2 border-amber-500/60 text-slate-200 text-xs italic leading-relaxed bg-amber-500/5 p-2 rounded-r-lg">
              "{link.evidenceDetail?.excerpt || link.details || "Direct association documented during investigation."}"
            </blockquote>

            <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between pt-1">
              <span>Basis: {link.evidenceDetail?.basis || "Official Police Case Record"}</span>
              {link.timestamp && <span>Time: {new Date(link.timestamp).toLocaleString()}</span>}
            </div>
          </div>
        </div>

        {/* Financial / Communication Attributes */}
        {(link.amount || link.frequency || link.durationSec || link.flags) && (
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Telemetry & Forensic Metrics
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {link.amount && (
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                  <div className="text-[10px] text-slate-400">Transfer Amount</div>
                  <div className="text-sm font-mono font-bold text-emerald-400">
                    ₹{link.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              )}
              {link.frequency && (
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                  <div className="text-[10px] text-slate-400">Event Frequency</div>
                  <div className="text-sm font-mono font-bold text-indigo-400">
                    {link.frequency} Calls / Pings
                  </div>
                </div>
              )}
            </div>

            {link.flags && link.flags.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-[10px] text-slate-400 mb-1.5">Forensic Pattern Flags:</div>
                <div className="flex flex-wrap gap-1.5">
                  {link.flags.map((flag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20"
                    >
                      {flag.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 2: INVESTIGATOR NOTES (Separated from Evidence) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span>Investigator Notes & Hypotheses (Non-Evidence)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {link.investigatorNotesList?.length || 0} Notes
            </span>
          </div>

          <div className="space-y-2">
            {link.investigatorNotesList && link.investigatorNotesList.length > 0 ? (
              link.investigatorNotesList.map((note) => (
                <div
                  key={note.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className="font-bold text-cyan-400">{note.author}</span>
                    <span>{new Date(note.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-200 leading-relaxed text-xs">{note.text}</p>
                </div>
              ))
            ) : (
              <div className="p-3 bg-slate-950/60 border border-dashed border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                No officer notes recorded yet for this relationship.
              </div>
            )}

            {/* Add Note Input */}
            <form onSubmit={handleAddNoteSubmit} className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Add investigator note or working lead..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={!newNoteText.trim()}
                className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl disabled:opacity-40 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
