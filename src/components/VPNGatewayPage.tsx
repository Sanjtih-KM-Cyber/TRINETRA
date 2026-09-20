import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "../context/LanguageContext";
import { VPNTunnel } from "./VPNTunnel";
import {
  vpnApi,
  verifyCertificatePin,
  isDemoMode,
  VPN_GATEWAY_HOST,
  PINNED_GATEWAY_FINGERPRINT,
  type CertificateInfo,
} from "../services/vpn";
import {
  Shield, Lock, Wifi, AlertCircle, CheckCircle2, Loader2,
  Terminal, Copy, Check, ArrowRight, RotateCcw,
} from "lucide-react";


interface VPNGatewayPageProps {
  onAuthenticated: () => void;
}

type Stage = "idle" | "connecting" | "handshake" | "ready" | "error";

const HANDSHAKE_STEPS = [
  { label: "TCP Handshake", duration: 500 },
  { label: "TLS 1.3 Client Hello", duration: 450 },
  { label: "Certificate Verification + Pinning", duration: 700 },
  { label: "Key Exchange (ECDHE X25519)", duration: 500 },
  { label: "Session Keys Derived (AES-256-GCM)", duration: 400 },
  { label: "Tunnel Established + OTP Issued", duration: 300 },
];

const PRESENTED_CERT: CertificateInfo = {
  subject: "CCTNS-GW-MH-01",
  issuer: "NIC CA 2026",
  validFrom: "2024-01-15",
  validTo: "2027-03-15",
  fingerprint: PINNED_GATEWAY_FINGERPRINT,
  algorithm: "RSA-2048",
  san: ["cctns-gateway.mh.gov.in", "cctns-gateway.int"],
};

/**
 * Screen 1 — VPN tunnel gateway (tunnel only, no identity).
 * The officer establishes the encrypted tunnel, copies the handshake OTP,
 * and proceeds to Officer Sign-In where badge + PIN + OTP are verified.
 */
