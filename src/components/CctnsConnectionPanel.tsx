import React from "react";
import { Shield, Wifi, Lock, Terminal, CheckCircle2, AlertCircle, Loader2, Zap, Database, Search, X, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";

interface CctnsConnectionPanelProps {
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSimulateError?: () => void;
  onSimulateQuery?: () => void;
  queryLog?: Array<{stage: string; message: string; timestamp: string}>;
  latencyMs?: number;
}

const STAGE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; progress: number }> = {
  DISCONNECTED: { label: "Disconnected", icon: <Wifi className="w-4 h-4" />, color: "text-slate-500", progress: 0 },
  HANDSHAKE_INIT: { label: "Handshake Initiated", icon: <Zap className="w-4 h-4 animate-pulse" />, color: "text-amber-400", progress: 10 },
  TLS_NEGOTIATING: { label: "TLS 1.3 Negotiating", icon: <Lock className="w-4 h-4 animate-spin" />, color: "text-cyan-400", progress: 25 },
  CERT_VERIFYING: { label: "Certificate Verification", icon: <Shield className="w-4 h-4" />, color: "text-emerald-400", progress: 45 },
  KEY_EXCHANGE: { label: "Key Exchange (ECDHE)", icon: <Zap className="w-4 h-4" />, color: "text-indigo-400", progress: 65 },
  TUNNEL_ESTABLISHED: { label: "Tunnel Established", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, color: "text-emerald-400", progress: 85 },
  QUERY_SENT: { label: "Query Transmitted", icon: <Search className="w-4 h-4 animate-bounce" />, color: "text-amber-400", progress: 90 },
  RESPONSE_RECEIVED: { label: "Response Received", icon: <Database className="w-4 h-4" />, color: "text-emerald-400", progress: 100 },
  ERROR: { label: "Connection Error", icon: <AlertCircle className="w-4 h-4 text-rose-400" />, color: "text-rose-400", progress: 0 },
};

const STAGE_SEQUENCE = [
  "HANDSHAKE_INIT",
  "TLS_NEGOTIATING",
  "CERT_VERIFYING",
  "KEY_EXCHANGE",
  "TUNNEL_ESTABLISHED",
];

interface CctnsConnectionPanelProps {
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSimulateError?: () => void;
  onSimulateQuery?: () => void;
  queryLog?: Array<{stage: string; message: string; timestamp: string; latencyMs?: number; packets?: number}>;
  latencyMs?: number;
}

