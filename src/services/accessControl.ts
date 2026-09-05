import {
  IntelligenceClassification,
  IntelligenceCompartment,
  IntelligenceCaveat,
  UserAccount,
} from "../types";

export const CLASSIFICATION_ORDER: Record<IntelligenceClassification, number> = {
  UNCLASSIFIED: 0,
  RESTRICTED: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  TOP_SECRET: 4,
};

export interface Clearance {
  level: IntelligenceClassification;
  compartments: IntelligenceCompartment[];
  caveats: IntelligenceCaveat[];
}

export const DEFAULT_CLEARANCE: Clearance = {
  level: "CONFIDENTIAL",
  compartments: ["GENERAL"],
  caveats: [],
};

export function getUserClearance(user: UserAccount | null | undefined): Clearance {
  if (!user || !user.clearance) return DEFAULT_CLEARANCE;
  return {
    level: user.clearance.level || "CONFIDENTIAL",
    compartments: user.clearance.compartments || ["GENERAL"],
    caveats: user.clearance.caveats || [],
  };
}

export interface ClassifiedRecord {
  classification: IntelligenceClassification;
  compartment?: IntelligenceCompartment;
  caveats?: IntelligenceCaveat[];
}

/**
 * Determines whether a user clearance grants access to a classified record.
 * Enforces: level >= record level, compartment membership (GENERAL is open),
 * and EYES_ONLY caveat as a hard block. Other caveats are surfaced as
 * handling warnings, not access blocks.
 */
export function canAccessIntel(
  clearance: Clearance | undefined,
  record: ClassifiedRecord
): { allowed: boolean; reason: string } {
  const clr = clearance || DEFAULT_CLEARANCE;
  const order = CLASSIFICATION_ORDER;

  if ((order[clr.level] ?? 0) < (order[record.classification] ?? 0)) {
    return {
      allowed: false,
      reason: `Requires ${record.classification} clearance (holder: ${clr.level}).`,
    };
  }

  const compartment = record.compartment || "GENERAL";
  if (compartment !== "GENERAL" && !clr.compartments.includes(compartment)) {
    return {
      allowed: false,
      reason: `Requires ${compartment} compartment access.`,
    };
  }

  const caveats = record.caveats || [];
  if (caveats.includes("EYES_ONLY") && !clr.caveats.includes("EYES_ONLY")) {
    return { allowed: false, reason: "EYES_ONLY handling caveat — named access only." };
  }

  return { allowed: true, reason: "Access granted." };
}

export function handlingWarnings(record: ClassifiedRecord): string[] {
  return (record.caveats || []).filter((c) => c !== "EYES_ONLY");
}

/**
 * Returns display-safe text for classified content.
 */
export function sanitizeIntelText(
  original: string,
  sanitizedVersion: string | undefined,
  allowed: boolean,
  classification: IntelligenceClassification
): string {
  if (allowed) return original;
  if (sanitizedVersion && sanitizedVersion.trim().length > 0) return sanitizedVersion;
  return `[${classification} — content restricted. Clearance required.]`;
}
