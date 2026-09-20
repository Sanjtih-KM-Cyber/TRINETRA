import React from "react";
import { Wifi, Lock, Shield, AlertCircle, CheckCircle2, Loader2, Zap, Database, Search, X, ChevronDown, ChevronUp } from "lucide-react";

interface VPNStatusProps {
  isConnected: boolean;
  latencyMs: number;
  stage: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const VPNStatus: React.FC<VPNStatusProps> = ({
  isConnected,
  latencyMs,
  stage,
  onConnect,
  onDisconnect,
}) => {
  const stageConfig = {
    idle: { label: "Disconnected", color: "text-on-surface-variant", icon: <Wifi className="w-4 h-4" /> },
    connecting: { label: "Connecting...", color: "text-primary", icon: <Zap className="w-4 h-4 animate-pulse" /> },
    handshake: { label: "Handshake", color: "text-tertiary", icon: <Lock className="w-4 h-4 animate-spin" /> },
    authenticating: { label: "Authenticating", color: "text-primary", icon: <Shield className="w-4 h-4" /> },
    verified: { label: "Connected", color: "text-success", icon: <CheckCircle2 className="w-4 h-4" /> },
    error: { label: "Error", color: "text-error", icon: <AlertCircle className="w-4 h-4" /> },
  };

  const current = stageConfig[stage as keyof typeof stageConfig] || stageConfig.idle;

  return (
    <div className="bg-surface-container border border-outline-variant rounded-lg p-4 space-y-3 transition-all duration-300 ease-in-out">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg border transition-all duration-300 ease-in-out ${isConnected ? "bg-success-container/30 border-success/30 text-success" : "bg-surface-container-high border-outline-variant text-on-surface-variant"}`}>
            {current.icon}
          </div>
          <div>
            <div className="text-xs font-bold text-on-surface flex items-center gap-2 tracking-tight">
              VPN Tunnel
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border tracking-wider ${
                isConnected
                  ? "bg-success-container/40 text-success border-success/40"
                  : "bg-surface-container-high text-on-surface-variant border-outline"
              }`}>
                {isConnected ? "ACTIVE" : "OFFLINE"}
              </span>
            </div>
            <div className="text-[10px] text-on-surface-variant font-mono">
              Gateway: CCTNS-GW-MH-01 • {isConnected ? "AES-256-GCM • TLS 1.3" : "Disconnected"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={isConnected ? onDisconnect : onConnect}
            disabled={stage !== "idle" && stage !== "verified" && stage !== "error"}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ease-in-out flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container ${
              isConnected
                ? "bg-error-container/40 border border-error/30 text-error hover:bg-error-container/60"
                : "bg-primary text-on-primary hover:brightness-110"
            } disabled:opacity-50`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>Connect</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* M3 linear progress */}
      <div className="h-2 bg-surface-container-lowest rounded-full overflow-hidden border border-outline-variant" role="progressbar" aria-valuenow={stage === 'verified' ? 100 : stage === 'handshake' ? 50 : 0} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`h-full rounded-full transition-all duration-300 ease-in-out ${
            isConnected ? "bg-primary" : "bg-surface-container-highest"
          }`}
          style={{ width: `${stage === 'verified' ? 100 : stage === 'handshake' ? 50 : 0}%` }}
        />
      </div>

      {isConnected ? (
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-outline-variant">
          <div className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant text-center">
            <div className="text-2xl font-bold font-mono text-tertiary tracking-tight">{latencyMs}ms</div>
            <div className="text-[10px] tracking-[0.08em] text-on-surface-variant font-medium uppercase">Latency</div>
          </div>
          <div className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant text-center">
            <div className="text-sm font-bold font-mono text-success tracking-tight pt-1.5">AES-256-GCM</div>
            <div className="text-[10px] tracking-[0.08em] text-on-surface-variant font-medium uppercase mt-1">Cipher</div>
          </div>
          <div className="p-2 bg-surface-container-lowest rounded-lg border border-outline-variant text-center">
            <div className="text-2xl font-bold font-mono text-primary tracking-tight">TLS 1.3</div>
            <div className="text-[10px] tracking-[0.08em] text-on-surface-variant font-medium uppercase">Protocol</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-outline-variant" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="m3-skeleton h-14" />
          ))}
        </div>
      )}
    </div>
  );
};

export default VPNStatus;
