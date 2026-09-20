import React, { useState, useEffect } from "react";
import { DepartmentIdentity } from "../../data/departments";
import { EMPTY_PIPELINE, type PipelineSnapshot } from "../../data/departmentDashboards";
import { DepartmentLayout } from "./DepartmentLayout";
import { DepartmentLogo } from "./DepartmentLogo";
import { UserAccount, CrimeNetworkNode, CrimeNetworkLink, IntelRecord } from "../../types";
import { proceedingsApi, stagingApi, caseApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { ArrowRight, LogOut, FileText, Camera, Users, Target, Activity, Zap, TrendingUp, ShieldAlert, Cpu, Eye, ShieldCheck, Network } from "lucide-react";
import { motion } from "motion/react";

interface AgencyDashboardProps {
  department: DepartmentIdentity;
  user: UserAccount;
  stats: { cases: number; nodes: number; links: number; patterns: number };
  graph: { nodes: CrimeNetworkNode[]; links: CrimeNetworkLink[]; intels: IntelRecord[] };
  onEnterWorkstation: () => void;
  onLogout: () => void;
}

export const AgencyDashboard: React.FC<AgencyDashboardProps> = ({
  department,
  user,
  stats,
  graph,
  onEnterWorkstation,
  onLogout,
}) => {
  const { authorizedCases } = useAuth();
  const { t } = useLanguage();
  const [pipeline, setPipeline] = useState<PipelineSnapshot>(EMPTY_PIPELINE);

  useEffect(() => {
    let cancelled = false;
    const caseId = authorizedCases[0]?.id || authorizedCases[0]?.case_id;
    if (!caseId) return;
    (async () => {
      try {
        const [diary, staging, cs] = await Promise.all([
          proceedingsApi.getDiary(caseId).catch(() => ({ entries: [] })),
          stagingApi.getQueue(caseId, { status: "PENDING" }).catch(() => ({ entities: [], links: [], batches: [] })),
          proceedingsApi.getChargeSheets(caseId).catch(() => ({ chargeSheets: [] })),
        ]);
        if (cancelled) return;
        setPipeline((prev) => ({
          ...prev,
          diary: diary.entries.length,
          stagedPending: staging.entities.length + staging.links.length,
          chargeSheets: cs.chargeSheets.length,
        }));
      } catch {
        // fail silently for stats
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedCases]);

  return (
    <DepartmentLayout department={department} officerName={user.name} officerRank={user.designation}>
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 md:py-12 flex flex-col min-h-screen">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 w-full animate-in slide-in-from-bottom-4 duration-500 fade-in">
          <div className="flex items-center gap-5">
            <DepartmentLogo department={department} size={64} className="drop-shadow-2xl" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-100">{department.fullName}</h1>
              <p className="text-sm text-slate-400 mt-1 uppercase tracking-widest font-mono">
                {department.shortName} · Operations Command
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageSelector compact />
            <button onClick={onLogout} className="px-4 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-slate-300 font-medium text-sm flex items-center gap-2 border border-slate-700/50 transition-colors backdrop-blur-md">
              <LogOut className="w-4 h-4" /> {t("logout")}
            </button>
            <button
              onClick={onEnterWorkstation}
              className="px-6 py-2 rounded-xl text-slate-900 font-bold text-sm flex items-center gap-2 transition-transform hover:scale-105 shadow-lg"
              style={{ backgroundColor: department.accentColor }}
            >
              Enter Workstation <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Metric Hub (Reimagined from the command strip) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Operatives", value: 24, sub: "Deployed in Field", icon: Users },
            { label: "Cases Solved (YTD)", value: 428, sub: "Highest Clearance", icon: ShieldCheck },
            { label: "Joint Task Forces", value: 6, sub: "Cross-Agency", icon: Network },
            { label: "HUMINT Assets", value: 84, sub: "Active Informants", icon: Eye }
          ].map((metric, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative overflow-hidden rounded-3xl p-5 border border-white/5 bg-slate-900/40 backdrop-blur-3xl shadow-xl flex flex-col justify-between"
              style={{ boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.05), border 1px solid ${department.accentColor}22` }}
            >
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <metric.icon className="w-12 h-12" style={{ color: department.accentColor }} />
              </div>
              <p className="text-xs font-mono font-medium tracking-wider text-slate-400 uppercase">{metric.label}</p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <span className="text-4xl font-bold tracking-tighter" style={{ color: department.accentColor }}>
                    {metric.value}
                  </span>
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-1">{metric.sub}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Command Staff Roster & Intelligence (Reimagined per User Request) */}
        <div className="flex flex-col md:flex-row gap-6 flex-1">
          {/* Main Action Link */}
          <div className="w-full md:w-1/3 flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-3xl bg-slate-900/60 border border-slate-800/80 p-8 backdrop-blur-xl relative overflow-hidden group cursor-pointer flex-1 flex flex-col justify-between shadow-lg"
              onClick={onEnterWorkstation}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/40 z-0"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 mb-6 group-hover:scale-110 transition-transform">
                  <Target className="w-6 h-6" style={{ color: department.accentColor }} />
                </div>
                <h2 className="text-2xl font-bold text-slate-100 mb-2">Initialize Subsystems</h2>
                <p className="text-sm text-slate-400">Launch the primary tactical workstation. Manage field directives and visualize complex syndicates.</p>
              </div>
              <div className="mt-8 flex items-center text-sm font-bold relative z-10" style={{ color: department.accentColor }}>
                Enter Workstation <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-2 transition-transform" />
              </div>
            </motion.div>
          </div>

          {/* Personnel Roster */}
          <div className="w-full md:w-2/3 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-200 tracking-wider font-mono flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                COMMAND STAFF ROSTER
              </h3>
              <span className="text-[10px] uppercase font-mono text-slate-400 tracking-widest border border-slate-700/50 px-2 py-0.5 rounded-full bg-slate-800/20">Active Clearances</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { name: user.name || "Lead Officer", rank: user.designation || "Task Force Commander", exp: "14 Yrs", cases: 218, status: "Active Command", initials: (user.name || "LO").slice(0, 2).toUpperCase(), highlight: true },
                { name: "Ananya Sharma", rank: "Cyber Intelligence Analyst", exp: "6 Yrs", cases: 84, status: "Reviewing SigInt", initials: "AS", highlight: false },
                { name: "Vikram Singh", rank: "Field Operative (Covert)", exp: "9 Yrs", cases: 142, status: "Deployed in Field", initials: "VS", highlight: false },
                { name: "Dr. R. Menon", rank: "Forensics Lead", exp: "18 Yrs", cases: 410, status: "Lab Analysis", initials: "RM", highlight: false },
              ].map((member, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + (idx * 0.1) }}
                  className={`rounded-2xl p-5 border backdrop-blur-xl relative overflow-hidden flex flex-col justify-between transition-colors ${member.highlight ? 'bg-slate-800/80 border-slate-600/50 shadow-md' : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/40'}`}
                  style={member.highlight ? { boxShadow: `0 0 20px ${department.accentColor}15` } : {}}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold font-mono text-sm shadow-inner" style={{ backgroundColor: member.highlight ? department.accentColor : '#1e293b', color: member.highlight ? '#020617' : '#94a3b8' }}>
                        {member.initials}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-100 text-sm leading-tight">{member.name}</h4>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">{member.rank}</p>
                      </div>
                    </div>
                    {member.highlight && (
                      <span className="w-2 h-2 rounded-full absolute top-5 right-5 animate-pulse" style={{ backgroundColor: department.accentColor }} />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
                      <p className="text-[9px] uppercase text-slate-500 font-mono tracking-wider mb-0.5">Experience</p>
                      <p className="text-xs font-bold text-slate-200">{member.exp}</p>
                    </div>
                    <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
                      <p className="text-[9px] uppercase text-slate-500 font-mono tracking-wider mb-0.5">Cases Solved</p>
                      <p className="text-xs font-bold text-slate-200">{member.cases}</p>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono flex items-center gap-2">
                    <span className="text-slate-500">Status:</span>
                    <span className="font-semibold text-slate-300">{member.status}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </DepartmentLayout>
  );
};
export default AgencyDashboard;
