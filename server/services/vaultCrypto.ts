/**
 * VAULT ENVELOPE ENCRYPTION — real AES-256-GCM encryption at rest.
 *
 * Every new upload (exhibit raw text, observation narratives), every staged
 * batch blob (raw content, readable text, AI brief), every generated
 * charge-sheet narrative and every case-diary proceeding is encrypted before
 * it touches the store (Mongo or the memory vault snapshot) and decrypted
 * transparently on read — so the frontend never sees ciphertext and no API
 * contract changes.
 *
 * Envelope format:  enc:v1:<base64( iv(12) || ciphertext || tag(16) )>
 * Legacy plaintext rows (written before this module existed) pass through
 * untouched on both write and read, so enabling encryption never garbles
 * existing data.
 */
import crypto from "crypto";

export const VAULT_PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Text-blob fields encrypted per collection. Deliberately display-only
 * blobs: none of these fields is ever used in a query predicate or sort,
 * so encrypting them cannot break lookups.
 */
export const VAULT_FIELDS: Record<string, string[]> = {
  evidence: ["raw_text"],
  observations: ["narrative"],
  ingestion_batches: ["content", "readableContent", "aiBrief"],
  charge_sheets: ["factsOfCase", "evidenceSummary", "legalOpinion"],
  case_diary: ["proceedings", "actionTaken"],
};

let cachedKey: Buffer | null = null;
let keyMode: "env-key" | "derived-dev-key" = "derived-dev-key";
let keyLogged = false;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = (process.env.VAULT_ENCRYPTION_KEY || "").trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      cachedKey = Buffer.from(raw, "hex");
      keyMode = "env-key";
    } else {
      const asB64 = Buffer.from(raw, "base64");
      if (asB64.length === 32 && raw.length >= 40) {
        cachedKey = asB64;
        keyMode = "env-key";
      } else {
        // Passphrase form — stretched to 32 bytes (persistent across restarts).
        cachedKey = crypto.scryptSync(raw, "trinetra-vault-v1", 32);
        keyMode = "env-key";
      }
    }
  } else {
    // Dev fallback: persistent derivation (stable across restarts, so the
    // memory snapshot and Mongo rows stay readable). Production MUST set
    // VAULT_ENCRYPTION_KEY — logged loudly below.
    const secret = process.env.JWT_SECRET || "trinetra-os-national-security-vault-key-2026";
    cachedKey = crypto.scryptSync(`vault:${secret}`, "trinetra-vault-v1", 32);
    keyMode = "derived-dev-key";
  }
  if (!keyLogged) {
    keyLogged = true;
    if (keyMode === "env-key") {
      console.log("[VAULT] At-rest encryption active (AES-256-GCM, env key). Uploads, briefs, diaries, charge sheets encrypted; reads decrypt transparently.");
    } else {
      console.warn("[VAULT] VAULT_ENCRYPTION_KEY unset — using derived dev key (persistent, but set a dedicated 32-byte VAULT_ENCRYPTION_KEY in production). AES-256-GCM active.");
    }
  }
  return cachedKey;
}

export function isVaultEncrypted(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(VAULT_PREFIX);
}

/** Encrypt a single string value. Non-strings pass through untouched. */
export function encryptVaultText(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0 || value.startsWith(VAULT_PREFIX)) return value;
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VAULT_PREFIX + Buffer.concat([iv, ct, tag]).toString("base64");
}

/**
 * Decrypt a single envelope value. Plaintext (legacy rows) passes through.
 * On auth failure returns a clear marker — never garbled base64 to the UI.
 */
export function decryptVaultText(value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith(VAULT_PREFIX)) return value;
  try {
    const key = resolveKey();
    const blob = Buffer.from(value.slice(VAULT_PREFIX.length), "base64");
    if (blob.length < IV_LEN + TAG_LEN + 1) throw new Error("short envelope");
    const iv = blob.subarray(0, IV_LEN);
    const tag = blob.subarray(blob.length - TAG_LEN);
    const ct = blob.subarray(IV_LEN, blob.length - TAG_LEN);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (err: any) {
    console.error(`[VAULT] Decrypt failed (${err?.message || err}) — wrong VAULT_ENCRYPTION_KEY or corrupt envelope.`);
    return "[vault unreadable — encryption key mismatch]";
  }
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function encryptDoc(collection: string, doc: any): any {
  const fields = VAULT_FIELDS[collection];
  if (!fields || !isPlainObject(doc)) return doc;
  let out = doc;
  for (const f of fields) {
    const v = (doc as any)[f];
    if (typeof v === "string" && v.length > 0 && !v.startsWith(VAULT_PREFIX)) {
      if (out === doc) out = { ...doc };
      (out as any)[f] = encryptVaultText(v);
    }
  }
  return out;
}

function decryptDoc(collection: string, doc: any): any {
  const fields = VAULT_FIELDS[collection];
  if (!fields || !isPlainObject(doc)) return doc;
  let out = doc;
  for (const f of fields) {
    const v = (doc as any)[f];
    if (typeof v === "string" && v.startsWith(VAULT_PREFIX)) {
      if (out === doc) out = { ...doc };
      (out as any)[f] = decryptVaultText(v);
    }
  }
  return out;
}

function decryptResult(collection: string, res: any): any {
  if (Array.isArray(res)) return res.map((d) => decryptDoc(collection, d));
  return decryptDoc(collection, res);
}

function wrapCollection(collection: string, col: any): any {
  return new Proxy(col, {
    get(t: any, prop: string | symbol, _r: any) {
      const orig = t[prop as string];
      if (typeof orig !== "function") return orig;
      if (prop === "insertOne") {
        return async (doc: any) => decryptResult(collection, await orig.call(t, encryptDoc(collection, doc)));
      }
      if (prop === "insertMany" || prop === "upsertMany") {
        return async (list: any) =>
          decryptResult(collection, await orig.call(t, Array.isArray(list) ? list.map((d) => encryptDoc(collection, d)) : list));
      }
      if (prop === "updateOne") {
        return async (id: any, updates: any) =>
          decryptResult(collection, await orig.call(t, id, encryptDoc(collection, updates)));
      }
      return async (...args: any[]) => decryptResult(collection, await orig.apply(t, args));
    },
  });
}

/**
 * Wrap a whole DB backend so covered collections encrypt on write and
 * decrypt on read. Method shapes are identical across the memory and
 * Mongo backends, so one proxy covers both. Non-covered collections and
 * non-doc results (booleans, counts) pass through untouched.
 */
export function withVaultCryptoBackend<T extends object>(backend: T): T {
  const cache = new Map<string, any>();
  return new Proxy(backend as any, {
    get(t: any, prop: string | symbol, _r: any) {
      if (typeof prop === "string" && VAULT_FIELDS[prop]) {
        const col = t[prop];
        if (col && typeof col === "object") {
          let w = cache.get(prop);
          if (!w) {
            w = wrapCollection(prop, col);
            cache.set(prop, w);
          }
          return w;
        }
      }
      return t[prop as string];
    },
  }) as T;
}

/** Surfaced in /api/health — proof the vault is really encrypted. */
export function vaultCryptoStatus(): {
  encrypted: boolean;
  algorithm: string;
  mode: "env-key" | "derived-dev-key";
  collections: Record<string, string[]>;
} {
  resolveKey();
  return { encrypted: true, algorithm: "aes-256-gcm", mode: keyMode, collections: VAULT_FIELDS };
}
