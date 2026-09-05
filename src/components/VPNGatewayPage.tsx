import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { VPNTunnel } from "./VPNTunnel";
import { Shield, Lock, Wifi, AlertCircle, CheckCircle2, Loader2, Terminal, Key, User, Eye, EyeOff, Zap, RotateCcw, X } from "lucide-react";

interface VPNGatewayPageProps {
  onAuthenticated: () => void;
}

export const VPNGatewayPage: React.FC<VPNGatewayPageProps> = ({ onAuthenticated }) => {
  const { login, isLoading: authLoading } = useAuth();
  const [stage, setStage] = useState<"idle" | "connecting" | "handshake" | "authenticating" | "verified" | "error">("idle");
  const [credentials, setCredentials] = useState({ badgeId: "", pin: "", otp: "" });
  const [showOtp, setShowOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handshakeStage, setHandshakeStage] = useState(0);
  const [certificate, setCertificate] = useState<CertificateInfo | null>(null);
  const [tunnelEstablished, setTunnelEstablished] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  const handshakeStages = [
    { label: "TCP Handshake", duration: 800 },
    { label: "TLS 1.3 Client Hello", duration: 600 },
    { label: "Certificate Verification", duration: 1000 },
    { label: "Key Exchange (ECDHE)", duration: 800 },
    { label: "Session Keys Derived", duration: 600 },
    { label: "Tunnel Established", duration: 400 },
  ];

  const addTerminalLine = (text: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === "error" ? "[ERROR]" : type === "warning" ? "[WARN]" : type === "success" ? "[OK]" : "[INFO]";
    setTerminalLines(prev => [...prev, `${timestamp} ${prefix} ${text}`].slice(-20));
  };

  const simulateHandshake = async () => {
    setStage("handshake");
    addTerminalLine("Initiating VPN handshake to CCTNS-GW-MH-01...", "info");
    
    for (let i = 0; i < handshakeStages.length; i++) {
      const stage = handshakeStages[i];
      setHandshakeStage(i + 1);
      addTerminalLine(stage.label, "info");
      await new Promise(r => setTimeout(r, stage.duration));
      
      if (i === 2) {
        // Certificate verification
        const cert: CertificateInfo = {
          subject: "CCTNS-GW-MH-01",
          issuer: "NIC CA 2026",
          validFrom: "2024-01-15",
          validTo: "2027-03-15",
          fingerprint: "A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:12:34:56:78:90",
          algorithm: "RSA-2048",
          san: ["cctns-gateway.mh.gov.in", "cctns-gateway.int"],
        };
        setCertificate(cert);
        addTerminalLine("Certificate verified: NIC CA 2026 • Valid until 2027-03-15", "success");
      }
      
      if (i === 3) {
        addTerminalLine("ECDHE key exchange • Curve: X25519 • PFS enabled", "success");
      }
      
      if (i === 4) {
        addTerminalLine("Session keys derived • Cipher: TLS_AES_256_GCM_SHA384", "success");
      }
      
      if (i === 5) {
        addTerminalLine("Tunnel established • MTU: 1400 • Keepalive: 25s", "success");
      }
    }
    
    setTunnelEstablished(true);
    setStage("authenticating");
    addTerminalLine("Tunnel ready • Awaiting credentials...", "info");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStage("authenticating");
    addTerminalLine(`Authenticating badge: ${credentials.badgeId}...`, "info");

    try {
      await login(credentials.badgeId, credentials.pin, credentials.otp || undefined);
      addTerminalLine("Authentication successful", "success");
      setStage("verified");
      addTerminalLine("Access granted • Launching workstation...", "success");
      setTimeout(() => onAuthenticated(), 1000);
    } catch (err: any) {
      addTerminalLine(`Authentication failed: ${err.message}`, "error");
      setError(err.message || "Authentication failed");
      setStage("error");
    }
  };

  const handleDisconnect = () => {
    setStage("idle");
    setTunnelEstablished(false);
    setHandshakeStage(0);
    setCertificate(null);
    setCredentials({ badgeId: "", pin: "", otp: "" });
    setShowOtp(false);
    setTerminalLines([]);
    addTerminalLine("Disconnected from CCTNS-GW-MH-01", "warning");
  };

  useEffect(() => {
    if (stage === "idle") {
      addTerminalLine("CRIM-INTEL OS v2.0 — VPN Gateway", "info");
      addTerminalLine("Waiting for connection...", "info");
    }
  }, [stage]);

  return (
    <div className="vpn-gateway-page">
      <div className="vpn-container">
        {/* Header */}
        <header className="vpn-header">
          <div className="header-left">
            <div className="logo">
              <Shield className="w-8 h-8" />
              <span className="logo-text">CRIM-INTEL OS</span>
            </div>
            <span className="version">v2.0 — SECURE WORKSTATION</span>
          </div>
          <div className="header-right">
            <div className="gateway-info">
              <Wifi className="w-4 h-4" />
              <span>CCTNS-GW-MH-01</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="vpn-main">
          <div className="vpn-grid">
            {/* Left Panel - Tunnel Visualization */}
            <div className="panel tunnel-panel">
              <div className="panel-header">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  <h2 className="panel-title">SECURE TUNNEL</h2>
                </div>
                <div className={`tunnel-status ${stage}`}>
                  <span className="status-dot"></span>
                  <span className="status-text">{getStatusText()}</span>
                </div>
              </div>

              <VPNTunnel 
                connected={tunnelEstablished} 
                latency={tunnelEstablished ? 45 : 0}
                stage={handshakeStage}
                certificate={certificate}
              />

              {/* Handshake Progress */}
              <div className="handshake-progress">
                <h3 className="progress-title">HANDSHAKE PROGRESS</h3>
                <div className="progress-steps">
                  {handshakeStages.map((step, idx) => (
                    <div key={idx} className={`progress-step ${idx < handshakeStage ? 'complete' : idx === handshakeStage ? 'current' : 'pending'}`}>
                      <div className="step-indicator">
                        {idx < handshakeStage ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : idx === handshakeStage ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <span className="step-number">{idx + 1}</span>
                        )}
                      </div>
                      <div className="step-label">{step.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Certificate Info */}
              {certificate && (
                <div className="certificate-panel">
                  <h4 className="panel-title">
                    <Shield className="w-4 h-4" /> CERTIFICATE VERIFIED
                  </h4>
                  <div className="cert-details">
                    <div className="cert-row"><span>Subject:</span><span>{certificate.subject}</span></div>
                    <div className="cert-row"><span>Issuer:</span><span>{certificate.issuer}</span></div>
                    <div className="cert-row"><span>Valid:</span><span>{certificate.validFrom} → {certificate.validTo}</span></div>
                    <div className="cert-row"><span>Algorithm:</span><span>{certificate.algorithm}</span></div>
                    <div className="cert-row"><span>Fingerprint:</span><span className="fingerprint">{certificate.fingerprint}</span></div>
                  </div>
                </div>
              )}

              {/* Connection Stats */}
              {tunnelEstablished && (
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-value">45ms</span>
                    <span className="stat-label">Latency</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-value">AES-256-GCM</span>
                    <span className="stat-label">Cipher</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-value">TLS 1.3</span>
                    <span className="stat-label">Protocol</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel - Credentials & Terminal */}
            <div className="panel auth-panel">
              {stage !== "verified" && (
                <form onSubmit={handleLogin} className="auth-form">
                  <div className="form-header">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5" />
                      <h2 className="panel-title">OFFICER CREDENTIALS</h2>
                    </div>
                    <div className={`connection-badge ${stage}`}>
                      {stage === "authenticating" && <Loader2 className="w-4 h-4 animate-spin" />}
                      {stage === "verified" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {stage === "error" && <AlertCircle className="w-4 h-4 text-rose-400" />}
                    </div>
                  </div>

                  {error && (
                    <div className="error-banner">
                      <AlertCircle className="w-4 h-4" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="badgeId">Badge ID</label>
                    <div className="input-wrapper">
                      <User className="input-icon" />
                      <input
                        id="badgeId"
                        type="text"
                        value={credentials.badgeId}
                        onChange={e => setCredentials({...credentials, badgeId: e.target.value})}
                        placeholder="e.g., DP-FIELD-502"
                        autoComplete="username"
                        disabled={stage === "authenticating" || stage === "verified"}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="pin">PIN</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" />
                      <input
                        id="pin"
                        type="password"
                        value={credentials.pin}
                        onChange={e => setCredentials({...credentials, pin: e.target.value})}
                        placeholder="4-digit PIN"
                        autoComplete="current-password"
                        disabled={stage === "authenticating" || stage === "verified"}
                        required
                        maxLength={4}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="otp">OTP (if enabled)</label>
                    <div className="input-wrapper">
                      <Key className="input-icon" />
                      <input
                        id="otp"
                        type="text"
                        value={credentials.otp}
                        onChange={e => setCredentials({...credentials, otp: e.target.value})}
                        placeholder="6-digit OTP"
                        autoComplete="one-time-code"
                        disabled={stage === "authenticating" || stage === "verified"}
                        maxLength={6}
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="btn-primary"
                    disabled={stage === "authenticating" || stage === "verified" || !credentials.badgeId || !credentials.pin}
                  >
                    {stage === "authenticating" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AUTHENTICATING...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>ESTABLISH SECURE TUNNEL</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {stage === "verified" && (
                <div className="success-state">
                  <div className="success-icon">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  </div>
                  <h3>ACCESS GRANTED</h3>
                  <p>Welcome back, Officer. Launching workstation...</p>
                  <div className="launch-bar">
                    <div className="launch-progress" style={{ width: "100%" }} />
                  </div>
                </div>
              )}

              {stage === "error" && (
                <div className="error-state">
                  <AlertCircle className="w-12 h-12 text-rose-400" />
                  <h3>AUTHENTICATION FAILED</h3>
                  <p>{error}</p>
                  <button onClick={() => setStage("idle")} className="btn-secondary">
                    <RotateCcw className="w-4 h-4" />
                    <span>TRY AGAIN</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Terminal */}
          <div className="panel terminal-panel">
            <div className="terminal-header">
              <div className="terminal-title">
                <Terminal className="w-4 h-4" />
                <span>SYSTEM LOG</span>
              </div>
              <div className="terminal-controls">
                <span className="text-[10px] text-slate-400 font-mono">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
            <div ref={terminalRef} className="terminal-content">
              {terminalLines.map((line, idx) => (
                <div key={idx} className="terminal-line">
                  <span className="terminal-timestamp">{line.split(']')[0]}]</span>
                  <span className={`terminal-message ${getLineType(line)}`}>{line.split('] ')[1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      </div>
      </div>
    </div>
  );
};

function getStatusText(): string {
  switch (stage) {
    case "idle": return "DISCONNECTED";
    case "connecting": return "CONNECTING...";
    case "handshake": return "HANDSHAKE IN PROGRESS";
    case "authenticating": return "AWAITING CREDENTIALS";
    case "verified": return "TUNNEL ACTIVE • SECURE";
    case "error": return "AUTHENTICATION FAILED";
    default: return "UNKNOWN";
  }
}

function getLineType(line: string): string {
  if (line.includes("[ERROR]")) return "error";
  if (line.includes("[WARN]")) return "warning";
  if (line.includes("[OK]")) return "success";
  return "info";
}

interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  algorithm: string;
  san: string[];
}

export default VPNGatewayPage;