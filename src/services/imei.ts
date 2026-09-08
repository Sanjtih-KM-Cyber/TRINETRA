/**
 * IMEI validation (15 digits, Luhn check digit per 3GPP TS 22.016) for
 * CEIR blocking/tracking requests. Shared by client forms and the server.
 */

export function normalizeImei(input: string): string {
  return (input || "").replace(/[\s-]/g, "");
}

export function luhnCheck(digits: string): boolean {
  let sum = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    let d = parseInt(reversed[i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function validateImei(input: string): { ok: boolean; reason: string } {
  const digits = normalizeImei(input);
  if (!/^\d{15}$/.test(digits)) {
    return { ok: false, reason: "IMEI must be exactly 15 digits." };
  }
  if (!luhnCheck(digits)) {
    return { ok: false, reason: "IMEI check digit (Luhn) failed — number is invalid." };
  }
  return { ok: true, reason: "Valid IMEI (Luhn check digit passed)." };
}

/** NCRP acknowledgement numbers are 14 digits beginning with 3. */
export function validateNcrpAck(input: string): { ok: boolean; reason: string } {
  const digits = (input || "").replace(/[\s-]/g, "");
  if (!/^3\d{13}$/.test(digits)) {
    return { ok: false, reason: "NCRP acknowledgement must be 14 digits starting with 3." };
  }
  return { ok: true, reason: "Valid NCRP acknowledgement format." };
}
