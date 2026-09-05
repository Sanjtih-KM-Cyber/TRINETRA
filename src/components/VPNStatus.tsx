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
    idle: { label: "Disconnected", color: "text-slate-500", icon: <Wifi className="w-4 h-4" /> },
    connecting: { label: "Connecting...", color: "text-amber-400", icon: <Zap className="w-4 h-4 animate-pulse" /> },
    handshake: { label: "Handshake", color: "text-cyan-400", icon: <Lock className="w-4 h-4 animate-spin" /> },
    authenticating: { label: "Authenticating", color: "text-amber-400", icon: <Shield className="w-4 h-4" /> },
    verified: { label: "Connected", color: "text-emerald-400", icon: <CheckCircle2 className="w-4 h-4" /> },
    error: { label: "Error", color: "text-rose-400", icon: <AlertCircle className="w-4 h-4" /> },
  };

  const current = stageConfig[stage as keyof typeof stageConfig] || stageConfig.idle;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg border ${isConnected ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-800/50 border-slate-700"}`}>
            {current.icon}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
              VPN Tunnel
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                isConnected
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}>
                {isConnected ? "ACTIVE" : "OFFLINE"}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Gateway: CCTNS-GW-MH-01 • {isConnected ? "AES-256-GCM • TLS 1.3" : "Disconnected"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={isConnected ? onDisconnect : onConnect}
            disabled={stage !== "idle" && stage !== "verified" && stage !== "error"}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
              isConnected
                ? "bg-rose-500/20 border-rose-500/30 text-rose-300 hover:bg-rose-500/30"
                : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
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

      {/* Progress Bar */}
      <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isConnected ? "bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" : "bg-slate-700"
          }`}
          style={{ width: `${stage === 'verified' ? 100 : stage === 'handshake' ? 50 : 0}%` }}
        />
      </div>

      {/* Connection Stats */}
      {isConnected && (
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800">
          <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-center">
            <div className="text-2xl font-bold font-mono text-cyan-400">{latencyMs}ms</div>
            <div className="text-[9px] text-slate-400 font-mono">Latency</div>
          </div>
          <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-center">
            <div className="text-2xl font-bold font-mono text-emerald-400">AES-256-GCM</div>
            <div className="text-[9px] text-slate-400 font-mono">Cipher</div>
          </div>
          <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-center">
            <div className="text-2xl font-bold font-mono text-amber-400">TLS 1.3</div>
            <div className="text-[9px] text-slate-400 font-mono">Protocol</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VPNStatus;