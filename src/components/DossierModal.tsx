import React, { useState, useMemo, useEffect } from "react";
import {
  CaseDataset,
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  SyndicateCommunity,
  AuditLogEntry,
} from "../types";
import { useAuth } from "../context/AuthContext";
import { caseApi, sahayakApi } from "../services/api";
import {
  X,
  Printer,
  Copy,
  Sparkles,
  AlertCircle,
  Plus,
  Trash2,
  Gavel,
  User,
  ArrowRight,
} from "lucide-react";

interface DossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCase: CaseDataset;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  patterns: SuspiciousPattern[];
  communities: SyndicateCommunity[];
  auditLogs?: AuditLogEntry[];
}

interface AccusedPerson {
  nodeId: string;
  name: string;
  role: string;
  sections: string[];
  allegations: string;
  evidenceRefs: string[];
}

interface ManualPoint {
  id: string;
  text: string;
}

interface WarrantDraft {
  accused: AccusedPerson[];
  manualPoints: ManualPoint[];
  courtName: string;
  venue: string;
  ioName: string;
  ioRank: string;
  ioBadge: string;
  filingDate: string;
}

export const DossierModal: React.FC<DossierModalProps> = ({
  isOpen,
  onClose,
  currentCase,
  nodes,
  links,
  patterns,
  communities,
  auditLogs,
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<"select" | "sections" | "review" | "final">("select");
  const [warrant, setWarrant] = useState<WarrantDraft>({
    accused: [],
    manualPoints: [],
    courtName: "Special Court",
    venue: "Mumbai",
    ioName: user?.name || "",
    ioRank: user?.designation || "",
    ioBadge: user?.official_id || "",
    filingDate: new Date().toISOString().split("T")[0],
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveEvidence, setLiveEvidence] = useState<any[]>([]);
  const [liveFirs, setLiveFirs] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    caseApi.getCaseState(currentCase.id).then((st) => {
      setLiveEvidence(st.evidenceFiles || []);
      setLiveFirs(st.firs || []);
    }).catch(() => undefined);
  }, [isOpen, currentCase.id]);

  // Get person nodes from the graph
  const personNodes = useMemo(() =>
    nodes.filter((n) => n.type === "PERSON" && n.reviewState === "CONFIRMED"),
    [nodes]
  );

  // Step 1: Select accused persons
  const toggleAccused = (node: CrimeNetworkNode) => {
    setWarrant((w) => {
      const exists = w.accused.find((a) => a.nodeId === node.id);
      if (exists) {
        return { ...w, accused: w.accused.filter((a) => a.nodeId !== node.id) };
      }
      return {
        ...w,
        accused: [
          ...w.accused,
          {
            nodeId: node.id,
            name: node.label,
            role: node.role || "Accused",
            sections: [],
            allegations: "",
            evidenceRefs: [],
          },
        ],
      };
    });
  };

  const isAccused = (nodeId: string) => warrant.accused.some((a) => a.nodeId === nodeId);

  // Update accused details
  const updateAccused = (nodeId: string, field: keyof AccusedPerson, value: any) => {
    setWarrant((w) => ({
      ...w,
      accused: w.accused.map((a) =>
        a.nodeId === nodeId ? { ...a, [field]: value } : a
      ),
    }));
  };

  // Add/remove manual points
  const addManualPoint = () => {
    setWarrant((w) => ({
      ...w,
      manualPoints: [...w.manualPoints, { id: `mp-${Date.now()}`, text: "" }],
    }));
  };

  const removeManualPoint = (id: string) => {
    setWarrant((w) => ({
      ...w,
      manualPoints: w.manualPoints.filter((p) => p.id !== id),
    }));
  };

  const updateManualPoint = (id: string, text: string) => {
    setWarrant((w) => ({
      ...w,
      manualPoints: w.manualPoints.map((p) => (p.id === id ? { ...p, text } : p)),
    }));
  };

  // Generate arrest warrant via SAHAYAK
  const generateWarrant = async () => {
    if (warrant.accused.length === 0) {
      setError("Select at least one accused person.");
      return;
    }
    setIsGenerating(true);
    setError(null);

    try {
      // Build context for SAHAYAK
      const accusedContext = warrant.accused.map((a) => {
        const connectedLinks = links.filter(
          (l) => (typeof l.source === "object" ? l.source.id : l.source) === a.nodeId ||
                 (typeof l.target === "object" ? l.target.id : l.target) === a.nodeId
        );
        const evidence = liveEvidence.filter((e) => a.evidenceRefs.includes(e._id || e.id));
        return {
          name: a.name,
          role: a.role,
          sections: a.sections,
          allegations: a.allegations,
          evidence: evidence.map((e) => `${e.fileName} (${e.fileType})`),
          connections: connectedLinks.map((l) => {
            const s = typeof l.source === "object" ? l.source.label : l.source;
            const t = typeof l.target === "object" ? l.target.label : l.target;
            const rel = l.relationType;
            return `${s} —[${rel}]— ${t}`;
          }),
        };
      });

      const manualPointsText = warrant.manualPoints.map((p) => p.text).filter(Boolean).join("\n");

      const prompt = `You are a Senior Public Prosecutor drafting an arrest warrant and chargesheet section under Indian law.

CASE: ${currentCase.name} (${currentCase.codeName})
FIR: ${liveFirs.map((f) => `${f.firNumber} u/s ${(f.sections || []).join(", ")}`).join("; ") || "Details pending"}

ACCUSED PERSONS:
${accusedContext.map((a, i) => `${i + 1}. ${a.name} (${a.role})
   Sections invoked: ${a.sections.join(", ") || "To be specified"}
   Allegations: ${a.allegations || "To be drafted from evidence"}
   Evidence: ${a.evidence.join("; ") || "To be linked"}
   Known associations: ${a.connections.join("; ") || "None"}`).join("\n\n")}

ADDITIONAL POINTS FROM INVESTIGATING OFFICER:
${manualPointsText || "None"}

COURT: ${warrant.courtName}, ${warrant.venue}
IO: ${warrant.ioName}, ${warrant.ioRank} (${warrant.ioBadge})
DATE: ${warrant.filingDate}

Draft a formal arrest warrant / chargesheet section that reads like a human-written legal document — narrative, precise, and court-ready. Include:
1. Formal address to the Court
2. Brief facts of the case from FIR and investigation
3. Specific role and allegations against each accused with evidence references
4. Legal provisions invoked (exact sections from BNS/BNSS/BSA/NDPS/PMLA/UAPA as applicable)
5. Prayer for arrest warrant / remand / chargesheet filing
6. IO attestation block with designation and badge
7. Leave space for Court seal and Magistrate signature

Write in formal legal English, narrative style, not bullet points. Avoid risk scores, graph metrics, or algorithmic language. Use "the accused" not "the suspect".`;

      const response = await sahayakApi.ask(prompt, currentCase.id);
      setGeneratedText(response.answer);
      setStep("review");
    } catch (e: any) {
      setError(e.message || "Failed to generate warrant. Check SAHAYAK connectivity.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Finalize and print
  const handlePrint = () => {
    if (!generatedText) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Arrest Warrant / Chargesheet - ${currentCase.codeName}</title>
  <style>
    @page { size: A4; margin: 25mm; @bottom-center { content: "Page " counter(page); font-family: 'Times New Roman', serif; font-size: 9pt; } }
    body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #111; margin: 0; padding: 0 4mm; }
    .court { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .court h1 { font-size: 16pt; margin: 4px 0; }
    .court .sub { font-size: 10pt; color: #333; }
    h2 { font-size: 13pt; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #000; padding-bottom: 3px; margin: 24px 0 10px; }
    p { text-align: justify; margin: 8px 0; }
    .sig-block { margin-top: 40px; }
    .sig-line { border-bottom: 1px solid #000; width: 300px; margin-bottom: 4px; }
    .indent { text-indent: 2em; }
  </style>
</head>
<body>${generatedText.replace(/\n/g, "<br>")}<script>window.onload=()=>setTimeout(()=>window.print(),300);</script></body></html>
`);
      printWindow.document.close();
    }
  };

  const handleCopy = () => {
    if (generatedText) navigator.clipboard.writeText(generatedText);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400"><Gavel className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Arrest Warrant / Chargesheet Wizard</h2>
              <p className="text-xs text-slate-400">Step {step === "select" ? 1 : step === "sections" ? 2 : step === "review" ? 3 : 4} of 4</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        {/* Progress */}
        <div className="px-4 pb-2 border-b border-slate-700">
          <div className="flex gap-2">
            {["select", "sections", "review", "final"].map((s, i) => (
              <div key={s} className="flex-1 flex items-center gap-1.5">
                <div className={`flex-1 h-1.5 rounded ${step === s || ["select", "sections", "review", "final"].indexOf(step) > i ? "bg-amber-500" : "bg-slate-700"}`} />
                <span className="text-[10px] text-slate-400 capitalize hidden sm:block">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="m-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* STEP 1: Select Accused */}
          {step === "select" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-amber-400">Select Accused Persons</h3>
              <p className="text-xs text-slate-400">Choose confirmed persons from the case graph to include in the warrant.</p>
              {personNodes.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">No confirmed person entities in this case.</div>
              ) : (
                <div className="grid gap-2 max-h-80 overflow-y-auto">
                  {personNodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => toggleAccused(node)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        isAccused(node.id)
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                          : "bg-slate-950 border-slate-700 text-slate-300 hover:border-amber-500/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-amber-400" />
                          <div>
                            <div className="font-bold text-sm">{node.label}</div>
                            <div className="text-[10px] text-slate-400">{node.role || "Accused"}</div>
                          </div>
                        </div>
                        {isAccused(node.id) && <span className="text-xs font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">SELECTED</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep("sections")}
                  disabled={warrant.accused.length === 0}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" /> Continue
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Legal Sections & Allegations */}
          {step === "sections" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-amber-400">Charges & Allegations</h3>
              <p className="text-xs text-slate-400">For each accused, specify the legal sections and a brief allegation summary.</p>
              {warrant.accused.map((accused, idx) => (
                <div key={accused.nodeId} className="bg-slate-950 border border-slate-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-amber-400" />
                    <span className="font-bold">{accused.name}</span>
                    <span className="text-[10px] text-slate-400">{accused.role}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Sections (comma-separated)</label>
                      <input
                        value={accused.sections.join(", ")}
                        onChange={(e) => updateAccused(accused.nodeId, "sections", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                        placeholder="e.g., BNS-103, BNS-111, NDPS-21, PMLA-3"
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Role in Offence</label>
                      <input
                        value={accused.role}
                        onChange={(e) => updateAccused(accused.nodeId, "role", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Allegations Summary</label>
                    <textarea
                      value={accused.allegations}
                      onChange={(e) => updateAccused(accused.nodeId, "allegations", e.target.value)}
                      rows={3}
                      placeholder="Describe the specific acts, evidence, and role of this accused..."
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Evidence References (exhibit IDs, one per line)</label>
                    <textarea
                      value={accused.evidenceRefs.join("\n")}
                      onChange={(e) => updateAccused(accused.nodeId, "evidenceRefs", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                      rows={2}
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep("select")} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg">Back</button>
                <button onClick={() => setStep("review")} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg">Next</button>
              </div>
            </div>
          )}

          {/* STEP 3: Additional Points & Court Details */}
          {step === "review" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-amber-400">Additional Points & Court Details</h3>
              <p className="text-xs text-slate-400">Add any manual points for the warrant. Fill in court and IO details.</p>
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 space-y-3">
                <label className="block text-[10px] text-slate-400 mb-1">Court</label>
                <input value={warrant.courtName} onChange={(e) => setWarrant({...warrant, courtName: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Venue</label>
                  <input value={warrant.venue} onChange={(e) => setWarrant({...warrant, venue: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Date</label>
                  <input type="date" value={warrant.filingDate} onChange={(e) => setWarrant({...warrant, filingDate: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100" />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">IO Name</label>
                  <input value={warrant.ioName} onChange={(e) => setWarrant({...warrant, ioName: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">IO Rank</label>
                  <input value={warrant.ioRank} onChange={(e) => setWarrant({...warrant, ioRank: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">IO Badge</label>
                  <input value={warrant.ioBadge} onChange={(e) => setWarrant({...warrant, ioBadge: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 font-mono" />
                </div>
              </div>

            {/* Manual Points */}
            <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-200">Additional Points for the Warrant</h4>
                <button onClick={addManualPoint} className="px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-bold flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Point
                </button>
              </div>
              {warrant.manualPoints.length === 0 ? (
                <p className="text-xs text-slate-500">No additional points. The warrant will be generated from case facts and allegations above.</p>
              ) : (
                <div className="space-y-2">
                  {warrant.manualPoints.map((p) => (
                    <div key={p.id} className="flex gap-2">
                      <textarea
                        value={p.text}
                        onChange={(e) => updateManualPoint(p.id, e.target.value)}
                        placeholder="Enter additional legal point, precedent, or fact..."
                        rows={2}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                      />
                      <button onClick={() => removeManualPoint(p.id)} className="p-1.5 text-rose-400 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep("sections")} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg">Back</button>
                <button onClick={generateWarrant} disabled={isGenerating} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">
                  {isGenerating ? <><Sparkles className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate with SAHAYAK</>}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Final Review & Print */}
          {step === "final" && generatedText && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-amber-400">Generated Warrant — Review & Print</h3>
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed font-serif text-slate-100">
                {generatedText}
              </div>
              <div className="flex gap-2">
                <button onClick={handleCopy} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2"><Copy className="w-4 h-4" /> Copy</button>
                <button onClick={handlePrint} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg flex items-center gap-2"><Printer className="w-4 h-4" /> Print</button>
                <button onClick={() => { setGeneratedText(null); setStep("select"); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">New Warrant</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DossierModal;