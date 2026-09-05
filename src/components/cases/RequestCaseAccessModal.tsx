import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { caseApi } from "../../services/api";
import {
  ShieldAlert,
  X,
  FileText,
  Lock,
  Send,
  CheckCircle2,
  AlertTriangle,
  Building,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";

interface RequestCaseAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedCaseId?: string;
  availableCases: Array<{
    id: string;
    name: string;
    codeName: string;
    description: string;
    date: string;
    leadAgency: string;
    hasAccess: boolean;
    hasPendingRequest: boolean;
  }>;
}

export const RequestCaseAccessModal: React.FC<RequestCaseAccessModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedCaseId,
  availableCases,
}) => {
  const { user } = useAuth();

  // Filter cases user doesn't have active access or pending request for
  const selectableCases = availableCases.filter((c) => !c.hasAccess && !c.hasPendingRequest);

  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    preselectedCaseId || selectableCases[0]?.id || ""
  );
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentSelectedCase = availableCases.find((c) => c.id === selectedCaseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId) {
      setError("Please select a case to request access.");
      return;
    }
    if (!reason.trim()) {
      setError("Please provide a legitimate operational justification for access.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await caseApi.requestCaseAccess(selectedCaseId, reason.trim());
      setSuccessMsg(res.message || "Case access request submitted successfully.");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to submit case access request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-wide">
                REQUEST CASE ACCESS
              </h2>
              <p className="text-xs text-slate-400">
                Official Law Enforcement Case Clearance & Workspace Authorization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Officer Credential Summary (Fixed) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Authenticated Officer Clearance
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Officer Name:</span>
                <span className="text-slate-200 font-semibold font-mono">{user?.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Designated Role:</span>
                <span className="text-amber-400 font-bold font-mono">
                  {user?.role === "LEAD_INVESTIGATOR"
                    ? "LEAD INVESTIGATOR"
                    : user?.role === "FORENSIC_INVESTIGATOR"
                    ? "FORENSIC INVESTIGATOR"
                    : user?.role}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Agency / Unit:</span>
                <span className="text-slate-300 font-mono">{user?.agency}</span>
              </div>
            </div>
          </div>

          {/* Case Selection Dropdown / Selector */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select Target Case Operation *
            </label>
            {selectableCases.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                You already have active membership or pending requests for all registered cases.
              </div>
            ) : (
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              >
                {selectableCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codeName} - {c.name}
                  </option>
                ))}
              </select>
            )}

            {currentSelectedCase && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <Building className="w-3.5 h-3.5 text-amber-400" />
                  <span>Lead Agency: {currentSelectedCase.leadAgency}</span>
                </div>
                <p className="text-slate-400 line-clamp-2">{currentSelectedCase.description}</p>
              </div>
            )}
          </div>

          {/* Justification Textarea */}
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Operational Justification / Reason for Access *
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Detail your operational role requirement (e.g. Assigned to analyze forensic CDR records, examine cryptocurrency tumbler trails, or lead multi-agency field raids)..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
            <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 font-mono">
              <span>Required for SecOps audit trail</span>
              <span>{reason.length}/500 chars</span>
            </div>
          </div>

          {/* Compliance Notice */}
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-slate-400 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Access authorizations are granted under Section 69 of the IT Act and Police
              Investigation Protocols. All actions and evidence contributions will be tied to your
              official badge ID <strong className="text-slate-200">{user?.official_id}</strong>.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectableCases.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Submit Access Request</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
