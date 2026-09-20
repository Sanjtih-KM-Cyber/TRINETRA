import React, { useState, useMemo } from "react";
import { adminApi, caseApi } from "../../services/api";
import { USER_ROLES, KNOWN_STATES, STATE_META, orgOf } from "../../data/roles";
import { CheckCircle2, AlertTriangle, FolderPlus, UserPlus } from "lucide-react";

/** Mirrors the server minting rules for a live preview (final numeric suffix assigned on submit). */
function previewCredentials(name: string, role: string, state: string): { email: string; employeeId: string } | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return null;
  const slug =
    trimmed.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 40) || "officer";
  const org = orgOf(role);
  const isStatewise = org === "POLICE" || org === "CID";
  const domain =
    org === "POLICE"
      ? STATE_META[state]?.domain || "police.gov.in"
      : org === "CBI"
      ? "cbi.gov.in"
      : org === "NIA"
      ? "nia.gov.in"
      : "cid.gov.in";
  const short = org === "POLICE" ? STATE_META[state]?.short || "ST" : org === "CID" && state ? `CID-${STATE_META[state]?.short || "ST"}` : org;
  const func = role.split("_").slice(1).join("").slice(0, 3).toUpperCase() || "GEN";
  return { email: `${slug}.···@${domain}`, employeeId: `${short}-${func}-···` };
}

function roleGroups(): Array<{ org: string; roles: string[] }> {
  const groups: Array<{ org: string; roles: string[] }> = [];
  for (const org of ["CBI", "NIA", "CID", "POLICE"]) {
    const roles = USER_ROLES.filter((r) => !r.endsWith("_ADMIN") && r.startsWith(`${org}_`));
    if (roles.length > 0) groups.push({ org: org === "POLICE" ? "State Police" : org, roles: [...roles] });
  }
  return groups;
}

/** Direct officer onboarding: name → branch → division → role → auto
 * credentials → admin-set password. No justification. */
