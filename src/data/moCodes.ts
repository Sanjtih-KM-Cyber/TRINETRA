export interface MOCode {
  code: string;
  category: string;
  description: string;
}

/**
 * Modus Operandi master (NCRB-style MO bureaux categories used across
 * State Crime Records Bureaux for history sheets and dossier classification).
 */
export const MO_CODES: MOCode[] = [
  { code: "HB-01", category: "House Breaking", description: "House breaking by day — latch/door breaking" },
  { code: "HB-02", category: "House Breaking", description: "House breaking by night — scaling / roof entry" },
  { code: "HB-03", category: "House Breaking", description: "House breaking with ks key / false keys" },
  { code: "ROB-01", category: "Robbery", description: "Highway robbery — truck/container interception" },
  { code: "ROB-02", category: "Robbery", description: "Street robbery — knife / weapon intimidation" },
  { code: "DAC-01", category: "Dacoity", description: "Armed gang dacoity with firearms" },
  { code: "SNCH-01", category: "Snatching", description: "Chain / purse snatching by motorcycle-borne offenders" },
  { code: "PICK-01", category: "Pick Pocketing", description: "Pick pocketing in crowds / transit hubs" },
  { code: "VEH-01", category: "Auto Theft", description: "Two-wheeler theft — handle-lock breaking" },
  { code: "VEH-02", category: "Auto Theft", description: "Car/SUV theft — duplicate key / tow-away" },
  { code: "VEH-03", category: "Auto Theft", description: "Commercial vehicle theft for contraband transport" },
  { code: "CHT-01", category: "Cheating", description: "Investment / Ponzi fraud via apps and messengers" },
  { code: "CHT-02", category: "Cheating", description: "Impersonation — fake officials / KYC fraud" },
  { code: "CYB-01", category: "Cyber", description: "UPI / OTP phishing and mule-account layering" },
  { code: "CYB-02", category: "Cyber", description: "SIM-swap / SIM-box fraud infrastructure" },
  { code: "CYB-03", category: "Cyber", description: "Crypto tumbler laundering of scam proceeds" },
  { code: "NDPS-01", category: "Narcotics", description: "Inter-state MDMA / heroin consignment transport" },
  { code: "NDPS-02", category: "Narcotics", description: "Coastal dhow-landing narcotics infiltration" },
  { code: "NDPS-03", category: "Narcotics", description: "Nightclub / peddler retail distribution" },
  { code: "FIN-01", category: "Economic", description: "Hawala / angadia cash-token distribution" },
  { code: "FIN-02", category: "Economic", description: "Shell-company layering under reporting thresholds" },
  { code: "FIN-03", category: "Economic", description: "Counterfeit currency circulation" },
  { code: "ARM-01", category: "Arms", description: "Cross-border arms smuggling — drone drops" },
  { code: "EXT-01", category: "Extortion", description: "Ransom calls to traders / real-estate targets" },
  { code: "KID-01", category: "Kidnapping", description: "Kidnapping for ransom by organised cell" },
  { code: "HOM-01", category: "Violent", description: "Contract killing / gang-warfare homicide" },
];

export function moLabel(code: string): string {
  const found = MO_CODES.find((m) => m.code === code);
  return found ? `${found.code} — ${found.description}` : code;
}
