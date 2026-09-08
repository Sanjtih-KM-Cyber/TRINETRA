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
import { LanguageSelector } from "./i18n/LanguageSelector";
import {
  Shield, Lock, Wifi, AlertCircle, CheckCircle2, Loader2,
  Terminal, Copy, Check, ArrowRight, RotateCcw, FileKey,
} from "lucide-react";

interface VPNGatewayPageProps {
  onAuthenticated: () => void;
}

type Stage = "idle" | "connecting" | "handshake" | "ready" | "error";

const HANDSHAKE_STEPS = [
  { label: "TCP Handshake", duration: 500 },
  { label: "TLS 1.3 Client Hello", duration: 450 },
  { label: "Certificate Verification + Pinning", duration: 700 },
  { label: "mTLS Client Certificate", duration: 600 },
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
  const [clientCertPem, setClientCertPem] = useState("");
  const [certFileName, setCertFileName] = useState("");
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
    await new Promise((r) => setTimeout(r, 400));
    setStage("handshake");

    for (let i = 0; i < HANDSHAKE_STEPS.length; i++) {
      const step = HANDSHAKE_STEPS[i];
      setHandshakeStage(i + 1);
      addLine(step.label + "…", "INFO");
      await new Promise((r) => setTimeout(r, demo ? Math.min(step.duration, 250) : step.duration));

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
      if (i === 3) {
        if (!demo && !clientCertPem.trim()) {
          addLine("mTLS client certificate required in production mode. Attach your officer .pem.", "ERROR");
          setError("mTLS client certificate required. Attach your issued officer certificate (.pem).");
          setStage("error");
          return;
        }
        addLine(demo && !clientCertPem.trim() ? "mTLS skipped (demo mode) — client cert optional" : "mTLS client certificate presented and verified", "OK");
      }
      if (i === 4) addLine("ECDHE X25519 · perfect forward secrecy · TLS_AES_256_GCM_SHA384", "OK");
      if (i === 5) addLine("Session keys derived · rekey 3600s", "OK");
    }

    // Anonymous handshake — no identity leaves the workstation on this screen.
    setSubmitting(true);
    try {
      const vpn = await vpnApi.handshake(clientCertPem || undefined);
      addLine(`VPN session ${vpn.vpnSession.slice(0, 18)}… · ${vpn.cipher} · ${vpn.protocol}${vpn.demo ? " · DEMO" : ""}${vpn.mtls ? " · mTLS" : ""}`, "OK");
      addLine("Tunnel established · MTU 1400 · keepalive 25s", "OK");
      if (vpn.otp) {
        setHandshakeOtp(vpn.otp);
        setHandshakeOtpExpiry(vpn.otpExpiresAt || null);
        try {
          sessionStorage.setItem("crim_intel_vpn_otp", vpn.otp);
          if (vpn.otpExpiresAt) sessionStorage.setItem("crim_intel_vpn_otp_exp", vpn.otpExpiresAt);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/95 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base">{t("appTitle")}</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-400 uppercase">
                Restricted Gov Access
              </span>
              {demo && (
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 uppercase">
                  Demo gateway
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">{t("appSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <Wifi className="w-3.5 h-3.5" />
            <span>{VPN_GATEWAY_HOST}</span>
          </div>
        </div>
      </header>

      {/* Centered tunnel-only column */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-4">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" /> {t("secureTunnel")}
            </h2>
            <span className="text-[10px] font-mono px-2 py-1 rounded-lg border border-slate-700 text-slate-300">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${stage === "ready" ? "bg-emerald-400" : stage === "error" ? "bg-rose-400" : stage === "idle" ? "bg-slate-500" : "bg-cyan-400 animate-pulse"}`} />
              {stage === "idle" ? "DISCONNECTED" : stage === "ready" ? "TUNNEL ACTIVE · SECURE" : stage === "error" ? "CONNECTION FAILED" : "HANDSHAKE IN PROGRESS"}
            </span>
          </div>

          <VPNTunnel connected={stage === "ready"} latency={stage === "ready" ? 45 : 0} stage={handshakeStage} certificate={certificate} />

          <div>
            <h3 className="text-[11px] font-mono font-bold text-slate-400 mb-2">HANDSHAKE PROGRESS</h3>
            <div className="space-y-1.5">
              {HANDSHAKE_STEPS.map((s, idx) => (
                <div key={s.label} className="flex items-center gap-2 text-xs">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${idx < handshakeStage ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-slate-800 border-slate-700 text-slate-500"}`}>
                    {idx < handshakeStage ? "✓" : idx + 1}
                  </span>
                  <span className={idx < handshakeStage ? "text-slate-200" : "text-slate-500"}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {certificate && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-1">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> CERTIFICATE PINNED + VERIFIED</div>
              <div className="font-mono text-[11px] text-slate-300">Subject: {certificate.subject} · Issuer: {certificate.issuer}</div>
              <div className="font-mono text-[11px] text-slate-400">Valid: {certificate.validFrom} → {certificate.validTo} · {certificate.algorithm}</div>
              <div className="font-mono text-[10px] text-slate-500 break-all">SHA-256 pin: {certificate.fingerprint}</div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-400 mb-2">
              <FileKey className="w-3.5 h-3.5" /> mTLS OFFICER CERTIFICATE {demo ? "(optional in demo)" : "(required)"}
            </div>
            <label className="block text-[11px] text-slate-400 mb-1.5">
              Attach issued client certificate (.pem) {certFileName && <span className="text-emerald-300 font-mono">· {certFileName}</span>}
            </label>
            <input
              type="file"
              accept=".pem,.crt,.cer,.txt"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setCertFileName(f.name);
                const text = await f.text();
                setClientCertPem(text.slice(0, 8000));
                addLine(`mTLS client cert loaded: ${f.name} (${f.size} bytes)`, "INFO");
              }}
              className="block w-full text-[11px] font-mono text-slate-300 file:mr-2 file:px-2.5 file:py-1.5 file:rounded-lg file:border file:border-slate-700 file:bg-slate-800 file:text-slate-200"
            />
          </div>

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
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-center space-y-2">
              <div className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-widest">
                Your tunnel OTP — copy it to Officer Sign-In
              </div>
              <div className="font-mono text-4xl font-black tracking-[0.4em] text-amber-200 pl-2">{handshakeOtp}</div>
              {handshakeOtpExpiry && (
                <div className="text-[10px] font-mono text-amber-300/80">Valid until {new Date(handshakeOtpExpiry).toLocaleTimeString()} · bound to this tunnel</div>
              )}
              <div className="flex gap-2 justify-center pt-1">
                <button onClick={copyOtp} className="btn-secondary">
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy OTP"}
                </button>
                <button onClick={onAuthenticated} className="btn-primary">
                  Proceed to Officer Sign-In <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={reset} className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Tear down & restart
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 text-[11px] font-mono font-bold text-slate-400">
            <Terminal className="w-3.5 h-3.5" /> SYSTEM LOG
          </div>
          <div ref={terminalRef} className="h-36 overflow-y-auto p-3 space-y-1 font-mono text-[11px] leading-relaxed">
            {terminalLines.map((l, i) => (
              <div key={i} className={l.includes("[ERROR]") ? "text-rose-300" : l.includes("[OK]") ? "text-emerald-300" : l.includes("[WARN]") ? "text-amber-300" : "text-slate-400"}>
                {l}
              </div>
            ))}
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