export const AddOfficerInline: React.FC<{ onAdded: () => void }> = ({ onAdded }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [division, setDivision] = useState("");
  const [role, setRole] = useState<string>(USER_ROLES[1]);
  const [state, setState] = useState<string>(KNOWN_STATES[0].code);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; creds?: any } | null>(null);
  // Live preview: name + branch + division + role (+ state) → generated credentials.
  const preview = useMemo(() => previewCredentials(name, role, state), [name, role, state]);
  const pwMismatch = password.length > 0 && confirm.length > 0 && password !== confirm;
  const pwValid = password.length >= 6 && confirm.length >= 6 && !pwMismatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !pwValid) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await adminApi.addOfficer({
        full_name: name.trim(),
        branch: branch.trim() || undefined,
        division: division.trim() || undefined,
        requested_role: role,
        state: orgOf(role) === "POLICE" || orgOf(role) === "CID" ? state : undefined,
        password,
      });
      setResult({
        ok: true,
        text: `${res.user.name} onboarded as ${res.user.role} — credentials below.`,
        creds: res.user,
      });
      setName("");
      setBranch("");
      setDivision("");
      setPassword("");
      setConfirm("");
      onAdded();
    } catch (err: any) {
      setResult({ ok: false, text: err.message || "Onboarding failed." });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold transition-all w-fit"
      >
        <UserPlus className="w-4 h-4" /> Add New Officer
      </button>
    );
  }

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100">Add New Officer (credentials auto-generated)</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
      </div>
      {result && (
        <div className={`p-3 rounded-xl text-xs border ${result.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          <div className="flex items-center gap-2">
            {result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{result.text}</span>
          </div>
          {result.ok && result.creds && (
            <div className="mt-2 font-mono text-[11px] bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-0.5">
              <div>Email: <strong className="text-amber-300">{result.creds.email}</strong></div>
              <div>Employee ID: <strong className="text-amber-300">{result.creds.official_id}</strong></div>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">1 · Full Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Officer Vikram Patil" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">2 · Branch</span>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Crime Branch" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">3 · Division</span>
          <input value={division} onChange={(e) => setDivision(e.target.value)} placeholder="e.g. Cyber Cell North" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">4 · Operation Role *</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            {roleGroups().map((g) => (
              <optgroup key={g.org} label={g.org}>
                {g.roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {(orgOf(role) === "POLICE" || orgOf(role) === "CID") && (
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-300">State *</span>
            <select value={state} onChange={(e) => setState(e.target.value)} className={inputCls}>
              {KNOWN_STATES.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {preview ? (
        <div className="rounded-xl bg-slate-950 border border-indigo-500/30 p-3 font-mono text-[11px] space-y-0.5">
          <div className="text-[10px] font-sans font-bold text-indigo-300 uppercase tracking-wider">Auto-generated credentials</div>
          <div className="text-slate-300">Official email: <strong className="text-amber-300">{preview.email}</strong></div>
          <div className="text-slate-300">Employee ID: <strong className="text-amber-300">{preview.employeeId}</strong></div>
          <div className="text-slate-500 font-sans text-[10px]">Final numbers are assigned on Create. No justification needed.</div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">Enter name, branch, division and role to auto-generate the credentials.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">5 · Set Password * <span className="font-normal text-slate-500">(min 6 chars)</span></span>
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Officer's login password"
            className={`${inputCls} font-mono`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Confirm Password *</span>
          <input
            type={showPw ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            placeholder="Repeat password"
            className={`${inputCls} font-mono ${pwMismatch ? "border-rose-500/60" : ""}`}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-200"
        >
          {showPw ? "Hide passwords" : "Show passwords"}
        </button>
        {pwMismatch && <span className="text-[11px] font-mono text-rose-300">Passwords do not match</span>}
      </div>
      <button type="submit" disabled={busy || !name.trim() || !pwValid} className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs disabled:opacity-40">
        {busy ? "Creating officer…" : "Create Officer"}
      </button>
    </form>
  );
};

/** Staffing requisition decisions — rendered inside the Access Clearance Queue
 * (Admin "Approve/Reject Personnel"). Approvals may seat an officer at once. */
export const StaffingRequisitions: React.FC<{
  requisitions: any[];
  pool?: any[];
  caseMembers?: Record<string, string[]>;
  onDecided: () => void;
  onNotice: (ok: boolean, text: string) => void;
}> = ({ requisitions, pool, caseMembers, onDecided, onNotice }) => {
  const [assignee, setAssignee] = useState<Record<string, string>>({});
  const decide = async (id: string, approve: boolean) => {
    try {
      const res = await adminApi.decideRequisition(id, approve, undefined, approve ? assignee[id] || undefined : undefined);
      onNotice(true, approve ? (res.assigned ? `Approved — ${res.assigned} seated on the case.` : "Requisition approved.") : "Requisition rejected.");
      onDecided();
    } catch (err: any) {
      onNotice(false, err.message || "Decision failed.");
    }
  };

  return (
    <div className="pt-6 border-t border-slate-800 space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-100">Staffing Requisitions ({requisitions.length})</h3>
        <p className="text-xs text-slate-400">
          Formal personnel allocation requests from Lead Investigators within your tenure.
        </p>
      </div>
      <div className="space-y-3">
        {requisitions.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
            No personnel requisitions lodged in your tenure.
          </div>
        ) : (
          requisitions.map((r) => (
            <div key={r._id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold">
                    {r.case_code}
                  </span>
                  <span className="font-mono text-xs text-slate-200 font-bold">
                    {r.count}× {r.functional}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${r.status === "PENDING" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : r.status === "APPROVED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-rose-500/20 text-rose-300 border-rose-500/40"}`}>
                    {r.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Requested by <strong className="text-slate-200">{r.requested_by}</strong> ({r.requested_by_role})
                </div>
                <p className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">{r.justification}</p>
                <div className="text-[11px] font-mono text-slate-500">
                  {new Date(r.requested_at).toLocaleString()}
                  {r.reviewed_by && ` • ${r.reviewed_by}`}
                </div>
              </div>
              {r.status === "PENDING" && (
                <div className="flex flex-col gap-2 shrink-0">
                  {(pool || []).length > 0 && (
                    <select
                      value={assignee[r._id] || ""}
                      onChange={(e) => setAssignee((a) => ({ ...a, [r._id]: e.target.value }))}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 max-w-[220px]"
                    >
                      <option value="">Approve only</option>
                      {(pool || [])
                        .filter((u: any) => !(caseMembers?.[r.case_id] || []).includes(u._id))
                        .map((u: any) => (
                          <option key={u._id} value={u._id}>
                            Seat now: {u.name} ({u.role})
                          </option>
                        ))}
                    </select>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decide(r._id, true)}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decide(r._id, false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 text-xs font-semibold border border-slate-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

/** Admin inline case registration (Case Title, Docket/FIR no., Synopsis, Statutory Sections). */
export const RegisterCaseInline: React.FC<{ onRegistered: () => void }> = ({ onRegistered }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [docket, setDocket] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [sections, setSections] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const description = [synopsis.trim(), sections.trim() ? `Statutory Sections: ${sections.trim()}` : ""].filter(Boolean).join("\n");
      await caseApi.createCase({ name: title.trim(), codeName: docket.trim(), description });
      setMsg({ ok: true, text: `Case ${docket.trim()} registered — assign its Lead below.` });
      setTitle("");
      setDocket("");
      setSynopsis("");
      setSections("");
      onRegistered();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Registration failed." });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all w-fit"
      >
        <FolderPlus className="w-4 h-4" /> Register New Case
      </button>
    );
  }

  const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <form onSubmit={submit} className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100">Register New Case Container</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
      </div>
      {msg && (
        <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${msg.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Case Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Operation Garuda Follow-on" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-300">Formal Docket / FIR Number *</span>
          <input value={docket} onChange={(e) => setDocket(e.target.value)} required placeholder="e.g. OP-GARUDA-2027" className={`${inputCls} font-mono`} />
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-300">Incident Synopsis</span>
        <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={2} placeholder="Incident title, facts, jurisdiction…" className={inputCls} />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-300">Relevant Statutory Sections (BNS, BNSS, UAPA…)</span>
        <input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="e.g. Sec 21 NDPS; Sec 17 UAPA; Sec 302 BNS" className={`${inputCls} font-mono`} />
      </label>
      <button type="submit" disabled={busy || !title.trim() || !docket.trim()} className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40">
        {busy ? "Registering…" : "Register Case"}
      </button>
    </form>
  );
};

/** Inline Lead provisioning for Yet-to-be-Assigned (incl. transferred) cases. */
export const AssignLeadInline: React.FC<{
  caseId: string;
  hasLead: boolean;
  leads: any[];
  agency?: string;
  onAssigned: () => void;
}> = ({ caseId, hasLead, leads, agency, onAssigned }) => {
  const [leadId, setLeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const assign = async () => {
    if (!leadId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminApi.assignCaseMember(caseId, leadId);
      setLeadId("");
      setMsg({ ok: true, text: "Lead Investigator provisioned." });
      onAssigned();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "Assignment failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-3 border-t border-slate-800/80 space-y-2">
      {!hasLead && (
        <div className="flex gap-2">
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Select Lead Investigator…</option>
            {leads.map((l: any) => (
              <option key={l._id} value={l._id}>
                {l.name} ({l.role} · {l.official_id})
              </option>
            ))}
          </select>
          <button
            onClick={assign}
            disabled={!leadId || busy}
            className="px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs flex items-center gap-1 shrink-0 disabled:opacity-40"
          >
            <UserPlus className="w-3.5 h-3.5" /> Assign Lead
          </button>
        </div>
      )}
      {msg && (
        <div className={`text-[11px] flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          <span>{msg.text}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Agency: <strong className="text-slate-300">{agency || "—"}</strong></span>
        {hasLead && <span className="font-mono text-[10px] text-emerald-300">Lead provisioned ✓</span>}
      </div>
    </div>
  );
};

export default RegisterCaseInline;
