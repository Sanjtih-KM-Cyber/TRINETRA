export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  algorithm: string;
  san: string[];
}

/** Pinned gateway certificate fingerprint (SHA-256). Must match server NIC CA cert. */
export const PINNED_GATEWAY_FINGERPRINT =
  import.meta.env.VITE_VPN_PINNED_FINGERPRINT ??
  "A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:12:34:56:78:90";

export const VPN_GATEWAY_HOST =
  import.meta.env.VITE_VPN_GATEWAY ?? "CCTNS-GW-MH-01";

export function isDemoMode(): boolean {
  return (import.meta.env.VITE_CCTNS_DEMO_MODE ?? "true") === "true";
}

export function normalizeFingerprint(fp: string): string {
  return fp.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
}

/** Cert pinning check — rejects MITM / rogue gateway certs before any credential is sent. */
export function verifyCertificatePin(cert: CertificateInfo): { ok: boolean; reason: string } {
  const presented = normalizeFingerprint(cert.fingerprint);
  const pinned = normalizeFingerprint(PINNED_GATEWAY_FINGERPRINT);
  if (!presented) return { ok: false, reason: "Gateway presented an empty certificate fingerprint." };
  if (presented !== pinned) {
    return {
      ok: false,
      reason: `Certificate pin mismatch. Expected ${PINNED_GATEWAY_FINGERPRINT}, got ${cert.fingerprint}. Connection aborted before credential exchange.`,
    };
  }
  const expiry = new Date(cert.validTo).getTime();
  if (Number.isFinite(expiry) && expiry < Date.now()) {
    return { ok: false, reason: `Gateway certificate expired on ${cert.validTo}.` };
  }
  return { ok: true, reason: "Pinned fingerprint match. Gateway identity verified." };
}

export interface VpnAuthResponse {
  success: boolean;
  vpnSession: string;
  message: string;
  gateway: string;
  cipher: string;
  protocol: string;
  demo?: boolean;
  mtls?: boolean;
  /** Phase 1 — handshake OTP to present at Officer Sign-In alongside credentials. */
  otp?: string;
  otpExpiresAt?: string;
}

export const vpnApi = {
  /** Anonymous tunnel handshake — no identity. Issues the session + OTP for sign-in. */
  async handshake(clientCertPem?: string): Promise<VpnAuthResponse> {
    const vpnSessionHeader = sessionStorage.getItem("crim_intel_vpn") ?? "";
    const res = await fetch("/api/vpn/handshake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(vpnSessionHeader ? { "X-VPN-Session": vpnSessionHeader } : {}),
      },
      body: JSON.stringify({ clientCertPem }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || "VPN handshake failed");
    }
    if (data.vpnSession) {
      sessionStorage.setItem("crim_intel_vpn", data.vpnSession);
    }
    return data as VpnAuthResponse;
  },

  async status(): Promise<{ connected: boolean; gateway?: string; cipher?: string; protocol?: string; demo?: boolean }> {
    const vpnSessionHeader = sessionStorage.getItem("crim_intel_vpn") ?? "";
    const res = await fetch("/api/vpn/status", {
      headers: vpnSessionHeader ? { "X-VPN-Session": vpnSessionHeader } : {},
    });
    return (await res.json().catch(() => ({ connected: false }))) as {
      connected: boolean;
      gateway?: string;
    };
  },

  async disconnect(): Promise<void> {
    const vpnSessionHeader = sessionStorage.getItem("crim_intel_vpn") ?? "";
    await fetch("/api/vpn/disconnect", {
      method: "POST",
      headers: vpnSessionHeader ? { "X-VPN-Session": vpnSessionHeader } : {},
    }).catch(() => undefined);
    sessionStorage.removeItem("crim_intel_vpn");
    sessionStorage.removeItem("crim_intel_vpn_otp");
    sessionStorage.removeItem("crim_intel_vpn_otp_exp");
  },

  sessionHeader(): Record<string, string> {
    const s = sessionStorage.getItem("crim_intel_vpn");
    return s ? { "X-VPN-Session": s } : {};
  },
};
