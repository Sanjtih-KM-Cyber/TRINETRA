import React, { useState, useRef, useEffect } from "react";
import { sahayakApi, caseApi } from "../../services/api";
import { Bot, Send, Loader2, AlertCircle, BookMarked, Paperclip, FolderOpen, FileText, X } from "lucide-react";
import { VoiceInputButton } from "../i18n/VoiceInputButton";

interface AskTabProps {
  caseId: string;
}

interface Msg {
  id: string;
  from: "user" | "sahayak";
  text: string;
  citations?: string[];
  confidence?: number;
  actions?: string[];
  isError?: boolean;
}

interface AttachedDoc {
  name: string;
  chars: number;
  text: string;
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

export const AskTab: React.FC<AskTabProps> = ({ caseId }) => {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      from: "sahayak",
      text: "Namaste. I am SAHAYAK — case-grounded reasoning over live evidence, the link graph and the statute corpus (BNS/BNSS/BSA, NDPS, UAPA, PMLA, precedent). Every answer cites its provisions.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Phase 5 Req25 — source files + ad-hoc context.
  const [sources, setSources] = useState<any[]>([]);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const [attached, setAttached] = useState<AttachedDoc[]>([]);
  const [attaching, setAttaching] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    let cancelled = false;
    caseApi
      .getCaseState(caseId)
      .then((st) => {
        if (!cancelled) setSources(st.evidenceFiles || []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const send = async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || busy) return;
    const context =
      attached.length > 0
        ? attached.map((a) => `--- ${a.name} ---\n${a.text}`).join("\n\n").slice(0, 12000)
        : undefined;
    setMessages((p) => [...p, { id: `u-${Date.now()}`, from: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await sahayakApi.ask(q, caseId, context);
      setMessages((p) => [
        ...p,
        {
          id: `s-${Date.now()}`,
          from: "sahayak",
          text: r.answer,
          citations: r.citations,
          confidence: r.confidence,
          actions: r.recommendedActions,
        },
      ]);
    } catch (err: any) {
      setMessages((p) => [...p, { id: `e-${Date.now()}`, from: "sahayak", text: err.message || "Query failed.", isError: true }]);
    } finally {
      setBusy(false);
    }
  };

  const ingestFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, 12);
    if (arr.length === 0) return;
    setAttaching(true);
    try {
      const docs: AttachedDoc[] = [];
      for (const f of arr) {
        if (f.size > 5 * 1024 * 1024) continue;
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".txt") || lower.endsWith(".log") || lower.endsWith(".csv") || f.type.startsWith("text/")) {
          const text = await f.text().catch(() => "");
          if (text.trim()) docs.push({ name: f.name, chars: text.length, text: text.slice(0, 6000) });
        } else {
          try {
            const b64 = await fileToBase64(f);
            const res = await sahayakApi.parseDocument(f.name, f.type || "application/octet-stream", b64);
            const text = String(res.document?.text || "").slice(0, 6000);
            if (text.trim()) docs.push({ name: f.name, chars: text.length, text });
          } catch {
            /* skip unparsable files */
          }
        }
      }
      if (docs.length > 0) setAttached((p) => [...p, ...docs].slice(0, 12));
    } finally {
      setAttaching(false);
    }
  };

