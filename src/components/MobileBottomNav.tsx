import React from "react";
import {
  LayoutDashboard,
  Network,
  AlertTriangle,
  Database,
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
          id: "ingest" as const,
          label: "Ingest",
          icon: Database,
          badge: null,
        },
        {
          id: "cyber" as const,
          label: "Cyber",
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
          badgeColor: "bg-slate-800 text-slate-300",
        },
        {
          id: "patterns" as const,
          label: "Alerts",
          icon: AlertTriangle,
          badge: patternCount > 0 ? `${patternCount}` : null,
          badgeColor: "bg-rose-500 text-white",
        },
        {
          id: "sahayak" as const,
          label: "SAHAYAK",
          icon: Sparkles,
          badge: null,
        },
      ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 px-2 py-1 flex items-center justify-around select-none safe-area-pb shadow-2xl">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all relative flex-1 min-w-0 ${
              isActive ? "text-amber-400 font-semibold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform ${isActive ? "scale-110" : ""}`} />
              {tab.badge && (
                <span
                  className={`absolute -top-1.5 -right-2 text-[9px] font-mono px-1 rounded-full font-bold ${
                    tab.badgeColor || "bg-slate-800 text-slate-300"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 truncate">{tab.label}</span>
            {isActive && (
              <span className="absolute bottom-0 w-8 h-0.5 bg-amber-400 rounded-full shadow-sm shadow-amber-400/50" />
            )}
          </button>
        );
      })}

      {/* Quick Action: New Case / Menu */}
      <button
        onClick={onOpenNewCase}
        className="flex flex-col items-center justify-center py-1.5 px-2 text-amber-400 hover:text-amber-300 transition-all flex-1 min-w-0"
        title="Add New Case"
      >
        <PlusCircle className="w-5 h-5" />
        <span className="text-[10px] tracking-tight mt-0.5 truncate font-medium">+ Case</span>
      </button>

      <button
        onClick={onOpenMobileMenu}
        className="flex flex-col items-center justify-center py-1.5 px-2 text-slate-400 hover:text-slate-200 transition-all flex-1 min-w-0"
        title="More Intelligence Modules"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] tracking-tight mt-0.5 truncate">More</span>
      </button>
    </div>
  );
};
