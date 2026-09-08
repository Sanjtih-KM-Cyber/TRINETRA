import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { caseApi } from "../../services/api";
import { matrixFor } from "../../data/roleMatrices";
import { orgOf } from "../../data/roles";
import { DataRequestInbox } from "../requisitions/DataRequestInbox";
import {
  Shield,
  FileText,
  Upload,
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FolderGit2,
  UserCheck,
} from "lucide-react";

/**
 * Phase 4 Req20 — streamlined forensic upload portal. Exactly three blocks:
 * 1. Assigned Case Overview
 * 2. Superior Reporting Officer detail
 * 3. Direct drag-and-drop file ingestion for forensic artifacts/reports
 */
export const ForensicPortal: React.FC = () => {
  const { user, logout, authorizedCases } = useAuth();

  const [currentCaseId, setCurrentCaseId] = useState<string>(
    authorizedCases[0]?.id || "case-garuda"
  );
  const [caseSummary, setCaseSummary] = useState<any>(null);
  const [reportingOfficer, setReportingOfficer] = useState<any>(null);
  const [uploads, setUploads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mandate = user ? matrixFor(orgOf(user.role)).forensic : null;

  const load = async (caseId: string) => {
    setIsLoading(true);
    setNotice(null);
    try {
      const [state, members] = await Promise.all([
        caseApi.getCaseState(caseId),
        caseApi.getCaseMembers(caseId).catch(() => ({ members: [] })),
      ]);
      const list = members.members || [];
      setReportingOfficer(
        list.find((m: any) => String(m.role).endsWith("_LEAD")) ||
          list.find((m: any) => String(m.role).endsWith("_ADMIN")) ||
          null
      );
      setCaseSummary({
        id: caseId,
        evidence: (state.evidenceFiles || []).length,
        cdrs: (state.cdrs || []).length,
        financials: (state.financials || []).length,
        members: list.length,
      });
      setUploads(state.evidenceFiles || []);
    } catch (err: any) {
      setNotice({ ok: false, text: err.message || "Failed to load case." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentCaseId) load(currentCaseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCaseId]);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setIsUploading(true);
    setNotice(null);
    try {
      for (const f of arr) {
        const text = await readAsTextSafe(f);
        await caseApi.uploadEvidence(currentCaseId, {
          fileName: f.name,
          fileType: inferType(f),
          fileSize: f.size,
          fileSizeFormatted: formatBytes(f.size),
          sourceAuthority: `${user?.agency || "Forensic Lab"} · ${mandate?.title || "Forensics"}`,
          rawText: text || undefined,
          summary: `Forensic artifact '${f.name}' ingested by ${user?.name || "examiner"}.`,
        });
      }
      setNotice({ ok: true, text: `${arr.length} artifact(s) ingested to the evidence locker.` });
      await load(currentCaseId);
    } catch (err: any) {
      setNotice({ ok: false, text: err.message || "Upload failed." });
    } finally {
      setIsUploading(false);
      setIsDragging(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="h-16 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm sm:text-base">TRINETRA OS • Forensic Upload Portal</h1>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {user?.role || "FORENSIC"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{mandate?.mandate}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1">
            <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={currentCaseId}
              onChange={(e) => setCurrentCaseId(e.target.value)}
              className="bg-transparent text-emerald-300 font-mono text-xs font-bold focus:outline-none cursor-pointer"
            >
              {authorizedCases.map((c: any) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
                  {c.codeName}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => load(currentCaseId)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full space-y-4">
        {notice && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              notice.ok
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {notice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        {/* 1. Assigned Case Overview */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" /> 1 · Assigned Case Overview
          </h2>
          {isLoading ? (
            <p className="text-xs text-slate-500 font-mono">Loading case…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { label: "Evidence files", value: caseSummary?.evidence ?? 0 },
                { label: "CDR records", value: caseSummary?.cdrs ?? 0 },
                { label: "Financial rows", value: caseSummary?.financials ?? 0 },
                { label: "Team members", value: caseSummary?.members ?? 0 },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <div className="text-xl font-bold font-mono text-emerald-300">{s.value}</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. Superior Reporting Officer */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" /> 2 · Superior Reporting Officer
          </h2>
          {reportingOfficer ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-300">
                {(reportingOfficer.user_name || "O").charAt(0)}
              </div>
              <div>
                <div className="text-sm font-bold">{reportingOfficer.user_name}</div>
                <div className="text-[11px] font-mono text-slate-400">
                  {reportingOfficer.role} · {reportingOfficer.official_id} · {reportingOfficer.agency}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No reporting officer assigned yet — contact your department Admin.</p>
          )}
        </section>

        {/* 3. Drag-and-drop ingestion */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-400" /> 3 · Forensic Artifact Dropzone
          </h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-emerald-400 bg-emerald-500/10"
                : "border-slate-700 bg-slate-950/60 hover:border-emerald-500/50"
            }`}
          >
            <Upload className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold">
              {isUploading ? "Uploading…" : "Drop forensic reports / artifacts here, or click to browse"}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 font-mono">
              Fingerprint matches · autopsy reports · toxicology assays · CFSL documents
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {uploads.length > 0 && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {uploads.slice(0, 30).map((f: any) => (
                <div key={f.id || f._id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-[11px]">
                  <span className="text-slate-200 truncate font-mono">{f.fileName || f.file_name}</span>
                  <span className="font-mono text-emerald-300 shrink-0">{f.processingStatus || f.status || "UPLOADED"}</span>
                </div>
              ))}
            </div>
          )}
          {/* Phase 4 Req22 — Lead data requisitions to fulfill (nested in ingestion block) */}
          <DataRequestInbox caseId={currentCaseId} ownFunctional="FORENSIC" />
        </section>
      </main>
    </div>
  );
};

export default ForensicPortal;

function inferType(f: File): string {
  const n = f.name.toLowerCase();
  if (n.endsWith(".csv")) return "CDR_CSV";
  if (n.endsWith(".pdf")) return "PDF";
  if (n.startsWith("fir")) return "FIR";
  return "FORENSIC_REPORT";
}

function formatBytes(n: number): string {
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function readAsTextSafe(f: File): Promise<string> {
  if (f.size > 2 * 1024 * 1024) return Promise.resolve("");
  return new Promise((resolve) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || "").slice(0, 200000));
      r.onerror = () => resolve("");
      r.readAsText(f);
    } catch {
      resolve("");
    }
  });
}
