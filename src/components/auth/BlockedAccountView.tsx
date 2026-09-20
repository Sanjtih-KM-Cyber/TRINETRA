import React, { useState, useEffect, useRef } from "react";
import { ShieldAlert, Copy, Check, RefreshCw, LogIn, UserX } from "lucide-react";
import { authApi } from "../../services/api";

export const BLOCKED_ID_KEY = "crim_intel_blocked_id";

export function getBlockedId(): string | null {
  try {
    return localStorage.getItem(BLOCKED_ID_KEY);
  } catch {
    return null;
  }
}

export function setBlockedId(id: string): void {
  try {
    localStorage.setItem(BLOCKED_ID_KEY, id);
  } catch {
    /* noop */
  }
}

export function clearBlockedId(): void {
  try {
    localStorage.removeItem(BLOCKED_ID_KEY);
  } catch {
    /* noop */
  }
}

interface BlockedAccountViewProps {
  identifier: string;
  reason?: string;
  onBackToLogin: () => void;
  onUseDifferentAccount: () => void;
}

/**
 * Lockout screen: persists across refresh (identifier in localStorage).
 * Polls account-status every 5s — when the department Admin unblocks,
 * the one-time temporary password appears here in realtime.
 */
export const BlockedAccountView: React.FC<BlockedAccountViewProps> = ({
  identifier,
  reason,
  onBackToLogin,
  onUseDifferentAccount,
}) => {
  const [checking, setChecking] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [unblocked, setUnblocked] = useState(false);
  const [officerName, setOfficerName] = useState("");
  const [copied, setCopied] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const checkStatus = async (silent = true) => {
    if (!identifier.trim()) return;
    if (!silent) setChecking(true);
    setPollError(null);
    try {
      const res = await authApi.accountStatus(identifier.trim());
      if (res.name) setOfficerName(res.name);
      if (res.unblocked && res.tempPassword) {
        setUnblocked(true);
        setTempPassword(res.tempPassword);
      } else if (res.unblocked && !res.tempPassword && (res as any).mustChangePassword) {
        setUnblocked(true);
      } else if (!res.blocked && res.status === "ACTIVE") {
        setUnblocked(true);
      }
    } catch (err: any) {
      if (!silent) setPollError(err.message || "Status check failed.");
    } finally {
      if (!silent) setChecking(false);
    }
  };

  useEffect(() => {
    setBlockedId(identifier);
    checkStatus(true);
    timerRef.current = window.setInterval(() => checkStatus(true), 5000);
    const onWsMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(String((e as any).data ?? ""));
        if (data?.type === "ACCOUNT_STATUS" && data?.unblocked) {
          if (data.tempPassword) setTempPassword(String(data.tempPassword));
          setUnblocked(true);
        }
      } catch {
        /* ignore */
      }
    };
    // Best-effort: if a socket exists it may carry the unblock push.
    // Polling above is the guaranteed path (no auth needed while blocked).
    window.addEventListener("message", onWsMessage as any);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      window.removeEventListener("message", onWsMessage as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier]);

  const copyTemp = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-300">
            {unblocked ? <Check className="w-5 h-5 text-emerald-300" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-base font-bold">{unblocked ? "Account unblocked" : "Account blocked"}</h2>
            <p className="text-[11px] font-mono text-slate-400">{identifier}</p>
          </div>
        </div>

        {!unblocked ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              {reason ||
                "Your account is blocked after repeated wrong OTP attempts. Your department Admin has been notified — you will be intimated here when it is unblocked. Keep this screen open."}
            </p>
            {officerName && (
              <p className="text-[11px] font-mono text-slate-400">Officer: {officerName}</p>
            )}
            <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Waiting for admin action — auto-checking every 5s
            </div>
            {pollError && <p className="text-[11px] text-rose-300">{pollError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => checkStatus(false)}
                disabled={checking}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
                {checking ? "Checking…" : "Check now"}
              </button>
              <button
                onClick={onUseDifferentAccount}
                className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5"
              >
                <UserX className="w-3.5 h-3.5" /> Different account
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-emerald-300 leading-relaxed">
              {officerName ? `${officerName}, your` : "Your"} account has been unblocked by your
              department Admin. Sign in with this one-time temporary password, then set your own on the next screen.
            </p>
            {tempPassword ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-300">
                  One-time temporary password
                </div>
                <div className="font-mono text-2xl font-black tracking-widest text-emerald-200 select-all">
                  {tempPassword}
                </div>
                <button
                  onClick={copyTemp}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold inline-flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                Temporary password was already consumed — sign in with your current password.
              </p>
            )}
            <button
              onClick={onBackToLogin}
              className="w-full px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center justify-center gap-1.5"
            >
              <LogIn className="w-4 h-4" /> Proceed to Officer Sign-In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockedAccountView;