  const opened = openSource ? sources.find((s: any) => (s.id || s.fileName) === openSource) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Phase 5 Req25 — case source files: retrieve + read complete files in chat */}
      <div className="mb-2 rounded-xl bg-slate-950 border border-slate-800 p-2.5">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <select
            value={openSource || ""}
            onChange={(e) => setOpenSource(e.target.value || null)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none"
          >
            <option value="">Read a complete case source file… ({sources.length})</option>
            {sources.map((s: any) => (
              <option key={s.id || s.fileName} value={s.id || s.fileName}>
                {s.fileName}
              </option>
            ))}
          </select>
          {openSource && (
            <button onClick={() => setOpenSource(null)} className="p-1.5 text-slate-400 hover:text-slate-200" title="Close reader">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {opened && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-900 border border-slate-800 p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
            <div className="font-mono font-bold text-slate-100 mb-1">{opened.fileName}</div>
            <div className="font-mono text-[10px] text-slate-500 mb-2">
              {opened.fileSizeFormatted || ""} · {opened.uploadedAt ? String(opened.uploadedAt).slice(0, 10) : ""} · {opened.sourceAuthority || ""}
            </div>
            {opened.summary && <div className="mb-2 text-slate-200">{opened.summary}</div>}
            {opened.rawText ? opened.rawText : <span className="text-slate-500 italic">No retrievable text stored for this exhibit (binary artifact).</span>}
          </div>
        )}
      </div>

      {/* Phase 5 Req25 — ad-hoc files / folders into conversation context */}
      <div className="mb-2 flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={attaching}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 disabled:opacity-50"
          title="Attach files for instant summarization & analysis"
        >
          <Paperclip className="w-3.5 h-3.5" /> {attaching ? "Reading…" : "Attach files"}
        </button>
        <button
          onClick={() => folderRef.current?.click()}
          disabled={attaching}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 disabled:opacity-50"
          title="Attach an entire folder"
        >
          <FolderOpen className="w-3.5 h-3.5" /> Folder
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) ingestFiles(e.target.files); e.target.value = ""; }} />
        <input
          ref={folderRef}
          type="file"
          className="hidden"
          {...({ webkitdirectory: "" } as any)}
          onChange={(e) => { if (e.target.files) ingestFiles(e.target.files); e.target.value = ""; }}
        />
        {attached.map((a) => (
          <span key={a.name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-200 text-[10px] font-mono" title={`${a.chars} chars in context — ask anything, e.g. 'summarize the attached'`}>
            {a.name} · {(a.chars / 1000).toFixed(1)}k
            <button onClick={() => setAttached((p) => p.filter((x) => x.name !== a.name))} className="hover:text-amber-100" title="Remove">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {messages.map((m) => (
          <div key={m.id} className={`rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap ${
            m.from === "user"
              ? "bg-amber-500/10 border border-amber-500/30 text-slate-100 ml-6"
              : m.isError
              ? "bg-rose-500/10 border border-rose-500/30 text-rose-200 mr-6"
              : "bg-slate-950 border border-slate-800 text-slate-200 mr-6"
          }`}>
            {m.from === "sahayak" && !m.isError && m.id !== "welcome" && typeof m.confidence === "number" && (
              <div className="mb-1.5 text-[10px] font-mono text-slate-500">
                confidence {m.confidence.toFixed(2)}
              </div>
            )}
            {m.from === "sahayak" ? <Bot className="w-3.5 h-3.5 text-amber-400 mb-1" /> : null}
            <div>{m.text}</div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] font-mono font-bold text-slate-400 flex items-center gap-1 mb-1">
                  <BookMarked className="w-3 h-3" /> CITATIONS
                </div>
                {m.citations.map((c, i) => (
                  <div key={i} className="text-[11px] text-slate-400">[{i + 1}] {c}</div>
                ))}
              </div>
            )}
            {m.actions && m.actions.length > 0 && (
              <div className="mt-1.5 text-[11px] text-slate-300">
                {m.actions.map((a, i) => (
                  <div key={i}>→ {a}</div>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> SAHAYAK reasoning…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-1.5 mt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={attached.length > 0 ? "Ask about the attached files, or the case…" : "Ask — bail clocks, sections, exhibits, strategy… (22-lang mic)"}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        <VoiceInputButton onTranscript={(tx) => setInput((v) => (v ? `${v} ${tx}` : tx))} title="Dictate question" />
        <button onClick={() => send()} disabled={busy || !input.trim()} className="btn-primary !px-3 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1.5">
        <AlertCircle className="w-3 h-3" /> Answers cite retrieved provisions; verify before filing.
      </div>
    </div>
  );
};

export default AskTab;
