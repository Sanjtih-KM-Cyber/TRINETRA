import React, { useState } from "react";
import { sahayakApi, stagingApi } from "../../services/api";
import { FileSearch, Upload, Loader2, AlertCircle, CheckCircle2, Send, Languages } from "lucide-react";

interface DocumentIntelTabProps {
  caseId: string;
  readOnly: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      resolve(res.includes(",") ? res.split(",")[1] : res);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export const DocumentIntelTab: React.FC<DocumentIntelTabProps> = ({ caseId, readOnly }) => {
  const [doc, setDoc] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState("Hindi");

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setDoc(null);
    setStaged(null);
    setTranslation(null);
    try {
      const b64 = await fileToBase64(f);
      const res = await sahayakApi.parseDocument(f.name, f.type || "application/octet-stream", b64);
      setDoc(res.document);
    } catch (err: any) {
      setError(err.message || "Parsing failed.");
    } finally {
      setBusy(false);
    }
  };

  const sendToStaging = async () => {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      const lower = doc.fileName.toLowerCase();
      const source = lower.includes("fir mul") || lower.startsWith("fir") ? "FIR" : lower.includes("cyber") || lower.includes("ncrp") ? "CYBER_LOG" : "INTEL_REPORT";
      const res = await stagingApi.ingest(caseId, {
        source,
        content: doc.text,
        fileName: doc.fileName,
      });
      setStaged(`${res.entityCount} entities + ${res.linkCount} links staged in batch ${res.batchId}. Review in Intake Pipeline.`);
    } catch (err: any) {
      setError(err.message || "Staging failed.");
    } finally {
      setBusy(false);
    }
  };

  const translate = async () => {
    if (!doc) return;
    setTranslating(true);
    setError(null);
    try {
      const res = await sahayakApi.translate(doc.text.slice(0, 4000), targetLang);
      setTranslation(res.translated);
    } catch (err: any) {
      setError(err.message || "Translation failed.");
    } finally {
      setTranslating(false);
    }
  };

  const renderHighlighted = (line: string, reasons: string[]) => {
    // Split on identifier-like tokens and emphasize them
    const parts = line.split(/(\+91[\-\s]?[6-9]\d{9}|\b\d{12,15}\b|[A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4}|₹\s?[\d,]+)/g);
    return (
      <>
        {parts.map((p, i) =>
          /(\+91|[0-9]{4}|₹)/.test(p) && p.trim().length > 3 ? (
            <mark key={i} className="bg-amber-400/80 text-slate-950 rounded px-0.5">{p}</mark>
          ) : (
            <span key={i}>{p}</span>
          )
        )}
        <span className="block text-[10px] font-mono text-amber-300/80 mt-0.5">◈ {reasons.join(" · ")}</span>
      </>
    );
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-amber-500/50 rounded-2xl p-5 cursor-pointer bg-slate-950/60 transition-colors">
        <Upload className="w-4 h-4 text-amber-400" />
        <span className="text-xs text-slate-300">
          {busy ? "Parsing document…" : "Drop PDF / DOCX / TXT / CSV / LOG here (≤20MB, parsed locally)"}
        </span>
        <input type="file" className="hidden" accept=".pdf,.docx,.txt,.csv,.log" disabled={busy}
          onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {busy && <Loader2 className="w-4 h-4 animate-spin text-amber-400 mx-auto" />}
      {error && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {doc && (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] font-mono text-slate-300 space-y-1">
            <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <FileSearch className="w-4 h-4 text-cyan-300" /> {doc.fileName}
            </div>
            <div>{doc.pages} page(s) · {doc.charCount.toLocaleString("en-IN")} chars · script: {doc.language.primary}</div>
            <div className="text-emerald-300">{doc.entities.length} entities · {doc.links.length} links · {doc.highlights.length} highlighted lines</div>
            <div className="text-slate-500 break-all">SHA-256 {String(doc.hash).slice(0, 40)}…</div>
          </div>

          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Relevant lines ({doc.highlights.length})</div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(doc.highlights || []).map((h: any) => (
                <div key={h.lineNo} className="text-[11px] text-slate-200 bg-slate-900 border border-amber-500/20 rounded-lg p-2">
                  <span className="font-mono text-slate-500 mr-1.5">L{h.lineNo}</span>
                  {renderHighlighted(h.line, h.reasons)}
                </div>
              ))}
              {(!doc.highlights || doc.highlights.length === 0) && (
                <div className="text-[11px] text-slate-500">No identifier-bearing lines detected.</div>
              )}
            </div>
          </div>

          {(doc.entities || []).length > 0 && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Extracted entities ({doc.entities.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {(doc.entities || []).slice(0, 30).map((e: any) => (
                  <span key={e.id} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200">
                    {e.label} <span className="text-slate-500">[{e.type}]</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5" /> Translate (live model)
            </div>
            <div className="flex gap-1.5">
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none">
                {["Hindi", "Marathi", "Bengali", "Tamil", "Telugu", "Urdu", "English"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button onClick={translate} disabled={translating} className="btn-secondary !py-1.5 disabled:opacity-50">
                {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Translate first 4000 chars
              </button>
            </div>
            {translation && <div className="text-[11px] text-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto">{translation}</div>}
          </div>

          {!readOnly && (
            <button onClick={sendToStaging} disabled={busy} className="btn-primary w-full disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to Staging (Lead review)
            </button>
          )}
          {staged && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 flex gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {staged}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentIntelTab;
