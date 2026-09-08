import React, { useState } from "react";
import { stagingApi } from "../../services/api";
import { DictationField } from "../proceedings/DictationField";
import { Upload, FileText, Phone, Landmark, Globe, Radio, Terminal, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface IngestTabProps {
  caseId: string;
  readOnly: boolean;
  onChanged: () => void;
}

const SOURCES = [
  { id: "FIR", label: "FIR Narrative", icon: <FileText className="w-4 h-4" />, hint: "Paste FIR text — phones, IMEIs, vehicles, names extracted" },
  { id: "CDR_CSV", label: "CDR CSV", icon: <Phone className="w-4 h-4" />, hint: "Call detail records → phone entities + call aggregates" },
  { id: "FINANCIAL_CSV", label: "Financial CSV", icon: <Landmark className="w-4 h-4" />, hint: "Ledger rows → account entities + transfer aggregates" },
  { id: "OSINT_URL", label: "OSINT URL", icon: <Globe className="w-4 h-4" />, hint: "Public page fetch (12s cap, 1MB) → entity extraction" },
  { id: "INTEL_REPORT", label: "Intel Report", icon: <Radio className="w-4 h-4" />, hint: "HUMINT / field intel narrative" },
  { id: "CYBER_LOG", label: "Cyber Log", icon: <Terminal className="w-4 h-4" />, hint: "NCRP / server / transaction logs" },
];

export const IngestTab: React.FC<IngestTabProps> = ({ caseId, readOnly, onChanged }) => {
  const [source, setSource] = useState("FIR");
  const [fileName, setFileName] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ batchId: string; entityCount: number; linkCount: number; truncated: boolean; note: string } | null>(null);

  const isText = source === "FIR" || source === "INTEL_REPORT" || source === "CYBER_LOG";
  const isCsv = source === "CDR_CSV" || source === "FINANCIAL_CSV";

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) {
      setError("File exceeds 15MB staging cap.");
      return;
    }
    setFileName(f.name);
    setContent(await f.text());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await stagingApi.ingest(caseId, {
        source,
        content: source === "OSINT_URL" ? undefined : content,
        fileName: fileName || undefined,
        url: source === "OSINT_URL" ? url : undefined,
      });
      setResult(res);
      setContent("");
      setUrl("");
      onChanged();
    } catch (err: any) {
      setError(err.message || "Ingestion failed.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="space-y-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setSource(s.id); setError(null); setResult(null); }}
            className={`w-full text-left rounded-xl border p-3 transition-all ${
              source === s.id ? "bg-amber-500/10 border-amber-500/40" : "bg-slate-900 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-100">{s.icon} {s.label}</div>
            <div className="text-[11px] text-slate-400 mt-1">{s.hint}</div>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3.5 h-fit">
        <h3 className="text-sm font-bold">Ingest → Staging Area <span className="text-[10px] font-mono text-slate-500">nothing reaches the main graph before Lead approval</span></h3>
        {error && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-300 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {result && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 flex gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold font-mono">Batch {result.batchId} — {result.entityCount} entities + {result.linkCount} links staged{result.truncated ? " (truncated to caps)" : ""}</div>
              <div className="mt-0.5 text-emerald-300/90">{result.note}</div>
            </div>
          </div>
        )}
        {readOnly && <div className="text-[11px] font-mono text-slate-500">VIEW_ONLY access — ingestion disabled.</div>}

        {source === "OSINT_URL" ? (
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Public URL *</label>
            <input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url"
              disabled={readOnly} className={`${inputCls} font-mono`} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">File name</label>
                <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={isCsv ? "dump.csv" : "document reference"} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Upload file</label>
                <label className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 cursor-pointer hover:border-slate-600">
                  <Upload className="w-3.5 h-3.5" /> {fileName || "Choose file (≤15MB)"}
                  <input type="file" className="hidden" disabled={readOnly}
                    accept={isCsv ? ".csv,.txt" : ".txt,.log,.csv"}
                    onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              </div>
            </div>
            {isText ? (
              <DictationField label={`${SOURCES.find((s) => s.id === source)?.label} text`} value={content} onChange={setContent} rows={8} required
                placeholder="Paste or dictate the narrative — extraction runs server-side…" />
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">CSV content *</label>
                <textarea required value={content} onChange={(e) => setContent(e.target.value)} rows={8} disabled={readOnly}
                  placeholder={source === "CDR_CSV" ? "aParty,bParty,imeiA,imeiB,timestamp,durationSec,callType,towerId,towerLocation,lat,lng\n+919820011442,+971508821990,864219038472911,,2026-08-14T23:10:00Z,340,VOICE_CALL,TOW-DONGRI-01,Dongri,18.9614,72.8373" : "senderAcc,senderName,receiverAcc,receiverName,amount,timestamp,mode,utr,bank\n50200049281923,Apex Agro,30918274619,Mahesh Rathod,980000,2026-08-14T11:20:00Z,RTGS,HDFC992819284,HDFC"}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-[11px] font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
            )}
          </>
        )}

        <button type="submit" disabled={busy || readOnly} className="btn-primary w-full disabled:opacity-50">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Parsing & staging…</> : <><Upload className="w-4 h-4" /> Stage for Review</>}
        </button>
      </form>
    </div>
  );
};

export default IngestTab;
