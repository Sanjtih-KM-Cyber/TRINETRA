import { extractEntitiesRuleBased } from "../../src/services/nlpExtractor";

export interface ParsedDocument {
  fileName: string;
  mimeType: string;
  pages: number;
  lines: string[];
  text: string;
  charCount: number;
  language: { primary: string; scripts: string[] };
  entities: any[];
  links: any[];
  highlights: Array<{ lineNo: number; line: string; reasons: string[] }>;
  hash: string;
}

export interface HighlightRule {
  pattern: RegExp;
  reason: string;
}

const HIGHLIGHT_RULES: HighlightRule[] = [
  { pattern: /(?:\+91[\-\s]?)?[6-9]\d{9}\b/, reason: "Phone identifier" },
  { pattern: /\b\d{15}\b/, reason: "IMEI hardware identifier" },
  { pattern: /\b\d{12}\b/, reason: "12-digit identifier (Aadhaar candidate)" },
  { pattern: /\b[A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4}\b/, reason: "Vehicle registration" },
  { pattern: /₹\s?[\d,]+|\bRs\.?\s?[\d,]+|\b\d+\s?(lakh|crore)/i, reason: "Money-value mention" },
  { pattern: /\b\d{4}[\-\s]?\d{4}[\-\s]?\d{4}[\-\s]?\d{4}\b/, reason: "Card/account digit string" },
  { pattern: /\b(sec(tion)?|u\/s)\s*\d+[A-Z]*/i, reason: "Statute/section reference" },
  { pattern: /\b(FIR|CDR|IMEI|UPI|NEFT|RTGS|IMPS|UTR|IFSC|NDPS|PMLA|UAPA|BNSS?|BSA|CrPC|IEA)\b/i, reason: "Legal/forensic marker" },
  { pattern: /\b(midnight|dawn|intercept|seizure|raid|surveillance|handover|consignment|parcel|container|godown|safehouse)\b/i, reason: "Operational keyword" },
];

const SCRIPT_RANGES: Array<{ name: string; test: RegExp }> = [
  { name: "Devanagari (Hindi/Marathi)", test: /[\u0900-\u097F]/ },
  { name: "Bengali/Assamese", test: /[\u0980-\u09FF]/ },
  { name: "Gurmukhi (Punjabi)", test: /[\u0A00-\u0A7F]/ },
  { name: "Gujarati", test: /[\u0A80-\u0AFF]/ },
  { name: "Odia", test: /[\u0B00-\u0B7F]/ },
  { name: "Tamil", test: /[\u0B80-\u0BFF]/ },
  { name: "Telugu", test: /[\u0C00-\u0C7F]/ },
  { name: "Kannada", test: /[\u0C80-\u0CFF]/ },
  { name: "Malayalam", test: /[\u0D00-\u0D7F]/ },
  { name: "Arabic/Urdu/Sindhi", test: /[\u0600-\u06FF]/ },
  { name: "Latin (English)", test: /[A-Za-z]/ },
];

export function detectScripts(text: string): { primary: string; scripts: string[] } {
  const found = SCRIPT_RANGES.filter((s) => s.test.test(text)).map((s) => s.name);
  const counts = SCRIPT_RANGES.map((s) => ({
    name: s.name,
    count: (text.match(new RegExp(s.test.source, "g")) || []).length,
  })).sort((a, b) => b.count - a.count);
  const primary = counts[0]?.count > 0 ? counts[0].name : "Unknown";
  return { primary, scripts: found };
}

export function scoreLine(line: string): string[] {
  const reasons: string[] = [];
  for (const rule of HIGHLIGHT_RULES) {
    if (rule.pattern.test(line)) reasons.push(rule.reason);
  }
  return reasons;
}

/**
 * Extractive summary for offline use: the highest-signal lines in document
 * order, each tagged with why it was picked. No model required.
 */
export function extractiveSummary(text: string, maxLines = 6): { lines: string[]; summary: string } {
  const scored = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 30)
    .map((line, i) => ({ line, i, score: scoreLine(line).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, maxLines)
    .sort((a, b) => a.i - b.i);
  const lines = scored.map((s) => s.line);
  return {
    lines,
    summary:
      lines.length > 0
        ? `Key extracts (${lines.length} highest-signal lines, document order):\n- ${lines.join("\n- ")}`
        : "No identifier-bearing lines found to summarize.",
  };
}

async function parsePdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  // pdfjs-dist legacy build works in pure Node for text extraction.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(buffer) }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it: any) => it.str || "").join(" "));
  }
  const pages = doc.numPages;
  if (typeof doc.destroy === "function") {
    await doc.destroy().catch(() => undefined);
  }
  return { text: parts.join("\n"), pages };
}

async function parseDocx(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const mammoth = await import("mammoth");
  const result = await (mammoth as any).extractRawText({ buffer });
  const text = String(result.value || "");
  return { text, pages: Math.max(1, Math.ceil(text.length / 3000)) };
}

/**
 * FileFinder-grade multilingual document parsing: PDF/DOCX/TXT/CSV/LOG →
 * text + script detection + rule-based entity extraction + scored line
 * highlights. Everything runs locally; no external calls.
 */
export async function parseDocument(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  docLabel?: string
): Promise<ParsedDocument> {
  const lower = fileName.toLowerCase();
  let text = "";
  let pages = 1;

  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    const r = await parsePdf(buffer);
    text = r.text;
    pages = r.pages;
  } else if (lower.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
    const r = await parseDocx(buffer);
    text = r.text;
    pages = r.pages;
  } else if (lower.endsWith(".doc")) {
    throw new Error("Legacy .doc (OLE) is not supported — convert to .docx, .pdf or .txt.");
  } else {
    text = buffer.toString("utf8");
    pages = Math.max(1, Math.ceil(text.length / 3000));
  }

  text = text.replace(/\r/g, "").trim();
  if (text.length < 10) throw new Error("Document yielded no readable text.");
  if (text.length > 500000) text = text.slice(0, 500000);

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const language = detectScripts(text);
  const extraction = extractEntitiesRuleBased(text, `DOC-${Date.now()}`, docLabel || fileName);

  const highlights = lines
    .map((line, i) => ({ lineNo: i + 1, line, reasons: scoreLine(line) }))
    .filter((h) => h.reasons.length > 0)
    .slice(0, 120);

  const crypto = await import("crypto");
  const hash = `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;

  return {
    fileName,
    mimeType,
    pages,
    lines,
    text,
    charCount: text.length,
    language,
    entities: extraction.nodes,
    links: extraction.links,
    highlights,
    hash,
  };
}
