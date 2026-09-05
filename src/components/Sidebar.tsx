import React from "react";
import {
  ShieldAlert,
  LayoutDashboard,
  Network,
  Layers,
  AlertTriangle,
  MapPin,
  Database,
  Bot,
  FileText,
  ChevronRight,
  FolderGit2,
  FolderArchive,
  LogOut,
  X,
} from "lucide-react";
import { CaseDataset } from "../types";

interface SidebarProps {
  currentCase: CaseDataset;
  allCases: CaseDataset[];
  onSelectCase: (c: CaseDataset) => void;
  activeTab: "overview" | "graph" | "analytics" | "patterns" | "geo" | "ingest";
  onTabChange: (tab: "overview" | "graph" | "analytics" | "patterns" | "geo" | "ingest") => void;
  onOpenCopilot: () => void;
  onOpenDossier: () => void;
  onOpenNewCase?: () => void;
  onOpenArchive?: () => void;
  onOpenMyCases?: () => void;
  onLogout?: () => void;
  nodeCount: number;
  kingpinCount: number;
  cutVertexCount: number;
  patternCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentCase,
  allCases,
  onSelectCase,
  activeTab,
  onTabChange,
  onOpenCopilot,
  onOpenDossier,
  onOpenNewCase,
  onOpenArchive,
  onOpenMyCases,
  onLogout,
  nodeCount,
  kingpinCount,
  cutVertexCount,
  patternCount,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const navItems = [
    {
      id: "overview" as const,
      label: "Command Overview",
      subtitle: "Executive Intel & Case Team",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: "graph" as const,
      label: "Graph Workstation",
      subtitle: "Force-Directed Analyst Canvas",
      icon: Network,
      badge: null,
    },
    {
      id: "analytics" as const,
      label: "Centrality & Bottlenecks",
      subtitle: "Betweenness & Cut-Vertices",
      icon: Layers,
      badge: null,
    },
    {
      id: "patterns" as const,
      label: "Threat Patterns & Leads",
      subtitle: "Burner, Hawala & Convergence",
      icon: AlertTriangle,
      badge: null,
    },
    {
      id: "geo" as const,
      label: "Geospatial & Timeline",
      subtitle: "GIS Triangulation & Chronology",
      icon: MapPin,
      badge: null,
    },
    {
      id: "ingest" as const,
      label: "Evidence Ingestion",
      subtitle: "FIR, Diary NLP & CDR Parser",
      icon: Database,
      badge: null,
    },
  ];

