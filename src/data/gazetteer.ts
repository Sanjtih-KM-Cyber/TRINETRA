/**
 * Gazetteer — known Indian landmarks for staging-time geocoding.
 * When an ingested entity's label/address matches a known place,
 * the pipeline attaches coordinates so it appears on the map.
 */
export interface GazetteerEntry {
  names: string[];
  lat: number;
  lng: number;
  label: string;
}

export const GAZETTEER: GazetteerEntry[] = [
  { names: ["taj mahal palace", "taj hotel", "taj", "apollo bunder"], lat: 18.9217, lng: 72.833, label: "Taj Mahal Palace, Colaba" },
  { names: ["gateway of india", "gateway"], lat: 18.922, lng: 72.8347, label: "Gateway of India" },
  { names: ["oberon", "oberoi trident", "oberoi", "nariman point"], lat: 18.927, lng: 72.82, label: "Oberoi, Nariman Point" },
  { names: ["nariman house", "chabad house"], lat: 18.917, lng: 72.831, label: "Nariman House, Colaba" },
  { names: ["cst", "csmt", "chatrapati shivaji terminus", "victoria terminus", "chhatrapati shivaji"], lat: 18.9401, lng: 72.8356, label: "CST Station" },
  { names: ["leopold", "leopold cafe"], lat: 18.923, lng: 72.8315, label: "Leopold Cafe, Colaba" },
  { names: ["machhimar", "machhimar nagar", "koliwada", "badwar park"], lat: 18.912, lng: 72.823, label: "Machhimar Nagar, Colaba" },
  { names: ["girgaum", "girgaon chowpatty", "chowpatty"], lat: 18.9514, lng: 72.81, label: "Girgaum Chowpatty" },
  { names: ["marine drive", "queen's necklace", "queens necklace"], lat: 18.944, lng: 72.823, label: "Marine Drive" },
  { names: ["juhu", "juhu beach", "santacruz"], lat: 19.1075, lng: 72.8263, label: "Juhu" },
  { names: ["andheri", "chakala"], lat: 19.1136, lng: 72.8697, label: "Andheri" },
  { names: ["bandra", "bandra-worli sea link", "sea link"], lat: 19.0596, lng: 72.8295, label: "Bandra" },
  { names: ["dadar", "dadar station"], lat: 19.0176, lng: 72.8561, label: "Dadar" },
  { names: ["dongri", "dongri jail road"], lat: 18.9614, lng: 72.8373, label: "Dongri" },
  { names: ["vashi", "vashi toll", "vashi plaza"], lat: 19.0688, lng: 72.9984, label: "Vashi Toll Plaza" },
  { names: ["nhava sheva", "nhava", "jnpt", "container terminal"], lat: 18.9507, lng: 72.9515, label: "Nhava Sheva Port" },
  { names: ["connaught place", "janpath"], lat: 28.6315, lng: 77.2167, label: "Connaught Place, Delhi" },
  { names: ["karachi", "clifton karachi", "defence karachi"], lat: 24.8607, lng: 67.0011, label: "Karachi" },
];

export function matchGazetteer(text: string): GazetteerEntry | null {
  const t = (text || "").toLowerCase();
  if (!t) return null;
  // Longest matching alias wins ("leopold cafe" beats bare "colaba").
  let best: GazetteerEntry | null = null;
  let bestLen = 0;
  for (const entry of GAZETTEER) {
    for (const n of entry.names) {
      if (n.length > bestLen && t.includes(n)) {
        best = entry;
        bestLen = n.length;
      }
    }
  }
  return best;
}
