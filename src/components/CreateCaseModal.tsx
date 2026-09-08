import React, { useState, useEffect } from "react";
import { FolderPlus, X, ShieldAlert, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { caseApi, authApi } from "../services/api";
import { isAdmin } from "../data/roles";
import type { CaseDataset } from "../types";

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fired after the server registers the case (parent refreshes workspace). */
  onCreateCase: () => void;
  existingCases?: CaseDataset[];
}

/**
 * Phase 3 Req16 — case creation governance.
 * - No investigation templates.
 * - ADMIN-only (server enforces; Leads never see the form).
 * - Admin instantiates the container and optionally assigns a same-tenure Lead.
 */
export const CreateCaseModal: React.FC<CreateCaseModalProps> = ({
  isOpen,
  onClose,
  onCreateCase,
}) => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [codeName, setCodeName] = useState("");
  const [description, setDescription] = useState("");
  const [leadUserId, setLeadUserId] = useState("");
  const [leads, setLeads] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const admin = !!user && isAdmin(user.role);

  useEffect(() => {
    if (!isOpen || !admin) return;
    setError(null);
    setSuccess(null);
    authApi
      .getTenureUsers()
      .then((res) => setLeads((res.users || []).filter((u: any) => String(u.role).endsWith("_LEAD"))))
      .catch(() => setLeads([]));
  }, [isOpen, admin]);

  if (!isOpen) return null;

  const valid = name.trim().length > 0 && codeName.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await caseApi.createCase({
        name: name.trim(),
        codeName: codeName.trim(),
        description: description.trim(),
        leadUserId: leadUserId || undefined,
      });
      setSuccess(`Case ${res.case.codeName} registered. Lead workspace syncs in real time.`);
      setName("");
      setCodeName("");
      setDescription("");
      setLeadUserId("");
      setTimeout(() => {
        onCreateCase();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || "Case registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Register New Case</h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Department Admin only · container + Lead assignment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!admin ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Case registration is restricted to Department Admins. Lead Investigators nominate Points of
              Contact and requisition personnel from the command overview instead.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Case Name <span className="text-amber-400">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Operation Garuda Follow-on"
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Case CodeName <span className="text-amber-400">*</span>
                </label>
                <input
                  value={codeName}
                  onChange={(e) => setCodeName(e.target.value)}
                  placeholder="e.g. OP-GARUDA-2027"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Assign Lead Investigator
                </label>
                <select
                  value={leadUserId}
                  onChange={(e) => setLeadUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">Assign later</option>
                  {leads.map((l) => (
                    <option key={l._id} value={l._id}>
                      {l.name} ({l.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Interstate transfer order reference, court mandate, jurisdiction…"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !valid}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Registering…</span>
                </>
              ) : (
                <span>Register Case Container</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default CreateCaseModal;
