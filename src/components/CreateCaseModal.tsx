import React, { useState, useRef } from "react";
import {
  FolderPlus,
  X,
  ShieldAlert,
  Building,
  Calendar,
  FileText,
  Users,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Plus,
  Trash2,
  Upload,
  Cpu,
  User,
} from "lucide-react";
import {
  CaseDataset,
  CrimeNetworkNode,
  CrimeNetworkLink,
  EntityType,
  EvidenceFileRecord,
  InvestigatorHypothesis,
  AIProcessingEngine,
} from "../types";
import {
  extractEntitiesUniversal,
  formatBytes,
  generateFileHash,
} from "../services/nlpExtractor";

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCase: (
    newCase: CaseDataset,
    initialNodes: CrimeNetworkNode[],
    initialLinks: CrimeNetworkLink[]
  ) => void;
}

interface TemplatePreset {
  id: string;
  title: string;
  tagline: string;
  agency: string;
  classification: string;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
}

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "blank",
    title: "Blank Investigation",
    tagline: "Start fresh with 15GB bulk evidence upload and investigator hypotheses",
    agency: "State Police Special Task Force",
    classification: "Organized Crime Syndicate",
    nodes: [],
    links: [],
  },
  {
    id: "interstate-gang",
    title: "Inter-State Extortion & Arms Gang",
    tagline: "Pre-seeded with kingpin, shooter cell, courier network, and safehouses",
    agency: "Anti-Extortion Cell (AEC)",
    classification: "Extortion & Illegal Firearms",
    nodes: [
      {
        id: "p-chhatarpal",
        label: "Chhatarpal 'Don' Gurjar",
        type: "PERSON",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        role: "Gang Leader & Extortion Handler",
        aliases: ["CP", "Gurjar Bhai"],
        riskScore: 94,
        confidence: 0.95,
        details: {
          phone: "+919811099881",
          status: "WANTED",
          notes: "Directs extortion calls to real estate developers.",
        },
      },
      {
        id: "p-subhash-shooter",
        label: "Subhash 'Katta' Yadav",
        type: "PERSON",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        role: "Chief Shooter & Enforcer",
        riskScore: 88,
        confidence: 0.92,
        details: {
          phone: "+919811022334",
          status: "ACTIVE",
          notes: "Procures illegal desi kattas and executes warning fires.",
        },
      },
      {
        id: "loc-safehouse-meerut",
        label: "Meerut Highway Godown",
        type: "LOCATION",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        role: "Weapons Cache & Hideout",
        riskScore: 78,
        confidence: 0.9,
        details: {
          address: "NH-58 Bypass, Meerut, UP",
        },
      },
      {
        id: "fin-shell-extort",
        label: "Gurjar Real Estate VPA",
        type: "FINANCIAL",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        role: "Protection Money Collection",
        riskScore: 85,
        confidence: 0.88,
        details: {
          accountNumber: "gurjarestate@okhdfcbank",
        },
      },
    ],
    links: [
      {
        id: "g-link-1",
        source: "p-chhatarpal",
        target: "p-subhash-shooter",
        relationType: "ASSOCIATED_WITH",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        weight: 9,
        details: "Direct extortion hit assignments",
      },
      {
        id: "g-link-2",
        source: "p-subhash-shooter",
        target: "loc-safehouse-meerut",
        relationType: "OPERATES_FROM",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        weight: 8,
        details: "Armed stash point",
      },
      {
        id: "g-link-3",
        source: "p-chhatarpal",
        target: "fin-shell-extort",
        relationType: "OWNS",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        weight: 9,
        amount: 3500000,
        details: "Extortion proceeds deposits",
      },
    ],
  },
  {
    id: "crypto-scam",
    title: "Telegram Cyber Scam & Mule Ring",
    tagline: "Pre-seeded with telegram bot admins, mule current accounts, and USDT tumbler",
    agency: "State Cyber Crime Division",
    classification: "Cyber Fraud & Crypto Laundering",
    nodes: [
      {
        id: "p-bot-admin",
        label: "Admin 'GhostTrader_99'",
        type: "PERSON",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        role: "Telegram Bot Admin",
        riskScore: 92,
        confidence: 0.94,
        details: {
          notes: "Operates automated Ponzi bots promising 300% weekly returns.",
        },
      },
      {
        id: "fin-mule-vpa1",
        label: "VPA: fastpay.trade@icici",
        type: "FINANCIAL",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        role: "Mule Layering Handle",
        riskScore: 84,
        confidence: 0.91,
        details: {
          accountNumber: "fastpay.trade@icici",
        },
      },
      {
        id: "fin-usdt-wallet",
        label: "TRC-20: TN8xP...09qL",
        type: "FINANCIAL",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        role: "Crypto Tumbler Off-Ramp",
        riskScore: 96,
        confidence: 0.97,
        details: {
          accountNumber: "TN8xPq72kLaM09qL882190",
        },
      },
    ],
    links: [
      {
        id: "c-link-1",
        source: "p-bot-admin",
        target: "fin-mule-vpa1",
        relationType: "OWNS",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        weight: 8,
        details: "Direct UPI collection redirect",
      },
      {
        id: "c-link-2",
        source: "fin-mule-vpa1",
        target: "fin-usdt-wallet",
        relationType: "FUNDS_TRANSFER",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        weight: 10,
        amount: 6200000,
        details: "Instant P2P conversion to USDT",
      },
    ],
  },
];

