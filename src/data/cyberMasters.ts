/** NCRP (cybercrime.gov.in) reporting categories for referrals. */
export const NCRP_CATEGORIES = [
  "Financial Fraud — UPI / Bank",
  "Financial Fraud — Investment / Task Scam",
  "Financial Fraud — OTP / KYC Phishing",
  "Social Media — Impersonation",
  "Social Media — Extortion / Sextortion",
  "Hacking / Unauthorized Access",
  "Ransomware / Malware",
  "SIM-Swap / SIM-Box Fraud",
  "Crypto / Virtual Asset Fraud",
  "Online Trafficking / Grooming",
  "Cyber Stalking / Harassment",
  "Other Cyber Crime",
];

export const CERT_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** CERT-In mandates incident reporting within 6 hours of detection. */
export const CERT_REPORT_HOURS = 6;

export const NCRP_STATUSES = ["DRAFT", "PUSHED", "ACKNOWLEDGED", "CLOSED"] as const;
export const CERT_STATUSES = ["OPEN", "REPORTED", "MITIGATING", "CLOSED"] as const;
export const SEC69_STATUSES = ["DRAFT", "ORDERED", "ACTIVE", "EXPIRED", "REVOKED"] as const;
export const CEIR_STATUSES = ["DRAFT", "SUBMITTED", "BLOCKED", "UNBLOCKED"] as const;
