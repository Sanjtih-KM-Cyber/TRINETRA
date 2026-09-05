import {
  CriminalHistoryQuery,
  CriminalRecord,
  ICCTNSAdapter,
} from "../types";

/**
 * CCTNS/ICJS Adapter — real-data contract only.
 *
 * Queries the backend CCTNS gateway (/api/cctns/*), which in production
 * proxies to the state CCTNS/ICJS service over the authorized channel.
 * No hardcoded records: if the gateway is not configured, every call
 * throws a descriptive error and nothing is fabricated.
 */

const GATEWAY_BASE = "/api/cctns";

async function postGateway<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 501) {
      throw new Error(
        "CCTNS gateway is not configured on this workstation. Contact the system administrator to enable the state CCTNS/ICJS channel (VPN + service credentials)."
      );
    }
    const text = await res.text().catch(() => "");
    throw new Error(`CCTNS gateway error (${res.status}): ${text || "no further detail"}`);
  }
  return (await res.json()) as T;
}

async function getGateway<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 501) {
      throw new Error(
        "CCTNS gateway is not configured on this workstation. Contact the system administrator to enable the state CCTNS/ICJS channel (VPN + service credentials)."
      );
    }
    const text = await res.text().catch(() => "");
    throw new Error(`CCTNS gateway error (${res.status}): ${text || "no further detail"}`);
  }
  return (await res.json()) as T;
}

export class CCTNSAdapter implements ICCTNSAdapter {
  async queryHistory(query: CriminalHistoryQuery): Promise<CriminalRecord> {
    const data = await postGateway<{ record: CriminalRecord }>("/history", query);
    if (!data || !data.record) {
      throw new Error("CCTNS gateway returned no record for the supplied identifier.");
    }
    return data.record;
  }

  async getCaseDetails(
    firNumber: string,
    state: string
  ): Promise<{
    firNumber: string;
    date: string;
    policeStation: string;
    district: string;
    state: string;
    sections: string[];
    complainant: string;
    accused: string[];
    briefNarrative: string;
    status: string;
  }> {
    const data = await getGateway<{
      case: {
        firNumber: string;
        date: string;
        policeStation: string;
        district: string;
        state: string;
        sections: string[];
        complainant: string;
        accused: string[];
        briefNarrative: string;
        status: string;
      };
    }>(`/case?firNumber=${encodeURIComponent(firNumber)}&state=${encodeURIComponent(state)}`);
    if (!data || !data.case) {
      throw new Error(`No case ${firNumber} returned by the CCTNS gateway.`);
    }
    return data.case;
  }

  async searchByBiometric(fingerprintId: string): Promise<CriminalRecord | null> {
    const data = await postGateway<{ record: CriminalRecord | null }>("/biometric", {
      fingerprintId,
    });
    return data && data.record ? data.record : null;
  }
}

export function createCCTNSAdapter(): ICCTNSAdapter {
  return new CCTNSAdapter();
}
