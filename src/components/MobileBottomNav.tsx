import React from "react";
import {
  LayoutDashboard,
  Network,
  AlertTriangle,
  PlusCircle,
  Menu,
  Sparkles,
  Radar,
} from "lucide-react";
import { WorkstationTab } from "../types";
import { isLead, isCyber } from "../data/roles";

interface MobileBottomNavProps {
  activeTab: WorkstationTab;
  onTabChange: (tab: WorkstationTab) => void;
  nodeCount?: number;
  patternCount?: number;
  onOpenNewCase: () => void;
  onOpenMobileMenu?: () => void;
  onOpenCopilot?: () => void;
  onOpenDossier?: () => void;
  /** Phase 4 Req19 — Lead sees SAHAYAK instead of Ingest. */
  userRole?: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  nodeCount = 0,
  patternCount = 0,
  onOpenNewCase,
  onOpenMobileMenu,
  userRole,
}) => {
  const leadView = !!userRole && isLead(userRole);
  const cyberView = !!userRole && isCyber(userRole);
  const tabs = cyberView
    ? [
        {
          id: "cyber" as const,
          label: "Console",
          icon: Radar,
          badge: null,
        },
      ]
    : [
        {
          id: "overview" as const,
          label: "Overview",
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: "graph" as const,
          label: "Graph",
          icon: Network,
          badge: nodeCount > 0 ? `${nodeCount}` : null,
          badgeColor: "bg-surface-container-highest text-on-surface-variant",
        },
        {
          id: "patterns" as const,
          label: "Alerts",
          icon: AlertTriangle,
          badge: patternCount > 0 ? `${patternCount}` : null,
          badgeColor: "bg-error text-on-error",
        },
        {
          id: "sahayak" as const,
          label: "SAHAYAK",
          icon: Sparkles,
          badge: null,
        },
      ];

  return (
    <nav
      aria-label="Workstation sections"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-container-low/95 backdrop-blur-md border-t border-outline-variant px-2 pt-1 flex items-center justify-around select-none safe-area-pb"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-lg transition-all duration-300 ease-in-out relative flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low ${
              isActive ? "text-primary font-semibold" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span
              className={`flex items-center justify-center w-14 h-8 rounded-full transition-all duration-300 ease-in-out relative ${
                isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-300 ease-in-out ${isActive ? "scale-110" : ""}`} />
              {tab.badge && (
                <span
                  className={`absolute -top-1 -right-1 text-[9px] font-mono px-1.5 py-px rounded-full font-bold ${
                    tab.badgeColor || "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium tracking-wide mt-0.5 truncate">{tab.label}</span>
          </button>
        );
      })}

      <button
        onClick={onOpenNewCase}
        className="flex flex-col items-center justify-center py-1.5 px-2 text-primary hover:brightness-110 transition-all duration-300 ease-in-out flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low rounded-lg"
        title="Add New Case"
      >
        <span className="flex items-center justify-center w-14 h-8 rounded-full border border-primary/30 bg-primary-container/30">
          <PlusCircle className="w-5 h-5" />
        </span>
        <span className="text-[11px] tracking-wide mt-0.5 truncate font-medium">+ Case</span>
      </button>

      <button
        onClick={onOpenMobileMenu}
        className="flex flex-col items-center justify-center py-1.5 px-2 text-on-surface-variant hover:text-on-surface transition-all duration-300 ease-in-out flex-1 min-w-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low rounded-lg"
        title="More Intelligence Modules"
      >
        <span className="flex items-center justify-center w-14 h-8 rounded-full">
          <Menu className="w-5 h-5" />
        </span>
        <span className="text-[11px] tracking-wide mt-0.5 truncate">More</span>
      </button>
    </nav>
  );
};
