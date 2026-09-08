import React from "react";
import { DepartmentIdentity } from "../../data/departments";
import { DepartmentLogo } from "./DepartmentLogo";
import { Shield, MapPin, Radio, Award } from "lucide-react";

interface DepartmentLayoutProps {
  department: DepartmentIdentity;
  officerName: string;
  officerRank: string;
  children: React.ReactNode;
}

/**
 * Department-aware layout shell.
 * Applies agency colors, motto, gateway and rank context around any dashboard.
 */
export const DepartmentLayout: React.FC<DepartmentLayoutProps> = ({
  department,
  officerName,
  officerRank,
  children,
}) => {
  return (
    <div className={`min-h-screen bg-gradient-to-br ${department.backgroundGradient} text-slate-100`}>
      <header
        className="border-b backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20"
        style={{ borderColor: department.accentColor + "33", backgroundColor: "rgba(2,6,23,0.85)" }}
      >
        <div className="flex items-center gap-3">
          <DepartmentLogo department={department} size={42} showLabel />
          <div className="hidden md:block h-8 w-px bg-slate-700/60" />
          <div className="hidden md:block">
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
              {department.motto}
            </div>
            <div className="text-[10px] font-mono text-slate-500">{department.mottoHindi}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div>
            <div className="text-xs font-bold text-slate-100">{officerName}</div>
            <div className="text-[10px] font-mono text-slate-400">{officerRank}</div>
            <div
              className="text-[10px] font-mono font-bold inline-flex items-center gap-1 mt-0.5"
              style={{ color: department.accentColor }}
            >
              <Radio className="w-3 h-3" />
              {department.gateway}
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400 border-b border-slate-800/60">
        <span className="inline-flex items-center gap-1">
          <Shield className="w-3.5 h-3.5" /> Clearance: {department.clearance}
        </span>
        <span className="text-slate-600">•</span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" /> {department.headquarters}
        </span>
        <span className="text-slate-600">•</span>
        <span>{department.jurisdiction}</span>
        <span className="text-slate-600">•</span>
        <span className="inline-flex items-center gap-1">
          <Award className="w-3.5 h-3.5" /> {department.ranks.length} sanctioned ranks
        </span>
      </div>

      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
};

export default DepartmentLayout;
