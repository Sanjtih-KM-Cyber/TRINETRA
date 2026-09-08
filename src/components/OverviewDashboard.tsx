import React, { useState, useEffect, useMemo } from "react";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  CaseDataset,
  CaseMember,
} from "../types";
import { DataRequestInbox } from "./requisitions/DataRequestInbox";
import { InterstateBridge } from "./bridge/InterstateBridge";
import { caseApi, authApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { isAdmin, isLead, orgOf } from "../data/roles";
import { buildCaseStory } from "../services/caseStory";
import { Users, ScrollText, UserPlus, Send, CheckCircle2, XCircle } from "lucide-react";

interface OverviewDashboardProps {
  currentCase: CaseDataset;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  patterns: SuspiciousPattern[];
  onSelectNode: (node: CrimeNetworkNode) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  currentCase,
  nodes,
  links,
  patterns,
  onSelectNode,
}) => {
  const { user } = useAuth();
  const [caseOfficers, setCaseOfficers] = useState<CaseMember[]>([]);
  const [isLoadingOfficers, setIsLoadingOfficers] = useState<boolean>(false);
  // Phase 3 Req15/17 — same-tenure directory, POCs, requisitions.
  const [tenureUsers, setTenureUsers] = useState<any[]>([]);
  const [pocs, setPocs] = useState<Record<string, string>>({});
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [pocDraft, setPocDraft] = useState<{ field: string; forensic: string; cyber: string }>({
    field: "",
    forensic: "",
    cyber: "",
  });
  const [reqFunctional, setReqFunctional] = useState("FIELD");
  const [reqCount, setReqCount] = useState(1);
  const [reqJustification, setReqJustification] = useState("");
  const [teamMsg, setTeamMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);

  const canManageTeam = !!user && (isAdmin(user.role) || isLead(user.role));

  const loadTeam = async () => {
    try {
      setIsLoadingOfficers(true);
      const [membersRes, reqRes, casesRes, tenureRes] = await Promise.all([
        caseApi.getCaseMembers(currentCase.id),
        caseApi.getRequisitions(currentCase.id).catch(() => ({ requisitions: [] })),
        caseApi.getCases().catch(() => ({ cases: [] })),
        canManageTeam ? authApi.getTenureUsers().catch(() => ({ users: [] })) : Promise.resolve({ users: [] } as any),
      ]);
      // Phase 3 Req17 — real registered members only; empty state when unstaffed.
      setCaseOfficers(membersRes.members || []);
      setRequisitions(reqRes.requisitions || []);
      const found = (casesRes.cases || []).find((c: any) => c.id === currentCase.id);
      const serverPocs = found?.pocs || {};
      setPocs(serverPocs);
      setPocDraft({ field: serverPocs.field || "", forensic: serverPocs.forensic || "", cyber: serverPocs.cyber || "" });
      setTenureUsers(tenureRes.users || []);
    } catch {
      setCaseOfficers([]);
    } finally {
      setIsLoadingOfficers(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      await loadTeam();
    })();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCase.id]);

  const story = useMemo(
    () =>
      buildCaseStory({
        caseDataset: currentCase,
        nodes,
        links,
        patterns,
      }),
    [currentCase, nodes, links, patterns]
  );

  const getRolePositionLabel = (role: string) => {
    if (role.endsWith("_ADMIN"))
      return {
        title: role.replace(/_/g, " "),
        position: "Department Administrator",
        color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
      };
    if (role.endsWith("_LEAD"))
      return {
        title: role.replace(/_/g, " "),
        position: "Lead Investigating Officer (Lead IO)",
        color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      };
    if (role.endsWith("_CYBER"))
      return {
        title: role.replace(/_/g, " "),
        position: "Cyber Cell & OSINT Specialist",
        color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
      };
    if (role.endsWith("_FORENSIC"))
      return {
        title: role.replace(/_/g, " "),
        position: "Forensic Examiner",
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      };
    return {
      title: role.replace(/_/g, " "),
      position: "Field Investigator & Sighting Officer",
      color: "text-sky-400 bg-sky-500/10 border-sky-500/30",
    };
  };

  // Phase 3 Req17 — real roster only (no mock fallback).
  const displayedOfficers = caseOfficers;
  void isLoadingOfficers;

  const eligibleToAdd = tenureUsers.filter(
    (u: any) => !caseOfficers.some((m) => m.user_id === u._id)
  );

  const pocName = (uid?: string) =>
    caseOfficers.find((m) => m.user_id === uid)?.user_name || "—";

  const handleAddMember = async () => {
    if (!addUserId || teamBusy) return;
    setTeamBusy(true);
    setTeamMsg(null);
    try {
      await caseApi.leadAddMember(currentCase.id, addUserId);
      setAddUserId("");
      setTeamMsg({ ok: true, text: "Officer added to the case team." });
      await loadTeam();
    } catch (err: any) {
      setTeamMsg({ ok: false, text: err.message || "Team assignment failed." });
    } finally {
      setTeamBusy(false);
    }
  };

  const handleSavePocs = async () => {
    if (teamBusy) return;
    setTeamBusy(true);
    setTeamMsg(null);
    try {
      const res = await caseApi.updatePocs(currentCase.id, {
        field: pocDraft.field || undefined,
        forensic: pocDraft.forensic || undefined,
        cyber: pocDraft.cyber || undefined,
      });
      setPocs(res.pocs || {});
      setTeamMsg({ ok: true, text: "Points of contact nominated." });
    } catch (err: any) {
      setTeamMsg({ ok: false, text: err.message || "POC nomination failed." });
    } finally {
      setTeamBusy(false);
    }
  };

  const handleRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teamBusy) return;
    setTeamBusy(true);
    setTeamMsg(null);
    try {
      await caseApi.createRequisition(currentCase.id, {
        functional: reqFunctional,
        count: reqCount,
        justification: reqJustification,
      });
      setReqJustification("");
      setReqCount(1);
      setTeamMsg({ ok: true, text: "Requisition sent to the department Admin." });
      await loadTeam();
    } catch (err: any) {
      setTeamMsg({ ok: false, text: err.message || "Requisition failed." });
    } finally {
      setTeamBusy(false);
    }
  };

  const handleDecideReq = async (reqId: string, approve: boolean) => {
    if (teamBusy) return;
    setTeamBusy(true);
    setTeamMsg(null);
    try {
      await caseApi.decideRequisition(currentCase.id, reqId, approve);
      setTeamMsg({ ok: true, text: approve ? "Requisition approved." : "Requisition rejected." });
      await loadTeam();
    } catch (err: any) {
      setTeamMsg({ ok: false, text: err.message || "Decision failed." });
    } finally {
      setTeamBusy(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-950 p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto w-full pb-20 md:pb-8">
      {/* 1. Operation Header + the case story so far */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-6 relative overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-amber-500/5 to-transparent pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 sm:gap-6 relative z-10">
          <div className="space-y-3 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-100 tracking-tight">
              {currentCase.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-4xl leading-relaxed">
              {currentCase.description}
            </p>
          </div>
        </div>

        {/* The story of the crime scene so far — narrated live from case data */}
        <div className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                {story.title}
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {story.updatedLabel}
            </span>
          </div>

          <div className="space-y-2.5">
            {story.paragraphs.map((para, idx) => (
              <p key={idx} className="text-sm text-slate-200 leading-relaxed font-sans">
                {para}
              </p>
            ))}
          </div>
        </div>

        {/* Agency Meta Ribbon */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-400">LEAD AGENCY: </span>
              <span className="text-slate-200 font-semibold">{currentCase.leadAgency}</span>
            </div>
            <div>
              <span className="text-slate-400">INITIATED: </span>
              <span className="text-slate-200">{currentCase.date}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Officers Working on the Case & Their Positions (real roster, Req17) */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Case Officers & Assigned Positions ({displayedOfficers.length})
              </h3>
              <p className="text-xs text-slate-400">
                Registered platform personnel actively assigned to {currentCase.name}
              </p>
            </div>
          </div>
        </div>

        {(pocs.field || pocs.forensic || pocs.cyber) && (
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            {pocs.field && (
              <span className="px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300">
                FIELD POC: {pocName(pocs.field)}
              </span>
            )}
            {pocs.forensic && (
              <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                FORENSIC POC: {pocName(pocs.forensic)}
              </span>
            )}
            {pocs.cyber && (
              <span className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                CYBER POC: {pocName(pocs.cyber)}
              </span>
            )}
          </div>
        )}

        {displayedOfficers.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
            No officers assigned yet. The department Admin assigns the Lead at registration; Leads staff
            same-tenure personnel below.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedOfficers.map((officer) => {
              const roleInfo = getRolePositionLabel(officer.role);
              const pocKinds = Object.entries(pocs)
                .filter(([, uid]) => uid === officer.user_id)
                .map(([k]) => k.toUpperCase());
              return (
                <div
                  key={officer._id || officer.user_id}
                  className="p-3.5 bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-xl space-y-2 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs shrink-0 font-mono">
                        {(officer.user_name || "Officer").charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-100 truncate">
                          {officer.user_name || "Investigating Officer"}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {roleInfo.title}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${roleInfo.color}`}>
                      {officer.role.replace(/_/g, " ")}
                    </span>
                  </div>
                  {pocKinds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {pocKinds.map((k) => (
                        <span key={k} className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">
                          {k} POC
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-900 text-[11px] space-y-1 font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-slate-400">Position:</span>
                      <span className="text-slate-200 text-right truncate ml-2 font-medium">
                        {roleInfo.position}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-slate-400">Official ID:</span>
                      <span className="text-amber-400/90">{officer.official_id || "N/A"}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-slate-400">Agency:</span>
                      <span className="text-slate-300 truncate ml-2">
                        {officer.agency || currentCase.leadAgency}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Phase 3 Req15/16/17 — Lead team management (same-tenure only) */}
        {canManageTeam && (
          <div className="pt-3 border-t border-slate-800 space-y-4">
            {teamMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
                  teamMsg.ok
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                {teamMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{teamMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-amber-400" /> Add case personnel (same agency prefix only)
                </h4>
                <div className="flex gap-2">
                  <select
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">Select a same-tenure officer…</option>
                    {eligibleToAdd.map((u: any) => (
                      <option key={u._id} value={u._id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={!addUserId || teamBusy}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(["field", "forensic", "cyber"] as const).map((kind) => (
                    <label key={kind} className="block">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">{kind} POC</span>
                      <select
                        value={pocDraft[kind]}
                        onChange={(e) => setPocDraft((p) => ({ ...p, [kind]: e.target.value }))}
                        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="">—</option>
                        {displayedOfficers.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.user_name} ({m.role})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleSavePocs}
                  disabled={teamBusy}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs disabled:opacity-40"
                >
                  Nominate POCs
                </button>
              </div>

              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-3.5 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-amber-400" /> Requisition personnel from Admin
                </h4>
                <form onSubmit={handleRequisition} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={reqFunctional}
                      onChange={(e) => setReqFunctional(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="FIELD">FIELD</option>
                      <option value="FORENSIC">FORENSIC</option>
                      <option value="CYBER">CYBER</option>
                      <option value="LEAD">LEAD</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={reqCount}
                      onChange={(e) => setReqCount(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-slate-200"
                    />
                  </div>
                  <textarea
                    value={reqJustification}
                    onChange={(e) => setReqJustification(e.target.value)}
                    rows={2}
                    placeholder="Operational justification (min 10 chars)…"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-slate-200 placeholder-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={teamBusy || reqJustification.trim().length < 10}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40"
                  >
                    Send requisition
                  </button>
                </form>
                {requisitions.length > 0 && (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {requisitions.map((r) => (
                      <div key={r._id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-[11px]">
                        <span className="text-slate-300 font-mono truncate">
                          {r.count}× {r.functional} · {r.status}
                        </span>
                        {user && isAdmin(user.role) && r.status === "PENDING" && (
                          <span className="flex gap-1 shrink-0">
                            <button
                              onClick={() => handleDecideReq(r._id, true)}
                              className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleDecideReq(r._id, false)}
                              className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 font-bold"
                            >
                              Reject
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Phase 4 Req22 — data requisition pipeline (Lead → personnel) */}
            <DataRequestInbox caseId={currentCase.id} canIssue onChanged={loadTeam} />
          </div>
        )}
      </div>

      {/* Phase 6 Req26 — interstate bridge (State Police only; self-gated) */}
      {user && orgOf(user.role) === "POLICE" && (
        <InterstateBridge caseId={currentCase.id} />
      )}

    </div>
  );
};
