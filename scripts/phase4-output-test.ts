/**
 * Phase 4 — output artifact verification (run with tsx, no server needed):
 *   npx tsx scripts/phase4-output-test.ts
 * Generates all legal PDFs + e-filing XML, extracts PDF text with pdfjs,
 * and asserts on real content. Exit 0 = pass, 1 = fail.
 */
import fs from "fs";
import {
  generateCaseDiaryPdf,
  generateArrestMemoPdf,
  generateHistorySheetPdf,
  generateChargeSheetPdf,
  generate65BCertificatePdf,
  generateChargeSheetFilingXml,
} from "../src/services/legalPdf";

const OUT = "C:/Users/Sanji/AppData/Local/Temp/opencode/phase4-output";
fs.mkdirSync(OUT, { recursive: true });
process.chdir(OUT);

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(label: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

async function pdfText(file: string): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await (pdfjs as any).getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str || "").join(" ") + "\n";
  }
  const pages = doc.numPages;
  if (typeof doc.destroy === "function") await doc.destroy().catch(() => undefined);
  return { text, pages };
}

function xmlWellFormed(xml: string): boolean {
  const tagRe = /<\/?([A-Za-z][\w.-]*)(?:\s[^<>]*)?\/?>/g;
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  const first = xml.trimStart();
  if (!first.startsWith("<?xml")) return false;
  while ((m = tagRe.exec(xml))) {
    const full = m[0];
    const name = m[1];
    if (full.startsWith("<?") || full.startsWith("<!")) continue;
    if (full.endsWith("/>")) continue;
    if (full.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

async function main() {
  const meta = { name: "Operation Garuda", codeName: "OP-GARUDA-2026", leadAgency: "NCB" };

  console.log("[ diary — 12 long entries, keep-together + certificate ]");
  const entries = Array.from({ length: 12 }, (_, i) => ({
    diaryNo: i + 1,
    date: "2026-09-07",
    time: "22:40",
    place: `Location ${i + 1}`,
    proceedings: `Proceedings paragraph ${i + 1}. ` + "Surveillance detail recorded with corroborating observations across multiple lines. ".repeat(12),
    actionTaken: "Follow-up ordered. ".repeat(6),
    ioName: "V. Rathore",
    ioRank: "SP",
    status: i % 2 === 0 ? "COUNTERSIGNED" : "SIGNED",
    hash: `sha256:hash${i}`,
    ioSignature: { name: "V. Rathore", rank: "SP", signedAt: "2026-09-07T10:00:00Z" },
    countersign: i % 2 === 0 ? { name: "DG", rank: "DGP", signedAt: "2026-09-07T12:00:00Z" } : undefined,
  }));
  generateCaseDiaryPdf(meta, entries);
  const diary = await pdfText(`${OUT}/CaseDiary_Sec172_OP-GARUDA-2026.pdf`);
  const diaryText = diary.text;
  const diaryPages = diary.pages;
  check("diary multi-page", diaryPages >= 3, `pages=${diaryPages}`);
  check("diary certificate page", diaryText.includes("Certificate of Correctness"));
  check("diary page numbers", /Page \d+ of \d+/.test(diaryText));
  check("diary SP countersign", diaryText.includes("Countersigned"));

  console.log("[ memo — 3-signature block ]");
  generateArrestMemoPdf(meta, {
    memoNo: "AM-2026-001",
    memoType: "ARREST_CUM_SEIZURE",
    statute: "CRPC_41",
    date: "2026-09-07",
    place: "Vashi",
    firNumber: "FIR No. 209/2026",
    sections: ["NDPS Sec 21"],
    accused: { name: "K. Saluja", address: "Navi Mumbai" },
    groundsOfArrest: "Caught with contraband.",
    articles: [{ description: "MDMA", quantity: "12", sealed: true }],
    witnesses: [{ name: "R. Pawar", address: "Vashi", signed: true }, { name: "S. Jadhav", address: "Turbhe", signed: false }],
    rightsRead: true,
    ioName: "V. Gaikwad",
    ioRank: "Inspector",
    status: "FILED",
    hash: "sha256:memo1",
  });
  const memoText = (await pdfText(`${OUT}/ARREST_CUM_SEIZURE_AM-2026-001.pdf`)).text;
  check("memo supervisory block", memoText.includes("Supervisory"));
  check("memo witness block", memoText.includes("Witness 1"));

  console.log("[ 65B certificate ]");
  generate65BCertificatePdf(
    meta,
    {
      id: "EVID-002",
      fileName: "CDR_Dump.csv",
      fileSizeFormatted: "18.4 MB",
      fileType: "CDR_CSV",
      fileHash: "sha256:3a1b4c9e",
      uploadedAt: "2026-08-14",
      uploadedBy: "S. Deshmukh",
      uploaderRole: "FORENSIC_INVESTIGATOR",
      sourceAuthority: "Nodal Cyber Ops",
      summary: "Tower dump",
    },
    { name: "S. Deshmukh", rank: "Forensic Lead", agency: "DFS" }
  );
  const certText = (await pdfText(`${OUT}/65B_Certificate_EVID-002.pdf`)).text;
  check("65B four conditions", certText.includes("65B(2)(a)") && certText.includes("65B(2)(d)"));
  check("65B hash present", certText.includes("sha256:3a1b4c9e"));
  check("65B countersign", certText.includes("Countersigned"));

  console.log("[ charge sheet + e-filing XML ]");
  const cs = {
    csNo: "CS-2026-001",
    firNumber: "FIR No. 209/2026",
    policeStation: "Special Cell",
    district: "New Delhi",
    state: "Delhi",
    sections: ["NDPS Sec 21", "BNS Sec 111"],
    accused: [{ name: "K. Saluja & Sons <Pvt>", address: "Navi Mumbai", custodyStatus: "JUDICIAL_CUSTODY", chargeFramed: "Carrier" }],
    witnesses: [{ name: "R. Pawar", type: "PROSECUTION", address: "Vashi" }],
    exhibits: ["EVID-001"],
    factsOfCase: "1. FIR. 2. Seizure.",
    evidenceSummary: "Ex.1 memo.",
    legalOpinion: "Sanction verified.",
    annexures: [
      { letter: "A", title: "Seizure memo", docType: "Memo", pages: 4, exhibitRef: "Ex.1" },
      { letter: "B", title: "CDR & analysis", docType: "Technical", pages: 22, exhibitRef: "Ex.2" },
    ],
    ioName: "V. Rathore",
    ioRank: "SP",
    forwardingOfficer: "DCP",
    draftSource: "MANUAL",
    status: "FILED",
    filedInCourt: "NDPS Court",
    filingDate: "2026-09-07",
    cnrNumber: "MHCC01",
    hash: "sha256:cs1",
  };
  generateChargeSheetPdf(meta, cs);
  const csText = (await pdfText(`${OUT}/ChargeSheet_CS-2026-001.pdf`)).text;
  check("charge sheet annexures", csText.includes("Annexures") && csText.includes("Seizure memo"));
  const xml = generateChargeSheetFilingXml(meta, cs);
  fs.writeFileSync(`${OUT}/eFiling_CS-2026-001.xml`, xml);
  check("XML well-formed", xmlWellFormed(xml));
  check("XML escapes specials", xml.includes("K. Saluja &amp; Sons &lt;Pvt&gt;"));
  for (const tag of ["ChargeSheetNo", "FIRNumber", "Accused", "Annexure letter=", "CNR", "Integrity"]) {
    check(`XML has ${tag}`, xml.includes(tag));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("Failures:", failures.join(" | "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("SUITE CRASH:", e);
  process.exit(1);
});
