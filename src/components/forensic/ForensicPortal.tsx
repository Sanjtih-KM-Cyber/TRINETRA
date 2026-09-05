import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { caseApi } from "../../services/api";
import {
  Shield,
  FileText,
  Upload,
  PhoneCall,
  Landmark,
  HardDrive,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Sparkles,
  Zap,
  ArrowRight,
  Database,
  Fingerprint,
  Radio,
  FileCheck,
  ChevronRight,
  FolderGit2,
  SlidersHorizontal,
} from "lucide-react";

export const ForensicPortal: React.FC = () => {
  const { user, logout, authorizedCases } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "intake" | "processing" | "cdr" | "imei" | "custody" | "audit" | "overview"
  >("intake");

  const [currentCaseId, setCurrentCaseId] = useState<string>(
    authorizedCases[0]?.id || "case-garuda"
  );

  const [isLoading, setIsLoading] = useState(true);
  const [caseState, setCaseState] = useState<any>(null);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [cdrs, setCdrs] = useState<any[]>([]);
  const [financials, setFinancials] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Action status state
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedEvidenceForCommit, setSelectedEvidenceForCommit] = useState<any>(null);

  // Evidence Intake Form State
  const [intakeType, setIntakeType] = useState<"FIR" | "CDR_CSV" | "FINANCIAL_CSV" | "DEVICE">("FIR");
  const [fileName, setFileName] = useState("FIR_209_SpecialCell_CrimeBranch.pdf");
  const [sourceAuthority, setSourceAuthority] = useState("Special Cell, Lodhi Colony HQ");
  const [evidenceText, setEvidenceText] = useState(
    `SPECIAL INTELLIGENCE INTERCEPT REPORT - CRIME BRANCH
Case Ref: FIR No. 209/2026 under IPC 302, 120B and NDPS Act Sec 21.

On 14th August 2026, intelligence confirmed that prime accused Farooq 'Chacha' Merchant (Contact: +919820011442, Handset IMEI: 864219038472911) held secret communications with wanted kingpin Vikramaditya Singhania (+971508821990).
Financial transactions indicate ₹48,00,000 was wired to Hawala banker Rameshwar 'Munshi' Joshi (VPA: munshi.trade@oksbi).
Subsequently, logistics coordinator Karan 'Rider' Saluja deployed container truck MH-04-AZ-8890 escorted by Toyota Fortuner GA-03-K-4411 driven by armed enforcer Shankar 'Chhota' Gaikwad towards the Anjuna Beach safehouse in Goa.`
  );

  const loadCaseData = async (caseIdToLoad: string) => {
    setIsLoading(true);
    setActionError(null);
    try {
      const data = await caseApi.getCaseState(caseIdToLoad);
      setCaseState(data);
      setEvidenceList(data.evidenceFiles || []);
      setCdrs(data.cdrs || []);
      setFinancials(data.financials || []);
      setAuditLogs(data.auditLogs || []);
    } catch (err: any) {
      setActionError(err.message || "Failed to load case data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentCaseId) {
      loadCaseData(currentCaseId);
    }
  }, [currentCaseId]);

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName || !evidenceText) {
      setActionError("Please provide Exhibit Name and Content.");
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await caseApi.uploadEvidence(currentCaseId, {
        fileName,
        fileType: intakeType,
        sourceAuthority,
        rawText: evidenceText,
        fileSizeFormatted: `${(evidenceText.length / 1024).toFixed(1)} KB`,
        summary: `Exhibit uploaded by Forensic Specialist ${user?.name}.`,
      });

      setActionSuccess(`Exhibit ${fileName} uploaded under cryptographic chain of custody.`);
      // Switch to processing tab
      setActiveTab("processing");
      loadCaseData(currentCaseId);
    } catch (err: any) {
      setActionError(err.message || "Failed to upload evidence.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessEvidence = async (evidenceId: string) => {
    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await caseApi.processEvidence(currentCaseId, evidenceId);
      setActionSuccess(`Evidence exhibit processed. Generated candidate entities & links ready for review.`);
      loadCaseData(currentCaseId);
    } catch (err: any) {
      setActionError(err.message || "Failed to process evidence.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitEvidence = async (evidenceId: string) => {
    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await caseApi.commitEvidence(currentCaseId, evidenceId);
      setActionSuccess(`Intelligence committed to Official Case Graph! Real-time broadcast dispatched to SIT.`);
      loadCaseData(currentCaseId);
      setSelectedEvidenceForCommit(null);
    } catch (err: any) {
      setActionError(err.message || "Failed to commit evidence to graph.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="h-16 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base text-slate-100">
                CRIM-INTEL OS • Forensic Evidence Lab
              </h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                FORENSIC_INVESTIGATOR
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Cryptographic Ingestion, Telecom CDR Decryption & Evidence Lifecycle
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Case Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Case:</span>
            <select
              value={currentCaseId}
              onChange={(e) => setCurrentCaseId(e.target.value)}
              className="bg-transparent text-amber-400 font-mono text-xs font-bold focus:outline-none cursor-pointer"
            >
              {authorizedCases.map((c: any) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100 normal-case">
                  {c.codeName}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadCaseData(currentCaseId)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-all active:scale-95"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all active:scale-95"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Forensic Workspace */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-slate-900/70 border-r border-slate-800/80 p-3 sm:p-4 flex md:flex-col justify-between shrink-0">
          <div className="w-full space-y-6">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-2 font-bold">
                FORENSICS WORKSPACE
              </span>
              <nav className="mt-2 space-y-1">
                <button
                  onClick={() => setActiveTab("intake")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "intake"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Upload className="w-4 h-4" />
                    <span>Evidence Intake</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("processing")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "processing"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4 h-4" />
                    <span>Processing Queue</span>
                  </div>
                  <span className="font-mono text-[10px] bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800 text-slate-300">
                    {evidenceList.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("cdr")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "cdr"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <PhoneCall className="w-4 h-4" />
                    <span>CDR & Tower Triangulation</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">{cdrs.length}</span>
                </button>

                <button
                  onClick={() => setActiveTab("imei")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "imei"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4" />
                    <span>Handset & IMEI Hopping</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("custody")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "custody"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileCheck className="w-4 h-4" />
                    <span>Chain of Custody Ledger</span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab("audit")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "audit"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Fingerprint className="w-4 h-4" />
                    <span>Evidence Audit Trail</span>
                  </div>
                </button>
              </nav>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-2 font-bold">
                ASSIGNED OPERATION
              </span>
              <nav className="mt-2 space-y-1">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "overview"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FolderGit2 className="w-4 h-4" />
                    <span>Case Overview</span>
                  </div>
                </button>
              </nav>
            </div>
          </div>

          <div className="hidden md:block p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
            <span className="block font-semibold text-emerald-400 mb-1">Evidence Lifecycle</span>
            <div className="space-y-1 font-mono text-[10px]">
              <div>1. UPLOADED (Raw Checksum)</div>
              <div>2. PROCESSING (AI & NLP)</div>
              <div>3. VALIDATED (Candidate Graph)</div>
              <div>4. COMMITTED (Official State)</div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-7xl">
          {actionSuccess && (
            <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
              <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">✕</button>
            </div>
          )}

          {actionError && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
              <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-200">✕</button>
            </div>
          )}

          {/* ================= 1. EVIDENCE INTAKE ================= */}
          {activeTab === "intake" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Cryptographic Evidence Intake Terminal
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Ingest raw telecommunication CDR dumps, FIR memos, bank records, and hardware extractions.
                </p>
              </div>

              <form onSubmit={handleUploadEvidence} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
                {/* Evidence Type Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "FIR", label: "FIR / Intercept PDF", icon: FileText },
                    { id: "CDR_CSV", label: "Telecom CDR Dump", icon: PhoneCall },
                    { id: "FINANCIAL_CSV", label: "Bank & Hawala Ledger", icon: Landmark },
                    { id: "DEVICE", label: "Hardware / UFED Extractions", icon: Cpu },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setIntakeType(t.id as any)}
                      className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                        intakeType === t.id
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-500/30"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-850"
                      }`}
                    >
                      <t.icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Exhibit File Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="e.g. CDR_Dongri_Surveillance_Dump.csv"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Seizure / Source Authority *
                    </label>
                    <input
                      type="text"
                      required
                      value={sourceAuthority}
                      onChange={(e) => setSourceAuthority(e.target.value)}
                      placeholder="e.g. Special Cell / Cyber Cell / Telecom Nodal"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Raw Data / Extraction Payload *
                  </label>
                  <textarea
                    rows={8}
                    required
                    value={evidenceText}
                    onChange={(e) => setEvidenceText(e.target.value)}
                    placeholder="Paste raw text, CSV records, or intercept transcript..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">
                    Stage upon intake: <strong className="text-amber-400">UPLOADED</strong> (Calculates SHA-256 Checksum)
                  </span>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md flex items-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Hashing & Logging...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Register & Upload Exhibit</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================= 2. PROCESSING QUEUE ================= */}
          {activeTab === "processing" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Evidence Processing & Graph Commitment Queue
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Execute 4-stage lifecycle: UPLOADED → PROCESSING → VALIDATED → COMMITTED.
                </p>
              </div>

              <div className="space-y-4">
                {evidenceList.map((ev) => {
                  const status = ev.lifecycleStatus || (ev.processingStatus === "PROCESSED" ? "COMMITTED" : "UPLOADED");
                  return (
                    <div
                      key={ev.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs text-slate-100">{ev.fileName}</span>
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                status === "COMMITTED"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : status === "VALIDATED"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : status === "PROCESSING"
                                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                                  : "bg-slate-800 text-slate-300 border-slate-700"
                              }`}
                            >
                              {status}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-slate-400 border border-slate-800">
                              {ev.fileType} • {ev.fileSizeFormatted}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">{ev.summary}</p>
                          <div className="text-[10px] font-mono text-slate-400 mt-1">
                            Fingerprint: {ev.fileHash}
                          </div>
                        </div>

                        {/* Stage Action Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          {status === "UPLOADED" && (
                            <button
                              onClick={() => handleProcessEvidence(ev.id)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Process & Validate</span>
                            </button>
                          )}

                          {status === "VALIDATED" && (
                            <button
                              onClick={() => handleCommitEvidence(ev.id)}
                              disabled={isProcessing}
                              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/10 active:scale-95"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Commit to Case Graph</span>
                            </button>
                          )}

                          {status === "COMMITTED" && (
                            <span className="font-mono text-xs text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Live in Official Graph</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Candidate preview if validated or committed */}
                      {(ev.extractedEntitiesCount > 0 || ev.extractedRelationsCount > 0) && (
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                          <span>
                            Extracted: <strong className="text-slate-200">{ev.extractedEntitiesCount} Entities</strong> and{" "}
                            <strong className="text-slate-200">{ev.extractedRelationsCount} Relationships</strong>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Source Authority: {ev.sourceAuthority}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= 3. CDR & TOWER ANALYSIS ================= */}
          {activeTab === "cdr" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Telecom Call Detail Records (CDR) & Cell Tower Pings
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Interception dumps, midnight call anomalies, and tower azimuth coverage.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Caller (A-Party)</th>
                        <th className="py-3 px-4">Receiver (B-Party)</th>
                        <th className="py-3 px-4">Handset IMEI</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Cell Tower Location</th>
                        <th className="py-3 px-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-[11px]">
                      {cdrs.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-850/40 transition-colors">
                          <td className="py-2.5 px-4 font-bold text-amber-400">{c.callerNumber}</td>
                          <td className="py-2.5 px-4 text-slate-200">{c.receiverNumber}</td>
                          <td className="py-2.5 px-4 text-slate-400">{c.imei || "864219038472911"}</td>
                          <td className="py-2.5 px-4 text-emerald-400">{c.durationSec}s ({c.callType})</td>
                          <td className="py-2.5 px-4 text-slate-300">{c.towerLocation || c.towerId}</td>
                          <td className="py-2.5 px-4 text-slate-400">{c.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= 4. IMEI ANALYSIS ================= */}
          {activeTab === "imei" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Handset IMEI Hopping & Multi-SIM Matrix
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Detects suspect handset sharing and burner SIM swap behavior.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-amber-400">IMEI: 864219038472911</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                      HIGH ANOMALY
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-100">Primary Syndicate Burner Handset</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Used sequentially with 3 different IMSIs across Dongri, Vashi Toll, and Nhava Sheva container terminal.
                  </p>
                  <div className="pt-3 border-t border-slate-800 text-[11px] font-mono space-y-1 text-slate-400">
                    <div>SIM 1: +919820011442 (Farooq Merchant)</div>
                    <div>SIM 2: +919820099011 (Feroz Electrician)</div>
                    <div>SIM 3: +919820099022 (Unregistered Burner)</div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-indigo-400">IMEI: 359871098234123</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      OVERSEAS HUB
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-100">Satellite Intercept Handset</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Direct communications linked to Dubai IP PBX gateway terminating at Palm Jumeirah safehouse.
                  </p>
                  <div className="pt-3 border-t border-slate-800 text-[11px] font-mono space-y-1 text-slate-400">
                    <div>SIM: +971508821990 (Vikramaditya Singhania)</div>
                    <div>Carrier: Etisalat UAE Roaming</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= 5. CHAIN OF CUSTODY ================= */}
          {activeTab === "custody" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Forensic Chain of Custody & Evidence Vault
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Station diary references, SHA-256 seal records, and digital evidence custody log.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-800">
                  {evidenceList.map((e) => (
                    <div key={e.id} className="p-4 hover:bg-slate-850/40 transition-colors space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-100">{e.id}</span>
                          <span className="font-semibold text-xs text-slate-300">• {e.fileName}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-emerald-300 border border-slate-800">
                            {e.fileSizeFormatted}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">{e.uploadedAt}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                        SHA-256 Checksum: <strong className="text-slate-300">{e.fileHash}</strong>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Custody: <strong className="text-slate-300">{e.sourceAuthority}</strong></span>
                        <span>Sealed by: <strong className="text-slate-300">{e.uploadedBy} ({e.uploaderRole})</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= 6. AUDIT TRAIL ================= */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Evidence Audit Records
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Cryptographic log of forensic operations performed on this case.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="divide-y divide-slate-800">
                  {auditLogs.map((l) => (
                    <div key={l._id || l.id} className="p-4 hover:bg-slate-850/40 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-100">{l.user_name || l.officerName}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            {l.action || l.actionType}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{l.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-300">{l.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================= 7. CASE OVERVIEW ================= */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                  Assigned Case Scope
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  High-level parameters and custody boundaries for active investigation.
                </p>
              </div>

              {caseState && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 uppercase">
                        {caseState.case?.codeName}
                      </span>
                      <h3 className="font-bold text-base text-slate-100 mt-2">{caseState.case?.name}</h3>
                    </div>
                    <span className="text-xs font-mono text-slate-400">{caseState.case?.date}</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {caseState.case?.description}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800 text-center">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-lg font-bold font-mono text-amber-400">{caseState.nodes?.length || 0}</div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Entities</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-lg font-bold font-mono text-indigo-400">{caseState.links?.length || 0}</div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Relationships</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-lg font-bold font-mono text-emerald-400">{caseState.evidenceFiles?.length || 0}</div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Exhibits</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-lg font-bold font-mono text-rose-400">{caseState.cdrs?.length || 0}</div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">CDR Rows</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
