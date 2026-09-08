import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { vpnApi, isDemoMode } from "../../services/vpn";
import type { UserRole } from "../../data/roles";
import { REQUESTABLE_ROLES, KNOWN_STATES, orgOf } from "../../data/roles";
import { detectGovTenant } from "../../data/departments";
import {
  Shield,
  Lock,
  User,
  Building,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  BadgeCheck,
  ArrowLeft,
  Eye,
  EyeOff,
  Briefcase,
  Layers,
  FileCheck,
  ShieldAlert,
  Clock,
  Sparkles,
  Check,
  X,
} from "lucide-react";

export const LoginView: React.FC = () => {
  const { login, requestAccess } = useAuth();
  const [viewMode, setViewMode] = useState<"signin" | "request">("signin");

  // Sign in form state (Phase 1: badge + PIN + tunnel-handshake OTP)
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(() => {
    try {
      return sessionStorage.getItem("crim_intel_vpn_otp") || "";
    } catch {
      return "";
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(120);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [accountStatusNotice, setAccountStatusNotice] = useState<{
    status: "PENDING" | "REJECTED" | "SUSPENDED";
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Request access form state
  // 1. IDENTITY
  const [reqFullName, setReqFullName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqBadgeId, setReqBadgeId] = useState("");

  // 2. ORGANIZATION
  const [reqAgency, setReqAgency] = useState("");
  const [reqDepartment, setReqDepartment] = useState("");
  const [reqRole, setReqRole] = useState<UserRole>("CBI_LEAD");
  const [reqState, setReqState] = useState<string>("MAHARASHTRA");

  // 3. ACCESS JUSTIFICATION
  const [reqReason, setReqReason] = useState("");

  // 4. SECURITY
  const [reqPassword, setReqPassword] = useState("");
  const [reqConfirmPassword, setReqConfirmPassword] = useState("");
  const [showReqPassword, setShowReqPassword] = useState(false);
  const [showReqConfirmPassword, setShowReqConfirmPassword] = useState(false);

  const [reqError, setReqError] = useState<string | null>(null);

  // Confirmation receipt state
  const [submissionReceipt, setSubmissionReceipt] = useState<{
    requestId: string;
    fullName: string;
    email: string;
    badgeId: string;
    agency: string;
    department: string;
    requestedRole: UserRole;
    state?: string;
    timestamp: string;
  } | null>(null);

  const isSignInFormValid =
    identifier.trim().length > 0 && password.length > 0 && /^\d{6}$/.test(otp);

  // Phase 1 Req4 — idle timer on the Officer Sign-In screen: 2 min of no
  // mouse/keyboard/touch activity tears down the tunnel and routes back to
  // the VPN gateway (App re-probes vpnApi.status() after reload).
  const idleTimerRef = useRef<number | null>(null);
  const idleCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    if (viewMode !== "signin" || submissionReceipt) return;
    setIdleSecondsLeft(120);
    const reset = () => setIdleSecondsLeft(120);
    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    idleCountdownRef.current = window.setInterval(() => {
      setIdleSecondsLeft((prev) => {
        if (prev <= 1) {
          if (idleCountdownRef.current) window.clearInterval(idleCountdownRef.current);
          vpnApi.disconnect().finally(() => window.location.reload());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reset));
      if (idleCountdownRef.current) window.clearInterval(idleCountdownRef.current);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [viewMode, submissionReceipt]);

  const passwordsMatch = reqPassword.length > 0 && reqPassword === reqConfirmPassword;
  const isPasswordValid = reqPassword.length >= 6;

  const isRequestFormValid =
    reqFullName.trim().length > 0 &&
    reqEmail.trim().length > 0 &&
    reqBadgeId.trim().length > 0 &&
    reqAgency.trim().length > 0 &&
    reqDepartment.trim().length > 0 &&
    isPasswordValid &&
    passwordsMatch;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignInFormValid) return;

    setIsSubmitting(true);
    setLoginError(null);
    setAccountStatusNotice(null);

    try {
      await login(identifier.trim(), password, otp);
    } catch (err: any) {
      const status = err.data?.status;
      // Wrong-OTP lockout: tunnel is torn down and the officer returns to it.
      if (status === "LOCKED" || err.message?.toLowerCase().includes("locked")) {
        setLoginError(
          err.message || "Account locked after repeated wrong OTP attempts. Contact your department Admin."
        );
        await vpnApi.disconnect().catch(() => undefined);
        setTimeout(() => window.location.reload(), 2500);
        return;
      }
      if (status === "PENDING" || err.message?.toLowerCase().includes("pending")) {
        setAccountStatusNotice({
          status: "PENDING",
          message: "Your access request is awaiting administrator approval. You will be able to sign in once your credentials are verified and activated.",
        });
      } else if (status === "REJECTED" || err.message?.toLowerCase().includes("rejected")) {
        setAccountStatusNotice({
          status: "REJECTED",
          message: "Your access request was rejected during administrative review. Contact your agency supervisor for assistance.",
        });
      } else if (status === "SUSPENDED" || err.message?.toLowerCase().includes("suspended")) {
        setAccountStatusNotice({
          status: "SUSPENDED",
          message: "Your workstation account credentials have been suspended. Contact system administration for access restoration.",
        });
      } else {
        setLoginError(err.message || "Invalid credentials. Please verify your Official Email or Badge ID and password.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reqFullName.trim() || !reqEmail.trim() || !reqBadgeId.trim() || !reqAgency.trim() || !reqDepartment.trim()) {
      setReqError("Please complete all required fields marked with an asterisk (*).");
      return;
    }

    if (reqPassword.length < 6) {
      setReqError("Password must be at least 6 characters in length.");
      return;
    }

    if (reqPassword !== reqConfirmPassword) {
      setReqError("The passwords entered do not match. Please verify both password fields.");
      return;
    }

    setIsSubmitting(true);
    setReqError(null);

    try {
      const isPoliceRole = orgOf(reqRole) === "POLICE";
      const res: any = await requestAccess({
        full_name: reqFullName.trim(),
        official_id: reqBadgeId.trim(),
        official_email: reqEmail.trim().toLowerCase(),
        agency: reqAgency.trim(),
        designation: "Investigative Officer",
        department: reqDepartment.trim(),
        requested_role: reqRole,
        state: isPoliceRole ? reqState : undefined,
        reason_for_access: reqReason.trim() || "Operational syndicate network analysis, evidence ingestion, and case collaboration.",
        password: reqPassword,
      });

      const generatedReqId =
        res?.request_id ||
        `REQ-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      setSubmissionReceipt({
        requestId: generatedReqId,
        fullName: reqFullName.trim(),
        email: reqEmail.trim().toLowerCase(),
        badgeId: reqBadgeId.trim(),
        agency: reqAgency.trim(),
        department: reqDepartment.trim(),
        requestedRole: reqRole,
        state: orgOf(reqRole) === "POLICE" ? reqState : undefined,
        timestamp: new Date().toLocaleString("en-IN", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      });

      // Clear sensitive request inputs
      setReqFullName("");
      setReqEmail("");
      setReqBadgeId("");
      setReqAgency("");
      setReqDepartment("");
      setReqReason("");
      setReqPassword("");
      setReqConfirmPassword("");
    } catch (err: any) {
      setReqError(err.message || "Failed to submit access request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetToSignIn = () => {
    setViewMode("signin");
    setSubmissionReceipt(null);
    setLoginError(null);
    setAccountStatusNotice(null);
    setReqError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Bar Header */}
      <header className="border-b border-slate-850 bg-slate-950/95 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono font-black text-sm shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight text-slate-100">
                TRINETRA OS
              </span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-750 text-amber-400 font-semibold uppercase tracking-wider">
                RESTRICTED GOV ACCESS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              National Security Intelligence & Criminal Syndicate Interdiction Platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
          <span className="text-[11px] tracking-wide text-slate-300">SECURE GATEWAY</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center items-center px-4 py-8 sm:py-12">
        {/* ================= 1. SUBMISSION RECEIPT VIEW ================= */}
        {submissionReceipt ? (
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-800">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight uppercase">
                  ACCESS REQUEST SUBMITTED
                </h2>
                <p className="text-xs text-slate-400">
                  Your request has been received and is awaiting administrator approval.
                </p>
              </div>
            </div>

            {/* Status Highlight Banner */}
            <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Application Status:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                PENDING ADMINISTRATIVE REVIEW
              </span>
            </div>

            {/* Request Summary Receipt Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 mb-6">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
                <span className="text-xs text-slate-400 font-mono">Request Reference ID</span>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {submissionReceipt.requestId}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Applicant Name</span>
                  <span className="text-slate-200 font-medium">{submissionReceipt.fullName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Official Email</span>
                  <span className="text-slate-200 font-mono text-[11px] truncate block">
                    {submissionReceipt.email}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Badge / Employee ID</span>
                  <span className="text-slate-200 font-mono text-[11px]">{submissionReceipt.badgeId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Organization & Unit</span>
                  <span className="text-slate-200 font-medium truncate block">
                    {submissionReceipt.agency} • {submissionReceipt.department}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Requested Role</span>
                  <span className="text-xs font-semibold text-slate-200 font-mono">
                    {submissionReceipt.requestedRole}
                    {submissionReceipt.state ? ` · ${submissionReceipt.state}` : ""}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Submission Timestamp</span>
                  <span className="text-[11px] font-mono text-slate-300">
                    {submissionReceipt.timestamp}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 leading-relaxed mb-6">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Access will remain unavailable until an authorized administrator verifies your identity and grants clearance.
                  Do not attempt repeated logins until approval confirmation is received.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetToSignIn}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs sm:text-sm transition-all border border-slate-700 flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Sign In</span>
            </button>
          </div>
        ) : viewMode === "signin" ? (
          /* ================= 2. OFFICER SIGN IN VIEW ================= */
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 animate-in fade-in duration-150">
            {/* Phase 1 Req3 — in-flow tabs inside the Login view */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => setViewMode("signin")}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
              >
                Officer Sign-In
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("request");
                  setLoginError(null);
                  setAccountStatusNotice(null);
                  setReqError(null);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Request Access
              </button>
            </div>
            <div className="mb-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-100 tracking-tight">Officer Sign In</h2>
              <p className="text-xs text-slate-400 mt-1">
                Badge + PIN + tunnel-handshake OTP (issued on the VPN screen).
              </p>
              <p className="text-[11px] font-mono text-slate-500 mt-1.5 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                Idle reset in {Math.floor(idleSecondsLeft / 60)}:{String(idleSecondsLeft % 60).padStart(2, "0")} → VPN gateway
              </p>
            </div>

            {/* Account Status Notices */}
            {accountStatusNotice && (
              <div
                className={`p-3.5 rounded-xl mb-5 text-xs flex items-start gap-2.5 border ${
                  accountStatusNotice.status === "PENDING"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">
                    {accountStatusNotice.status === "PENDING"
                      ? "Access Pending Approval"
                      : accountStatusNotice.status === "REJECTED"
                      ? "Access Request Rejected"
                      : "Account Suspended"}
                  </strong>
                  <span className="text-[11px] leading-normal">{accountStatusNotice.message}</span>
                </div>
              </div>
            )}

            {/* Login Error Notice */}
            {loginError && !accountStatusNotice && (
              <div className="p-3.5 rounded-xl mb-5 bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-normal">{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="official-identifier"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Official Email / Badge ID <span className="text-amber-400">*</span>
                </label>
                {(() => {
                  const detected = detectGovTenant(identifier.trim());
                  return detected ? (
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-mono">
                      <span
                        className="px-2 py-0.5 rounded border font-bold"
                        style={{
                          borderColor: `${detected.department.accentColor}66`,
                          color: detected.department.accentColor,
                        }}
                      >
                        {detected.department.shortName}
                        {detected.state ? ` · ${detected.state}` : ""}
                      </span>
                      <span className="text-slate-500">dept resolved from gov-ID prefix</span>
                    </div>
                  ) : null;
                })()}
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="official-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (loginError) setLoginError(null);
                    }}
                    placeholder="e.g. CBI-LEAD-210 or rao@cbi.gov.in"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="official-password"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Password <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="official-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (loginError) setLoginError(null);
                    }}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="tunnel-otp"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Tunnel OTP <span className="text-amber-400">*</span>
                  <span className="ml-1 font-normal text-slate-500">6-digit code from VPN handshake</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="tunnel-otp"
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                      if (loginError) setLoginError(null);
                    }}
                    placeholder="000000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono tracking-[0.35em] transition-colors"
                  />
                </div>
              </div>

              {isDemoMode() && (
                <p className="text-[11px] font-mono text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                  Demo — admin@cbi.gov.in / Admin@123 · rao@cbi.gov.in / Lead@123 · cid_cyber_01@cid.gov.in / Agency@123 · patil@mahapolice.gov.in / Lead@123
                  <span className="block mt-1 text-slate-400">Paste the 6-digit OTP from the VPN tunnel screen. 5 wrong OTPs lock the account.</span>
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !isSignInFormValid}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <BadgeCheck className="w-4 h-4 stroke-[2.5]" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* ================= 3. REQUEST ACCESS VIEW ================= */
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 animate-in fade-in duration-150">
            {/* Phase 1 Req3 — same in-flow tabs on the request side */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => {
                  setViewMode("signin");
                  setReqError(null);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Officer Sign-In
              </button>
              <button
                type="button"
                onClick={() => setViewMode("request")}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
              >
                Request Access
              </button>
            </div>
            <div className="mb-6 flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  Access Clearance Request
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Submit official credentials and security profile for administrative authorization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewMode("signin");
                  setReqError(null);
                }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors shrink-0"
                title="Return to Sign In"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>

            {reqError && (
              <div className="p-3.5 rounded-xl mb-5 bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-normal">{reqError}</span>
              </div>
            )}

            <form onSubmit={handleRequestSubmit} className="space-y-6">
              {/* GROUP 1: IDENTITY */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                  <User className="w-3.5 h-3.5" />
                  <span>Identity</span>
                </div>

                <div>
                  <label htmlFor="req-fullname" className="block text-xs font-semibold text-slate-300 mb-1">
                    Full Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    id="req-fullname"
                    type="text"
                    required
                    value={reqFullName}
                    onChange={(e) => setReqFullName(e.target.value)}
                    placeholder="e.g. Officer Vikramaditya Rathore"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="req-email" className="block text-xs font-semibold text-slate-300 mb-1">
                      Official Email <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="req-email"
                      type="email"
                      required
                      value={reqEmail}
                      onChange={(e) => setReqEmail(e.target.value)}
                      placeholder="officer@agency.gov.in"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="req-badge" className="block text-xs font-semibold text-slate-300 mb-1">
                      Badge / Employee ID <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="req-badge"
                      type="text"
                      required
                      value={reqBadgeId}
                      onChange={(e) => setReqBadgeId(e.target.value)}
                      placeholder="e.g. cbi_lead_01 / police_kar_lead"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* GROUP 2: ORGANIZATION */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                  <Building className="w-3.5 h-3.5" />
                  <span>Organization</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="req-agency" className="block text-xs font-semibold text-slate-300 mb-1">
                      Department / Agency <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="req-agency"
                      type="text"
                      required
                      value={reqAgency}
                      onChange={(e) => setReqAgency(e.target.value)}
                      placeholder="e.g. Central Bureau of Investigation"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="req-dept" className="block text-xs font-semibold text-slate-300 mb-1">
                      Division / Unit <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="req-dept"
                      type="text"
                      required
                      value={reqDepartment}
                      onChange={(e) => setReqDepartment(e.target.value)}
                      placeholder="e.g. Special Task Force & Cyber"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Requested Operational Role <span className="text-amber-400">*</span>
                    <span className="ml-1 font-normal text-slate-500">(CBI / NIA / CID / State Police)</span>
                  </label>

                  <div className="grid grid-cols-1 gap-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {REQUESTABLE_ROLES.map((value) => (
                        <label
                          key={value}
                          className={`px-2.5 py-2 rounded-lg border text-[11px] cursor-pointer transition-all flex items-center gap-2 ${
                            reqRole === value
                              ? "bg-amber-500/10 border-amber-500/40 text-slate-100"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="radio"
                            name="requested_role"
                            value={value}
                            checked={reqRole === value}
                            onChange={() => setReqRole(value)}
                            className="text-amber-500 focus:ring-amber-500"
                          />
                          <span className="font-semibold font-mono">{value}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Gov-ID prefix drives tenant: cbi_ / nia_ / cid_ / police_kar_ / police_mah_. Use CID_CYBER for cid_cyber_01.
                    </p>

                    {orgOf(reqRole) === "POLICE" && (
                      <div>
                        <label htmlFor="req-state" className="block text-xs font-semibold text-slate-300 mb-1">
                          State Jurisdiction <span className="text-amber-400">*</span>
                        </label>
                        <select
                          id="req-state"
                          value={reqState}
                          onChange={(e) => setReqState(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          {KNOWN_STATES.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.label} ({s.code})
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Karnataka and Maharashtra admins are fully isolated tenants.
                        </p>
                      </div>
                    )}

                    {/* Policy note regarding Admin Role */}
                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
                      <Layers className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-300">ADMIN PRIVILEGES: </span>
                        <span>
                          CBI/NIA/CID/State-Police Admin roles are provisioned strictly by existing department Admins within the same tenant.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* GROUP 3: ACCESS JUSTIFICATION */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Access Justification</span>
                </div>

                <div>
                  <label htmlFor="req-reason" className="block text-xs font-semibold text-slate-300 mb-1">
                    Reason for Access <span className="text-slate-400 font-normal">(Operational Justification)</span>
                  </label>
                  <textarea
                    id="req-reason"
                    rows={2}
                    value={reqReason}
                    onChange={(e) => setReqReason(e.target.value)}
                    placeholder="Specify case assignment, operational jurisdiction, or investigative interdiction tasks..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors"
                  />
                </div>
              </div>

              {/* GROUP 4: SECURITY */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Security</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="req-password" className="block text-xs font-semibold text-slate-300 mb-1">
                      Password <span className="text-amber-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="req-password"
                        type={showReqPassword ? "text" : "password"}
                        required
                        value={reqPassword}
                        onChange={(e) => setReqPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowReqPassword(!showReqPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showReqPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="req-confirm-password" className="block text-xs font-semibold text-slate-300 mb-1">
                      Confirm Password <span className="text-amber-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="req-confirm-password"
                        type={showReqConfirmPassword ? "text" : "password"}
                        required
                        value={reqConfirmPassword}
                        onChange={(e) => setReqConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                        className={`w-full bg-slate-950 border rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 font-mono transition-colors ${
                          reqConfirmPassword.length > 0
                            ? passwordsMatch
                              ? "border-emerald-500/60 focus:ring-emerald-500"
                              : "border-rose-500/60 focus:ring-rose-500"
                            : "border-slate-700 focus:ring-amber-500"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowReqConfirmPassword(!showReqConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showReqConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password match indicator */}
                {reqConfirmPassword.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    {passwordsMatch ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Passwords match
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Passwords do not match
                      </span>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !isRequestFormValid}
                className="w-full mt-4 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4 stroke-[2.5]" />
                    <span>Submit Access Request</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setViewMode("signin")}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Return to Sign In
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Clean Enterprise Footer */}
      <footer className="border-t border-slate-850 bg-slate-950/95 backdrop-blur-md px-4 sm:px-8 py-3 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 z-10 shrink-0">
        <span>TRINETRA OS • Restricted to Authorized Law Enforcement Personnel</span>
        <span className="font-mono text-[11px] text-slate-400">
          Section 65B Indian Evidence Act Compliant
        </span>
      </footer>
    </div>
  );
};
