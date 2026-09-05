import React, { useEffect, useRef, useState } from "react";

interface VPNTunnelProps {
  connected: boolean;
  latency: number;
  stage: number;
  certificate: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    fingerprint: string;
    algorithm: string;
  } | null;
  width?: number;
  height?: number;
}

interface TunnelPacket {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  color: string;
  size: number;
  type: "data" | "ack" | "key" | "heartbeat";
}

interface TunnelNode {
  x: number;
  y: number;
  label: string;
  icon: string;
  status: "active" | "pending" | "error";
  pulsePhase: number;
}

export const VPNTunnel: React.FC<VPNTunnelProps> = ({
  connected,
  latencyMs = 0,
  packetsPerSecond = 12,
  width = 480,
  height = 180,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const packetsRef = useRef<TunnelPacket[]>([]);
  const nodesRef = useRef<TunnelNode[]>([]);
  const lastSpawnRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const [errorFlash, setErrorFlash] = useState(0);

  // Initialize tunnel nodes
  useEffect(() => {
    const nodes: TunnelNode[] = [
      {
        x: 60,
        y: height / 2,
        label: "WORKSTATION",
        icon: "💻",
        status: "active",
        pulsePhase: 0,
      },
      {
        x: width * 0.33,
        y: height / 2,
        label: "VPN GATEWAY",
        icon: "🔐",
        status: "active",
        pulsePhase: Math.PI / 2,
      },
      {
        x: width * 0.66,
        y: height / 2,
        label: "CCTNS GW",
        icon: "🛡️",
        status: "active",
        pulsePhase: Math.PI,
      },
      {
        x: width - 60,
        y: height / 2,
        label: "CCTNS DB",
        icon: "🗄️",
        status: "active",
        pulsePhase: Math.PI * 1.5,
      },
    ];
    nodesRef.current = nodes;
  }, [width, height]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    let lastTime = performance.now();

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      frameRef.current++;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw background grid
      drawGrid(ctx, width, height, frameRef.current);

      // Draw tunnel tube
      drawTunnelTube(ctx, width, height, frameRef.current);

      // Draw nodes
      nodesRef.current.forEach((node, idx) => {
        drawNode(ctx, node, idx, connected, frameRef.current);
      });

      // Update and draw packets
      updatePackets(dt);
      drawPackets(ctx);

      // Draw latency indicator
      drawLatencyIndicator(ctx, width, height);

      // Draw error flash
      if (errorFlash > 0) {
        drawErrorFlash(ctx, width, height, errorFlash);
        setErrorFlash((prev) => Math.max(0, prev - 0.016));
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number, frame: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(51, 65, 85, 0.15)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      const offset = (frame * 0.5) % gridSize;

      for (let x = -offset; x < w + offset; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = -offset; y < h + offset; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawTunnelTube = (ctx: CanvasRenderingContext2D, w: number, h: number, frame: number) => {
      const nodeX = nodesRef.current.map(n => n.x);
      const centerY = h / 2;
      const tubeHeight = 36;
      const waveAmplitude = 4;
      const waveFrequency = 0.015;

      // Main tunnel body
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(nodeX[0] + 20, centerY - tubeHeight / 2);
      
      // Top edge with subtle wave
      for (let x = nodeX[0] + 20; x <= nodeX[3] - 20; x += 2) {
        const wave = Math.sin(x * waveFrequency + frame * 0.02) * waveAmplitude;
        ctx.lineTo(x, centerY - tubeHeight / 2 + wave);
      }
      
      // Bottom edge with wave
      for (let x = nodeX[3] - 20; x >= nodeX[0] + 20; x -= 2) {
        const wave = Math.sin(x * waveFrequency + frame * 0.02) * waveAmplitude;
        ctx.lineTo(x, centerY + tubeHeight / 2 + wave);
      }
      
      ctx.closePath();
      
      // Gradient fill
      const gradient = ctx.createLinearGradient(0, centerY - tubeHeight / 2, 0, centerY + tubeHeight / 2);
      gradient.addColorStop(0, "rgba(14, 116, 144, 0.08)");
      gradient.addColorStop(0.5, "rgba(6, 78, 59, 0.12)");
      gradient.addColorStop(1, "rgba(14, 116, 144, 0.08)");
      ctx.fillStyle = gradient;
      ctx.fill();

      // Border glow
      ctx.strokeStyle = "rgba(6, 182, 212, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner highlight line
      ctx.beginPath();
      ctx.moveTo(nodeX[0] + 20, centerY);
      for (let x = nodeX[0] + 20; x <= nodeX[3] - 20; x += 2) {
        const wave = Math.sin(x * waveFrequency + frame * 0.02) * (waveAmplitude * 0.3);
        ctx.lineTo(x, centerY + wave);
      }
      ctx.strokeStyle = "rgba(6, 182, 212, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    };

    const drawNode = (ctx: CanvasRenderingContext2D, node: TunnelNode, idx: number, isConnected: boolean, frame: number) => {
      const radius = 28;
      const pulseIntensity = Math.sin(frame * 0.08 + node.pulsePhase) * 0.3 + 0.7;
      const isActive = connected && node.status === "active";
      
      ctx.save();
      ctx.translate(node.x, node.y);

      // Outer glow ring
      if (isActive) {
        const gradient = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius * 1.8);
        gradient.addColorStop(0, `rgba(6, 182, 212, ${0.25 * pulseIntensity})`);
        gradient.addColorStop(0.5, `rgba(6, 182, 212, ${0.08 * pulseIntensity})`);
        gradient.addColorStop(1, "rgba(6, 182, 212, 0)");
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Rotating scan line
        const scanAngle = (frame * 0.03 + node.pulsePhase) % (Math.PI * 2);
        ctx.save();
        ctx.rotate(scanAngle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * 1.6, 0);
        ctx.strokeStyle = `rgba(6, 182, 212, ${0.4 * pulseIntensity})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 12]);
        ctx.lineDashOffset = -frame * 2;
        ctx.stroke();
        ctx.restore();
      }

      // Node core
      const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      if (isActive) {
        gradient.addColorStop(0, "#06b6d4");
        gradient.addColorStop(0.5, "#0891b2");
        gradient.addColorStop(1, "#0e7490");
      } else {
        gradient.addColorStop(0, "#475569");
        gradient.addColorStop(0.5, "#334155");
        gradient.addColorStop(1, "#1e293b");
      }
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Node border
      ctx.strokeStyle = isActive ? `rgba(6, 182, 212, ${pulseIntensity})` : "rgba(100, 116, 139, 0.5)";
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.stroke();

      // Icon
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isActive ? "#0f172a" : "#94a3b8";
      const iconMap: Record<string, string> = {
        "WORKSTATION": "◉",
        "VPN GATEWAY": "🔒",
        "CCTNS GW": "🛡️",
        "CCTNS DB": "🗄️",
      };
      ctx.fillText(iconMap[node.label] || "●", 0, 3);

      // Status indicator
      if (isActive) {
        ctx.beginPath();
        ctx.arc(radius + 4, -radius - 4, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#10b981";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(radius + 4, -radius - 4, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      // Label
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = isActive ? "#e2e8f0" : "#64748b";
      ctx.fillText(node.label, 0, radius + 18);

      ctx.restore();
    };

    const drawPackets = (ctx: CanvasRenderingContext2D) => {
      packetsRef.current.forEach((packet) => {
        const x = packet.x + (packet.targetX - packet.x) * packet.progress;
        const y = packet.y + (packet.targetY - packet.y) * packet.progress;
        const pulse = Math.sin(frameRef.current * 0.2) * 0.3 + 0.7;

        ctx.save();
        ctx.translate(x, y);

        // Packet trail
        if (packet.progress > 0.1 && packet.progress < 0.9) {
          ctx.beginPath();
          const trailLength = 15;
          for (let i = 0; i < trailLength; i++) {
            const t = packet.progress - i * 0.02;
            if (t <= 0) break;
            const tx = packet.x + (packet.targetX - packet.x) * t;
            const ty = packet.y + (packet.targetY - packet.y) * t;
            ctx.globalAlpha = 0.3 * (1 - i / trailLength);
            ctx.beginPath();
            ctx.arc(tx, y, packet.size * (1 - i / trailLength), 0, Math.PI * 2);
            ctx.fillStyle = packet.color;
            ctx.fill();
          }
        }

        // Packet core
        ctx.beginPath();
        ctx.arc(0, 0, packet.size * pulse, 0, Math.PI * 2);
        
        const packetGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, packet.size * 1.5);
        if (packet.type === "key") {
          gradient.addColorStop(0, "#fbbf24");
          gradient.addColorStop(1, "#f59e0b");
        } else if (packet.type === "ack") {
          gradient.addColorStop(0, "#34d399");
          gradient.addColorStop(1, "#10b981");
        } else if (packet.type === "heartbeat") {
          gradient.addColorStop(0, "#f87171");
          gradient.addColorStop(1, "#ef4444");
        } else {
          gradient.addColorStop(0, "#60a5fa");
          gradient.addColorStop(1, "#3b82f6");
        }
        ctx.fillStyle = gradient;
        ctx.fill();

        // Packet type indicator
        ctx.font = "7px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#0f172a";
        const typeChar = packet.type === "key" ? "K" : packet.type === "ack" ? "A" : packet.type === "heartbeat" ? "H" : "D";
        ctx.fillText(typeChar, 0, 2.5);

        ctx.restore();
      };
    };

    const updatePackets = (dt: number) => {
      const now = performance.now();
      
      // Spawn new packets
      if (connected && now - lastSpawnRef.current > PACKET_SPAWN_INTERVAL / (packetsPerSecond / 12)) {
        spawnPacket();
        lastSpawnRef.current = now;
      }

      // Update existing packets
      packetsRef.current = packetsRef.current.filter((packet) => {
        packet.progress += PACKET_SPEED * dt * 60;
        return packet.progress < 1.0;
      });
    };

    const spawnPacket = () => {
      const nodes = nodesRef.current;
      if (nodes.length < 2) return;

      // Pick random source and destination
      const srcIdx = Math.floor(Math.random() * (nodes.length - 1));
      const dstIdx = srcIdx + 1 + Math.floor(Math.random() * (nodes.length - srcIdx - 1));
      
      const src = nodes[srcIdx];
      const dst = nodes[dstIdx];

      // Determine packet type based on connection phase
      let type: TunnelPacket["type"] = "data";
      const rand = Math.random();
      if (rand < 0.05) type = "key";
      else if (rand < 0.15) type = "ack";
      else if (rand < 0.2) type = "heartbeat";

      const colors: Record<TunnelPacket["type"], string> = {
        data: "#60a5fa",
        key: "#fbbf24",
        ack: "#34d399",
        heartbeat: "#f87171",
      };

      packetsRef.current.push({
        x: src.x,
        y: src.y,
        targetX: dst.x,
        targetY: dst.y,
        progress: 0,
        color: colors[type],
        size: type === "key" ? 5 : type === "ack" ? 4.5 : type === "heartbeat" ? 3.5 : 4,
        type,
      });
    };

    const drawLatencyIndicator = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (latencyMs <= 0) return;

      ctx.save();
      ctx.font = "11px monospace";
      ctx.fillStyle = latencyMs < 100 ? "#10b981" : latencyMs < 300 ? "#fbbf24" : "#f87171";
      ctx.textAlign = "right";
      ctx.fillText(`⚡ ${latencyMs}ms RTT`, w - 12, 20);
      
      // Latency bar
      const barWidth = 80;
      const barHeight = 4;
      const x = w - barWidth - 12;
      const y = 24;
      const fillRatio = Math.min(1, latencyMs / 500);
      
      ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
      ctx.fillRect(x, y, barWidth, barHeight);
      
      const grad = ctx.createLinearGradient(x, 0, x + barWidth, 0);
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(0.5, "#fbbf24");
      grad.addColorStop(1, "#f87171");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth * fillRatio, barHeight);
      ctx.restore();
    };

    const drawErrorFlash = (ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) => {
      ctx.save();
      ctx.globalAlpha = intensity * 0.3;
      ctx.fillStyle = "#f87171";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [connected, latencyMs, packetsPerSecond, width, height]);

  // Simulate error flash
  const triggerError = () => {
    setErrorFlash(1);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-auto rounded-xl bg-slate-950/50 border border-slate-800"
        style={{ width, height }}
      />
      
      {/* Overlay Status */}
      <div className="absolute inset-0 flex flex-col items-center justify-between p-4 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
            connected 
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
              : "bg-slate-800/50 text-slate-400 border border-slate-700"
          }`}>
            {connected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>TUNNEL ACTIVE</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>DISCONNECTED</span>
              </>
            )}
          </div>
          {connected && (
            <div className="flex items-center gap-2 text-[9px] font-mono text-slate-400">
              <span>⚡ {latencyMs}ms</span>
              <span>📦 {packetsPerSecond}/s</span>
              <span>🔐 AES-256-GCM</span>
            </div>
          )}
        </div>
        
        <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none">
          <button
            onClick={triggerError}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors"
            title="Simulate gateway error"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Simulate Error</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VPNTunnel;