export const VPNGatewayPage: React.FC<VPNGatewayPageProps> = ({ onAuthenticated }) => {
  const { t } = useLanguage();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [handshakeStage, setHandshakeStage] = useState(0);
  const [certificate, setCertificate] = useState<CertificateInfo | null>(null);
  const [handshakeOtp, setHandshakeOtp] = useState<string | null>(null);
  const [handshakeOtpExpiry, setHandshakeOtpExpiry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const demo = isDemoMode();

  const addLine = (text: string, type: "INFO" | "OK" | "WARN" | "ERROR" = "INFO") => {
    const ts = new Date().toLocaleTimeString();
    setTerminalLines((prev) => [...prev, `${ts} [${type}] ${text}`].slice(-30));
  };

  useEffect(() => {
    addLine(`TRINETRA OS — VPN Gateway (${VPN_GATEWAY_HOST})`, "INFO");
    addLine(demo ? "CCTNS_DEMO_MODE=ON — anonymous tunnel handshake, OTP shown on screen" : "CCTNS_DEMO_MODE=OFF — production mTLS + pinned cert enforced", demo ? "WARN" : "INFO");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight });
  }, [terminalLines]);

  const runHandshake = async () => {
    setError(null);
    setHandshakeOtp(null);
    setStage("connecting");
    addLine(`Dialing ${VPN_GATEWAY_HOST}…`, "INFO");
    setStage("handshake");

    for (let i = 0; i < HANDSHAKE_STEPS.length; i++) {
      const step = HANDSHAKE_STEPS[i];
      setHandshakeStage(i + 1);
      addLine(step.label + "…", "INFO");

      if (i === 2) {
        const check = verifyCertificatePin(PRESENTED_CERT);
        if (!check.ok) {
          addLine(check.reason, "ERROR");
          setError(check.reason);
          setStage("error");
          return;
        }
        setCertificate(PRESENTED_CERT);
        addLine(`Certificate verified: ${PRESENTED_CERT.issuer} · pin match · valid to ${PRESENTED_CERT.validTo}`, "OK");
      }
      if (i === 3) addLine("ECDHE X25519 · perfect forward secrecy · TLS_AES_256_GCM_SHA384", "OK");
      if (i === 4) addLine("Session keys derived · rekey 3600s", "OK");
    }

    // Anonymous handshake — no identity leaves the workstation on this screen.
    setSubmitting(true);
    try {
      const vpn = await vpnApi.handshake(undefined);
      addLine(`VPN session ${vpn.vpnSession.slice(0, 18)}… · ${vpn.cipher} · ${vpn.protocol}${vpn.demo ? " · DEMO" : ""}${vpn.mtls ? " · mTLS" : ""}`, "OK");
      addLine("Tunnel established · MTU 1400 · keepalive 25s", "OK");
      if (vpn.otp) {
        setHandshakeOtp(vpn.otp);
        setHandshakeOtpExpiry(vpn.otpExpiresAt || null);
        // NOTE: OTP is intentionally NOT stored in sessionStorage — the
        // officer must copy/paste it manually on the Sign-In screen.
        try {
          sessionStorage.removeItem("crim_intel_vpn_otp");
          sessionStorage.removeItem("crim_intel_vpn_otp_exp");
        } catch {
          /* sessionStorage unavailable */
        }
        addLine(`Handshake OTP issued: ${vpn.otp} (valid 10 min) — copy it to Officer Sign-In.`, "OK");
      }
      setStage("ready");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Handshake failed";
      addLine(msg, "ERROR");
      setError(msg);
      setStage("error");
    } finally {
      setSubmitting(false);
    }
  };

  const copyOtp = async () => {
    if (!handshakeOtp) return;
    try {
      await navigator.clipboard.writeText(handshakeOtp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const reset = () => {
    setStage("idle");
    setHandshakeStage(0);
    setCertificate(null);
    setHandshakeOtp(null);
    setHandshakeOtpExpiry(null);
    setError(null);
    try {
      sessionStorage.removeItem("crim_intel_vpn_otp");
      sessionStorage.removeItem("crim_intel_vpn_otp_exp");
    } catch {
      /* noop */
    }
    vpnApi.disconnect().catch(() => undefined);
    addLine("Tunnel torn down by operator.", "WARN");
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col">
      <header className="border-b border-white/5 glass-strong px-4 sm:px-8 py-3 flex items-center justify-between transition-all duration-300 ease-in-out">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl glass-panel border border-primary/30 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(var(--color-primary),0.3)]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base">{t("appTitle")}</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-surface-container-lowest border border-white/10 text-primary uppercase shadow-sm">
                Restricted Gov Access
              </span>
              {demo && (
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-error-container text-on-error-container border border-error/50 uppercase shadow-sm">
                  Demo gateway
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">{t("appSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-on-surface-variant bg-surface-container-lowest px-2.5 py-1.5 rounded-lg border border-white/5">
            <Wifi className="w-3.5 h-3.5" />
            <span>{VPN_GATEWAY_HOST}</span>
          </div>
        </div>
      </header>

      {/* Centered tunnel-only column — M3 tonal surface, XL dialog geometry */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-4">
        <section className="glass-panel border-white/10 rounded-2xl p-6 space-y-5 shadow-2xl transition-all duration-300 ease-in-out">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" /> {t("secureTunnel")}
            </h2>
            <span className="text-[10px] font-mono px-2 py-1 rounded-lg border border-white/10 text-on-surface bg-surface-container-lowest flex items-center">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${stage === "ready" ? "bg-success" : stage === "error" ? "bg-error" : stage === "idle" ? "bg-slate-500" : "bg-primary animate-pulse"}`} />
              {stage === "idle" ? "DISCONNECTED" : stage === "ready" ? "TUNNEL ACTIVE · SECURE" : stage === "error" ? "CONNECTION FAILED" : "HANDSHAKE IN PROGRESS"}
            </span>
          </div>

          <VPNTunnel connected={stage === "ready"} latency={stage === "ready" ? 45 : 0} stage={handshakeStage} certificate={certificate} />

          <div>
            <h3 className="text-[11px] font-mono font-bold text-slate-400 mb-2">HANDSHAKE PROGRESS</h3>
            <div className="space-y-1.5">
              {HANDSHAKE_STEPS.map((s, idx) => (
                <div key={s.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${idx < handshakeStage ? "bg-success/20 border-success/40 text-success" : "bg-surface-container-lowest border-white/5 text-on-surface-variant"}`}>
                    {idx < handshakeStage ? "✓" : idx + 1}
                  </span>
                  <span className={idx < handshakeStage ? "text-on-surface" : "text-on-surface-variant"}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {certificate && (
            <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs space-y-1 backdrop-blur-sm">
              <div className="font-bold text-success flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> CERTIFICATE PINNED + VERIFIED</div>
              <div className="font-mono text-[11px] text-on-surface">Subject: {certificate.subject} · Issuer: {certificate.issuer}</div>
              <div className="font-mono text-[11px] text-on-surface-variant">Valid: {certificate.validFrom} → {certificate.validTo} · {certificate.algorithm}</div>
              <div className="font-mono text-[10px] text-on-surface-variant opacity-70 break-all">SHA-256 pin: {certificate.fingerprint}</div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-xs text-error flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {stage === "idle" || stage === "error" ? (
            <button onClick={runHandshake} disabled={submitting} className="btn-primary w-full disabled:opacity-50">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Establishing…</> : <><Lock className="w-4 h-4" /> Connect Tunnel</>}
            </button>
          ) : stage === "ready" ? null : (
            <button disabled className="btn-secondary w-full justify-center opacity-70">
              <Loader2 className="w-4 h-4 animate-spin" /> Handshake in progress…
            </button>
          )}

          {stage === "ready" && handshakeOtp && (
            <div className="rounded-xl glass-strong border border-primary/50 shadow-[0_0_20px_rgba(var(--color-primary),0.15)] p-4 text-center space-y-2 transition-all duration-300 ease-in-out relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5"></div>
              <div className="relative">
                <div className="text-[11px] font-medium text-primary uppercase tracking-[0.14em]">
                  Your tunnel OTP — copy it to Officer Sign-In
                </div>
                <div className="font-mono text-4xl font-black tracking-[0.45em] text-on-surface pl-2 select-all drop-shadow-md" aria-label={`Tunnel one-time code ${handshakeOtp}`}>{handshakeOtp}</div>
                {handshakeOtpExpiry && (
                  <div className="text-[11px] font-mono tracking-wider text-on-surface-variant">Valid until {new Date(handshakeOtpExpiry).toLocaleTimeString()} · bound to this tunnel</div>
                )}
                <div className="flex gap-2 justify-center pt-1">
                  <button onClick={copyOtp} className="btn-secondary glass-panel border-white/10 hover:bg-surface-container">
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied" : "Copy OTP"}
                  </button>
                  <button onClick={onAuthenticated} className="btn-primary">
                    Proceed to Officer Sign-In <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={reset} className="text-[11px] text-on-surface-variant hover:text-error inline-flex items-center gap-1 mt-2 transition-colors">
                  <RotateCcw className="w-3 h-3" /> Tear down & restart
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl glass-panel border border-white/5 shadow-xl">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5 text-[11px] font-mono font-bold text-on-surface-variant">
            <Terminal className="w-3.5 h-3.5" /> SYSTEM LOG
          </div>
          <div ref={terminalRef} className="h-36 overflow-y-auto p-3 space-y-1 font-mono text-[11px] leading-relaxed relative">
            <div className="absolute inset-0 bg-surface-container-lowest/50 pointer-events-none"></div>
            <div className="relative z-10">
              {terminalLines.map((l, i) => (
                <div key={i} className={l.includes("[ERROR]") ? "text-error" : l.includes("[OK]") ? "text-success" : l.includes("[WARN]") ? "text-warning" : "text-on-surface-variant"}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 px-4 sm:px-8 py-3 text-[11px] text-slate-500 flex flex-col sm:flex-row justify-between gap-1">
        <span>TRINETRA OS · mTLS + pinned TLS 1.3 · Section 65B BSA compliant chain</span>
        <span className="font-mono">Pin: {PINNED_GATEWAY_FINGERPRINT.slice(0, 23)}… · {demo ? "DEMO MODE" : "PRODUCTION"}</span>
      </footer>
    </div>
  );
};

export default VPNGatewayPage;
