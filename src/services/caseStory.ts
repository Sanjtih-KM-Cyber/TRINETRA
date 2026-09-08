import type {
  CaseDataset,
  CrimeNetworkLink,
  CrimeNetworkNode,
  SuspiciousPattern,
} from "../types";

export interface CaseStory {
  title: string;
  paragraphs: string[];
  updatedLabel: string;
}

function inr(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "₹0";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function personLabel(n: CrimeNetworkNode): string {
  return n.aliases && n.aliases.length > 0 ? `${n.label} (${n.aliases[0]})` : n.label;
}

/**
 * Builds the crime story so far — a plain-language narrative of what
 * happened, who is involved, how the machine runs, and where the case
 * stands. Every sentence is computed from live case data; nothing is
 * templated fiction.
 */
export function buildCaseStory(args: {
  caseDataset: CaseDataset;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  patterns: SuspiciousPattern[];
}): CaseStory {
  const { caseDataset, nodes, links, patterns } = args;
  const paragraphs: string[] = [];

  // 1. Origin — the FIR, or an open file awaiting registration.
  const fir = caseDataset.firs && caseDataset.firs.length > 0 ? caseDataset.firs[0] : null;
  if (fir) {
    const sections = fir.sections && fir.sections.length > 0 ? ` under ${fir.sections.join(", ")}` : "";
    paragraphs.push(
      `It began with ${fir.firNumber}, registered on ${fir.date} at ${fir.policeStation}${sections}. ` +
        (fir.briefNarrative ? fir.briefNarrative.trim() + " " : "") +
        (fir.complainant ? `The complainant on record is ${fir.complainant}.` : "")
    );
  } else {
    paragraphs.push(
      "No FIR is on record yet — the case file stands open while the first complaint is registered and verified."
    );
  }

  // 2. The cast — top people by risk, kingpin if the graph names one.
  const persons = nodes
    .filter((n) => n.type === "PERSON")
    .sort((a, b) => b.riskScore - a.riskScore);
  const kingpin =
    nodes.find((n) => n.isKingpinCandidate && n.type === "PERSON") ||
    nodes.find((n) => n.isKingpinCandidate);
  if (persons.length > 0) {
    const cast = persons
      .slice(0, 3)
      .map((p) => `${personLabel(p)}${p.role ? ` — ${p.role}` : ""}`)
      .join("; ");
    let para =
      `The investigation tracks ${persons.length} ${persons.length === 1 ? "person" : "people"}` +
      ` out of ${nodes.length} mapped entities. At the top of the board: ${cast}.`;
    if (kingpin) {
      para += ` ${personLabel(kingpin)} sits at the centre of it all — cut them out and the network splits.`;
    }
    paragraphs.push(para);
  } else if (nodes.length > 0) {
    paragraphs.push(
      `No persons are mapped yet, but ${nodes.length} entities (phones, accounts, vehicles, locations) are already on the board — the people behind them are still being identified.`
    );
  } else {
    paragraphs.push("The board is empty. Ingest the first exhibit and the story starts writing itself.");
  }

  // 3. The machinery — money moved, calls made, ground assets.
  const moneyLinks = links.filter((l) => l.relationType === "FUNDS_TRANSFER");
  const callLinks = links.filter((l) => l.relationType === "CALLS");
  const machinery: string[] = [];
  if (moneyLinks.length > 0) {
    const total = moneyLinks.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    machinery.push(
      `${inr(total)} changed hands across ${moneyLinks.length} traced transfer${moneyLinks.length === 1 ? "" : "s"}`
    );
  }
  if (callLinks.length > 0) {
    const calls = callLinks.reduce((s, l) => s + (Number(l.frequency) || 1), 0);
    const secs = callLinks.reduce((s, l) => s + (Number(l.durationSec) || 0), 0);
    const hours = secs >= 3600 ? ` totalling ${(secs / 3600).toFixed(1)} hours` : secs > 0 ? ` totalling ${Math.round(secs / 60)} minutes` : "";
    machinery.push(`${calls} intercepted calls${hours}`);
  }
  const vehicles = nodes.filter((n) => n.type === "VEHICLE");
  const locations = nodes.filter((n) => n.type === "LOCATION");
  if (vehicles.length > 0) {
    machinery.push(
      `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} on record (${vehicles.slice(0, 2).map((v) => v.label).join(", ")})`
    );
  }
  if (locations.length > 0) {
    machinery.push(
      `${locations.length} pinned location${locations.length === 1 ? "" : "s"} (${locations.slice(0, 2).map((l) => l.label).join(", ")})`
    );
  }
  if (machinery.length > 0) {
    paragraphs.push(`This is how the machine runs: ${machinery.join("; ")}.`);
  }

  // 4. State of play — evidence in, verification pending, open threats.
  const confirmed = nodes.filter((n) => n.reviewState === "CONFIRMED").length;
  const pending = nodes.length - confirmed;
  const exhibits = caseDataset.evidenceFiles?.length || 0;
  const critical = patterns.filter((p) => p.severity === "CRITICAL");
  const stateParts: string[] = [];
  if (exhibits > 0) stateParts.push(`${exhibits} sealed exhibit${exhibits === 1 ? "" : "s"} back every claim below`);
  if (nodes.length > 0) {
    stateParts.push(
      pending > 0
        ? `${confirmed} of ${nodes.length} entities verified, ${pending} still awaiting IO confirmation`
        : `all ${nodes.length} entities verified`
    );
  }
  if (critical.length > 0) {
    stateParts.push(
      `${critical.length} critical threat${critical.length === 1 ? "" : "s"} open (${critical.slice(0, 2).map((p) => p.title).join("; ")})`
    );
  } else if (patterns.length > 0) {
    stateParts.push(`${patterns.length} watched patterns, none critical right now`);
  }
  if (stateParts.length > 0) {
    const joined =
      stateParts.length === 1
        ? stateParts[0]
        : stateParts.slice(0, -1).join("; ") + "; and " + stateParts[stateParts.length - 1];
    paragraphs.push(`Where things stand: ${joined}.`);
  }

  return {
    title: "Case Story So Far",
    paragraphs,
    updatedLabel: "Narrated live from case data",
  };
}
