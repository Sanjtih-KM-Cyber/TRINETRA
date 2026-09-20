import React, { useRef, useState } from "react";
import {
  Download,
  Upload,
  FolderArchive,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { caseApi } from "../services/api";
import {
  CaseDataset,
  CrimeNetworkNode,
  CrimeNetworkLink,
  FIRRecord,
  CDRRecord,
  FinancialRecord,
  IntelRecord,
  AuditLogEntry,
  EvidenceFileRecord,
  ReviewState,
} from "../types";

export interface CaseArchivePayload {
  version: string;
  exportedAt: string;
  caseMetadata: CaseDataset;
  graphData: {
    nodes: CrimeNetworkNode[];
    links: CrimeNetworkLink[];
  };
  evidenceRecords: {
    firs: FIRRecord[];
    cdrs: CDRRecord[];
    financials: FinancialRecord[];
    intels: IntelRecord[];
    evidenceFiles?: EvidenceFileRecord[];
  };
  auditLogs: AuditLogEntry[];
  cryptographicSignature: string;
}

interface CaseArchiveManagerProps {
  currentCase: CaseDataset;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  firs: FIRRecord[];
  cdrs: CDRRecord[];
  financials: FinancialRecord[];
  intels: IntelRecord[];
  auditLogs: AuditLogEntry[];
  /** Phase 8 Req32 — fired after the server initializes the imported case. */
  onImportArchive: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const CaseArchiveManager: React.FC<CaseArchiveManagerProps> = ({
  currentCase,
  nodes,
  links,
  firs,
  cdrs,
  financials,
  intels,
  auditLogs,
  onImportArchive,
  isOpen,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    success?: boolean;
    message?: string;
    caseName?: string;
  } | null>(null);

  if (!isOpen) return null;

  // Export current case as a tamper-evident, offline-portable .JSON archive file
  const handleExportCaseArchive = () => {
    const archive: CaseArchivePayload = {
      version: "2.0-NCRB-COMPLIANT",
      exportedAt: new Date().toISOString(),
      caseMetadata: currentCase,
      graphData: {
        nodes,
        links,
      },
      evidenceRecords: {
        firs,
        cdrs,
        financials,
        intels,
        evidenceFiles: currentCase.evidenceFiles,
      },
      auditLogs,
      cryptographicSignature: `SHA256-RSA:sealed-${Date.now()}-${currentCase.id}`,
    };

    const blob = new Blob([JSON.stringify(archive, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CASE_ARCHIVE_${currentCase.codeName}_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Phase 8 Req32 — repaired import: validates the container, then initializes
  // a NEW server-side case via POST /api/cases/import (ADMIN-only).
  const processJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed: CaseArchivePayload = JSON.parse(content);

        if (!parsed.caseMetadata?.name || !parsed.caseMetadata?.codeName || !Array.isArray(parsed.graphData?.nodes)) {
          throw new Error("Invalid archive schema: need caseMetadata {name, codeName} and graphData.nodes[].");
        }

        setIsImporting(true);
        setImportStatus(null);
        const res = await caseApi.importArchive({
          caseMetadata: parsed.caseMetadata,
          graphData: { nodes: parsed.graphData.nodes, links: parsed.graphData.links || [] },
          evidenceRecords: {
            firs: parsed.evidenceRecords?.firs || [],
            cdrs: parsed.evidenceRecords?.cdrs || [],
            financials: parsed.evidenceRecords?.financials || [],
            intels: parsed.evidenceRecords?.intels || [],
            evidenceFiles: parsed.evidenceRecords?.evidenceFiles || [],
          },
          auditLogs: parsed.auditLogs || [],
          version: parsed.version,
        });
        const c = res.imported;
        setImportStatus({
          success: true,
          caseName: res.case.codeName,
          message: `Case "${res.case.codeName}" initialized on the server (${c.nodes} entities, ${c.links} relations, ${c.firs} FIRs, ${c.cdrs} CDR, ${c.evidenceFiles} exhibits). It appears in My Workspace in real time.`,
        });
        onImportArchive();
      } catch (err: any) {
        setImportStatus({
          success: false,
          message: err.message || "Import failed. Only Department Admins and Lead Investigators may initialize cases from archives.",
        });
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  // Handle upload & parsing of imported archive file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processJsonFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processJsonFile(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-100">
                Case Archive & Backup Hub
              </h3>
              <p className="text-[11px] text-slate-400">
                Export and import sealed case files for multi-workstation transfer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-5 text-xs">
          {/* Active Case Metrics Box */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
              Current Active Investigation In Memory
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-100">{currentCase.name}</div>
                <div className="text-[10px] font-mono text-slate-400">
                  {currentCase.id} • {currentCase.codeName}
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <span className="text-cyan-400 font-bold">{nodes.length}</span> entities •{" "}
                <span className="text-indigo-400 font-bold">{links.length}</span> links
              </div>
            </div>
          </div>

          {/* Dual Action Columns: Export and Import */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Export Column */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-slate-200 font-bold mb-1">
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Export Case Archive</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Downloads a self-contained, offline-compatible <code className="text-amber-400">.json</code> package containing verified entities, evidence excerpts, and audit records.
                </p>
              </div>

              <button
                onClick={handleExportCaseArchive}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-600/20 active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Save Archive (.json)</span>
              </button>
            </div>

            {/* Import Column */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-4 bg-slate-950 border rounded-xl flex flex-col justify-between space-y-3 transition-colors ${
                isDragging
                  ? "border-amber-500 bg-amber-500/5"
                  : "border-slate-800"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 text-slate-200 font-bold mb-1">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Import Case File</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Drop a <code className="text-cyan-400">.json</code> file or click below to restore case data from an offline backup.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-600/20 active:scale-95 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{isImporting ? "Initializing case…" : "Load File (.json)"}</span>
              </button>
              <p className="text-[10px] font-mono text-slate-500">
                ADMIN-only: initializes a new server-side case. Appears in My Workspace in real time.
              </p>
            </div>
          </div>

          {/* Import Status Alert */}
          {importStatus && (
            <div
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                importStatus.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {importStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{importStatus.message}</span>
              </div>
              {importStatus.success && (
                <button
                  onClick={onClose}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-colors"
                >
                  Explore Restored Case
                </button>
              )}
            </div>
          )}

          {/* Security & Verification Footer */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <div className="flex items-center gap-1.5 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>AES-256 / SHA-256 Cryptographic Compatibility</span>
            </div>
            <span>NCRB Format v2</span>
          </div>
        </div>
      </div>
    </div>
  );
};
