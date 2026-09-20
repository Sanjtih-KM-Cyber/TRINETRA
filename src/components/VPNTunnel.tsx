import React, { useEffect, useRef } from "react";
import { Wifi, CheckCircle2 } from "lucide-react";
import type { CertificateInfo } from "../services/vpn";

interface VPNTunnelProps {
  connected: boolean;
  latency?: number;
  stage?: number;
  certificate?: CertificateInfo | null;
  width?: number;
  height?: number;
}

interface Packet {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  color: string;
  size: number;
  label: string;
}

const NODE_DEFS = [
  { frac: 0.12, label: "WORKSTATION", glyph: "◉" },
  { frac: 0.37, label: "VPN GATEWAY", glyph: "⬢" },
  { frac: 0.63, label: "CCTNS GW", glyph: "⬣" },
  { frac: 0.88, label: "CCTNS DB", glyph: "▣" },
];

const PACKET_SPEED = 0.012;
const SPAWN_EVERY_FRAMES = 14;

export const VPNTunnel: React.FC<VPNTunnelProps> = ({
  connected,
  latency = 0,
  certificate = null,
  width = 520,
  height = 190,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const packetsRef = useRef<Packet[]>([]);
  void certificate;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let frame = 0;
    const centerY = height / 2;
    const nodeX = NODE_DEFS.map((n) => n.frac * width);

    const spawn = () => {
      const srcIdx = Math.floor(Math.random() * (nodeX.length - 1));
      const dstIdx = srcIdx + 1;
      const roll = Math.random();
      const kind =
        roll < 0.08 ? { color: "#fbbf24", size: 5, label: "K" } : roll < 0.2 ? { color: "#34d399", size: 4.5, label: "A" } : { color: "#60a5fa", size: 4, label: "D" };
      packetsRef.current.push({
        x: nodeX[srcIdx],
        y: centerY,
        targetX: nodeX[dstIdx],
        targetY: centerY,
        progress: 0,
        ...kind,
      });
      if (packetsRef.current.length > 40) packetsRef.current.shift();
    };

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      // grid
      ctx.save();
      ctx.strokeStyle = "rgba(51,65,85,0.18)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // tunnel tube
      const tubeH = 34;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(nodeX[0], centerY - tubeH / 2);
      ctx.lineTo(nodeX[nodeX.length - 1], centerY - tubeH / 2);
      ctx.lineTo(nodeX[nodeX.length - 1], centerY + tubeH / 2);
      ctx.lineTo(nodeX[0], centerY + tubeH / 2);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, centerY - tubeH / 2, 0, centerY + tubeH / 2);
      grad.addColorStop(0, "rgba(14,116,144,0.10)");
      grad.addColorStop(0.5, connected ? "rgba(6,182,212,0.22)" : "rgba(51,65,85,0.18)");
      grad.addColorStop(1, "rgba(14,116,144,0.10)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = connected ? "rgba(6,182,212,0.55)" : "rgba(100,116,139,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // flowing dashes
      ctx.beginPath();
      ctx.moveTo(nodeX[0], centerY);
      ctx.lineTo(nodeX[nodeX.length - 1], centerY);
      ctx.strokeStyle = connected ? "rgba(6,182,212,0.8)" : "rgba(100,116,139,0.5)";
      ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = -frame * 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // packets
      if (connected && frame % SPAWN_EVERY_FRAMES === 0) spawn();
      packetsRef.current = packetsRef.current.filter((p) => p.progress < 1);
      for (const p of packetsRef.current) {
        p.progress += PACKET_SPEED;
        const x = p.x + (p.targetX - p.x) * p.progress;
        const pulse = 0.8 + Math.sin(frame * 0.2) * 0.2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, centerY, p.size * pulse, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.font = "7px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#0f172a";
        ctx.fillText(p.label, x, centerY + 2.5);
        ctx.restore();
      }
      if (!connected) packetsRef.current = [];

      // nodes
      NODE_DEFS.forEach((n, idx) => {
        const x = nodeX[idx];
        const active = connected;
        const pulseI = 0.6 + Math.sin(frame * 0.08 + idx * 1.2) * 0.4;
        ctx.save();
        ctx.translate(x, centerY);
        if (active) {
          const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
          glow.addColorStop(0, `rgba(6,182,212,${0.3 * pulseI})`);
          glow.addColorStop(1, "rgba(6,182,212,0)");
          ctx.beginPath();
          ctx.arc(0, 0, 46, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
        if (active) {
          core.addColorStop(0, "#06b6d4");
          core.addColorStop(1, "#0e7490");
        } else {
          core.addColorStop(0, "#475569");
          core.addColorStop(1, "#1e293b");
        }
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();
        ctx.strokeStyle = active ? "#67e8f9" : "#64748b";
        ctx.lineWidth = active ? 2 : 1.2;
        ctx.stroke();
        ctx.font = "18px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0f172a";
        ctx.fillText(n.glyph, 0, 1);
        ctx.font = "9px monospace";
        ctx.fillStyle = active ? "#e2e8f0" : "#64748b";
        ctx.fillText(n.label, 0, 42);
        ctx.restore();
      });

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [connected, width, height]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-auto rounded-xl glass-strong border border-white/5 transition-all duration-300 ease-in-out shadow-inner"
        style={{ maxWidth: width }}
        role="img"
        aria-label={connected ? "Encrypted tunnel active" : "Tunnel disconnected"}
      />
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border tracking-wider transition-all duration-300 ease-in-out ${connected
              ? "bg-success/20 text-success border-success/40 shadow-[0_0_10px_rgba(var(--color-success),0.2)]"
              : "glass-panel text-on-surface-variant border-white/10"
            }`}
        >
          {connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
          <span>{connected ? "TUNNEL ACTIVE · TLS 1.3" : "DISCONNECTED"}</span>
        </div>
        {connected && latency > 0 && (
          <span className="text-[10px] font-mono text-success opacity-80 backdrop-blur-md px-2 py-0.5 rounded border border-success/20 bg-success/5">⚡ {latency}ms · AES-256-GCM</span>
        )}
      </div>
    </div>
  );
};

export default VPNTunnel;
