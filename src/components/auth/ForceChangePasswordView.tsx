import React, { useState } from "react";
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertTriangle } from "lucide-react";
import { authApi } from "../../services/api";

interface ForceChangePasswordViewProps {
  officerName: string;
  onDone: () => void;
}

/** Mandatory rotation screen after admin unblock (temp-password session). */
export const ForceChangePasswordView: React.FC<ForceChangePasswordViewProps> = ({
  officerName,
  onDone,
}) => {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = pw.length > 0 && confirm.length > 0 && pw !== confirm;
  const valid = pw.length >= 6 && confirm.length >= 6 && !mismatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.changePassword(pw);
      onDone();
    } catch (err: any) {
      setError(err.message || "Password change failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">Set your new password</h2>
            <p className="text-[11px] font-mono text-slate-400">{officerName} · first sign-in after unblock</p>
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          You signed in with a one-time temporary password. Set your own password now —
          every sign-in after this uses the new password.
        </p>
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">New password * (min 6 chars)</span>
          <div className="relative mt-1">
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              minLength={6}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono pr-10"
              placeholder="Choose a strong password"
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-2 text-slate-400 hover:text-slate-200">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Confirm password *</span>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            className={`mt-1 w-full bg-slate-950 border rounded-xl px-3 py-2.5 text-xs font-mono ${mismatch ? "border-rose-500/60" : "border-slate-700"}`}
            placeholder="Repeat password"
          />
        </label>
        {mismatch && <p className="text-[11px] font-mono text-rose-300">Passwords do not match</p>}
        <button
          type="submit"
          disabled={!valid || busy}
          className="w-full px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
        >
          {busy ? "Saving…" : (<><CheckCircle2 className="w-4 h-4" /> Save new password</>)}
        </button>
      </form>
    </div>
  );
};

export default ForceChangePasswordView;
