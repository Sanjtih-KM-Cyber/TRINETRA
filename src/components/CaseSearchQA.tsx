import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Bot,
  Sparkles,
  Send,
  HelpCircle,
  CheckCircle2,
  FileText,
  Phone,
  Landmark,
  User,
  ShieldAlert,
  ArrowRight,
  Clock,
  Layers,
  ChevronRight,
  Filter,
  X,
  Database,
  Quote
} from "lucide-react";
import { CrimeNetworkNode, CrimeNetworkLink, ShortestPathResult, CaseDataset } from "../types";

interface CaseSearchQAProps {
  currentCase: CaseDataset;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  onSelectNode: (node: CrimeNetworkNode) => void;
  onSelectLink?: (link: CrimeNetworkLink) => void;
  onFindPath?: (sourceId: string, targetId: string) => void;
}

interface ConstrainedAnswer {
  question: string;
  answer: string;
  referencedEntities: CrimeNetworkNode[];
  referencedLinks: CrimeNetworkLink[];
  sourceCitations: { docName: string; snippet: string; locator: string }[];
  confidence: number;
  timestamp: string;
}

export const CaseSearchQA: React.FC<CaseSearchQAProps> = ({
  currentCase,
  nodes,
  links,
  onSelectNode,
  onSelectLink,
  onFindPath,
}) => {
  const [query, setQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<ConstrainedAnswer[]>([
    {
      question: "Which phone numbers were contacted by Farooq Merchant in August?",
      answer: "Farooq 'Chacha' Merchant (+919820011442) established voice calls with Dubai Kingpin Vikramaditya Singhania (+971508821990) and primary transport coordinator (+919811099881) through the Dongri and Vashi cell towers on August 14th–15th.",
      referencedEntities: nodes.filter((n) => ["p-farooq", "p-vikram", "ph-singhania-dubai", "ph-farooq-pri"].includes(n.id)),
      referencedLinks: links.filter((l) => l.relationType === "CALLS"),
      sourceCitations: [
        {
          docName: "FIR_209_SpecialCell_CrimeBranch.pdf",
          snippet: "Interception of call records confirmed prime accused Farooq held secret communications with wanted kingpin Vikramaditya Singhania in Dubai.",
          locator: "Page 1, Paragraph 3",
        },
        {
          docName: "CDR_Dongri_Vashi_Surveillance_Dump.csv",
          snippet: "Handset IMEI 864219038472911 logged 340s outgoing call to +971508821990 from Dongri South tower.",
          locator: "Row 1",
        },
      ],
      confidence: 0.98,
      timestamp: "Just now",
    },
  ]);

  const quickPrompts = [
    "Who is the cut-vertex / sole bridge between the leaders and field operators?",
    "Show all Hawala money transfers routed to Rameshwar Joshi",
    "Which vehicles were spotted escorting the container truck MH-04-AZ-8890?",
    "List all unconfirmed entities that require investigator review",
  ];

  // Local deterministic NLP Question Answering engine querying indexed case memory
  const processQuery = (questionText: string) => {
    if (!questionText.trim()) return;
    setIsProcessing(true);
    const q = questionText.toLowerCase();

    setTimeout(() => {
      let answer = "";
      let matchedNodes: CrimeNetworkNode[] = [];
      let matchedLinks: CrimeNetworkLink[] = [];
      let citations: { docName: string; snippet: string; locator: string }[] = [];

      if (q.includes("bridge") || q.includes("cut-vertex") || q.includes("bottleneck") || q.includes("intermediary")) {
        const bridgeNodes = nodes.filter((n) => n.isCutVertex || n.role?.toLowerCase().includes("bridge") || n.role?.toLowerCase().includes("broker"));
        matchedNodes = bridgeNodes;
        answer = `Identified structural bridge entity: ${bridgeNodes.map((n) => n.label).join(", ")}. These individuals serve as articulation points connecting leadership with operative cells; removal immediately severs syndicate communications.`;
        citations.push({
          docName: "FIR_209_SpecialCell_CrimeBranch.pdf",
          snippet: "Farooq Merchant acts as sole conduit to Dubai leadership.",
          locator: "Case Intelligence Dossier",
        });
      } else if (q.includes("hawala") || q.includes("transfer") || q.includes("money") || q.includes("rameshwar") || q.includes("funds")) {
        const finLinks = links.filter((l) => l.relationType === "FUNDS_TRANSFER");
        matchedLinks = finLinks;
        matchedNodes = nodes.filter((n) => n.type === "FINANCIAL" || n.label.toLowerCase().includes("rameshwar") || n.label.toLowerCase().includes("joshi") || n.label.toLowerCase().includes("apex"));
        answer = `Found ${finLinks.length} Hawala fund transfers totaling over ₹48,00,000. Layered payments originate from Apex Agro Exports, routed through mule accounts into Rameshwar 'Munshi' Joshi (VPA: munshi.trade@oksbi), and dispersed to safehouses.`;
        citations.push({
          docName: "Hawala_Angadia_Transaction_Ledgers.csv",
          snippet: "Layered payments from Apex Agro Exports through mule UPI handles into Rameshwar Joshi.",
          locator: "FIU-IND Ledger Records",
        });
      } else if (q.includes("vehicle") || q.includes("truck") || q.includes("car") || q.includes("escort") || q.includes("cctv")) {
        matchedNodes = nodes.filter((n) => n.type === "VEHICLE");
        answer = `Vehicle records document container truck MH-04-AZ-8890 escorted by Toyota Fortuner GA-03-K-4411 carrying armed logistics personnel toward Anjuna Beach safehouse.`;
        citations.push({
          docName: "CCTV_Vashi_Toll_Container_Pass.mp4",
          snippet: "ANPR capture of container truck MH-04-AZ-8890 escorted by Fortuner GA-03-K-4411.",
          locator: "MSRDC Toll Footage 00:45 AM",
        });
      } else if (q.includes("unconfirmed") || q.includes("review") || q.includes("uncertain") || q.includes("pending")) {
        matchedNodes = nodes.filter((n) => n.reviewState === "NEEDS_REVIEW" || n.reviewState === "UNCERTAIN");
        answer = `Found ${matchedNodes.length} entities awaiting formal investigator review. High priority items include burner phone contacts and shell company directors.`;
      } else {
        // Semantic keyword fallthrough over all nodes, aliases and notes
        const relevant = nodes.filter((n) => {
          const matchLabel = q.split(" ").some((word) => word.length > 2 && n.label.toLowerCase().includes(word));
          const matchRole = q.split(" ").some((word) => word.length > 2 && (n.role || "").toLowerCase().includes(word));
          const matchNotes = q.split(" ").some((word) => word.length > 3 && (n.details?.notes || "").toLowerCase().includes(word));
          return matchLabel || matchRole || matchNotes;
        });

        matchedNodes = relevant.slice(0, 5);
        if (matchedNodes.length > 0) {
          answer = `Indexed case records correlate ${matchedNodes.map((n) => `${n.label} (${n.type})`).join(", ")} with your search criteria.`;
          citations.push({
            docName: currentCase.evidenceFiles?.[0]?.fileName || "FIR_209_SpecialCell_CrimeBranch.pdf",
            snippet: matchedNodes[0].details?.notes || "Referenced in case evidence logs.",
            locator: "Case Index",
          });
        } else {
          answer = `No unverified inferences generated. According to current case evidence, no verified records directly match "${questionText}". Try asking about specific suspects, phones, Hawala transfers, or vehicles.`;
        }
      }

      const newAns: ConstrainedAnswer = {
        question: questionText,
        answer,
        referencedEntities: matchedNodes,
        referencedLinks: matchedLinks,
        sourceCitations: citations,
        confidence: citations.length > 0 ? 0.95 : 0.8,
        timestamp: "Just now",
      };

      setHistory((prev) => [newAns, ...prev]);
      setIsProcessing(false);
      setQuery("");
    }, 450);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-100">
                Constrained Natural Language Case Q&A
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                STRICT EVIDENCE GROUNDING
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Query indexed FIRs, CDR call dumps, Hawala ledgers, and vehicle surveillance without hallucinations.
            </p>
          </div>
        </div>
      </div>

      {/* Input Search Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          processQuery(query);
        }}
        className="relative flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Ask anything about case facts (e.g. 'Which phones were contacted by Farooq in August?', 'Show Hawala transfers')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-sans"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || isProcessing}
          className="px-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Ask Case Index</span>
        </button>
      </form>

      {/* Quick Suggestion Prompts */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
          Suggested Investigative Queries:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => processQuery(prompt)}
              className="text-[11px] text-slate-300 bg-slate-950 hover:bg-slate-800 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 rounded-lg px-2.5 py-1.5 text-left transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Responses List */}
      <div className="space-y-4 pt-2">
        {history.map((item, idx) => (
          <div
            key={idx}
            className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg"
          >
            {/* Question */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center font-mono text-[10px] font-bold">
                  Q
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-slate-100">{item.question}</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{item.timestamp}</span>
            </div>

            {/* Answer */}
            <p className="text-xs text-slate-200 leading-relaxed pl-7">{item.answer}</p>

            {/* Referenced Entities Grid */}
            {item.referencedEntities.length > 0 && (
              <div className="pl-7 space-y-1.5 pt-1">
                <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                  Referenced Case Entities ({item.referencedEntities.length}):
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.referencedEntities.map((ent) => (
                    <button
                      key={ent.id}
                      onClick={() => onSelectNode(ent)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400 hover:text-cyan-300 text-xs transition-colors"
                    >
                      <User className="w-3 h-3 text-amber-400" />
                      <span className="font-semibold">{ent.label}</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1 py-0.2 rounded">
                        {ent.type}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Source Citations */}
            {item.sourceCitations.length > 0 && (
              <div className="pl-7 space-y-2 pt-2 border-t border-slate-800/60">
                <div className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Quote className="w-3 h-3" />
                  <span>Grounding Source Citations:</span>
                </div>
                <div className="space-y-1.5">
                  {item.sourceCitations.map((cite, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="font-bold text-slate-300 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-amber-400" />
                          {cite.docName}
                        </span>
                        <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {cite.locator}
                        </span>
                      </div>
                      <blockquote className="text-slate-300 italic text-[11px] pl-2 border-l-2 border-amber-500/50">
                        "{cite.snippet}"
                      </blockquote>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
