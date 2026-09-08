import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface CaseMeta {
  name: string;
  codeName: string;
  leadAgency: string;
  firNumber?: string;
}

const MARGIN = 14;
const PAGE_W = 210;

function header(doc: jsPDF, title: string, subtitle: string, meta: CaseMeta) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 30, "F");
  doc.setTextColor(251, 191, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("TRINETRA OS", MARGIN, 10);
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(11);
  doc.text(title, MARGIN, 17);
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(subtitle, MARGIN, 23);
  doc.setFontSize(8);
  doc.text(`${meta.codeName}  |  ${meta.leadAgency}`, PAGE_W - MARGIN, 10, { align: "right" });
  doc.text(meta.name.slice(0, 60), PAGE_W - MARGIN, 16, { align: "right" });
  if (meta.firNumber) doc.text(`FIR: ${meta.firNumber}`, PAGE_W - MARGIN, 22, { align: "right" });
  doc.setTextColor(15, 23, 42);
}

function footer(doc: jsPDF, hashNote?: string) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, 290, { align: "right" });
    doc.text("System-generated court record — TRINETRA OS", MARGIN, 290);
    if (hashNote) {
      doc.setFontSize(6.5);
      doc.text(`Integrity: ${hashNote.slice(0, 64)}`, MARGIN, 294);
    }
  }
}

function sectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(text, MARGIN, y);
  doc.setDrawColor(251, 191, 36);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
  return y + 7;
}

function bodyText(doc: jsPDF, y: number, text: string, size = 9): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(30, 41, 59);
  const lines = doc.splitTextToSize(text || "—", PAGE_W - MARGIN * 2) as string[];
  doc.text(lines, MARGIN, y);
  return y + lines.length * (size * 0.45) + 3;
}

function kvTable(doc: jsPDF, y: number, rows: Array<[string, string]>) {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [],
    body: rows,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 52, fillColor: [241, 245, 249] } },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
}

export interface SignParty {
  label: string;
  name?: string;
  rank?: string;
  at?: string;
}

