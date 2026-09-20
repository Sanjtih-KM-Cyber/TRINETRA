import React, { useState, useEffect, useRef } from "react";
import { caseApi } from "../../services/api";
import { uploadExhibitFile } from "../../services/exhibitUpload";
import { X, FolderOpen, Users, FileText, RefreshCw, Upload, CheckCircle2, AlertCircle } from "lucide-react";

interface CaseViewerModalProps {
  caseId: string | null;
  onClose: () => void;
}

/**
 * Case viewer for Department Admins: open any same-tenure case to go through
 * its facts, roster and exhibits, then staff it from the pool. Admins may
 * also seal exhibits directly (PDF/DOC/images/audio/video) — analysis and
 * graph commitment stay with the investigation pipeline.
 */
export const CaseViewerModal: React.FC<CaseViewerModalProps> = ({ caseId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const st = await caseApi.getCaseState(id);
      setState(st);
    } catch (err: any) {
      setError(err.message || "Failed to open case.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) load(caseId);
  }, [caseId]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !caseId || uploading) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      let done = 0;
      let withText = 0;
      for (const f of Array.from(files)) {
        const up = await uploadExhibitFile(caseId, f);
        done++;
        if (up.withText) withText++;
      }
      setUploadMsg({ ok: true, text: `${done} exhibit(s) sealed into the evidence locker${withText ? ` (${withText} with text for SAHAYAK extraction)` : ""}.` });
      await load(caseId);
    } catch (err: any) {
      setUploadMsg({ ok: false, text: err.message || "Exhibit upload failed." });
    } finally {
      setUploading(false);
    }
  };

  if (!caseId) return null;
  const c = state?.case || {};
  const members: any[] = state?.members || [];
  const exhibits: any[] = state?.evidenceFiles || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-bold text-amber-400">{c.codeName || caseId}</div>
              <h2 className="text-sm font-bold text-slate-100 truncate">{c.name || "Case container"}</h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => load(caseId)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {loading ? (
            <p className="font-mono text-slate-500">Opening case container…</p>
          ) : error ? (
            <p className="text-rose-300">{error}</p>
          ) : (
            <>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-1.5">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Case Facts</div>
                <p className="text-slate-200 leading-relaxed">{c.description || "—"}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-slate-400 pt-1">
                  <span>Agency: <strong className="text-slate-200">{c.leadAgency || "—"}</strong></span>
                  <span>Opened: <strong className="text-slate-200">{c.date || "—"}</strong></span>
                  <span>Tenure: <strong className="text-slate-200">{c.org}{c.state ? `/${c.state}` : ""}</strong></span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">{(state?.nodes || []).length} entities</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">{(state?.links || []).length} links</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">{exhibits.length} exhibits</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">{(state?.firs || []).length} FIRs</span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Officers Involved ({members.length})
                </div>
                {members.length === 0 ? (
                  <p className="text-slate-500">No officers assigned — use Assign Lead on the pool card.</p>
                ) : (
                  <div className="space-y-1.5">
                    {members.map((m: any) => (
                      <div key={m._id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5">
                        <span className="text-slate-200 truncate">{m.user_name}</span>
                        <span className="font-mono text-[10px] text-amber-300 shrink-0">{m.role}{m.access === "VIEW_ONLY" ? " · read-only" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Case Files ({exhibits.length})
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.log,.csv,.json,.png,.jpg,.jpeg,.webp,.tiff,.bmp,.mp4,.mov,.avi,.mkv,.webm,.mp3,.wav,.m4a,.ogg,.aac"
                    onChange={(e) => {
                      uploadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-200 text-[11px] font-bold transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Sealing…" : "Add exhibit (PDF/DOC/image/audio/video, ≤15GB)"}
                  </button>
                </div>
                {uploadMsg && (
                  <div className={`p-2.5 rounded-lg text-[11px] flex items-center gap-2 border ${uploadMsg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
                    {uploadMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span>{uploadMsg.text}</span>
                  </div>
                )}
                {exhibits.length === 0 ? (
                  <p className="text-slate-500">No exhibits ingested yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {exhibits.map((e: any) => (
                      <div key={e.id} className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-2 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-200 font-mono text-[11px] truncate">{e.fileName}</span>
                          <span className="font-mono text-[10px] text-emerald-300 shrink-0">{e.lifecycleStatus || e.processingStatus}</span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-500 truncate">
                          {e.fileType} · {e.fileHash?.slice(0, 24)}… · {e.sourceAuthority}
                        </div>
                        {e.summary && <p className="text-[11px] text-slate-400 leading-snug">{e.summary}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaseViewerModal;
