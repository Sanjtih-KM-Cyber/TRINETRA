import React, { useState, useEffect, useRef } from "react";
import {
  ShieldAlert,
  Search,
  Bot,
  FileText,
  Radio,
  SlidersHorizontal,
  FolderGit2,
  Lock,
  ChevronDown,
  User,
  Phone,
  Landmark,
  MapPin,
  Truck,
  Command,
  X,
  Zap,
  Plus,
  Menu,
  FolderArchive,
  LogOut,
} from "lucide-react";
import { CaseDataset, CrimeNetworkNode, InvestigatorProfile, WorkstationTab } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { LanguageSelector } from "./i18n/LanguageSelector";

interface HeaderProps {
  currentCase: CaseDataset;
  allCases: CaseDataset[];
  onSelectCase: (c: CaseDataset) => void;
  activeTab: WorkstationTab;
  onTabChange: (tab: WorkstationTab) => void;
  onOpenDossier: () => void;
  onOpenCopilot: () => void;
  onOpenNewCase: () => void;
  onOpenArchive?: () => void;
  onOpenMobileMenu: () => void;
  nodes: CrimeNetworkNode[];
  onSelectNode: (node: CrimeNetworkNode) => void;
  nodeCount: number;
  linkCount: number;
  kingpinCount: number;
  patternCount: number;
  currentOfficer?: InvestigatorProfile;
  onLogout?: () => void;
  onOpenMyCases?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentCase,
  allCases,
  onSelectCase,
  activeTab,
  onTabChange,
  onOpenDossier,
  onOpenCopilot,
  onOpenNewCase,
  onOpenArchive,
  onOpenMobileMenu,
  nodes,
  onSelectNode,
  nodeCount,
  linkCount,
  kingpinCount,
  patternCount,
  currentOfficer,
  onLogout,
  onOpenMyCases,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useLanguage();

  // Keyboard shortcut Ctrl+K or /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === "Escape") {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  // Search Results
  const searchResults = searchQuery.trim()
    ? nodes.filter((n) => {
      const q = searchQuery.toLowerCase();
      const matchName = n.label.toLowerCase().includes(q);
      const matchRole = (n.role || "").toLowerCase().includes(q);
      const matchAlias = (n.aliases || []).some((a) => a.toLowerCase().includes(q));
      const matchPhone = (n.details?.phone || "").includes(q);
      const matchPlate = (n.details?.vehiclePlate || "").toLowerCase().includes(q);
      const matchBank = (n.details?.accountNumber || "").toLowerCase().includes(q);
      return matchName || matchRole || matchAlias || matchPhone || matchPlate || matchBank;
    })
    : [];

  const getTabTitle = () => {
    switch (activeTab) {
      case "overview":
        return t("commandOverview");
      case "graph":
        return t("graphWorkstation");
      case "patterns":
        return t("threatPatterns");
      case "geo":
        return t("geoTimeline");
      case "ingest":
        return t("ingest");
      case "proceedings":
        return t("proceedings");
      case "staging":
        return t("staging");
      case "cyber":
        return t("cyberCell");
      default:
        return "Intelligence Workstation";
    }
  };

  return (
    <>
      <header
        className="h-14 sm:h-16 glass-panel px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-40 shrink-0 select-none transition-all duration-300 ease-out"
        style={{ borderColor: "color-mix(in srgb, var(--dept-accent, #e2c268) 25%, transparent)" }}
      >
        {/* Left: Mobile Menu Trigger + Tab Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Hamburger Button */}
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-full bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface shrink-0 active:scale-95 transition-all duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
            title="Open Menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Clean Tab / Workstation Title */}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm sm:text-base md:text-lg font-bold text-on-surface tracking-tight truncate">
              {getTabTitle()}
            </h1>
          </div>
        </div>

        {/* Center: Global Omnibar Trigger (Desktop) */}
        <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md hidden md:block">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface-variant text-xs transition-all duration-300 ease-in-out group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-primary transition-all duration-300 ease-in-out" />
              <span className="truncate">{t("searchPlaceholder")}</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px] bg-surface-container-lowest border border-outline-variant text-on-surface-variant px-1.5 py-0.5 rounded-full">
              <Command className="w-3 h-3" />
              <span>K</span>
            </div>
          </button>
        </div>