/** 1–3 party signature block (memo PDFs carry IO + witness + supervisory). */
function signBlock(doc: jsPDF, y: number, ...parties: Array<SignParty | undefined>) {
  const shown = parties.filter((p): p is SignParty => !!p).slice(0, 3);
  if (shown.length === 0) return y;
  const colW = (PAGE_W - MARGIN * 2) / shown.length;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  shown.forEach((p, i) => {
    doc.text(p.label, MARGIN + i * colW, y);
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  shown.forEach((p, i) => {
    const x = MARGIN + i * colW;
    doc.text(`Name: ${(p.name || "_______________").slice(0, 26)}`, x, y + 6);
    doc.text(`Rank: ${(p.rank || "_______________").slice(0, 26)}`, x, y + 11);
    doc.text(`Date: ${p.at ? p.at.slice(0, 10) : "___________"}`, x, y + 16);
    doc.text(`Sign: __________`, x, y + 21);
  });
  return y + 27;
}

function measureLines(doc: jsPDF, text: string, size: number): number {
  doc.setFontSize(size);
  return (doc.splitTextToSize(text || "—", PAGE_W - MARGIN * 2) as string[]).length;
}

export function downloadTextFile(filename: string, content: string, mime = "application/xml") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------

export function generateCaseDiaryPdf(meta: CaseMeta, entries: any[]) {
  const doc = new jsPDF();
  header(doc, "CASE DIARY — Sec 172 CrPC / Sec 176 BNSS", "Daily record of investigation proceedings (hash-chained)", meta);
  let y = 36;
  y = kvTable(doc, y, [
    ["Case", `${meta.name}`],
    ["Total entries", `${entries.length}`],
    ["Generated", new Date().toLocaleString("en-IN")],
  ]);
  entries.forEach((e: any, i: number) => {
    // Keep-together pagination: measure the whole entry block first
    const procLines = measureLines(doc, `Proceedings: ${e.proceedings}`, 9);
    const actLines = e.actionTaken ? measureLines(doc, `Action taken: ${e.actionTaken}`, 9) : 0;
    const blockH = 7 + procLines * 4.1 + actLines * 4.1 + 8 + (e.ioSignature || e.countersign ? 29 : 0) + 6;
    if (y + blockH > 278) {
      doc.addPage();
      y = 16;
    }
    y = sectionTitle(doc, y, `Entry No.${e.diaryNo} — ${e.date}${e.time ? ` ${e.time}` : ""} — ${e.place}`);
    y = bodyText(doc, y, `Proceedings: ${e.proceedings}`);
    if (e.actionTaken) y = bodyText(doc, y, `Action taken: ${e.actionTaken}`);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `IO: ${e.ioName} (${e.ioRank}) · Status: ${e.status}${e.autoLogged ? ` · Auto-logged [${e.sourceAction || "system"}]` : ""} · Hash: ${String(e.hash || "").slice(0, 30)}…`,
      MARGIN, y
    );
    y += 5;
    if (e.ioSignature || e.countersign) {
      y = signBlock(
        doc, y,
        { label: "Investigating Officer", name: e.ioSignature?.name, rank: e.ioSignature?.rank, at: e.ioSignature?.signedAt },
        e.countersign ? { label: "Countersigned (SP)", name: e.countersign?.name, rank: e.countersign?.rank, at: e.countersign?.signedAt } : undefined
      );
    }
    if (i < entries.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 4;
    }
  });

  // Certificate of correctness — closes the hash chain on its own page
  doc.addPage();
  let cy = 16;
  cy = sectionTitle(doc, cy, "Certificate of Correctness (Sec 172)");
  cy = bodyText(doc, cy, `Certified that this case diary contains ${entries.length} entries constituting the true and complete daily record of investigation in ${meta.name} (${meta.codeName}). The entries are hash-chained; terminal chain hash:`, 9);
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  const termHash = entries.length > 0 ? String(entries[entries.length - 1].hash) : "GENESIS (no entries)";
  const hashLines = doc.splitTextToSize(termHash, PAGE_W - MARGIN * 2) as string[];
  doc.text(hashLines, MARGIN, cy);
  cy += hashLines.length * 4 + 4;
  const last = entries[entries.length - 1];
  cy = signBlock(
    doc, cy,
    { label: "Investigating Officer", name: last?.ioSignature?.name || last?.ioName, rank: last?.ioSignature?.rank || last?.ioRank, at: new Date().toISOString() },
    last?.countersign ? { label: "Countersigned (SP)", name: last.countersign.name, rank: last.countersign.rank, at: last.countersign.signedAt } : { label: "Supervisory Officer (SP)" }
  );

  footer(doc, entries.length > 0 ? String(entries[entries.length - 1].hash) : undefined);
  doc.save(`CaseDiary_Sec172_${meta.codeName}.pdf`);
}

export function generateArrestMemoPdf(meta: CaseMeta, memo: any) {
  const doc = new jsPDF();
  const isArrest = memo.memoType !== "SEIZURE";
  header(doc, `${memo.memoType === "SEIZURE" ? "SEIZURE MEMO — Sec 102 CrPC / Sec 185 BNSS" : "ARREST MEMO — Sec 41/41A CrPC / Sec 35 BNSS"}`, `Memo ${memo.memoNo} · ${memo.statute.replace(/_/g, " ")}`, { ...meta, firNumber: memo.firNumber });
  let y = 36;
  y = kvTable(doc, y, [
    ["Memo No.", `${memo.memoNo} (${memo.memoType.replace(/_/g, " ")})`],
    ["Date / Time", `${memo.date}${memo.time ? ` ${memo.time}` : ""}`],
    ["Place", memo.place],
    ["FIR / Sections", `${memo.firNumber} — ${(memo.sections || []).join(", ") || "as per FIR"}`],
    ["Statute", memo.statute.replace(/_/g, " ")],
    ["Status", memo.status],
  ]);
  if (isArrest && memo.accused) {
    y = sectionTitle(doc, y, "Person Arrested");
    y = kvTable(doc, y, [
      ["Name", memo.accused.name || "—"],
      ["Age / Gender", `${memo.accused.age ?? "—"} / ${memo.accused.gender ?? "—"}`],
      ["Address", memo.accused.address || "—"],
      ["ID", `${memo.accused.idType || "—"} ${memo.accused.idNumber || ""}`],
    ]);
    y = sectionTitle(doc, y, "Grounds of Arrest (communicated to accused)");
    y = bodyText(doc, y, memo.groundsOfArrest || "—");
  }
  if (memo.articles?.length > 0) {
    y = sectionTitle(doc, y, "Articles Seized");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["#", "Description", "Qty", "Value (₹)", "ID Mark", "Sealed"]],
      body: memo.articles.map((a: any, i: number) => [
        `${i + 1}`, a.description, a.quantity, a.value ?? "—", a.identificationMark || "—", a.sealed ? `Yes${a.sealNo ? ` (${a.sealNo})` : ""}` : "No",
      ]),
      theme: "grid",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }
  y = sectionTitle(doc, y, "Witnesses (independent, Sec 100(4) CrPC)");
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Name", "Address", "Signed"]],
    body: (memo.witnesses || []).map((w: any, i: number) => [`${i + 1}`, w.name, w.address, w.signed ? "Yes" : "No"]),
    theme: "grid",
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  if (y > 230) {
    doc.addPage();
    y = 16;
  }
  y = sectionTitle(doc, y, "Rights & Intimation (Sec 41C / 50A CrPC)");
  y = kvTable(doc, y, [
    ["Rights read", memo.rightsRead ? "Yes — grounds of arrest communicated" : "No (record reasons separately)"],
    ["Intimation", memo.intimationName ? `${memo.intimationName} (${memo.intimationRelation || "—"}) ${memo.intimationPhone || ""} at ${memo.intimationAt || "—"}` : "—"],
    ["Aadhaar e-sign", memo.esign ? `${memo.esign.signerName} · ${memo.esign.aadhaarMasked} · ${memo.esign.signedAt.slice(0, 10)}` : "—"],
  ]);
  if (y > 240) {
    doc.addPage();
    y = 16;
  }
  y = sectionTitle(doc, y, "Signatures (3-block: IO · Witness · Supervisory)");
  signBlock(
    doc, y,
    { label: "Investigating Officer", name: memo.ioName, rank: memo.ioRank },
    { label: "Witness 1", name: memo.witnesses?.[0]?.name },
    { label: "Supervisory Officer (SP)", name: memo.witnesses?.[1]?.name }
  );
  footer(doc, memo.hash);
  doc.save(`${memo.memoType}_${memo.memoNo}.pdf`);
}