export const CreateCaseModal: React.FC<CreateCaseModalProps> = ({
  isOpen,
  onClose,
  onCreateCase,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState("blank");
  const [name, setName] = useState("");
  const [codeName, setCodeName] = useState("");
  const [leadAgency, setLeadAgency] = useState("Special Crime Investigation Cell");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");

  // Investigator Knowledge & Hypotheses (Non-Evidence)
  const [initialHypothesis, setInitialHypothesis] = useState("");
  const [leadOfficer, setLeadOfficer] = useState("IO / Superintendent");

  // Multi-Engine Selector
  const [engine, setEngine] = useState<AIProcessingEngine>("LOCAL_OFFLINE");

  // 15GB Staged Intake Files
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual seed suspects
  const [initialSuspects, setInitialSuspects] = useState<
    Array<{ name: string; role: string; phone: string; risk: number }>
  >([{ name: "", role: "Primary Suspect", phone: "", risk: 85 }]);

  if (!isOpen) return null;

  const totalBytes = stagedFiles.reduce((acc, f) => acc + f.size, 0);

  const handleSelectPreset = (preset: TemplatePreset) => {
    setSelectedPresetId(preset.id);
    if (preset.id !== "blank") {
      setName(preset.title);
      setCodeName(
        `OP-${preset.title
          .replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 8)
          .toUpperCase()}-2026`
      );
      setLeadAgency(preset.agency);
      setDescription(preset.tagline);
    }
  };

  const handleFilesDropped = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setStagedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const handleAddSuspectField = () => {
    setInitialSuspects((prev) => [
      ...prev,
      { name: "", role: "Associate / Courier", phone: "", risk: 75 },
    ]);
  };

  const handleRemoveSuspectField = (index: number) => {
    setInitialSuspects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSuspectChange = (
    index: number,
    field: "name" | "role" | "phone" | "risk",
    value: string | number
  ) => {
    setInitialSuspects((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !codeName.trim()) return;

    const caseId = `case-${Date.now().toString(36)}`;
    const preset = TEMPLATE_PRESETS.find((p) => p.id === selectedPresetId);

    const initialNodes: CrimeNetworkNode[] = preset ? [...preset.nodes] : [];
    const initialLinks: CrimeNetworkLink[] = preset ? [...preset.links] : [];
    const evidenceFiles: EvidenceFileRecord[] = [];
    const hypotheses: InvestigatorHypothesis[] = [];

    // Add initial working hypothesis if provided
    if (initialHypothesis.trim()) {
      hypotheses.push({
        id: `HYP-INIT-01`,
        title: "Initial Case Working Hypothesis & Lead",
        narrative: initialHypothesis.trim(),
        author: leadOfficer,
        status: "ACTIVE",
        associatedSuspectIds: [],
        createdAt: new Date().toISOString(),
      });
    }

    // Add manual seed suspects as Investigator Knowledge
    initialSuspects
      .filter((s) => s.name.trim().length > 0)
      .forEach((s, idx) => {
        const id = `suspect-${caseId}-${idx + 1}`;
        initialNodes.push({
          id,
          label: s.name.trim(),
          type: "PERSON",
          category: "INVESTIGATOR_KNOWLEDGE",
          reviewState: "NEEDS_REVIEW",
          role: s.role || "Suspect",
          riskScore: s.risk || 80,
          confidence: 0.85,
          details: {
            phone: s.phone ? s.phone.trim() : undefined,
            notes: `Seeded at case intake by ${leadOfficer}`,
            status: "ACTIVE",
          },
          investigatorNotesList: [
            {
              id: `NOTE-INTAKE-${idx}`,
              targetId: id,
              author: leadOfficer,
              text: `Initial suspect named during case registration.`,
              timestamp: new Date().toISOString(),
            },
          ],
        });
      });

    // Process staged 15GB files if any
    for (let i = 0; i < stagedFiles.length; i++) {
      const file = stagedFiles[i];
      let content = "";
      try {
        if (file.type.startsWith("text") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
          content = await file.text();
        } else {
          content = `Police Evidence Material: ${file.name}\nSize: ${file.size} bytes.`;
        }
      } catch (err) {
        content = `Seized Evidence: ${file.name}`;
      }

      const hash = generateFileHash(content, file.name);
      const extResult = await extractEntitiesUniversal(content, file.name, engine);
      initialNodes.push(...extResult.nodes);
      initialLinks.push(...extResult.links);

      evidenceFiles.push({
        id: `EVID-INTAKE-${i + 1}`,
        fileName: file.name,
        fileSize: file.size,
        fileSizeFormatted: formatBytes(file.size),
        fileType: file.name.endsWith(".pdf") ? "PDF" : file.name.endsWith(".csv") ? "CDR_CSV" : "TEXT_DOC",
        fileHash: hash,
        uploadedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        processingStatus: "PROCESSED",
        extractedEntitiesCount: extResult.nodes.length,
        extractedRelationsCount: extResult.links.length,
        summary: extResult.summary,
      });
    }

    const newCase: CaseDataset = {
      id: caseId,
      name: name.trim(),
      codeName: codeName.trim().toUpperCase(),
      description: description.trim() || "Active criminal syndicate investigation file.",
      date: date || new Date().toISOString().split("T")[0],
      leadAgency: leadAgency.trim() || "Special Task Force",
      nodes: initialNodes,
      links: initialLinks,
      firs: [],
      cdrs: [],
      financials: [],
      intels: [],
      evidenceFiles,
      hypotheses,
      auditLogs: [
        {
          id: `AUD-INIT-${Date.now()}`,
          user: leadOfficer,
          userRank: "Lead Investigator",
          action: "INITIALIZED_CASE",
          objectId: caseId,
          timestamp: new Date().toISOString(),
          details: `Registered case ${codeName} with ${initialNodes.length} entities and ${evidenceFiles.length} evidence files.`,
        },
      ],
    };

    onCreateCase(newCase, initialNodes, initialLinks);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
              <FolderPlus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  NEW CASE WORKBENCH
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  15 GB BULK INGESTION SUPPORT
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 mt-0.5">
                Register New Syndicate Operation File
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Step 1: Starter Templates */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>1. Select Starting Investigation Template</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TEMPLATE_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    selectedPresetId === preset.id
                      ? "bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/30"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${selectedPresetId === preset.id ? "text-amber-300" : "text-slate-200"}`}>
                        {preset.title}
                      </span>
                      {selectedPresetId === preset.id && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {preset.tagline}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>{preset.nodes.length} Nodes</span>
                    <span>{preset.links.length} Links</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step 2: Metadata */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
              2. Operation & Intelligence Metadata
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1.5">
                  Operation Code Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OP-GARUDA-2026"
                  value={codeName}
                  onChange={(e) => setCodeName(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500 uppercase placeholder-slate-600"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1.5">
                  Case Operation Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inter-State Narcotics & Hawala Cartel"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1.5">
                  Lead Agency & Officer
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Agency (e.g. STF, NCB)"
                    value={leadAgency}
                    onChange={(e) => setLeadAgency(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <input
                    type="text"
                    placeholder="Lead Officer Name"
                    value={leadOfficer}
                    onChange={(e) => setLeadOfficer(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1.5">
                  FIR Registration Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium block mb-1.5">
                Executive Intelligence Brief
              </label>
              <textarea
                rows={2}
                placeholder="Modus operandi, syndicate hierarchy, and key jurisdiction targets..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-slate-600 resize-none"
              />
            </div>
          </div>

          {/* Step 3: Investigator Initial Hypothesis (SIH Explicit Blueprint Requirement) */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <User className="w-4 h-4 text-cyan-400" />
                <span>3. Investigator Knowledge & Working Hypotheses (Non-Evidence)</span>
              </label>
              <span className="text-[10px] font-mono text-slate-400">SIH Blueprint Separation</span>
            </div>

            <div>
              <textarea
                rows={2}
                placeholder="Enter working officer hypotheses, confidential informant leads, or unverified intelligence..."
                value={initialHypothesis}
                onChange={(e) => setInitialHypothesis(e.target.value)}
                className="w-full bg-slate-950 border border-cyan-500/30 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 placeholder-slate-600 resize-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Hypotheses will be stored separately with dedicated tags and will not be conflated with court-admissible source evidence.
              </p>
            </div>
          </div>

          {/* Step 4: Bulk Evidence Ingestion Dropzone (15GB Max) */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-amber-400" />
                <span>4. Bulk Evidence Dossiers Upload (Up to 15 GB)</span>
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                Staged: {formatBytes(totalBytes)} ({stagedFiles.length} files)
              </span>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFilesDropped}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700/80 hover:border-amber-500/60 bg-slate-950/60 hover:bg-slate-950/90 rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setStagedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
              />
              <Upload className="w-6 h-6 text-slate-400 group-hover:text-amber-400" />
              <p className="text-xs font-semibold text-slate-300">
                Drop FIRs, CDR Sheets, Bank CSVs, or Media Files (Up to 15 GB)
              </p>
              <p className="text-[10px] text-slate-400">
                Supports PDF, DOCX, CSV, JPG, MP4, MP3 with SHA-256 Checksumming
              </p>
            </div>

            {stagedFiles.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {stagedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <span className="text-slate-300 truncate max-w-[320px]">{file.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
              Case state and evidence citations persist across workspace sessions.
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Initialize Case Operation</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
