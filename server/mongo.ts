import { MongoClient, Db, Collection } from "mongodb";
import type {
  DBUser,
  DBAccessRequest,
  DBCaseAccessRequest,
  DBCaseMember,
  DBEvidence,
  DBObservation,
  DBEntity,
  DBRelationship,
  DBInvestigationEvent,
  DBAuditLog,
  DBCaseDiary,
  DBArrestMemo,
  DBHistorySheet,
  DBCustodyRecord,
  DBChargeSheet,
  DBIngestionBatch,
  DBStagedEntity,
  DBStagedLink,
  DBInnocentItem,
  DBTransfer,
  DBCyberIncident,
  DBMeshPeer,
  DBRequisition,
  DBDossierSignature,
  DBCollabRequest,
} from "./db";

function eqFilter(query: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Vault documents always carry string _ids (no ObjectId dependency). */
export type VaultDoc = { _id: string; [key: string]: any };

function makeHelpers<T extends { _id: string }>(col: () => Collection<VaultDoc>) {
  return {
    async insertOne(doc: T): Promise<T> {
      await col().insertOne(doc as any);
      return doc;
    },
    async updateOne(id: string, updates: Partial<T>): Promise<T | null> {
      const updated = await col().findOneAndUpdate(
        { _id: id },
        { $set: updates as any },
        { returnDocument: "after" }
      );
      return (updated as unknown as T) || null;
    },
  };
}

/**
 * MongoDB vault backend implementing the same DAO surface as the memory
 * store. All record _ids are application strings (no ObjectId dependency).
 */
export async function createMongoBackend(uri: string, dbName: string): Promise<any> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const database: Db = client.db(dbName);

  const C = (name: string): Collection<VaultDoc> => database.collection<VaultDoc>(name);

  // Best-effort indexes for case-scoped reads (never fatal).
  const indexSpecs: Array<[string, any]> = [
    ["users", { email: 1 }],
    ["users", { official_id: 1 }],
    ["case_members", { case_id: 1, user_id: 1 }],
    ["entities", { case_id: 1 }],
    ["relationships", { case_id: 1 }],
    ["evidence", { case_id: 1 }],
    ["audit_logs", { case_id: 1 }],
    ["case_diary", { case_id: 1 }],
    ["staged_entities", { case_id: 1, batchId: 1 }],
    ["staged_links", { case_id: 1, batchId: 1 }],
    ["custody", { case_id: 1 }],
    ["cyber_incidents", { case_id: 1 }],
  ];
  await Promise.allSettled(
    indexSpecs.map(([col, spec]) => C(col).createIndex(spec))
  );

  const idHelpers = <T extends { _id: string }>(name: string) => {
    const h = makeHelpers<T>(() => C(name));
    return {
      ...h,
      findOne: async (id: string): Promise<T | null> =>
        (await C(name).findOne({ _id: id })) as unknown as T | null,
    };
  };

  return {
    users: {
      find: async (query: Partial<DBUser> = {}) =>
        (await C("users").find(eqFilter(query)).toArray()) as unknown as DBUser[],
      findOne: async (query: { _id?: string; email?: string; official_id?: string }) => {
        const ors: any[] = [];
        if (query._id) ors.push({ _id: query._id });
        if (query.email) ors.push({ email: { $regex: `^${escRe(query.email)}$`, $options: "i" } });
        if (query.official_id) ors.push({ official_id: { $regex: `^${escRe(query.official_id)}$`, $options: "i" } });
        if (ors.length === 0) return null;
        return (await C("users").findOne({ $or: ors })) as unknown as DBUser | null;
      },
      ...makeHelpers<DBUser>(() => C("users")),
      count: async () => C("users").countDocuments(),
    },

    access_requests: {
      find: async (query: Partial<DBAccessRequest> = {}) =>
        (await C("access_requests").find(eqFilter(query)).sort({ submitted_at: -1 }).toArray()) as unknown as DBAccessRequest[],
      ...idHelpers<DBAccessRequest>("access_requests"),
    },

    case_access_requests: {
      find: async (query: { case_id?: string; user_id?: string; status?: string } = {}) =>
        (await C("case_access_requests").find(eqFilter(query)).sort({ requested_at: -1 }).toArray()) as unknown as DBCaseAccessRequest[],
      findOne: async (id: string) =>
        (await C("case_access_requests").findOne({ _id: id })) as unknown as DBCaseAccessRequest | null,
      findOneByCaseAndUser: async (case_id: string, user_id: string) =>
        (await C("case_access_requests").findOne({ case_id, user_id, status: "PENDING" })) as unknown as DBCaseAccessRequest | null,
      ...makeHelpers<DBCaseAccessRequest>(() => C("case_access_requests")),
    },

    cases: {
      find: async () => (await C("cases").find({}).toArray()) as unknown as any[],
      findOne: async (id: string) => (await C("cases").findOne({ _id: id })) as unknown as any | null,
      insertOne: async (c: any) => {
        await C("cases").insertOne(c);
        return c;
      },
      updateOne: async (id: string, updates: Record<string, any>) => {
        const updated = await C("cases").findOneAndUpdate(
          { _id: id },
          { $set: updates as any },
          { returnDocument: "after" }
        );
        return updated as unknown as any;
      },
    },

    case_members: {
      find: async (query: { case_id?: string; user_id?: string }) =>
        (await C("case_members").find(eqFilter(query)).toArray()) as unknown as DBCaseMember[],
      findOne: async (query: { case_id: string; user_id: string }) =>
        (await C("case_members").findOne(query)) as unknown as DBCaseMember | null,
      ...makeHelpers<DBCaseMember>(() => C("case_members")),
      deleteOne: async (id: string) => (await C("case_members").deleteOne({ _id: id })).deletedCount > 0,
      deleteByCaseAndUser: async (case_id: string, user_id: string) =>
        (await C("case_members").deleteOne({ case_id, user_id })).deletedCount > 0,
    },

    evidence: {
      find: async (query: { case_id?: string; status?: string } = {}) =>
        (await C("evidence").find(eqFilter(query)).sort({ uploaded_at: -1 }).toArray()) as unknown as DBEvidence[],
      ...idHelpers<DBEvidence>("evidence"),
    },

    observations: {
      find: async (query: { case_id?: string; officer_id?: string; status?: string } = {}) =>
        (await C("observations").find(eqFilter(query)).sort({ timestamp: -1 }).toArray()) as unknown as DBObservation[],
      ...idHelpers<DBObservation>("observations"),
    },

    entities: {
      find: async (query: { case_id: string }) =>
        (await C("entities").find({ case_id: query.case_id }).toArray()) as unknown as DBEntity[],
      findOne: async (case_id: string, id: string) =>
        (await C("entities").findOne({ case_id, $or: [{ id }, { _id: id }] })) as unknown as DBEntity | null,
      upsertMany: async (list: DBEntity[]) => {
        if (list.length > 0) {
          await C("entities").bulkWrite(
            list.map((ent) => {
              const key = ent._id || `ent-${ent.case_id}-${ent.id}`;
              return {
                updateOne: { filter: { _id: key }, update: { $set: { ...ent, _id: key } }, upsert: true },
              };
            })
          );
        }
        return list;
      },
      insertOne: async (ent: DBEntity) => {
        const key = ent._id || `ent-${ent.case_id}-${ent.id}`;
        const doc = { ...ent, _id: key };
        await C("entities").insertOne(doc as any);
        return doc;
      },
      updateOne: async (id: string, updates: Partial<DBEntity>) => {
        const updated = await C("entities").findOneAndUpdate({ _id: id }, { $set: updates as any }, { returnDocument: "after" });
        return (updated as unknown as DBEntity) || null;
      },
    },

    relationships: {
      find: async (query: { case_id: string }) =>
        (await C("relationships").find({ case_id: query.case_id }).toArray()) as unknown as DBRelationship[],
      upsertMany: async (list: DBRelationship[]) => {
        if (list.length > 0) {
          await C("relationships").bulkWrite(
            list.map((rel) => {
              const key = rel._id || `rel-${rel.case_id}-${rel.id}`;
              return {
                updateOne: { filter: { _id: key }, update: { $set: { ...rel, _id: key } }, upsert: true },
              };
            })
          );
        }
        return list;
      },
      insertOne: async (rel: DBRelationship) => {
        const key = rel._id || `rel-${rel.case_id}-${rel.id}`;
        const doc = { ...rel, _id: key };
        await C("relationships").insertOne(doc as any);
        return doc;
      },
      updateOne: async (id: string, updates: Partial<DBRelationship>) => {
        const updated = await C("relationships").findOneAndUpdate({ _id: id }, { $set: updates as any }, { returnDocument: "after" });
        return (updated as unknown as DBRelationship) || null;
      },
    },

    investigation_events: {
      find: async (query: { case_id?: string } = {}) =>
        (await C("investigation_events").find(eqFilter(query)).sort({ timestamp: -1 }).toArray()) as unknown as DBInvestigationEvent[],
      insertOne: async (ev: DBInvestigationEvent) => {
        await C("investigation_events").insertOne(ev as any);
        return ev;
      },
    },

    audit_logs: {
      find: async (query: { case_id?: string; user_id?: string } = {}) =>
        (await C("audit_logs").find(eqFilter(query)).sort({ timestamp: -1 }).toArray()) as unknown as DBAuditLog[],
      insertOne: async (log: DBAuditLog) => {
        await C("audit_logs").insertOne(log as any);
        return log;
      },
    },

    firs: {
      find: async (case_id: string) =>
        (await C("firs").find({ case_id }).toArray()) as unknown as any[],
      insertOne: async (fir: any) => {
        await C("firs").insertOne(fir);
        return fir;
      },
    },

    cdrs: {
      find: async (case_id: string) =>
        (await C("cdrs").find({ case_id }).toArray()) as unknown as any[],
      insertMany: async (items: any[]) => {
        if (items.length > 0) await C("cdrs").insertMany(items);
        return items;
      },
    },

    financials: {
      find: async (case_id: string) =>
        (await C("financials").find({ case_id }).toArray()) as unknown as any[],
      insertMany: async (items: any[]) => {
        if (items.length > 0) await C("financials").insertMany(items);
        return items;
      },
    },

    intels: {
      find: async (case_id: string) =>
        (await C("intels").find({ case_id }).toArray()) as unknown as any[],
      insertOne: async (intel: any) => {
        await C("intels").insertOne(intel);
        return intel;
      },
    },

    case_diary: {
      find: async (case_id: string) =>
        (await C("case_diary").find({ case_id }).sort({ diaryNo: 1 }).toArray()) as unknown as DBCaseDiary[],
      ...idHelpers<DBCaseDiary>("case_diary"),
    },

    arrest_memos: {
      find: async (case_id: string) =>
        (await C("arrest_memos").find({ case_id }).sort({ created_at: -1 }).toArray()) as unknown as DBArrestMemo[],
      ...idHelpers<DBArrestMemo>("arrest_memos"),
    },

    history_sheets: {
      find: async (case_id: string) =>
        (await C("history_sheets").find({ case_id }).sort({ created_at: 1 }).toArray()) as unknown as DBHistorySheet[],
      ...idHelpers<DBHistorySheet>("history_sheets"),
    },

    custody: {
      find: async (case_id: string) =>
        (await C("custody").find({ case_id }).sort({ created_at: 1 }).toArray()) as unknown as DBCustodyRecord[],
      ...idHelpers<DBCustodyRecord>("custody"),
    },

    charge_sheets: {
      find: async (case_id: string) =>
        (await C("charge_sheets").find({ case_id }).sort({ created_at: 1 }).toArray()) as unknown as DBChargeSheet[],
      ...idHelpers<DBChargeSheet>("charge_sheets"),
    },

    ingestion_batches: {
      find: async (case_id: string) =>
        (await C("ingestion_batches").find({ case_id }).sort({ submittedAt: -1 }).toArray()) as unknown as DBIngestionBatch[],
      ...idHelpers<DBIngestionBatch>("ingestion_batches"),
    },

    staged_entities: {
      find: async (case_id: string, status?: string) =>
        (await C("staged_entities").find(status ? { case_id, status } : { case_id }).sort({ created_at: 1 }).toArray()) as unknown as DBStagedEntity[],
      findOne: async (id: string) =>
        (await C("staged_entities").findOne({ _id: id })) as unknown as DBStagedEntity | null,
      insertMany: async (items: DBStagedEntity[]) => {
        if (items.length > 0) await C("staged_entities").insertMany(items as any);
        return items;
      },
      updateOne: async (id: string, updates: Partial<DBStagedEntity>) => {
        const updated = await C("staged_entities").findOneAndUpdate({ _id: id }, { $set: updates as any }, { returnDocument: "after" });
        return (updated as unknown as DBStagedEntity) || null;
      },
      deleteOne: async (id: string) => (await C("staged_entities").deleteOne({ _id: id })).deletedCount > 0,
    },

    staged_links: {
      find: async (case_id: string, status?: string) =>
        (await C("staged_links").find(status ? { case_id, status } : { case_id }).sort({ created_at: 1 }).toArray()) as unknown as DBStagedLink[],
      findOne: async (id: string) =>
        (await C("staged_links").findOne({ _id: id })) as unknown as DBStagedLink | null,
      insertMany: async (items: DBStagedLink[]) => {
        if (items.length > 0) await C("staged_links").insertMany(items as any);
        return items;
      },
      updateOne: async (id: string, updates: Partial<DBStagedLink>) => {
        const updated = await C("staged_links").findOneAndUpdate({ _id: id }, { $set: updates as any }, { returnDocument: "after" });
        return (updated as unknown as DBStagedLink) || null;
      },
      deleteOne: async (id: string) => (await C("staged_links").deleteOne({ _id: id })).deletedCount > 0,
    },

    innocent_pool: {
      find: async (case_id: string) =>
        (await C("innocent_pool").find({ case_id }).sort({ rejectedAt: -1 }).toArray()) as unknown as DBInnocentItem[],
      ...idHelpers<DBInnocentItem>("innocent_pool"),
    },

    transfers: {
      find: async (case_id: string) =>
        (await C("transfers").find({ case_id }).sort({ requestedAt: -1 }).toArray()) as unknown as DBTransfer[],
      ...idHelpers<DBTransfer>("transfers"),
    },

    cyber_incidents: {
      find: async (case_id: string, kind?: string) =>
        (await C("cyber_incidents").find(kind ? { case_id, kind } : { case_id }).sort({ created_at: -1 }).toArray()) as unknown as DBCyberIncident[],
      ...idHelpers<DBCyberIncident>("cyber_incidents"),
    },

    mesh_peers: {
      find: async () =>
        (await C("mesh_peers").find({}).sort({ created_at: 1 }).toArray()) as unknown as DBMeshPeer[],
      ...idHelpers<DBMeshPeer>("mesh_peers"),
      deleteOne: async (id: string) => (await C("mesh_peers").deleteOne({ _id: id })).deletedCount > 0,
    },

    requisitions: {
      find: async (query: { case_id?: string; status?: string } = {}) =>
        (await C("requisitions").find(eqFilter(query)).sort({ requested_at: -1 }).toArray()) as unknown as DBRequisition[],
      ...idHelpers<DBRequisition>("requisitions"),
    },

    dossier_signatures: {
      find: async (query: { case_id?: string } = {}) =>
        (await C("dossier_signatures").find(eqFilter(query)).sort({ signed_at: -1 }).toArray()) as unknown as DBDossierSignature[],
      ...idHelpers<DBDossierSignature>("dossier_signatures"),
    },

    collab_requests: {
      find: async (query: { from_state?: string; to_state?: string; status?: string } = {}) =>
        (await C("collab_requests").find(eqFilter(query)).sort({ requested_at: -1 }).toArray()) as unknown as DBCollabRequest[],
      ...idHelpers<DBCollabRequest>("collab_requests"),
    },

    // ---- Admin: cascade-delete a case + every case-scoped record ----
    deleteCaseCascade: async (caseId: string) => {
      const memberCount = await C("case_members").countDocuments({ case_id: caseId });
      const evidenceCount = await C("evidence").countDocuments({ case_id: caseId });
      const caseScoped = [
        "case_members",
        "evidence",
        "entities",
        "relationships",
        "firs",
        "cdrs",
        "financials",
        "intels",
        "observations",
        "investigation_events",
        "audit_logs",
        "case_diary",
        "arrest_memos",
        "history_sheets",
        "custody",
        "charge_sheets",
        "cyber_incidents",
        "ingestion_batches",
        "staged_entities",
        "staged_links",
        "innocent_pool",
        "transfers",
        "requisitions",
        "case_access_requests",
        "dossier_signatures",
      ];
      await Promise.all(caseScoped.map((name) => C(name).deleteMany({ case_id: caseId })));
      await C("cases").deleteOne({ _id: caseId });
      await C("cases").deleteOne({ id: caseId } as any);
      return { memberCount, evidenceCount };
    },
  };
}