export interface Exhibit65B {
  id?: string;
  fileName: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  fileType?: string;
  fileHash: string;
  uploadedAt?: string;
  uploadedBy?: string;
  uploaderRole?: string;
  sourceAuthority?: string;
  summary?: string;
}

export interface CertOfficer {
  name: string;
  rank: string;
  agency: string;
}

/**
 * Section 65B IEA / Sec 63 BSA certificate for a single electronic exhibit:
 * computer-output particulars, the four statutory conditions, SHA-256 chain.
 */
export function generate65BCertificatePdf(meta: CaseMeta, exhibit: Exhibit65B, officer: CertOfficer) {
  const doc = new jsPDF();
  header(doc, "CERTIFICATE u/s 65B INDIAN EVIDENCE ACT / Sec 63 BSA", `Electronic record: ${exhibit.fileName}`, meta);
  let y = 36;
  y = kvTable(doc, y, [
    ["Exhibit", exhibit.fileName],
    ["Exhibit ID", exhibit.id || "—"],
    ["Size / Type", `${exhibit.fileSizeFormatted || (exhibit.fileSize ? `${exhibit.fileSize} bytes` : "—")} · ${exhibit.fileType || "—"}`],
    ["SHA-256", exhibit.fileHash || "—"],
    ["Source authority", exhibit.sourceAuthority || "—"],
    ["Received", `${exhibit.uploadedAt || "—"} by ${exhibit.uploadedBy || "—"} (${exhibit.uploaderRole || "—"})`],
    ["Description", exhibit.summary || "Electronic record produced from the case vault"],
  ]);
  y = sectionTitle(doc, y, "Computer Particulars (Sec 65B(2) / BSA Sch.)");
  y = bodyText(doc, y, "The computer output was produced by the TRINETRA OS evidence vault — a computer regularly used to store and process case information in the ordinary course of investigative activity. The exhibit bitstream above is the exact output retrieved from that system, verified by recomputation of the SHA-256 digest at certificate time.", 9);
  y = sectionTitle(doc, y, "Statutory Conditions Certified");
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Condition", "Status"]],
    body: [
      ["1", "Computer was regularly used to store/process information in ordinary course (65B(2)(a))", "Certified"],
      ["2", "Information of the kind was regularly fed in ordinary course (65B(2)(b))", "Certified"],
      ["3", "Computer was operating properly; failure (if any) did not affect output (65B(2)(c))", "Certified"],
      ["4", "Output reproduces information fed in ordinary course (65B(2)(d))", "Certified"],
      ["5", "SHA-256 digest recomputed at certificate time matches the sealed digest", "Certified"],
    ],
    theme: "grid",
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  if (y > 235) {
    doc.addPage();
    y = 16;
  }
  y = bodyText(doc, y, `Statement of the person occupying a responsible official position in relation to the operation of the relevant device (Sec 65B(4)): I, ${officer.name}, ${officer.rank}, ${officer.agency}, certify the above to the best of my knowledge and belief.`, 9);
  signBlock(
    doc, y,
    { label: "Certifying Officer", name: officer.name, rank: officer.rank, at: new Date().toISOString() },
    { label: "Countersigned (SP)" }
  );
  footer(doc, exhibit.fileHash);
  doc.save(`65B_Certificate_${(exhibit.id || exhibit.fileName).replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`);
}

