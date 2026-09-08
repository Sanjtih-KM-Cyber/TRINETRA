import type { Org, Functional } from "./roles";

/**
 * Phase 2 Req9–12 — department role mandates.
 * Single source of truth for CBI / NIA / CID / State Police frontends:
 * titles, mandate text, staffing prefix, and capability flags.
 * Portal-stripping (forensic minimal, lead SAHAYAK swap, field mobile capture)
 * lands in Phase 4; this file drives headers, dashboards and option lists.
 */

export interface FunctionalMandate {
  title: string;
  mandate: string;
  staffingPrefix: string;
}

export interface OrgMatrix {
  org: Org;
  department: string;
  admin: FunctionalMandate;
  lead: FunctionalMandate;
  cyber: FunctionalMandate & { focus: string[] };
  forensic: FunctionalMandate;
  field: FunctionalMandate & { logTypes: string[] };
}

export const ROLE_MATRICES: Record<Org, OrgMatrix> = {
  CBI: {
    org: "CBI",
    department: "Central Bureau of Investigation",
    admin: {
      title: "CBI Admin",
      mandate: "Ingests interstate transfer orders from Central Government / High / Supreme Courts, instantiates the case container and assigns the Lead Investigator.",
      staffingPrefix: "cbi_",
    },
    lead: {
      title: "CBI Lead Investigator (DySP/Inspector)",
      mandate: "Economic offences & corruption command. Evidence ingestion is replaced by SAHAYAK AI; may requisition data and staff only cbi_ personnel.",
      staffingPrefix: "cbi_",
    },
    cyber: {
      title: "CBI Cyber Personnel",
      mandate: "Exclusive digital forensics, OSINT and cryptocurrency / offshore financial trail analysis.",
      staffingPrefix: "cbi_",
      focus: ["Digital forensics", "OSINT", "Crypto trails", "Offshore finance"],
    },
    forensic: {
      title: "CBI Forensic (CFSL)",
      mandate: "CFSL document examiners & forensic accountants. Minimalist intake: case overview, reporting officer, raw file dropzone.",
      staffingPrefix: "cbi_",
    },
    field: {
      title: "CBI Field (Sub-Inspector)",
      mandate: "Executes search warrants, seizes physical books of accounts, serves summons.",
      staffingPrefix: "cbi_",
      logTypes: ["SEARCH_WARRANT_EXECUTION", "BOOKS_OF_ACCOUNTS_SEIZURE", "SUMMONS_SERVED", "SUSPECT_SIGHTING", "FIELD_INTEL_NOTE"],
    },
  },
  NIA: {
    org: "NIA",
    department: "National Investigation Agency",
    admin: {
      title: "NIA Admin (MHA liaison)",
      mandate: "Registers national-security & terror-financing matters; provisions branch lead investigators.",
      staffingPrefix: "nia_",
    },
    lead: {
      title: "NIA Lead Investigator",
      mandate: "Counter-terror command: inter-state raids, intelligence feeds, SAHAYAK AI for UAPA / terror statute mapping.",
      staffingPrefix: "nia_",
    },
    cyber: {
      title: "NIA Cyber Cell",
      mandate: "Dark-web intercepts, encrypted-channel (Telegram/Signal) exploitation, transnational terror-funding analysis.",
      staffingPrefix: "nia_",
      focus: ["Dark-web intercepts", "Telegram/Signal", "Terror funding"],
    },
    forensic: {
      title: "NIA Forensic (Ballistics/IED)",
      mandate: "Ballistics & IED chemical analysis. Ultra-simplified explosive-analysis report uploads.",
      staffingPrefix: "nia_",
    },
    field: {
      title: "NIA Field (Tactical squads)",
      mandate: "Ground tactical squads & handler logs: operational logs, surveillance reports, high-risk field actions.",
      staffingPrefix: "nia_",
      logTypes: ["RAID_LOG", "SURVEILLANCE_REPORT", "HANDLER_LOG", "HIGH_RISK_ACTION", "FIELD_INTEL_NOTE"],
    },
  },
  CID: {
    org: "CID",
    department: "Crime Investigation Department",
    admin: {
      title: "CID Admin",
      mandate: "State-tier monitor for specialised crime units; approves police-station escalations to the CID wing.",
      staffingPrefix: "cid_",
    },
    lead: {
      title: "CID Lead Investigator",
      mandate: "Multi-district matters (organised rings, serial crimes, large financial fraud). May flag evidence for interstate exchange.",
      staffingPrefix: "cid_",
    },
    cyber: {
      title: "CID Cyber (cid_cyber_01)",
      mandate: "Regional tech-crime unit: spoofing, identity theft, localised phishing, cybercrime feeds.",
      staffingPrefix: "cid_",
      focus: ["Spoofing", "Identity theft", "Phishing", "Cybercrime feeds"],
    },
    forensic: {
      title: "CID Forensic (State FSL)",
      mandate: "State FSL & Fingerprint Bureau: fingerprint matches, autopsy reports, toxicology assays via drag-and-drop.",
      staffingPrefix: "cid_",
    },
    field: {
      title: "CID Field (Detectives)",
      mandate: "Tracks interstate absconders, executes state non-bailable warrants.",
      staffingPrefix: "cid_",
      logTypes: ["ABSCONDER_TRACK", "NBW_EXECUTION", "SUSPECT_SIGHTING", "LOCATION_SURVEILLANCE", "FIELD_INTEL_NOTE"],
    },
  },
  POLICE: {
    org: "POLICE",
    department: "State Police",
    admin: {
      title: "State Police Admin",
      mandate: "State-isolated tenant admin (e.g. Karnataka vs Maharashtra). No cross-state visibility.",
      staffingPrefix: "police_",
    },
    lead: {
      title: "SHO / Circle Inspector",
      mandate: "Station-house command. Approving field evidence flags it for the interstate visibility bridge.",
      staffingPrefix: "police_",
    },
    cyber: {
      title: "State Police — via CID",
      mandate: "State Police has no organic cyber cell; cyber work routes via the CID cyber unit.",
      staffingPrefix: "cid_",
      focus: ["Routed via CID cyber"],
    },
    forensic: {
      title: "State Police — via CID FSL",
      mandate: "Forensics route via the state FSL under CID.",
      staffingPrefix: "cid_",
    },
    field: {
      title: "Beat / Station Officers (mobile-first)",
      mandate: "Police Login uploads: field-camera images, witness audio, FIR scans, dossier attachments in real time.",
      staffingPrefix: "police_",
      logTypes: ["BEAT_LOG", "FIR_SCAN", "WITNESS_AUDIO_NOTE", "FIELD_CAMERA_CAPTURE", "FIELD_INTEL_NOTE"],
    },
  },
};

export function matrixFor(org: string): OrgMatrix {
  const key = (org || "POLICE").toUpperCase() as Org;
  return ROLE_MATRICES[key] ?? ROLE_MATRICES.POLICE;
}

export function mandateFor(org: string, functional: Functional): FunctionalMandate {
  const m = matrixFor(org);
  switch (functional) {
    case "ADMIN":
      return m.admin;
    case "LEAD":
      return m.lead;
    case "CYBER":
      return m.cyber;
    case "FORENSIC":
      return m.forensic;
    default:
      return m.field;
  }
}
