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
import { isAdmin, isLead, orgOf, tenureKey, caseTenureOf, isStatewiseOrg } from "../data/roles";
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
  const [caseTenure, setCaseTenure] = useState<string | null>(null);
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
  const [reqAssignee, setReqAssignee] = useState<Record<string, string>>({});
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
      // Case-tenure gate: the picker must list officers matching the CASE
      // tenure (not just the caller's) — otherwise every Add fails with
      // "Member tenure 'X' does not match case tenure 'Y'".
      setCaseTenure(found?.org ? caseTenureOf(found) : null);
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

  const getRolePositionLabel = (role?: string) => {
    const r = String(role || "FIELD");
    if (r.endsWith("_ADMIN"))
      return {
        title: r.replace(/_/g, " "),
        position: "Department Administrator",
        color: "text-tertiary font-bold bg-tertiary-container/30 border-tertiary/30",
      };
    if (r.endsWith("_LEAD"))
      return {
        title: r.replace(/_/g, " "),
        position: "Lead Investigating Officer (Lead IO)",
        color: "text-primary font-bold bg-primary-container/30 border-primary/30",
      };
    if (r.endsWith("_CYBER"))
      return {
        title: r.replace(/_/g, " "),
        position: "Cyber Cell & OSINT Specialist",
        color: "text-secondary font-bold bg-secondary-container/30 border-secondary/30",
      };
    if (r.endsWith("_FORENSIC"))
      return {
        title: r.replace(/_/g, " "),
        position: "Forensic Examiner",
        color: "text-success font-bold bg-success-container/30 border-success/30",
      };
    return {
      title: r.replace(/_/g, " "),
      position: "Field Investigator & Sighting Officer",
      color: "text-on-surface font-bold bg-surface-container-high border-white/5",
    };
  };

  // Phase 3 Req17 — real roster only (no mock fallback).
  const displayedOfficers = caseOfficers;
  void isLoadingOfficers;

  const eligibleToAdd = tenureUsers.filter((u: any) => {
    if (caseOfficers.some((m) => m.user_id === u._id)) return false;
    // Enforce case-tenure match client-side so cross-tenure officers
    // (e.g. CBI on a POLICE:MAHARASHTRA case) are never offered.
    if (caseTenure && caseTenure !== "SHARED") {
      return tenureKey(u.role, u.state) === caseTenure;
    }
    return true;
  });

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
      const res = await caseApi.decideRequisition(currentCase.id, reqId, approve, undefined, approve ? reqAssignee[reqId] || undefined : undefined);
      setTeamMsg({
        ok: true,
        text: approve
          ? res.assigned
            ? `Requisition approved — ${res.assigned} seated on the case.`
            : "Requisition approved."
          : "Requisition rejected.",
      });
      await loadTeam();
    } catch (err: any) {
      setTeamMsg({ ok: false, text: err.message || "Decision failed." });
    } finally {
      setTeamBusy(false);
    }
  };

  const handleRemoveOfficer = async (memberUserId: string, memberName: string) => {
    if (teamBusy) return;
    setTeamBusy(true);
    setTeamMsg(null);
    try {
      await caseApi.leadRemoveMember(currentCase.id, memberUserId);
      setTeamMsg({ ok: true, text: `${memberName} removed from the case.` });
      await loadTeam();
    } catch (err: any) {
      setTeamMsg({ ok: false, text: err.message || "Removal failed." });
    } finally {
      setTeamBusy(false);
    }
  };

  return (
    <div className="flex-1 bg-surface-container-lowest p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto w-full pb-20 md:pb-8">
      {/* 1. Operation Header + the case story so far — M3 tonal surface, Large geometry */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 relative overflow-hidden transition-all duration-300 ease-out">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-primary/10 to-transparent pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 sm:gap-6 relative z-10">
          <div className="space-y-3 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold text-on-surface tracking-tight">
              {currentCase.name}
            </h1>
            <p className="text-sm sm:text-base text-on-surface-variant max-w-4xl leading-relaxed">
              {currentCase.description}
            </p>
          </div>
        </div>

        {/* The story of the crime scene so far — narrated live from case data */}
        <div className="mt-5 p-4 sm:p-5 rounded-xl bg-surface-container-lowest/40 border border-white/5 space-y-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-bold text-on-surface font-mono uppercase tracking-wider">
                {story.title}
              </h2>
            </div>
            <span className="text-[10px] font-mono text-on-surface-variant">
              {story.updatedLabel}
            </span>
          </div>

          <div className="space-y-2.5">
            {story.paragraphs.map((para, idx) => (
              <p key={idx} className="text-sm text-on-surface-variant/90 leading-relaxed font-sans">
                {para}
              </p>
            ))}
          </div>
        </div>

        {/* Agency Meta Ribbon */}
        <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs text-on-surface-variant font-mono">
          <div className="flex items-center gap-6">
            <div>
              <span className="opacity-70">LEAD AGENCY: </span>
              <span className="text-on-surface font-semibold">{currentCase.leadAgency}</span>
            </div>
            <div>
              <span className="opacity-70">INITIATED: </span>
              <span className="text-on-surface">{currentCase.date}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Officers Working on the Case & Their Positions (real roster, Req17) */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">
                Case Officers & Assigned Positions ({displayedOfficers.length})
              </h3>
              <p className="text-xs text-on-surface-variant">
                Registered platform personnel actively assigned to {currentCase.name}
              </p>
            </div>
          </div>
        </div>

        {(pocs.field || pocs.forensic || pocs.cyber) && (
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            {pocs.field && (
              <span className="px-2 py-1 rounded-lg bg-surface-container-high border border-white/5 text-on-surface-variant">
                FIELD POC: <span className="text-on-surface">{pocName(pocs.field)}</span>
              </span>
            )}
            {pocs.forensic && (
              <span className="px-2 py-1 rounded-lg bg-surface-container-high border border-white/5 text-on-surface-variant">
                FORENSIC POC: <span className="text-on-surface">{pocName(pocs.forensic)}</span>
              </span>
            )}
            {pocs.cyber && (
              <span className="px-2 py-1 rounded-lg bg-surface-container-high border border-white/5 text-on-surface-variant">
                CYBER POC: <span className="text-on-surface">{pocName(pocs.cyber)}</span>
              </span>
            )}
          </div>
        )}

        {isLoadingOfficers ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" aria-label="Loading case officers" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-3.5 bg-surface-container-low border border-outline-variant rounded-lg space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="m3-skeleton-chip w-8 h-8 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="m3-skeleton h-3 w-2/3" />
                    <div className="m3-skeleton h-2.5 w-1/3" />
                  </div>
                </div>
                <div className="m3-skeleton h-8 w-full" />
              </div>
            ))}
          </div>
        ) : displayedOfficers.length === 0 ? (
          <div className="p-6 rounded-lg bg-surface-container-low border border-dashed border-white/10 text-center space-y-2">
            <p className="text-xs text-on-surface-variant font-medium">No officers assigned yet</p>
            <p className="text-[11px] text-on-surface-variant/70">The department Admin assigns the Lead at registration; Leads staff same-tenure personnel below.</p>
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
                  className="card-hover space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-surface-container-highest border border-white/10 flex items-center justify-center text-on-surface font-bold text-xs shrink-0 font-mono shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                        {(officer.user_name || "Officer").charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-on-surface truncate">
                          {officer.user_name || "Investigating Officer"}
                        </div>
                        <div className="text-[11px] text-on-surface-variant truncate">
                          {roleInfo.title}
                        </div>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${roleInfo.color}`}>
                        {String(officer.role || "FIELD").replace(/_/g, " ")}
                      </span>
                      {canManageTeam && user && officer.user_id !== user._id && !String(officer.role).endsWith("_ADMIN") && (
                        <button
                          onClick={() => handleRemoveOfficer(officer.user_id, officer.user_name)}
                          disabled={teamBusy}
                          className="text-rose-300 hover:text-rose-200 font-bold text-xs px-1 disabled:opacity-40"
                          title="Remove from case"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  </div>
                  {pocKinds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {pocKinds.map((k) => (
                        <span key={k} className="badge-amber bg-primary/20 border-primary/30 text-primary">
                          {k} POC
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-3 border-t border-white/5 text-[11px] space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span className="opacity-70">Position:</span>
                      <span className="text-on-surface text-right truncate ml-2 font-medium">
                        {roleInfo.position}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span className="opacity-70">Official ID:</span>
                      <span className="text-primary font-bold">{officer.official_id || "N/A"}</span>
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span className="opacity-70">Agency:</span>
                      <span className="text-on-surface truncate ml-2">
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
          <div className="pt-4 border-t border-white/5 space-y-4">
            {teamMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${teamMsg.ok
                    ? "bg-success-container/30 border-success/30 text-success"
                    : "bg-error-container/30 border-error/30 text-error"
                  }`}
              >
                {teamMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{teamMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass-panel p-4 space-y-3 rounded-xl">
                <h4 className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-primary" /> Add case personnel (same agency prefix only)
                  {caseTenure && <span className="font-mono text-[10px] text-on-surface-variant">· {caseTenure}</span>}
                </h4>
                <div className="flex gap-2">
                  <select
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    className="flex-1 bg-surface-container-lowest border border-white/10 rounded-xl px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                  >
                    <option value="">
                      {eligibleToAdd.length === 0
                        ? caseTenure
                          ? `No ${caseTenure} officers available`
                          : "No officers available"
                        : "Select a same-tenure officer…"}
                    </option>
                    {eligibleToAdd.map((u: any) => (
                      <option key={u._id} value={u._id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={!addUserId || teamBusy}
                    className="btn-primary py-2 px-6"
                  >
                    Add
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(["field", "forensic", "cyber"] as const).map((kind) => (
                    <label key={kind} className="block">
                      <span className="text-[10px] font-mono font-bold text-on-surface-variant uppercase">{kind} POC</span>
                      <select
                        value={pocDraft[kind]}
                        onChange={(e) => setPocDraft((p) => ({ ...p, [kind]: e.target.value }))}
                        className="mt-1 w-full bg-surface-container-lowest border border-white/10 shadow-inner rounded-xl px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
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
                  className="btn-secondary w-full justify-center py-2"
                >
                  Nominate POCs
                </button>
              </div>

              <div className="glass-panel p-4 space-y-3 rounded-xl">
                <h4 className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-primary" /> Requisition personnel from Admin
                </h4>
                <form onSubmit={handleRequisition} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={reqFunctional}
                      onChange={(e) => setReqFunctional(e.target.value)}
                      className="bg-surface-container-lowest border border-white/10 shadow-inner rounded-xl px-2 py-1.5 text-xs text-on-surface"
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
                      className="bg-surface-container-lowest border border-white/10 shadow-inner rounded-xl px-3 py-1.5 text-xs text-on-surface"
                    />
                  </div>
                  <textarea
                    value={reqJustification}
                    onChange={(e) => setReqJustification(e.target.value)}
                    rows={2}
                    placeholder="Operational justification (min 10 chars)…"
                    className="w-full bg-surface-container-lowest border border-white/10 shadow-inner rounded-xl p-3 text-xs text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={teamBusy || reqJustification.trim().length < 10}
                    className="btn-primary w-full justify-center"
                  >
                    Send requisition
                  </button>
                </form>
                {requisitions.length > 0 && (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {requisitions.map((r) => (
                      <div key={r._id} className="rounded-lg bg-surface-container-lowest border border-white/5 px-3 py-2 text-[11px] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface font-mono truncate">
                            {r.count}× {r.functional} · {r.status}
                          </span>
                          {user && isAdmin(user.role) && r.status === "PENDING" && (
                            <span className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleDecideReq(r._id, true)}
                                className="px-2 py-1 rounded bg-success-container/30 border border-success/40 text-success font-bold hover:brightness-110 active:scale-95 transition-all"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleDecideReq(r._id, false)}
                                className="px-2 py-1 rounded bg-error-container/30 border border-error/40 text-error font-bold hover:brightness-110 active:scale-95 transition-all"
                              >
                                Reject
                              </button>
                            </span>
                          )}
                        </div>
                        {user && isAdmin(user.role) && r.status === "PENDING" && (
                          <select
                            value={reqAssignee[r._id] || ""}
                            onChange={(e) => setReqAssignee((p) => ({ ...p, [r._id]: e.target.value }))}
                            className="w-full bg-surface-container border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-on-surface shadow-inner"
                          >
                            <option value="">Approve only (no seating)</option>
                            {tenureUsers
                              .filter((u: any) => !caseOfficers.some((m) => m.user_id === u._id))
                              .map((u: any) => (
                                <option key={u._id} value={u._id}>
                                  Seat now: {u.name} ({u.role})
                                </option>
                              ))}
                          </select>
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

      {/* Phase 6 Req26 — interstate bridge (State Police + CID; self-gated) */}
      {user && isStatewiseOrg(orgOf(user.role)) && (
        <InterstateBridge caseId={currentCase.id} />
      )}

    </div>
  );
};