  const handleNavClick = (tabId: "overview" | "graph" | "analytics" | "patterns" | "geo" | "ingest") => {
    onTabChange(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleCopilotClick = () => {
    onOpenCopilot();
    if (onCloseMobile) onCloseMobile();
  };

  const handleDossierClick = () => {
    onOpenDossier();
    if (onCloseMobile) onCloseMobile();
  };

  const handleArchiveClick = () => {
    if (onOpenArchive) onOpenArchive();
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 md:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Sidebar (Desktop fixed + Mobile slide-out drawer) */}
      <aside
        className={`h-screen bg-slate-950/98 border-r border-slate-800/80 flex flex-col justify-between transition-all duration-300 select-none z-50 shrink-0 ${
          /* Desktop behavior */
          isCollapsed ? "md:w-18" : "md:w-72"
        } ${
          /* Mobile Drawer behavior */
          isMobileOpen
            ? "fixed inset-y-0 left-0 w-72 shadow-2xl flex translate-x-0"
            : "hidden md:flex"
        }`}
      >
        {/* Top Section: Agency Branding (No confidential badge) */}
        <div className="p-4 border-b border-slate-800/80 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/5">
                <ShieldAlert className="w-5 h-5" />
              </div>
              {(!isCollapsed || isMobileOpen) && (
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-amber-400 tracking-wider uppercase">
                      CRIM-INTEL OS
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-100 truncate tracking-tight">
                    National Security AI
                  </h2>
                </div>
              )}
            </div>

            {/* Desktop Collapse Toggle / Mobile Close Button */}
            <div className="flex items-center gap-1">
              {isMobileOpen ? (
                <button
                  onClick={onCloseMobile}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 md:hidden"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={onToggleCollapse}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-850 transition-colors hidden md:block"
                  title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                  <ChevronRight
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isCollapsed ? "" : "rotate-180"
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Middle Section: Navigation Modules */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 no-scrollbar">
          {(!isCollapsed || isMobileOpen) && (
            <div className="px-3 pb-1.5 text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase flex items-center justify-between">
              <span>Intelligence Modules</span>
            </div>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all relative group ${
                  isActive
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent"
                }`}
                title={isCollapsed && !isMobileOpen ? item.label : undefined}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                    isActive
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-slate-900 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {(!isCollapsed || isMobileOpen) && (
                  <div className="flex-1 truncate">
                    <span className="text-xs tracking-tight truncate block font-medium">
                      {item.label}
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate font-normal">
                      {item.subtitle}
                    </span>
                  </div>
                )}

                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-amber-400 rounded-r"></span>
                )}
              </button>
            );
          })}

          {/* Tactical Operations Section */}
          {(!isCollapsed || isMobileOpen) && (
            <div className="pt-3 pb-1.5 px-3 text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
              Tactical Operations
            </div>
          )}

          {/* AI Copilot */}
          <button
            onClick={handleCopilotClick}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 to-slate-900 text-indigo-300 hover:text-indigo-200 hover:border-indigo-500/50 shadow-sm`}
            title="AI Criminal Graph Copilot"
          >
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex-1 truncate">
                <span className="text-xs font-semibold tracking-tight block">AI Graph Copilot</span>
                <span className="text-[10px] text-slate-400 block truncate font-normal">
                  Multi-hop reasoning & inquiry
                </span>
              </div>
            )}
          </button>

          {/* Judicial Dossier */}
          <button
            onClick={handleDossierClick}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all border border-amber-500/30 bg-gradient-to-r from-amber-950/40 to-slate-900 text-amber-300 hover:text-amber-200 hover:border-amber-500/50 shadow-sm`}
            title="Court-Ready Case Dossier"
          >
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex-1 truncate">
                <span className="text-xs font-semibold tracking-tight block">Judicial Dossier</span>
                <span className="text-[10px] text-slate-400 block truncate font-normal">
                  Chargesheet & evidence annexure
                </span>
              </div>
            )}
          </button>

          {/* Archive & Backup */}
          {onOpenArchive && (
            <button
              onClick={handleArchiveClick}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 to-slate-900 text-emerald-300 hover:text-emerald-200 hover:border-emerald-500/50 shadow-sm`}
              title="Export / Restore Offline Case Archive (.json)"
            >
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                <FolderArchive className="w-4 h-4" />
              </div>
              {(!isCollapsed || isMobileOpen) && (
                <div className="flex-1 truncate">
                  <span className="text-xs font-semibold tracking-tight block">Archive & Backup</span>
                  <span className="text-[10px] text-slate-400 block truncate font-normal">
                    Export / restore case file (.json)
                  </span>
                </div>
              )}
            </button>
          )}
        </div>

        {/* Bottom Section: Clean Active Operation Info + Log Out */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/50">
          {!isCollapsed || isMobileOpen ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <FolderGit2 className="w-3.5 h-3.5 text-amber-400" />
                <span>ACTIVE OPERATION</span>
              </div>

              {/* Case Name Display */}
              <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                <h4 className="text-xs font-bold text-slate-100 line-clamp-2">
                  {currentCase.name}
                </h4>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900 font-mono">
                  <span className="truncate max-w-[130px]">{currentCase.leadAgency}</span>
                  <span>{currentCase.date}</span>
                </div>
              </div>

              {/* Sign Out Action */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-950/80 hover:bg-rose-500/15 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs font-semibold transition-all active:scale-95"
                  title="Sign Out of Session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-mono font-bold"
                title={`${currentCase.codeName} - ${currentCase.name}`}
              >
                {currentCase.codeName.slice(0, 2)}
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-rose-500/20 border border-slate-800 hover:border-rose-500/40 flex items-center justify-center text-slate-400 hover:text-rose-300 transition-colors"
                  title="Log Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
