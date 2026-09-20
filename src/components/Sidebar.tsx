import React from "react";
import {
  ShieldAlert,
  LayoutDashboard,
  Network,
  Layers,
  AlertTriangle,
  MapPin,
  FileText,
  Inbox,
  Radar,
  ChevronRight,
  FolderGit2,
  FolderArchive,
  LogOut,
  X,
  Sparkles,
} from "lucide-react";
import { CaseDataset, WorkstationTab } from "../types";
import { isLead, isCyber } from "../data/roles";
import { useLanguage } from "../context/LanguageContext";

interface SidebarProps {
  currentCase: CaseDataset;
  allCases: CaseDataset[];
  onSelectCase: (c: CaseDataset) => void;
  activeTab: WorkstationTab;
  onTabChange: (tab: WorkstationTab) => void;
  /** @deprecated Phase 5 Req23 — AI Graph Copilot removed; kept optional for callers. */
  onOpenCopilot?: () => void;
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
  /** Phase 4 Req18/19 — Lead sees SAHAYAK AI instead of Evidence Ingestion; cyber cell hidden from Leads. */
  userRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentCase,
  allCases,
  onSelectCase,
  activeTab,
  onTabChange,
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
  userRole,
}) => {
  // Changes.md portals — Lead: overview/graph/patterns/geo/sahayak/staging.
  // Cyber: single Cyber Console (ingestion + tasks + correlator + trails).
  const leadView = !!userRole && isLead(userRole);
  const cyberView = !!userRole && isCyber(userRole);
  const { t } = useLanguage();
  const navItems = cyberView
    ? [
        {
          id: "cyber" as const,
          label: t("cyberConsole"),
          subtitle: "Ingestion, Tasks, Correlator, Trails",
          icon: Radar,
          badge: null,
        },
      ]
    : [
        {
          id: "overview" as const,
          label: t("commandOverview"),
          subtitle: "Executive Intel & Case Team",
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: "graph" as const,
          label: t("graphWorkstation"),
          subtitle: "Force-Directed Analyst Canvas",
          icon: Network,
          badge: null,
        },
        {
          id: "patterns" as const,
          label: t("threatPatterns"),
          subtitle: "Burner, Hawala & Convergence",
          icon: AlertTriangle,
          badge: null,
        },
        {
          id: "geo" as const,
          label: t("geoTimeline"),
          subtitle: "GIS Triangulation & Chronology",
          icon: MapPin,
          badge: null,
        },
        {
          id: "sahayak" as const,
          label: t("sahayakAi"),
          subtitle: "Investigative Chat + Case RAG",
          icon: Sparkles,
          badge: null,
        },
        {
          id: "staging" as const,
          label: t("evidenceTriage"),
          subtitle: "Review Field, Forensic & Cyber Intake",
          icon: Inbox,
          badge: null,
        },
      ];

  const handleNavClick = (tabId: WorkstationTab) => {
    onTabChange(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
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
      {/* Mobile Drawer Scrim — M3 tinted + blurred */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 m3-scrim z-50 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* M3 Navigation Rail (Desktop) + Modal Navigation Drawer (Mobile) */}
      <aside
        className={`h-screen glass-panel flex flex-col justify-between transition-all duration-300 ease-in-out select-none z-50 shrink-0 ${
          isCollapsed ? "md:w-18" : "md:w-72"
        } ${
          isMobileOpen
            ? "fixed inset-y-0 left-0 w-72 shadow-2xl flex translate-x-0 m3-dialog rounded-r-2xl"
            : "hidden md:flex"
        }`}
        aria-label="Primary workstation navigation"
      >
        {/* Top Section: Agency Branding (border follows org accent) */}
        <div
          className="p-4 border-b border-outline-variant flex flex-col gap-3"
          style={{ borderColor: "color-mix(in srgb, var(--dept-accent, #e2c268) 35%, transparent)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div
                className="h-10 w-10 shrink-0 rounded-lg border border-primary/40 flex items-center justify-center text-primary bg-primary-container/30 transition-all duration-300 ease-in-out"
              >
                <ShieldAlert className="w-5 h-5" />
              </div>
              {(!isCollapsed || isMobileOpen) && (
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-primary tracking-[0.12em] uppercase">
                      TRINETRA OS
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                  </div>
                  <h2 className="text-sm font-bold text-on-surface truncate tracking-tight">
                    National Security AI
                  </h2>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1">
              {isMobileOpen ? (
                <button
                  onClick={onCloseMobile}
                  className="p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low md:hidden"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={onToggleCollapse}
                  className="p-1.5 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all duration-300 ease-in-out hidden md:block focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
                  title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                  aria-label={isCollapsed ? "Expand navigation rail" : "Collapse navigation rail"}
                >
                  <ChevronRight
                    className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                      isCollapsed ? "" : "rotate-180"
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Middle Section: M3 Navigation Destinations */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 scrollbar-hide">
          {(!isCollapsed || isMobileOpen) && (
            <div className="px-3 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-on-surface-variant uppercase flex items-center justify-between">
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
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-300 ease-out relative group focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest my-0.5 ${
                  isActive
                    ? "bg-primary-container/40 text-on-surface font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.1)] border border-primary/20"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container border border-transparent"
                }`}
                title={isCollapsed && !isMobileOpen ? item.label : undefined}
              >
                <span
                  className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all duration-300 ease-in-out ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant group-hover:text-on-surface"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>

                {(!isCollapsed || isMobileOpen) && (
                  <span className="flex-1 truncate">
                    <span className="text-xs tracking-tight truncate block font-medium">
                      {item.label}
                    </span>
                    <span className="text-[11px] text-on-surface-variant/80 block truncate font-normal">
                      {item.subtitle}
                    </span>
                  </span>
                )}

                {isActive && (
                  <span className="absolute left-1 top-2 bottom-2 w-1 bg-primary rounded-full shadow-[0_0_8px_var(--color-primary)]" aria-hidden="true"></span>
                )}
              </button>
            );
          })}

          {(!isCollapsed || isMobileOpen) && (
            <div className="pt-3 pb-1.5 px-3 text-[11px] font-medium tracking-[0.08em] text-on-surface-variant uppercase">
              Tactical Operations
            </div>
          )}

          {/* Judicial Dossier — Lead signatories only */}
          {!cyberView && (
          <button
            onClick={handleDossierClick}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-full text-left transition-all duration-300 ease-in-out bg-primary-container/30 text-on-primary-container hover:bg-primary-container/60 border border-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
            title="Court-Ready Case Dossier"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            {(!isCollapsed || isMobileOpen) && (
              <span className="flex-1 truncate">
                <span className="text-xs font-semibold tracking-tight block">{t("dossier")}</span>
                <span className="text-[11px] text-on-surface-variant block truncate font-normal">
                  Chargesheet & evidence annexure
                </span>
              </span>
            )}
          </button>
          )}

          {/* Archive & Backup */}
          {onOpenArchive && !cyberView && (
            <button
              onClick={handleArchiveClick}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-full text-left transition-all duration-300 ease-in-out bg-success-container/20 text-on-surface hover:bg-success-container/35 border border-success/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
              title="Export / Restore Offline Case Archive (.json)"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-success/20 text-success shrink-0">
                <FolderArchive className="w-4 h-4" />
              </span>
              {(!isCollapsed || isMobileOpen) && (
                <span className="flex-1 truncate">
                  <span className="text-xs font-semibold tracking-tight block">Archive & Backup</span>
                  <span className="text-[11px] text-on-surface-variant block truncate font-normal">
                    Export / restore case file (.json)
                  </span>
                </span>
              )}
            </button>
          )}
        </div>

        {/* Bottom Section: Active Operation */}
        <div className="p-3 border-t border-white/5 bg-surface-container-lowest/50 backdrop-blur-md">
          {!isCollapsed || isMobileOpen ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] tracking-[0.08em] text-on-surface-variant font-medium uppercase">
                <FolderGit2 className="w-3.5 h-3.5 text-primary" />
                <span>Active Operation</span>
              </div>

              <div className="p-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg space-y-1 transition-all duration-300 ease-in-out">
                <h4 className="text-xs font-bold text-on-surface line-clamp-2 tracking-tight">
                  {currentCase.name}
                </h4>
                <div className="flex items-center justify-between text-[10px] text-on-surface-variant pt-1 border-t border-outline-variant font-mono">
                  <span className="truncate max-w-[130px]">{currentCase.leadAgency}</span>
                  <span>{currentCase.date}</span>
                </div>
              </div>

              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-full bg-surface-container-lowest hover:bg-error-container/30 border border-outline-variant hover:border-error/30 text-on-surface-variant hover:text-error text-xs font-semibold transition-all duration-300 ease-in-out active:scale-95 focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container"
                  title="Sign Out of Session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t("logout")}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline flex items-center justify-center text-on-surface text-xs font-mono font-bold"
                title={`${currentCase.codeName} - ${currentCase.name}`}
              >
                {currentCase.codeName.slice(0, 2)}
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-error-container/30 border border-outline-variant hover:border-error/40 flex items-center justify-center text-on-surface-variant hover:text-error transition-all duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2"
                  title="Log Out"
                  aria-label="Log out"
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
