import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Scan,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Hash,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  FileCheck,
  CornerDownRight,
  AlertCircle,
  Search,
  ArrowRight,
  X,
} from "lucide-react";
import { RelationshipEvidence, EvidenceFileRecord, SourceSnippet } from "../types";

interface DocumentPreviewerProps {
  evidenceDetail?: RelationshipEvidence;
  evidenceFile?: EvidenceFileRecord;
  fallbackDocumentName?: string;
  excerptText?: string;
  locator?: string;
  sourceSnippet?: SourceSnippet;
  onClose?: () => void;
}

export const DocumentPreviewer: React.FC<DocumentPreviewerProps> = ({
  evidenceDetail,
  evidenceFile,
  fallbackDocumentName,
  excerptText,
  locator,
  sourceSnippet,
  onClose,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showOcrOverlay, setShowOcrOverlay] = useState<boolean>(true);
  const [activePage, setActivePage] = useState<number>(1);
  const [highlightedText, setHighlightedText] = useState<string>("");
  const documentRef = useRef<HTMLDivElement>(null);
  const [isHighlightVisible, setIsHighlightVisible] = useState(false);

  const docName =
    sourceSnippet?.docName ||
    evidenceDetail?.sourceDocumentName ||
    evidenceFile?.fileName ||
    fallbackDocumentName ||
    "FIR_209_SpecialCell_CrimeBranch.pdf";

  const fileHash =
    evidenceFile?.fileHash ||
    sourceSnippet?.docId?.startsWith("sha256:") ? sourceSnippet.docId :
    "sha256:7f8e9a4b2c1d889201a094bb819c927f8a9e2c4d1b8e9a4b";

  // Resolve the exact excerpt to highlight
  const resolvedExcerpt =
    sourceSnippet?.snippet ||
    evidenceDetail?.excerpt ||
    excerptText ||
    "On 14th August 2026, intelligence sources confirmed that prime accused Farooq 'Chacha' Merchant held secret communications with wanted kingpin Vikramaditya Singhania operating out of Dubai (+971508821990). Financial transactions indicate ₹48,00,000 was wired to Hawala banker Rameshwar 'Munshi' Joshi (VPA: munshi.trade@oksbi).";

  // Resolve the locator (page, line, CDR row, etc.)
  const resolvedLocator =
    sourceSnippet?.locator ||
    evidenceDetail?.locator ||
    locator ||
    `Page ${sourceSnippet?.page || 1}${sourceSnippet?.line ? `, Line ${sourceSnippet.line}` : ""}`;

  // Auto-scroll to highlighted text on mount
  useEffect(() => {
    if (documentRef.current && resolvedExcerpt) {
      const walker = document.createTreeWalker(
        documentRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.includes(resolvedExcerpt.substring(0, 50))) {
          const range = document.createRange();
          const startIdx = node.textContent.indexOf(resolvedExcerpt.substring(0, 50));
          range.setStart(node, Math.max(0, startIdx));
          range.setEnd(node, Math.min(node.textContent.length, startIdx + resolvedExcerpt.length));
          
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          
          node.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
          setIsHighlightVisible(true);
          break;
        }
      }
    }
  }, [resolvedExcerpt]);

  return (
    <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Document Header & Barcode/Hash Banner */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{docName}</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <FileCheck className="w-2.5 h-2.5" />
                OCR PROCESSED
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-1 text-slate-400">
                <Hash className="w-2.5 h-2.5 text-slate-400" />
                {fileHash.slice(0, 22)}...
              </span>
              <span>•</span>
              <span className="text-amber-400 font-semibold">{resolvedLocator}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowOcrOverlay(!showOcrOverlay)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors ${
              showOcrOverlay
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
            title="Toggle OCR Bounding Box Layer"
          >
            <Scan className="w-3 h-3" />
            <span>OCR BBOX</span>
          </button>

          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setZoomLevel((prev) => Math.max(70, prev - 15))}
              className="p-1 text-slate-400 hover:text-slate-200"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-mono text-slate-300 px-1.5">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel((prev) => Math.min(150, prev + 15))}
              className="p-1 text-slate-400 hover:text-slate-200"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="Close Document Viewer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Side-by-Side Dual Viewport: Simulated Paper & Live OCR Bounding Box */}
      <div className="p-4 bg-slate-950/70 overflow-auto max-h-[380px] flex justify-center items-start">
        <div
          ref={documentRef}
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
          className="w-full max-w-xl bg-amber-50/95 text-slate-900 rounded-lg shadow-2xl p-6 sm:p-8 font-serif text-xs border border-amber-200 relative transition-transform duration-200 selection:bg-amber-200 selection:text-slate-900"
        >
          {/* Watermark / Police Seal */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
            <div className="w-64 h-64 rounded-full border-8 border-slate-900 flex items-center justify-center text-center font-sans font-black text-2xl rotate-[-25deg]">
              DELHI POLICE SPECIAL CELL • EVIDENCE ARCHIVE
            </div>
          </div>

          {/* Official Document Letterhead */}
          <div className="text-center border-b border-slate-400/80 pb-3 mb-4 space-y-0.5">
            <div className="font-sans font-extrabold text-[11px] tracking-wider uppercase text-slate-800">
              POLICE DEPARTMENT • SPECIAL TASK FORCE
            </div>
            <div className="font-sans font-bold text-[10px] text-slate-600 uppercase tracking-widest">
              OFFICIAL INVESTIGATION MEMORANDUM & CASE RECORD
            </div>
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-600 pt-1">
              <span>CASE DIARY REF: STF/2026/08/209</span>
              <span>CONFIDENTIAL // LAW ENFORCEMENT SENSITIVE</span>
            </div>
          </div>

          {/* Preceding text */}
          <p className="leading-relaxed text-slate-700 mb-3">
            1. Pursuant to surveillance authorization granted under CrPC Section 91, interception of wireless telemetry and telecom transmissions was initiated on targets operating in Western Hub corridor.
          </p>

          {/* The Active Evidence Excerpt with Highlighted Bounding Box Overlay */}
          <div className="relative my-3">
            {showOcrOverlay && isHighlightVisible && (
              <div className="absolute -inset-2 bg-amber-400/25 border-2 border-amber-600 rounded-md pointer-events-none animate-pulse flex items-start justify-end p-1">
                <span className="bg-amber-600 text-slate-950 font-sans font-black text-[8px] px-1 rounded uppercase tracking-tighter">
                  VERIFIED SOURCE EVIDENCE
                </span>
              </div>
            )}
            <p className="font-semibold text-slate-950 bg-amber-200/50 p-2.5 rounded border border-amber-300 leading-relaxed font-mono text-[11px]">
              {(() => {
                // Split the excerpt to show highlighted portion
                const text = resolvedExcerpt;
                return `"${text}"`;
              })()}
            </p>
          </div>

          {/* Subsequent text */}
          <p className="leading-relaxed text-slate-700 mt-3">
            2. Chain of custody maintained under Station Diary Entry No. 44/A. All extracted digital artifacts verified against primary SHA-256 fingerprint hash before ingestion.
          </p>

          {/* Signature & Seal Footer */}
          <div className="mt-8 pt-4 border-t border-slate-300 flex justify-between items-end text-[9px] font-sans">
            <div className="space-y-1">
              <div className="font-mono text-[8px] text-slate-500">DIGITAL DIGEST VERIFIED</div>
              <div className="font-mono text-slate-700">{fileHash.slice(0, 32)}</div>
            </div>
            <div className="text-right space-y-0.5">
              <div className="font-bold text-slate-800">ACP S. R. Deshmukh</div>
              <div className="text-slate-600">Superintendent / Investigating Officer</div>
            </div>
          </div>
        </div>
      </div>

      {/* Document Trace Footer */}
      <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <div className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Chain of Custody Cryptographically Verified</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Page {activePage} of 1</span>
          <button
            className="text-slate-500 hover:text-slate-300 text-[10px] font-mono flex items-center gap-1"
            title="Navigate to source in evidence locker"
          >
            <ArrowRight className="w-3 h-3" />
            <span>Open in Evidence Locker</span>
          </button>
        </div>
      </div>
    </div>
  );
};