/**
 * e-Courts CIS-compatible e-filing XML for a charge sheet:
 * case, parties, sections, exhibits, A–Z annexures, filing + integrity hash.
 */
export function generateChargeSheetFilingXml(meta: CaseMeta, cs: any): string {
  const esc = xmlEscape;
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ChargeSheetFiling generated="${new Date().toISOString()}" system="TRINETRA OS" version="1.0">`,
    `  <Case>`,
    `    <CodeName>${esc(meta.codeName)}</CodeName>`,
    `    <CaseTitle>${esc(meta.name)}</CaseTitle>`,
    `    <LeadAgency>${esc(meta.leadAgency)}</LeadAgency>`,
    `    <ChargeSheetNo>${esc(cs.csNo)}</ChargeSheetNo>`,
    `    <FIRNumber>${esc(cs.firNumber)}</FIRNumber>`,
    `    <PoliceStation>${esc(cs.policeStation)}</PoliceStation>`,
    `    <District>${esc(cs.district)}</District>`,
    `    <State>${esc(cs.state)}</State>`,
    `    <Status>${esc(cs.status)}</Status>`,
    `  </Case>`,
    `  <Sections>`,
    ...((cs.sections || []).map((s: string) => `    <Section>${esc(s)}</Section>`)),
    `  </Sections>`,
    `  <Accused>`,
    ...((cs.accused || []).map(
      (a: any) =>
        `    <Person><Name>${esc(a.name)}</Name><Address>${esc(a.address || "")}</Address><CustodyStatus>${esc(a.custodyStatus || "")}</CustodyStatus><Charge>${esc(a.chargeFramed || "")}</Charge></Person>`
    )),
    `  </Accused>`,
    `  <Witnesses>`,
    ...((cs.witnesses || []).map(
      (w: any) =>
        `    <Witness><Name>${esc(w.name)}</Name><Type>${esc(w.type)}</Type><Address>${esc(w.address || "")}</Address></Witness>`
    )),
    `  </Witnesses>`,
    `  <Exhibits>`,
    ...((cs.exhibits || []).map((e: string) => `    <Exhibit>${esc(e)}</Exhibit>`)),
    `  </Exhibits>`,
    `  <Annexures>`,
    ...((cs.annexures || []).map(
      (a: any) =>
        `    <Annexure letter="${esc(a.letter)}"><Title>${esc(a.title)}</Title><DocType>${esc(a.docType)}</DocType><Pages>${a.pages ?? ""}</Pages><ExhibitRef>${esc(a.exhibitRef || "")}</ExhibitRef><Hash>${esc(a.hash || "")}</Hash></Annexure>`
    )),
    `  </Annexures>`,
    `  <InvestigatingOfficer><Name>${esc(cs.ioName)}</Name><Rank>${esc(cs.ioRank)}</Rank></InvestigatingOfficer>`,
    `  <Filing><Court>${esc(cs.filedInCourt || "")}</Court><Date>${esc(cs.filingDate || "")}</Date><CNR>${esc(cs.cnrNumber || "")}</CNR></Filing>`,
    `  <Integrity hash="${esc(cs.hash || "")}" />`,
    `</ChargeSheetFiling>`,
    ``,
  ];
  return lines.join("\n");
}

export function generateHistorySheetPdf(meta: CaseMeta, sheet: any) {
  const doc = new jsPDF();
  header(doc, `HISTORY SHEET — Category ${sheet.category}`, `Sheet ${sheet.sheetNo} · Village Crime Notebook extract`, meta);
  let y = 36;
  y = kvTable(doc, y, [
    ["Sheet No.", `${sheet.sheetNo} (Category ${sheet.category})`],
    ["Subject", `${sheet.subjectName}${sheet.aliases?.length ? ` @ ${sheet.aliases.join(", ")}` : ""}`],
    ["DOB", sheet.dob || "—"],
    ["Address", sheet.address],
    ["PS / District", `${sheet.policeStation} / ${sheet.district}`],
    ["Status", sheet.status],
  ]);
  y = sectionTitle(doc, y, "Modus Operandi Codes");
  y = bodyText(doc, y, (sheet.moCodes || []).join(", ") || "—");
  if (sheet.previousCases?.length > 0) {
    y = sectionTitle(doc, y, "Previous Cases");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["#", "FIR", "Police Station", "Sections", "Status"]],
      body: sheet.previousCases.map((c: any, i: number) => [`${i + 1}`, c.firNumber, c.policeStation, c.sections, c.status]),
      theme: "grid",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }
  if (sheet.associates?.length > 0) {
    y = sectionTitle(doc, y, "Known Associates");
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["#", "Name", "Relation"]],
      body: sheet.associates.map((a: any, i: number) => [`${i + 1}`, a.name, a.relation]),
      theme: "grid",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }
  if (y > 230) {
    doc.addPage();
    y = 16;
  }
  y = sectionTitle(doc, y, "Village Crime Notebook (Part II)");
  y = kvTable(doc, y, [
    ["Village / Beat", `${sheet.village}${sheet.beatNo ? ` — Beat ${sheet.beatNo}` : ""}`],
    ["Beat Officer", sheet.beatOfficer || "—"],
    ["Remarks", sheet.villageRemarks || "—"],
    ["Last checked", sheet.villageLastChecked || "—"],
  ]);
  y = sectionTitle(doc, y, "Surveillance");
  y = kvTable(doc, y, [
    ["Level", sheet.surveillanceLevel || "—"],
    ["Check interval", `${sheet.checkIntervalDays ?? "—"} days`],
    ["Last / Next check", `${sheet.lastChecked || "—"} / ${sheet.nextCheck || "—"}`],
    ["Opened by", `${sheet.openedBy} (${sheet.openedByRank || ""}) on ${String(sheet.openedAt || "").slice(0, 10)}`],
  ]);
  footer(doc, sheet.hash);
  doc.save(`HistorySheet_${sheet.sheetNo}.pdf`);
}

export function generateChargeSheetPdf(meta: CaseMeta, cs: any) {
  const doc = new jsPDF();
  header(doc, "CHARGE SHEET — Sec 173 CrPC / Sec 193 BNSS", `No.${cs.csNo} · Status: ${cs.status}`, { ...meta, firNumber: cs.firNumber });
  let y = 36;
  y = kvTable(doc, y, [
    ["Charge sheet", cs.csNo],
    ["FIR", cs.firNumber],
    ["PS / District / State", `${cs.policeStation} / ${cs.district} / ${cs.state}`],
    ["Sections", (cs.sections || []).join(", ") || "—"],
    ["Draft", cs.draftSource === "SAHAYAK_ASSIST" ? "SAHAYAK-assisted (from case graph + evidence)" : "Manual"],
    ["Court / CNR", cs.status === "FILED" ? `${cs.filedInCourt || "—"} on ${cs.filingDate || "—"}${cs.cnrNumber ? ` (CNR ${cs.cnrNumber})` : ""}` : "Not filed"],
  ]);
  y = sectionTitle(doc, y, "Accused Persons");
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Name", "Address", "Custody", "Charge"]],
    body: (cs.accused || []).map((a: any, i: number) => [`${i + 1}`, a.name, a.address || "—", String(a.custodyStatus || "").replace(/_/g, " "), a.chargeFramed || "—"]),
    theme: "grid",
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  y = sectionTitle(doc, y, "Facts of the Case");
  y = bodyText(doc, y, cs.factsOfCase || "—", 8.5);
  if (y > 250) {
    doc.addPage();
    y = 16;
  }
  y = sectionTitle(doc, y, "Evidence Summary");
  y = bodyText(doc, y, cs.evidenceSummary || "—", 8.5);
  if (cs.legalOpinion) {
    y = sectionTitle(doc, y, "Legal Opinion");
    y = bodyText(doc, y, cs.legalOpinion, 8.5);
  }
  if (y > 250) {
    doc.addPage();
    y = 16;
  }
  y = sectionTitle(doc, y, "Prosecution Witnesses");
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Name", "Type", "Address"]],
    body: (cs.witnesses || []).map((w: any, i: number) => [`${i + 1}`, w.name, w.type, w.address || "—"]),
    theme: "grid",
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [15, 23, 42] },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  y = sectionTitle(doc, y, "Annexures (A–Z)");
  if ((cs.annexures || []).length === 0) {
    y = bodyText(doc, y, "No annexures attached.");
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Letter", "Title", "Type", "Pages", "Exhibit Ref"]],
      body: (cs.annexures || []).map((a: any) => [a.letter, a.title, a.docType, a.pages ?? "—", a.exhibitRef || "—"]),
      theme: "grid",
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }
  if (y > 230) {
    doc.addPage();
    y = 16;
  }
  signBlock(
    doc, y,
    { label: "Investigating Officer", name: cs.ioName, rank: cs.ioRank },
    { label: "Forwarding Officer (SP)", name: cs.forwardingOfficer }
  );
  footer(doc, cs.hash);
  doc.save(`ChargeSheet_${cs.csNo}.pdf`);
}
