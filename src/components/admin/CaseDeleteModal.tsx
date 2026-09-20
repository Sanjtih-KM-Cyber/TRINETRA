import React, { useState } from "react";
import { AlertTriangle, Trash2, XCircle, AlertCircle } from "lucide-react";

interface CaseDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  onConfirm: () => void;
}

export const CaseDeleteModal: React.FC<CaseDeleteModalProps> = ({
  isOpen,
  onClose,
  caseId,
  reason,
  setReason,
  busy,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const confirmed = confirmText.trim().toUpperCase() === "DELETE";
  const reasonOk = reason.trim().length >= 6;

  const handleDelete = () => {
    if (!confirmed) {
      setLocalError("Type DELETE to confirm permanent deletion.");
      return;
    }
    if (!reasonOk) {
      setLocalError("Reason must be at least 6 characters.");
      return;
    }
    setLocalError(null);
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Delete Case Permanently</h2>
              <p className="text-xs text-slate-400">This action cannot be undone. All case data will be permanently removed.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
            <XCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-slate-200">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="text-sm font-semibold text-rose-300">This action is irreversible</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Deleting case {caseId || "(unknown)"} will permanently remove officers assigned, evidence files,
              entities, links, FIRs, CDRs, financials, intelligence, observations, proceedings, custody
              records, charge sheets, audit logs, and all related data.
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-300 mb-1 block">Type &quot;DELETE&quot; to confirm</span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-300 mb-1 block">Reason (min 6 chars) *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason for deletion (min 6 characters)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </label>

          {localError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{localError}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={busy || !confirmed || !reasonOk}
              className="flex-1 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete Permanently
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaseDeleteModal;
