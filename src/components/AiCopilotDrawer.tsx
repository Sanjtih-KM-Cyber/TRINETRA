import React, { useState, useRef, useEffect } from "react";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  SyndicateCommunity,
} from "../types";
import { caseApi } from "../services/api";
import {
  Bot,
  X,
  Send,
  Sparkles,
  User,
  ShieldAlert,
  Crown,
  ChevronRight,
  Flame,
  Loader2,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
} from "lucide-react";

interface AiCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  caseId?: string;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  patterns: SuspiciousPattern[];
  communities: SyndicateCommunity[];
  onSelectNode: (node: CrimeNetworkNode) => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
  citations?: string[];
  confidenceScore?: number;
  recommendedActions?: string[];
  isError?: boolean;
}

export const AiCopilotDrawer: React.FC<AiCopilotDrawerProps> = ({
  isOpen,
  onClose,
  caseId = "case-garuda",
  nodes,
  links,
  patterns,
  communities,
  onSelectNode,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "copilot",
      text: `Criminal Intelligence Graph Copilot online.\nIndexed ${nodes.length} network entities, ${links.length} relational connections, and ${patterns.length} forensic alerts.\n\nYou can ask any question regarding syndicate command hierarchy, money laundering trails, phone call triangulation, or interrogation strategies.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInputText("");
    setIsLoading(true);

    try {
      const response = await caseApi.queryCopilot(caseId, textToSend, {
        nodeCount: nodes.length,
        linkCount: links.length,
        patterns: patterns.map((p) => p.title),
      });

      const copilotMsg: ChatMessage = {
        id: `copilot-${Date.now()}`,
        sender: "copilot",
        text: response.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        citations: response.citations,
        confidenceScore: response.confidenceScore,
        recommendedActions: response.recommendedActions,
      };

      setMessages((prev) => [...prev, copilotMsg]);
    } catch (e: any) {
      console.error(e);
      let errorText = "Unable to complete query. Please verify connectivity.";
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "copilot",
        text: errorText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "welcome-new",
        sender: "copilot",
        text: `Chat cleared. Ready for your investigative queries across ${nodes.length} entities and ${links.length} relational trails.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const samplePrompts = [
    "Who is the kingpin and how are they shielded from ground operations?",
    "Which suspect's arrest would disrupt the largest communication channels?",
    "Explain the burner phone swapping pattern detected on IMEI 864219038472911.",
    "Trace the Hawala money trail from remitter to receiver.",
    "Draft Section 91 CrPC requisition questions for the bank manager.",
  ];

  return (
    <>
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[540px] bg-slate-900/98 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Criminal Intelligence Copilot</h2>
              <p className="text-[11px] text-slate-400">
                AI Forensic Assistant &bull; Grounded on Case Evidence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearChat}
              className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-800 hover:border-slate-700"
              title="Reset conversation"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.sender === "copilot" && (
                <div
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                    msg.isError
                      ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                      : "bg-indigo-600/20 border-indigo-500/30 text-indigo-300"
                  }`}
                >
                  {msg.isError ? <AlertTriangle className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl p-3.5 text-xs leading-relaxed space-y-2.5 ${
                  msg.sender === "user"
                    ? "bg-amber-500 text-slate-950 font-medium"
                    : msg.isError
                    ? "bg-rose-950/40 border border-rose-500/30 text-rose-200"
                    : "bg-slate-950 border border-slate-800 text-slate-200"
                }`}
              >
                <p className="whitespace-pre-line">{msg.text}</p>

                {/* Citations & Recommended Actions */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      <FileCheck className="w-3 h-3" />
                      <span>Evidentiary Citations:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {msg.citations.map((c, idx) => (
                        <span
                          key={idx}
                          className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 border border-slate-800"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {msg.recommendedActions && msg.recommendedActions.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Recommended Interdictions:</span>
                    </div>
                    <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                      {msg.recommendedActions.map((a, idx) => (
                        <li key={idx}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <span
                  className={`text-[9px] block font-mono ${
                    msg.sender === "user" ? "text-slate-800" : "text-slate-500 text-right"
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>

              {msg.sender === "user" && (
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-indigo-300 flex items-center gap-2">
                <span>Synthesizing multi-hop graph topology with Gemini...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Prompts */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
            Tactical Inquiry Suggestions:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(p)}
                disabled={isLoading}
                className="text-[11px] bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-md transition-colors text-left truncate max-w-full"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Input Box */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask copilot about suspects, phone hops, cut-vertices..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendMessage();
            }}
            className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-lg transition-colors shadow font-bold"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};
