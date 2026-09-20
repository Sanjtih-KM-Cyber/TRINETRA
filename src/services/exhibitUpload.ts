import { caseApi, sahayakApi } from "./api";
import { apiUrl } from "./apiBase";

/**
 * Shared exhibit upload: any role can seal PDF / Word / images / audio /
 * video / text as a case exhibit. Text-bearing files are converted to text
 * via SAHAYAK document intel (server-side PDF/DOCX parsing, direct read for
 * plain text) so the Lead's Extracted-data review queue fills automatically.
 * Pure media (photo/audio/video) registers as a sealed container — the
 * officer's narrative carries the extractable intel.
 */

export function exhibitKindOf(fileName: string, mime = ""): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const m = (mime || "").toLowerCase();
  if (ext === "pdf" || m.includes("pdf")) return "PDF";
  if (ext === "doc" || ext === "docx") return "DOCX";
  if (["png", "jpg", "jpeg", "webp", "tiff", "bmp"].includes(ext) || m.includes("image")) return "IMAGE_OCR";
  if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext) || m.includes("video")) return "VIDEO_CCTV";
  if (["mp3", "wav", "m4a", "ogg", "aac", "flac"].includes(ext) || m.includes("audio")) return "AUDIO_LOG";
  if (ext === "csv") return /cdr|call/i.test(fileName) ? "CDR_CSV" : "FINANCIAL_CSV";
  return "TEXT_DOC";
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
  }
  return btoa(bin);
}

/**
 * Convert a file to extractable text where possible.
 * Returns null for pure media (photo/audio/video) — sealed as containers.
 */
export async function fileToText(file: File): Promise<{ text: string; via: string } | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const mime = (file.type || "").toLowerCase();
  const isPlainText =
    mime.startsWith("text/") ||
    ["txt", "log", "csv", "json", "md"].includes(ext);
  if (isPlainText) {
    if (file.size > 2 * 1024 * 1024) return null;
    return { text: await file.text(), via: "direct-read" };
  }
  if (["pdf", "doc", "docx"].includes(ext)) {
    if (file.size === 0 || file.size > 20 * 1024 * 1024) return null;
    const base64 = bufToBase64(await file.arrayBuffer());
    const res = await sahayakApi.parseDocument(file.name, file.type || "application/octet-stream", base64);
    const text = String(res.document?.text || "").slice(0, 200000);
    if (!text.trim()) return null;
    return { text, via: "sahayak-doc-intel" };
  }
  return null;
}

/** Exhibit size ceiling: 15GB for every role (field, cyber, forensic, lead, admin). */
export const MAX_EXHIBIT_BYTES = 15 * 1024 * 1024 * 1024;
/** Files at or under this size travel inline as JSON; larger ones stream in chunks. */
const INLINE_LIMIT_BYTES = 8 * 1024 * 1024;
const STREAM_CHUNK_BYTES = 50 * 1024 * 1024;

export function fmtExhibitBytes(n: number): string {
  if (!n || Number.isNaN(n)) return "0 B";
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export interface UploadedExhibit {
  id: string;
  name: string;
  kind: string;
  withText: boolean;
}

/** Seal one file as a case exhibit (≤15GB for every role), converting to text when possible. */
export async function uploadExhibitFile(caseId: string, file: File): Promise<UploadedExhibit> {
  if (file.size > MAX_EXHIBIT_BYTES) {
    throw new Error(`'${file.name}' exceeds the 15GB exhibit cap.`);
  }
  const kind = exhibitKindOf(file.name, file.type || "");
  if (file.size > INLINE_LIMIT_BYTES) {
    // Large container: stream bytes in 50MB chunks (server reassembles +
    // SHA-256 seals), then register metadata. Text conversion is skipped —
    // the officer's narrative carries the extractable intel.
    const streamId = `exh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { sha256 } = await streamFileChunks(file, streamId);
    const res = await caseApi.uploadEvidence(caseId, {
      fileName: file.name,
      fileType: kind,
      fileSize: file.size,
      fileSizeFormatted: fmtExhibitBytes(file.size),
      summary: `${kind} container '${file.name}' (${fmtExhibitBytes(file.size)}) streamed to the vault with ${sha256}. Sealed into the evidence locker with chain-of-custody.`,
    });
    return {
      id: res.evidence?._id || res.evidence?.id || "",
      name: file.name,
      kind,
      withText: false,
    };
  }
  let rawText: string | undefined;
  try {
    const converted = await fileToText(file);
    if (converted?.text.trim()) rawText = converted.text;
  } catch {
    rawText = undefined;
  }
  const res = await caseApi.uploadEvidence(caseId, {
    fileName: file.name,
    fileType: kind,
    fileSize: file.size,
    fileSizeFormatted: fmtExhibitBytes(file.size),
    ...(rawText ? { rawText } : {}),
    summary: rawText
      ? `${kind} exhibit '${file.name}' sealed with text conversion (${fmtExhibitBytes(rawText.length)} chars) for SAHAYAK extraction.`
      : `${kind} exhibit '${file.name}' sealed into the evidence locker with SHA-256 chain-of-custody.`,
  });
  return {
    id: res.evidence?._id || res.evidence?.id || "",
    name: file.name,
    kind,
    withText: !!rawText,
  };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("crim_intel_token");
  let vpn: string | null = null;
  try {
    vpn = sessionStorage.getItem("crim_intel_vpn");
  } catch {
    vpn = null;
  }
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(vpn ? { "X-VPN-Session": vpn } : {}),
  };
}

/** Stream a large file to /api/upload-chunk in 50MB segments. Resolves with the vault SHA-256. */
async function streamFileChunks(file: File, streamId: string): Promise<{ sha256: string }> {
  const totalChunks = Math.max(1, Math.ceil(file.size / STREAM_CHUNK_BYTES));
  let last: any = null;
  for (let idx = 0; idx < totalChunks; idx++) {
    const start = idx * STREAM_CHUNK_BYTES;
    const end = Math.min(file.size, start + STREAM_CHUNK_BYTES);
    const buf = await file.slice(start, end).arrayBuffer();
    const res = await fetch(apiUrl("/api/upload-chunk"), {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...authHeaders(),
        "x-file-id": streamId,
        "x-file-name": file.name,
        "x-chunk-index": String(idx),
        "x-total-chunks": String(totalChunks),
        "x-total-bytes": String(file.size),
      },
      body: buf,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      throw new Error(body?.error || `Chunk ${idx + 1}/${totalChunks} failed to stream.`);
    }
    last = body;
  }
  if (!last || last.status !== "COMPLETE" || !last.sha256) {
    throw new Error("Vault did not confirm the streamed container.");
  }
  return { sha256: last.sha256 };
}
