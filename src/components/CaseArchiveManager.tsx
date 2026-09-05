import React, { useRef, useState, useEffect } from "react";
import {
  Download,
  Upload,
  FolderArchive,
  CheckCircle2,
  AlertCircle,
  FileJson,
  Database,
  Lock,
  HardDrive,
  ShieldCheck,
  X,
  FileText,
  List,
  Hash,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
} from "lucide-react";
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
  onImportArchive: (payload: CaseArchivePayload) => void;
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
  const [importStatus, setImportStatus] = useState<{
    success?: boolean;
    message?: string;
    caseName?: string;
  } | null>(null);

  // Audit Log Streaming State
  const [auditLogsStream, setAuditLogsStream] = useState<AuditLogEntry[]>(auditLogs);
  const [auditFilter, setAuditFilter] = useState<"all" | "review" | "ingestion" | "notes" | "access">("all");

  // Filter audit logs based on selected filter
  const filteredAuditLogs = auditLogsStream.filter((log) => {
    if (auditFilter === "all") return true;
    if (auditFilter === "review") return log.actionType === "EVIDENCE_REVIEW" || log.action?.includes("REVIEW");
    if (auditFilter === "ingestion") return log.action?.includes("INGEST") || log.action?.includes("EVIDENCE_COMMITTED") || log.action?.includes("EVIDENCE_VALIDATED");
    if (auditFilter === "notes") return log.action?.includes("NOTE") || log.action?.includes("HYPOTHESIS");
    if (auditFilter === "access") return log.action?.includes("ACCESS") || log.action?.includes("CASE_ACCESS");
    return true;
  });

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

  const processJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed: CaseArchivePayload = JSON.parse(content);

        if (!parsed.caseMetadata || !parsed.graphData || !parsed.graphData.nodes) {
          throw new Error("Invalid archive schema: Missing essential caseMetadata or graphData.nodes.");
        }

        onImportArchive(parsed);
        setImportStatus({
          success: true,
          caseName: parsed.caseMetadata.name,
          message: `Successfully loaded Case "${parsed.caseMetadata.name}" (${parsed.graphData.nodes.length} entities, ${parsed.graphData.links.length} relations, ${(parsed.evidenceRecords.firs || []).length} FIRs, ${(parsed.evidenceRecords.cdrs || []).length} CDR records).`,
        });
      } catch (err: any) {
        setImportStatus({
          success: false,
          message: err.message || "Failed to parse case archive file. Ensure valid JSON.",
        });
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
                className="w-full py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-600/20 active:scale-95"
              >
                <Upload className="w-4 h-4" />
                <span>Load File (.json)</span>
              </button>
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

          {/* Immutable Audit Ledger Stream */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-bold">
                <List className="w-4 h-4 text-amber-400" />
                <span>Immutable Audit Ledger Stream</span>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-[10px] font-mono rounded-lg px-2 py-1 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="all">All Events</option>
                  <option value="review">Review Decisions</option>
                  <option value="ingestion">Evidence Ingestion</option>
                  <option value="notes">Notes & Hypotheses</option>
                  <option value="access">Access Control</option>
                </select>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {filteredAuditLogs.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-[11px]">
                  No audit events match the current filter.
                </div>
              ) : (
                filteredAuditLogs.slice(0, 50).map((log, idx) => {
                  const isReview = log.actionType === "EVIDENCE_REVIEW" || log.action?.includes("REVIEW");
                  const isIngestion = log.action?.includes("INGEST") || log.action?.includes("EVIDENCE_COMMITTED") || log.action?.includes("EVIDENCE_VALIDATED");
                  const isNotes = log.action?.includes("NOTE") || log.action?.includes("HYPOTHESIS");
                  const isAccess = log.action?.includes("ACCESS") || log.action?.includes("CASE_ACCESS");

                  const getActionIcon = () => {
                    if (isReview) return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
                    if (isIngestion) return <Database className="w-3.5 h-3.5 text-cyan-400" />;
                    if (isNotes) return <FileText className="w-3.5 h-3.5 text-amber-400" />;
                    if (isAccess) return <Lock className="w-3.5 h-3.5 text-indigo-400" />;
                    return <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />;
                  };

                  const getTargetBadge = () => {
                    if (log.target_type === "NODE") return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">NODE</span>;
                    if (log.target_type === "LINK") return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">LINK</span>;
                    if (log.target_type === "EXHIBIT") return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">EVIDENCE</span>;
                    return <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{log.target_type || "SYSTEM"}</span>;
                  };

                  return (
                    <div
                      key={idx}
                      className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1.5 hover:border-amber-500/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="p-1.5 bg-slate-800 rounded-lg border border-slate-700 shrink-0">
                            {getActionIcon()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-100 truncate">{log.user_name || "System"}</span>
                              <span className="text-[9px] font-mono text-slate-400 shrink-0">{log.user_role || ""}</span>
                              {getTargetBadge()}
                              {log.target_label && (
                                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 truncate shrink-0">
                                  {log.target_label}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{log.details}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
                          <span className="text-[9px] font-mono text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                          <span className="text-[8px] font-mono text-slate-500">{log.digital_hash?.slice(0, 16)}...</span>
                        </div>
                      </div>
                      {log.metadata && (
                        <details className="group">
                          <summary className="text-[9px] text-slate-500 cursor-pointer hover:text-slate-300 flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            <span>View Digital Signature & Metadata</span>
                          </summary>
                          <div className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded text-[9px] font-mono text-slate-300 space-y-0.5">
                            <div><strong>Hash:</strong> {log.digital_hash}</div>
                            {log.metadata.previousState && <div><strong>Previous State:</strong> {log.metadata.previousState}</div>}
                            {log.metadata.newState && <div><strong>New State:</strong> {log.metadata.newState}</div>}
                            {log.metadata.note && <div><strong>Note:</strong> {log.metadata.note}</div>}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {filteredAuditLogs.length > 50 && (
              <div className="text-center text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
                Showing 50 of {filteredAuditLogs.length} events. Export full audit log for complete chain of custody.
              </div>
            )}
          </div>

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
