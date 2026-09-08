import { db, DBMeshPeer } from "../db";

export interface MeshChatResult {
  content: string;
  peerName: string;
  model: string;
  latencyMs: number;
}

let envSeeded = false;

function transportOf(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host.endsWith(".ts.net") || host.startsWith("100.")) return "tailscale";
    if (host === "localhost" || host === "127.0.0.1") return "local";
    return "lan";
  } catch {
    return "unknown";
  }
}

/** Seed peers from MESH_PEERS env (JSON array) exactly once per boot. */
async function ensureEnvSeeded(): Promise<void> {
  if (envSeeded) return;
  envSeeded = true;
  const raw = process.env.MESH_PEERS;
  if (!raw) return;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      if (!p?.name || !p?.baseUrl) continue;
      const id = `peer-${String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      if (await db.mesh_peers.findOne(id)) continue;
      await db.mesh_peers.insertOne({
        _id: id,
        name: String(p.name),
        baseUrl: String(p.baseUrl).replace(/\/$/, ""),
        transport: transportOf(String(p.baseUrl)),
        adapters: Array.isArray(p.adapters) ? p.adapters.map(String) : [],
        models: Array.isArray(p.models) ? p.models.map(String) : [],
        enabled: p.enabled !== false,
        addedBy: "ENV:MESH_PEERS",
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[MESH] invalid MESH_PEERS JSON:", err);
  }
}

export async function listMeshPeers(): Promise<DBMeshPeer[]> {
  await ensureEnvSeeded();
  return db.mesh_peers.find();
}

async function probePeer(peer: DBMeshPeer, timeoutMs = 5000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // OpenAI-compatible servers expose /models; llama.cpp exposes /health.
    // Try /models first, fall back to /health — either HTTP answer counts.
    let res = await fetch(`${peer.baseUrl}/models`, { signal: ctrl.signal }).catch(() => null);
    if (!res) {
      res = await fetch(`${peer.baseUrl}/health`, { signal: ctrl.signal }).catch(() => null);
    }
    clearTimeout(timer);
    if (!res) return { ok: false, error: "connection refused/timeout" };
    if (res.status >= 500) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err: any) {
    clearTimeout(timer);
    return { ok: false, error: err?.name === "AbortError" ? "probe timeout" : "connection refused" };
  }
}

export async function refreshMeshHealth(): Promise<DBMeshPeer[]> {
  const peers = await listMeshPeers();
  for (const p of peers) {
    if (!p.enabled) continue;
    const r = await probePeer(p);
    await db.mesh_peers.updateOne(p._id, {
      lastLatencyMs: r.latencyMs,
      lastSeen: r.ok ? new Date().toISOString() : p.lastSeen,
      lastError: r.ok ? undefined : r.error,
    });
  }
  return db.mesh_peers.find();
}

/**
 * Federated inference: route a chat request to the best live peer.
 * Local-first ordering, adapter-filtered when requested, full failover.
 */
export async function routeMeshChat(
  messages: Array<{ role: string; content: string }>,
  opts: { adapter?: string; timeoutMs?: number; modelHint?: string } = {}
): Promise<MeshChatResult> {
  const peers = (await listMeshPeers()).filter((p) => p.enabled);
  if (peers.length === 0) throw new Error("Mesh has no registered peers.");

  let candidates = peers;
  if (opts.adapter) {
    const tagged = peers.filter((p) => p.adapters.includes(opts.adapter!));
    if (tagged.length > 0) candidates = tagged;
  }
  // Local-first, then lowest known latency
  const order = ["local", "tailscale", "lan", "unknown"];
  candidates = [...candidates].sort(
    (a, b) => order.indexOf(transportOf(a.baseUrl)) - order.indexOf(transportOf(b.baseUrl)) ||
      (a.lastLatencyMs ?? 99999) - (b.lastLatencyMs ?? 99999)
  );

  const timeoutMs = opts.timeoutMs || 60000;
  const errors: string[] = [];
  for (const peer of candidates) {
    const model = opts.modelHint || peer.models[0] || "default";
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${peer.baseUrl}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.1,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        errors.push(`${peer.name}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        errors.push(`${peer.name}: empty completion`);
        continue;
      }
      const latencyMs = Date.now() - t0;
      await db.mesh_peers.updateOne(peer._id, { lastLatencyMs: latencyMs, lastSeen: new Date().toISOString(), lastError: undefined });
      return { content, peerName: peer.name, model, latencyMs };
    } catch (err: any) {
      errors.push(`${peer.name}: ${err?.name === "AbortError" ? "timeout" : "unreachable"}`);
    }
  }
  throw new Error(`All mesh peers failed — ${errors.join("; ")}`);
}

export function meshTransport(): string {
  return process.env.TAILSCALE_HOSTNAME ? "tailscale" : "lan";
}