        {/* Right: Search (Mobile) + My Workspaces Button */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Mobile Search Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="md:hidden p-2 rounded-full bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface active:scale-95 transition-all duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            title="Search Graph"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Switch Case / My Workspaces Button (Primary action in header) */}
          {onOpenMyCases && (
            <button
              onClick={onOpenMyCases}
              className="flex items-center gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-outline hover:border-primary/40 text-on-surface text-xs font-semibold transition-all duration-300 ease-in-out active:scale-95 group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
              title="View All Authorized Operations & Request Case Access"
            >
              <FolderGit2 className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform duration-300 ease-in-out" />
              <span>{t("myWorkspaces")}</span>
            </button>
          )}
          <LanguageSelector compact />
        </div>
      </header>

      {/* Global Search Omnibar Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 m3-scrim flex items-start justify-center pt-10 sm:pt-20 p-3 sm:p-4">
          <div className="glass-strong w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh] m3-dialog" role="dialog" aria-modal="true" aria-label="Global entity search">
            {/* Search Input */}
            <div className="p-3 sm:p-4 border-b border-outline-variant flex items-center gap-3 bg-surface-container-low">
              <Search className="w-5 h-5 text-primary shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search suspect, phone (+91), IMEI, bank VPA, vehicle plate..."
                className="w-full bg-transparent text-on-surface placeholder-on-surface-variant/60 text-xs sm:text-sm focus:outline-none"
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="Close search"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Results or Quick Suggestions */}
            <div className="p-3 sm:p-4 overflow-y-auto space-y-2 flex-1">
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  searchResults.map((node) => (
                    <div
                      key={node.id}
                      onClick={() => {
                        onSelectNode(node);
                        onTabChange("graph");
                        setIsSearchOpen(false);
                      }}
                      className="p-2.5 sm:p-3 rounded-lg bg-surface-container-low hover:bg-surface-container-high border border-outline-variant hover:border-primary/40 cursor-pointer flex items-center justify-between transition-all duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold font-mono text-xs shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                          {node.type === "PERSON" && <User className="w-4 h-4" />}
                          {node.type === "PHONE" && <Phone className="w-4 h-4" />}
                          {node.type === "FINANCIAL" && <Landmark className="w-4 h-4" />}
                          {node.type === "LOCATION" && <MapPin className="w-4 h-4" />}
                          {node.type === "VEHICLE" && <Truck className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                              {node.label}
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-mono text-on-surface-variant uppercase bg-surface-container-lowest px-1.5 py-0.5 rounded border border-white/5">
                              {node.type}
                            </span>
                            {node.isKingpinCandidate && (
                              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-primary bg-primary/20 px-1.5 py-0.5 rounded border border-primary/30">
                                KINGPIN
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] sm:text-xs text-on-surface-variant truncate mt-0.5">
                            {node.role || "Network entity"} • Risk: {node.riskScore}/100
                            {node.details?.phone && ` • Phone: ${node.details.phone}`}
                            {node.details?.vehiclePlate && ` • Plate: ${node.details.vehiclePlate}`}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-amber-400 shrink-0 pl-2">
                        Inspect →
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs font-mono">
                    No matching entities found for "{searchQuery}".
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div className="text-xs font-mono text-on-surface-variant uppercase tracking-wider px-1">
                    Quick Tactical Queries
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: "Overseas Kingpin: Vikramaditya Varma", query: "Vikramaditya" },
                      { label: "Financial Layering: Farooq Merchant", query: "Farooq" },
                      { label: "Armed Courier: Chhota Bilal", query: "Bilal" },
                      { label: "Safehouse Corridor: Mumbai Dockyard", query: "Dockyard" },
                    ].map((item) => (
                      <button
                        key={item.query}
                        onClick={() => setSearchQuery(item.query)}
                        className="p-2.5 rounded-xl bg-surface-container-lowest/50 hover:bg-surface-container-high border border-white/5 text-left text-xs text-on-surface-variant hover:text-primary transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-primary flex items-center justify-between group"
                      >
                        <span className="truncate">{item.label}</span>
                        <Zap className="w-3.5 h-3.5 text-primary opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-surface-container-lowest border-t border-white/5 flex items-center justify-between text-[10px] sm:text-[11px] text-on-surface-variant font-mono">
              <span>Press ESC to close</span>
              <span>Click entity to focus in Graph Workstation</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