export const CctnsConnectionPanel: React.FC<CctnsConnectionPanelProps> = ({
  isConnected,
  onConnect,
  onDisconnect,
  onSimulateError,
  onSimulateQuery,
  queryLog = [],
  latencyMs = 0,
}) => {
  const [stage, setStage] = useState<string>("DISCONNECTED");
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<Array<{id: string; timestamp: string; stage: string; message: string; latencyMs?: number; packets?: number}>>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [handshakeProgress, setHandshakeProgress] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout>();

  // WebSocket listener for tunnel events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTunnelEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "CCTNS_TUNNEL_EVENT") {
          const entry = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            timestamp: data.timestamp,
            stage: data.stage,
            message: data.message,
            latencyMs: data.latencyMs,
            packets: data.packets,
          };
          setLogs((prev) => [...prev, entry].slice(-50));
          
          if (data.stage !== "ERROR") {
            setStage(data.stage);
            setProgress(STAGE_CONFIG[data.stage as keyof typeof STAGE_CONFIG]?.progress || 0);
          } else {
            setStage("ERROR");
          }
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    window.addEventListener("message", handleTunnelEvent);
    return () => window.removeEventListener("message", handleTunnelEvent);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handshake animation
  useEffect(() => {
    if (!isConnected && stage !== "DISCONNECTED") {
      setStage("DISCONNECTED");
      setProgress(0);
      setHandshakeProgress(0);
      setLogs([]);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    if (isConnected && stage === "DISCONNECTED") {
      // Start handshake animation
      let currentStep = 0;
      setStage("HANDSHAKE_INIT");
      setHandshakeProgress(0);

      progressIntervalRef.current = setInterval(() => {
        if (currentStep >= STAGE_SEQUENCE.length - 1) {
          clearInterval(progressIntervalRef.current!);
          setStage("TUNNEL_ESTABLISHED");
          setProgress(85);
          setHandshakeProgress(100);
          // Log established event
          addLog("TUNNEL_ESTABLISHED", "AES-256-GCM tunnel established • Cipher: TLS_AES_256_GCM_SHA384 • MTU: 1400");
          return;
        }
        currentStep++;
        const nextStage = STAGE_SEQUENCE[currentStep];
        setStage(nextStage);
        setProgress(STAGE_CONFIG[nextStage as keyof typeof STAGE_CONFIG].progress);
        setHandshakeProgress((currentStep / (STAGE_SEQUENCE.length - 1)) * 100);
        
        const messages: Record<string, string> = {
          TLS_NEGOTIATING: "TLS 1.3 handshake • Cipher: TLS_AES_256_GCM_SHA384",
          CERT_VERIFYING: "Certificate verified • Issuer: NIC CA 2026 • Valid until 2027-03-15",
          KEY_EXCHANGE: "ECDHE key exchange • Curve: X25519 • PFS enabled",
        };
        addLog(nextStage, messages[nextStage] || "Processing...");
      }, 800 + Math.random() * 400);
    }

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isConnected]);

  const addLog = (stage: string, message: string, latencyMs?: number, packets?: number) => {
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      stage,
      message,
      latencyMs,
      packets,
    };
    setLogs((prev) => [...prev, entry].slice(-50));
  };

  const handleConnect = () => {
    onConnect();
    addLog("HANDSHAKE_INIT", "Initiating VPN handshake to CCTNS-GW-MH-01 • NIC CA 2026 certificate");
  };

  const handleDisconnect = () => {
    onDisconnect();
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setStage("DISCONNECTED");
    setProgress(0);
    setHandshakeProgress(0);
    setLogs([]);
  };

  const handleSimulateQuery = () => {
    if (!isConnected) return;
    onSimulateQuery?.();
    setStage("QUERY_SENT");
    setProgress(90);
    addLog("QUERY_SENT", "Criminal history query transmitted • Encrypted payload: 1.2 KB • AES-256-GCM");
    
    // Simulate response after delay
    setTimeout(() => {
      setStage("RESPONSE_RECEIVED");
      setProgress(100);
      const latency = 800 + Math.floor(Math.random() * 300);
      addLog("RESPONSE_RECEIVED", "Criminal history record received • Decrypted • Integrity verified • SHA-256 validated", latency, 3);
    }, 800 + Math.random() * 400);
  };

  const handleSimulateError = () => {
    if (!isConnected) return;
    onSimulateError?.();
    setStage("ERROR");
    setProgress(0);
    addLog("ERROR", "Gateway timeout • CCTNS-GW-MH-01 unreachable • Retrying in 5s...", undefined, 0);
    
    // Auto-recover after 3 seconds
    setTimeout(() => {
      if (isConnected) {
        setStage("TUNNEL_ESTABLISHED");
        setProgress(85);
        addLog("TUNNEL_ESTABLISHED", "Reconnected • Tunnel re-established • Session resumed");
      }
    }, 3000);
  };

  const currentStageConfig = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.DISCONNECTED;

  return (
    <div className="cctns-connection-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl border ${isConnected ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-800/50 border-slate-700"}`}>
            {currentStageConfig.icon}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
              CCTNS Tunnel
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
            onClick={isConnected ? handleDisconnect : handleConnect}
            disabled={stage !== "DISCONNECTED" && stage !== "TUNNEL_ESTABLISHED" && stage !== "ERROR"}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
              isConnected
                ? "bg-rose-500/20 border-rose-500/30 text-rose-300 hover:bg-rose-500/30"
                : "bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40"
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

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isConnected ? "bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500" : "bg-slate-700"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Handshake Steps */}
      {isConnected && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">
            Handshake Progress
          </div>
          <div className="space-y-1.5">
            {STAGE_SEQUENCE.map((s, idx) => {
              const isComplete = idx < STAGE_SEQUENCE.indexOf(stage) || (idx === STAGE_SEQUENCE.indexOf(stage) && stage !== "DISCONNECTED");
              const isCurrent = s === stage;
              const stepConfig = STAGE_CONFIG[s];
              return (
                <div
                  key={s}
                  className={`flex items-center gap-2 p-1.5 rounded-lg transition-all ${
                    isComplete ? "bg-emerald-500/5" : isCurrent ? "bg-amber-500/5" : "bg-slate-900/50"
                  } border ${isComplete ? "border-emerald-500/20" : isCurrent ? "border-amber-500/30 animate-pulse" : "border-slate-800"}`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isComplete ? "bg-emerald-500 text-slate-950" : isCurrent ? "bg-amber-500 text-slate-950 animate-pulse" : "bg-slate-800 text-slate-500"
                  }`}>
                    {isComplete ? <CheckCircle2 className="w-3 h-3" /> : <span>{idx + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`font-medium truncate ${isComplete ? "text-emerald-300" : isCurrent ? "text-amber-300" : "text-slate-400"}`}>
                        {stepConfig.label}
                      </span>
                      {isCurrent && <span className="text-[9px] font-mono text-amber-400 animate-pulse">▸</span>}
                    </div>
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isComplete ? "bg-emerald-500" : isCurrent ? "bg-amber-500 animate-pulse" : "bg-slate-700"
                        }`}
                        style={{ width: isComplete ? "100%" : isCurrent ? `${handshakeProgress}%` : "0%" }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Query Log */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Live Query Log</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSimulateQuery}
            disabled={!isConnected || stage === "QUERY_SENT" || stage === "RESPONSE_RECEIVED"}
            className="px-2 py-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow"
          >
            <Search className="w-3 h-3" />
            <span>Send Query</span>
          </button>
          {onSimulateError && (
            <button
              onClick={handleSimulateError}
              disabled={!isConnected}
              className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <AlertCircle className="w-3 h-3" />
              <span>Error</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto bg-slate-950/50 border border-slate-800 rounded-lg p-2 space-y-1 font-mono text-[10px]">
        {logs.length === 0 ? (
          <div className="text-slate-500 text-center py-4 text-[11px]">
            {isConnected ? "Tunnel active • Awaiting queries..." : "Click Connect to establish tunnel"}
          </div>
        ) : (
          logs.map((log) => {
            const stageConfig = STAGE_CONFIG[log.stage as keyof typeof STAGE_CONFIG] || { color: "text-slate-400", icon: <Terminal className="w-3 h-3" /> };
            const time = new Date(log.timestamp).toLocaleTimeString();
            return (
              <div
                key={log.id}
                className={`flex items-start gap-2 p-1.5 rounded border-l-2 transition-colors ${
                  log.stage === "ERROR" ? "bg-rose-500/5 border-rose-500/30" :
                  log.stage === "RESPONSE_RECEIVED" ? "bg-emerald-500/5 border-emerald-500/30" :
                  log.stage === "QUERY_SENT" ? "bg-amber-500/5 border-amber-500/30" :
                  "bg-slate-900/50 border-slate-800"
                }`}
              >
                <div className="flex-shrink-0 w-5 text-center text-[9px]">
                  {stageConfig.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`font-mono truncate ${stageConfig.color}`}>{log.stage.replace(/_/g, " ")}</span>
                    <span className="text-[9px] text-slate-500 shrink-0">{time}</span>
                  </div>
                  <div className="text-slate-300 text-[10px] truncate">{log.message}</div>
                  {(log.latencyMs || log.packets) && (
                    <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-500">
                      {log.latencyMs && <span>⚡ {log.latencyMs}ms</span>}
                      {log.packets && <span>📦 {log.packets} packets</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
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

export default CctnsConnectionPanel;