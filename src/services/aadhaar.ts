/**
 * Aadhaar number validation (Verhoeff checksum, as specified by UIDAI)
 * plus privacy masking. Used for e-sign blocks on arrest/seizure memos.
 */

const D_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P_TABLE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 7, 2, 5],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function normalizeAadhaar(input: string): string {
  return (input || "").replace(/[\s-]/g, "");
}

export function verhoeffCheck(digits: string): boolean {
  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = D_TABLE[c][P_TABLE[i % 8][parseInt(reversed[i], 10)]];
  }
  return c === 0;
}

export function validateAadhaar(input: string): { ok: boolean; reason: string } {
  const digits = normalizeAadhaar(input);
  if (!/^\d{12}$/.test(digits)) {
    return { ok: false, reason: "Aadhaar must be exactly 12 digits." };
  }
  if (/^(\d)\1{11}$/.test(digits)) {
    return { ok: false, reason: "Aadhaar cannot be a repeated digit." };
  }
  if (!verhoeffCheck(digits)) {
    return { ok: false, reason: "Aadhaar checksum (Verhoeff) failed — number is invalid." };
  }
  return { ok: true, reason: "Valid Aadhaar (Verhoeff checksum passed)." };
}

export function maskAadhaar(input: string): string {
  const digits = normalizeAadhaar(input);
  if (digits.length !== 12) return "XXXX-XXXX-XXXX";
  return `XXXX-XXXX-${digits.slice(8)}`;
}
