import crypto from "crypto";
import { db, DBEvidence, DBEntity, DBRelationship, DBObservation, DBInvestigationEvent, DBAuditLog, DBRole } from "../db";
import { broadcastCaseUpdate } from "../realtime";
import { extractEntitiesUniversal, parseCDRCSV, parseFinancialCSV, extractEntitiesRuleBased } from "../../src/services/nlpExtractor";
import { stageCandidates } from "./stagingService";
// Normalizers live in the Reconstructor (single home for all intake paths).
import { normalizePhoneNumber, normalizeVehiclePlate, normalizeText } from "./reconstructor";
export { normalizePhoneNumber, normalizeVehiclePlate, normalizeText };

export interface IngestionActor {
  id: string;
  name: string;
  role: DBRole;
  badge?: string;
  agency?: string;
}

export interface IngestionInput {
  caseId: string;
  actor: IngestionActor;
  sourceAuthority?: string;
  fileName?: string;
  fileType: string;
  rawText: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  summary?: string;
  /**
   * stageOnly: structure + stage for Lead review instead of writing the
   * main graph. Field, forensic and cyber intake always use this — only
   * the Lead's own workstation commits directly.
   */
  stageOnly?: boolean;
  observationMetadata?: {
    observationType?:
      | "SUSPECT_SIGHTING"
      | "LOCATION_SURVEILLANCE"
      | "VEHICLE_TRACKING"
      | "FIELD_INTEL_NOTE"
      | "RELATIONSHIP_OBSERVED";
    locationName?: string;
    lat?: number;
    lng?: number;
    relatedEntities?: Array<{
      id?: string;
      label: string;
      type: string;
      role?: string;
    }>;
    observedRelationships?: Array<{
      sourceId: string;
      targetId: string;
      relationType: string;
      notes?: string;
    }>;
    attachments?: Array<{
      id: string;
      fileName: string;
      fileType: string;
      fileSizeFormatted: string;
      sha256: string;
      mediaCategory: "PHOTO" | "AUDIO" | "VIDEO" | "DOCUMENT";
    }>;
    tags?: string[];
    confidenceScore?: number;
  };
}

export interface IngestionResult {
  success: boolean;
  evidenceRecord?: DBEvidence;
  observationRecord?: DBObservation;
  resolvedEntities: DBEntity[];
  extractedRelationships: DBRelationship[];
  stagedBatchId?: string;
  pipelineStages: {
    validation: "PASSED";
    normalization: "PASSED";
    classification: string;
    metadataExtraction: {
      sha256: string;
      timestamp: string;
    };
    deduplication: {
      mergedCount: number;
      createdCount: number;
    };
    relationshipExtraction: {
      count: number;
      provenance: string;
    };
    canonicalStorage: "COMMITTED" | "STAGED_FOR_REVIEW";
    eventEmission: "BROADCASTED";
  };
}

export async function processIngestionPipeline(input: IngestionInput): Promise<IngestionResult> {
  const { caseId, actor, sourceAuthority, fileName, fileType, rawText, fileSize, fileSizeFormatted, summary, observationMetadata, stageOnly } = input;
  const now = new Date().toISOString();

  // STAGE 1: VALIDATION
  if (!caseId) throw new Error("Validation Error: Case ID is mandatory.");
  if (!actor || !actor.id || !actor.name) throw new Error("Validation Error: Actor credentials must be authenticated.");
  if (!rawText && !observationMetadata) throw new Error("Validation Error: Ingestion payload cannot be empty.");

  const targetCase = await db.cases.findOne(caseId);
  if (!targetCase) throw new Error(`Validation Error: Target case workspace '${caseId}' not found.`);

  // STAGE 2: NORMALIZATION
  const normalizedRaw = normalizeText(rawText);
  const normalizedFileName = fileName ? fileName.trim() : `Exhibit_${Date.now()}`;
  const effectiveAuthority = sourceAuthority?.trim() || `${actor.agency || "National Intelligence Service"} Evidence Locker`;

  // STAGE 3: CLASSIFICATION
  let classificationCategory = "FORENSIC_EXHIBIT";
  if (fileType === "CDR_CSV") classificationCategory = "TELECOM_CDR";
  else if (fileType === "FINANCIAL_CSV") classificationCategory = "FINANCIAL_LEDGER";
  else if (observationMetadata || fileType === "FIELD_OBSERVATION") classificationCategory = "FIELD_OBSERVATION";
  else if (fileType === "FIR" || fileType === "PDF") classificationCategory = "CRIMINAL_RECORD";

  // STAGE 4: METADATA EXTRACTION & CRYPTOGRAPHIC PROVENANCE
  const contentToDigest = `${normalizedFileName}:${fileType}:${normalizedRaw}:${now}:${actor.id}`;
  const sha256Checksum = `sha256:${crypto.createHash("sha256").update(contentToDigest).digest("hex")}`;
  const exhibitId = `EVID-${Date.now().toString().slice(-6)}`;

  // STAGE 5: DEDUPLICATION & ENTITY RESOLUTION
  // Fetch existing entities in canonical case database
  const existingEntities = await db.entities.find({ case_id: caseId });
  const entityMapByLabel = new Map<string, DBEntity>();
  const entityMapById = new Map<string, DBEntity>();

  for (const ent of existingEntities) {
    entityMapByLabel.set(ent.label.toLowerCase().trim(), ent);
    entityMapById.set(ent.id, ent);
    if (ent.aliases) {
      for (const alias of ent.aliases) {
        entityMapByLabel.set(alias.toLowerCase().trim(), ent);
      }
    }
  }

  let candidateNodes: any[] = [];
  let candidateLinks: any[] = [];

  if (observationMetadata) {
    // Field Observation Entity Extraction
    if (observationMetadata.relatedEntities) {
      candidateNodes = observationMetadata.relatedEntities.map((re, idx) => ({
        id: re.id || `field-ent-${Date.now()}-${idx}`,
        label: re.label,
        type: re.type || "PERSON",
        role: re.role || "Investigative Subject",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        riskScore: 75,
        confidence: observationMetadata.confidenceScore || 0.95,
        details: { source: "Field Observation", notes: observationMetadata.locationName },
      }));
    }

    if (observationMetadata.observedRelationships) {
      candidateLinks = observationMetadata.observedRelationships.map((rel, idx) => ({
        id: `field-rel-${Date.now()}-${idx}`,
        source: rel.sourceId,
        target: rel.targetId,
        relationType: rel.relationType || "ASSOCIATED_WITH",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        provenance: "FIELD_OBSERVATION" as const,
        status: "VERIFIED" as const,
        creator_id: actor.id,
        creator_name: actor.name,
        creator_role: actor.role,
        weight: 0.9,
        details: rel.notes || `Direct field observation by ${actor.name} (${actor.badge || actor.role}).`,
        confidence: observationMetadata.confidenceScore || 0.95,
      }));
    }
  } else if (fileType === "CDR_CSV") {
    const parsed = parseCDRCSV(normalizedRaw);
    const tempNodeMap = new Map<string, any>();
    parsed.forEach((rec, idx) => {
      const aPartyNorm = normalizePhoneNumber(rec.aParty);
      const bPartyNorm = normalizePhoneNumber(rec.bParty);
      const aId = `phone-${aPartyNorm.replace(/\D/g, "")}`;
      const bId = `phone-${bPartyNorm.replace(/\D/g, "")}`;

      if (!tempNodeMap.has(aId)) {
        tempNodeMap.set(aId, {
          id: aId,
          label: aPartyNorm,
          type: "PHONE",
          riskScore: 65,
          confidence: 0.95,
          details: { phone: aPartyNorm, imei: rec.imeiA, towerLocation: rec.towerLocation },
        });
      }
      if (!tempNodeMap.has(bId)) {
        tempNodeMap.set(bId, {
          id: bId,
          label: bPartyNorm,
          type: "PHONE",
          riskScore: 60,
          confidence: 0.9,
          details: { phone: bPartyNorm, imei: rec.imeiB, towerLocation: rec.towerLocation },
        });
      }
      candidateLinks.push({
        id: `cdr-rel-${Date.now()}-${idx}`,
        source: aId,
        target: bId,
        relationType: "CALLS",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        provenance: "CDR_TRIANGULATION" as const,
        status: "VERIFIED" as const,
        creator_id: actor.id,
        creator_name: actor.name,
        creator_role: actor.role,
        weight: 0.9,
        frequency: 1,
        durationSec: rec.durationSec,
        timestamp: rec.timestamp,
        confidence: 0.95,
        details: `Call record tower ${rec.towerLocation} (Duration: ${rec.durationSec}s)`,
      });
    });
    candidateNodes = Array.from(tempNodeMap.values());
  } else if (fileType === "FINANCIAL_CSV") {
    const parsed = parseFinancialCSV(normalizedRaw);
    const tempNodeMap = new Map<string, any>();
    parsed.forEach((rec, idx) => {
      const senderId = `acc-${rec.senderAcc.replace(/\W/g, "")}`;
      const receiverId = `acc-${rec.receiverAcc.replace(/\W/g, "")}`;

      if (!tempNodeMap.has(senderId)) {
        tempNodeMap.set(senderId, {
          id: senderId,
          label: rec.senderName || rec.senderAcc,
          type: "ACCOUNT",
          riskScore: rec.isSmurfingFlag ? 85 : 55,
          confidence: 0.95,
          details: { accountNumber: rec.senderAcc, bankName: rec.bankName },
        });
      }
      if (!tempNodeMap.has(receiverId)) {
        tempNodeMap.set(receiverId, {
          id: receiverId,
          label: rec.receiverName || rec.receiverAcc,
          type: "ACCOUNT",
          riskScore: rec.isSmurfingFlag ? 85 : 55,
          confidence: 0.95,
          details: { accountNumber: rec.receiverAcc, bankName: rec.bankName },
        });
      }
      candidateLinks.push({
        id: `fin-rel-${Date.now()}-${idx}`,
        source: senderId,
        target: receiverId,
        relationType: "FINANCIAL_TRANSFER",
        category: "EVIDENCE",
        reviewState: "CONFIRMED",
        provenance: "FINANCIAL_LEDGER" as const,
        status: "VERIFIED" as const,
        creator_id: actor.id,
        creator_name: actor.name,
        creator_role: actor.role,
        weight: 0.95,
        amount: rec.amount,
        timestamp: rec.timestamp,
        confidence: 0.98,
        details: `Transaction ₹${rec.amount.toLocaleString("en-IN")} via ${rec.mode} (UTR: ${rec.utrNumber})`,
      });
    });
    candidateNodes = Array.from(tempNodeMap.values());
} else {
      // FIR, Document, OCR, or general text - use multi-provider universal extraction
      try {
        const nlp = await extractEntitiesUniversal(normalizedRaw, normalizedFileName);
        candidateNodes = nlp.nodes;
        candidateLinks = nlp.links.map((l: any, idx: number) => ({
          ...l,
          id: l.id || `nlp-rel-${Date.now()}-${idx}`,
          provenance: "FORENSIC_EXTRACTION" as const,
          status: "EXTRACTED" as const,
          creator_id: actor.id,
          creator_name: actor.name,
          creator_role: actor.role,
        }));
      } catch {
        const fallback = extractEntitiesRuleBased(normalizedRaw);
        candidateNodes = fallback.nodes;
        candidateLinks = fallback.links.map((l: any, idx: number) => ({
          ...l,
          id: l.id || `rule-rel-${Date.now()}-${idx}`,
          provenance: "FORENSIC_EXTRACTION" as const,
          status: "EXTRACTED" as const,
          creator_id: actor.id,
          creator_name: actor.name,
          creator_role: actor.role,
        }));
      }
    }

  // Deduplicate Candidate Entities against Canonical DB
  const resolvedEntities: DBEntity[] = [];
  let mergedCount = 0;
  let createdCount = 0;

  for (const cand of candidateNodes) {
    const key = cand.label.toLowerCase().trim();
    const existing = entityMapByLabel.get(key) || entityMapById.get(cand.id);

    if (existing) {
      mergedCount++;
      const updatedEvidenceIds = Array.from(new Set([...(existing.evidence_ids || []), exhibitId]));
      const updatedAliases = Array.from(new Set([...(existing.aliases || []), ...(cand.aliases || [])]));
      const mergedEntity: DBEntity = {
        ...existing,
        aliases: updatedAliases,
        evidence_ids: updatedEvidenceIds,
        updated_at: now,
      };
      resolvedEntities.push(mergedEntity);
      entityMapById.set(existing.id, mergedEntity);
    } else {
      createdCount++;
      const newEntity: DBEntity = {
        _id: `ent-${caseId}-${cand.id}`,
        case_id: caseId,
        id: cand.id,
        label: cand.label,
        type: cand.type || "PERSON",
        category: cand.category || "EVIDENCE",
        reviewState: cand.reviewState || "CONFIRMED",
        role: cand.role || "Investigative Subject",
        aliases: cand.aliases || [],
        riskScore: cand.riskScore || 70,
        confidence: cand.confidence || 0.9,
        details: cand.details || {},
        evidence_ids: [exhibitId],
        sourceDocumentIds: [exhibitId],
        created_at: now,
        updated_at: now,
      };
      resolvedEntities.push(newEntity);
      entityMapByLabel.set(key, newEntity);
      entityMapById.set(newEntity.id, newEntity);
    }
  }

  // STAGE 6: RELATIONSHIP EXTRACTION & PROVENANCE ASSIGNMENT
  const extractedRelationships: DBRelationship[] = candidateLinks.map((l: any, idx: number) => {
    const srcId = typeof l.source === "object" ? l.source.id : l.source;
    const tgtId = typeof l.target === "object" ? l.target.id : l.target;
    return {
      _id: `rel-${caseId}-${l.id || `rel-${Date.now()}-${idx}`}`,
      case_id: caseId,
      id: l.id || `rel-${Date.now()}-${idx}`,
      source: srcId,
      target: tgtId,
      relationType: l.relationType || "ASSOCIATED_WITH",
      category: l.category || "EVIDENCE",
      reviewState: l.reviewState || "CONFIRMED",
      provenance: l.provenance || (observationMetadata ? "FIELD_OBSERVATION" : "FORENSIC_EXTRACTION"),
      status: l.status || "VERIFIED",
      creator_id: actor.id,
      creator_name: actor.name,
      creator_role: actor.role,
      source_record_id: exhibitId,
      weight: l.weight || 0.8,
      frequency: l.frequency,
      amount: l.amount,
      durationSec: l.durationSec,
      timestamp: l.timestamp || now,
      details: l.details || `Extracted from exhibit ${normalizedFileName}`,
      evidence_ids: [exhibitId],
      source_type: fileType,
      confidence: l.confidence || 0.9,
      flags: l.flags || [],
    };
  });

  // STAGE 7: CANONICAL STORAGE
  // 1. Evidence record
  const evidenceRecord: DBEvidence = {
    _id: exhibitId,
    case_id: caseId,
    file_name: normalizedFileName,
    file_size: fileSize || normalizedRaw.length,
    file_size_formatted: fileSizeFormatted || `${(normalizedRaw.length / 1024).toFixed(1)} KB`,
    file_type: fileType,
    file_hash: sha256Checksum,
    uploaded_at: now,
    uploaded_by: actor.name,
    uploader_role: actor.role,
    status: "COMMITTED",
    source_authority: effectiveAuthority,
    summary: summary || `Ingested by ${actor.name} (${actor.role}). Extracted ${resolvedEntities.length} entities & ${extractedRelationships.length} relationships.`,
    raw_text: normalizedRaw,
    extracted_entities_count: resolvedEntities.length,
    extracted_relations_count: extractedRelationships.length,
    extracted_entities: resolvedEntities,
    extracted_relations: extractedRelationships,
  };
  await db.evidence.insertOne(evidenceRecord);

  // 2. Field Observation record (if applicable)
  let observationRecord: DBObservation | undefined;
  if (observationMetadata) {
    const obsId = `obs-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    observationRecord = {
      _id: obsId,
      case_id: caseId,
      observation_type: observationMetadata.observationType || "FIELD_INTEL_NOTE",
      title: normalizedFileName,
      narrative: normalizedRaw,
      location_name: observationMetadata.locationName || "Operational Field Location",
      lat: observationMetadata.lat,
      lng: observationMetadata.lng,
      timestamp: now,
      officer_id: actor.id,
      officer_name: actor.name,
      officer_role: actor.role,
      officer_badge: actor.badge || "N/A",
      related_entities: (observationMetadata.relatedEntities || []).map((re) => ({
        id: re.id || "unspecified",
        label: re.label,
        type: re.type,
        role_in_observation: re.role,
      })),
      observed_relationships: (observationMetadata.observedRelationships || []).map((or) => ({
        source_id: or.sourceId,
        target_id: or.targetId,
        relation_type: or.relationType,
        notes: or.notes,
      })),
      attachments: (observationMetadata.attachments || []).map((att) => ({
        id: att.id,
        file_name: att.fileName,
        file_type: att.fileType,
        file_size_formatted: att.fileSizeFormatted,
        sha256: att.sha256,
        media_category: att.mediaCategory,
      })),
      status: "INTEGRATED_IN_CASE",
      confidence_score: observationMetadata.confidenceScore || 0.95,
      tags: observationMetadata.tags || ["FIELD_OBSERVATION"],
      created_at: now,
    };
    await db.observations.insertOne(observationRecord);
  }

  // 3-4. Graph write OR staging. stageOnly keeps the main graph untouched —
  // Lead review admits each item explicitly.
  let stagedBatchId: string | undefined;
  if (stageOnly) {
    const labelById = new Map(resolvedEntities.map((e) => [e.id, e.label]));
    const toStageLinks = extractedRelationships
      .filter((l) => labelById.has(String(l.source)) && labelById.has(String(l.target)))
      .map((l) => ({
        sourceLabel: labelById.get(String(l.source))!,
        targetLabel: labelById.get(String(l.target))!,
        relationType: l.relationType,
        weight: l.weight,
        frequency: l.frequency,
        amount: l.amount,
        details: l.details,
        evidenceRef: exhibitId,
        locator: undefined as string | undefined,
      }));
    const stagingSource =
      fileType === "CDR_CSV" || fileType === "FINANCIAL_CSV"
        ? fileType
        : observationMetadata
        ? "INTEL_REPORT"
        : fileType === "FIR" || fileType === "PDF"
        ? "FIR"
        : "CYBER_LOG";
    const staged = await stageCandidates({
      caseId,
      source: stagingSource,
      fileName: normalizedFileName,
      enrichment: "PIPELINE_UNIVERSAL",
      provider: "universal extraction pipeline",
      entities: resolvedEntities.map((e) => ({
        label: e.label,
        type: e.type,
        role: e.role,
        riskScore: e.riskScore,
        confidence: e.confidence,
        details: e.details,
        evidenceRef: exhibitId,
        locator: undefined as string | undefined,
      })),
      links: toStageLinks,
      actor: { _id: actor.id, name: actor.name, official_id: actor.badge || "", email: "", password_hash: "", agency: actor.agency || "", designation: actor.role, department: "", role: actor.role, status: "ACTIVE", created_at: now } as any,
      note: `Staged from ${fileType} via ingestion pipeline (${mergedCount} would-be merges held for review).`,
      content: normalizedRaw,
    });
    stagedBatchId = staged.batchId;
  } else {
    // 3. Upsert Entities
    if (resolvedEntities.length > 0) {
      await db.entities.upsertMany(resolvedEntities);
    }

    // 4. Upsert Relationships
    if (extractedRelationships.length > 0) {
      await db.relationships.upsertMany(extractedRelationships);
    }
  }

  // 5. Investigation Event
  const eventRecord: DBInvestigationEvent = {
    _id: `ev-${Date.now()}`,
    case_id: caseId,
    event_type: observationMetadata ? "FIELD_OBSERVATION_INTEGRATED" : stageOnly ? "INTELLIGENCE_STAGED" : "INTELLIGENCE_INGESTED",
    title: observationMetadata ? `Field Intel: ${normalizedFileName}` : stageOnly ? `Staged Intake: ${normalizedFileName}` : `Exhibit Intake: ${normalizedFileName}`,
    description: stageOnly
      ? `Staged ${resolvedEntities.length} entities and ${extractedRelationships.length} relationships for Lead review.`
      : `Integrated ${resolvedEntities.length} entities and ${extractedRelationships.length} relationships into case graph.`,
    timestamp: now,
    actor_id: actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
  };
  await db.investigation_events.insertOne(eventRecord);

  // 6. Cryptographic Audit Log
  const auditDigest = crypto
    .createHash("sha256")
    .update(`${exhibitId}:${resolvedEntities.length}:${extractedRelationships.length}:${now}`)
    .digest("hex");

  const auditLog: DBAuditLog = {
    _id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now,
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role,
    action: observationMetadata ? "FIELD_OBSERVATION_SUBMITTED" : stageOnly ? "INTELLIGENCE_STAGED" : "INGEST_EVIDENCE_PIPELINE",
    case_id: caseId,
    resource_id: exhibitId,
    target_label: normalizedFileName,
    details: stageOnly
      ? `Officer ${actor.name} (${actor.role}) staged ${resolvedEntities.length} entities and ${extractedRelationships.length} relationships from exhibit ${normalizedFileName} for Lead review (batch ${stagedBatchId}).`
      : `Officer ${actor.name} (${actor.role}) committed ${resolvedEntities.length} entities (${mergedCount} merged, ${createdCount} new) and ${extractedRelationships.length} relationships from exhibit ${normalizedFileName}.`,
    digital_hash: `sha256:${auditDigest}`,
    result: "SUCCESS",
  };
  await db.audit_logs.insertOne(auditLog);

  // STAGE 8: REAL-TIME EVENT EMISSION
  if (stageOnly) {
    broadcastCaseUpdate(caseId, {
      event_type: "STAGING_UPDATED",
      title: "New Intake Staged for Review",
      message: `${actor.name} (${actor.role}) staged ${resolvedEntities.length} entities & ${extractedRelationships.length} links from ${normalizedFileName}.`,
      changes: {
        new_evidence: 1,
        new_entities: resolvedEntities.length,
        new_relationships: extractedRelationships.length,
        new_alerts: 1,
      },
      evidence_id: exhibitId,
      actor_name: actor.name,
      actor_role: actor.role,
    });
  } else {
    broadcastCaseUpdate(caseId, {
      event_type: observationMetadata ? "FIELD_OBSERVATION_INTEGRATED" : "EVIDENCE_COMMITTED",
      title: observationMetadata ? "New Field Observation Integrated" : "New Intelligence Ingested",
      message: `${actor.name} (${actor.role}) added ${resolvedEntities.length} entities & ${extractedRelationships.length} links to ${caseId}.`,
      changes: {
        new_evidence: 1,
        new_entities: resolvedEntities.length,
        new_relationships: extractedRelationships.length,
        new_alerts: 1,
      },
      evidence_id: exhibitId,
      actor_name: actor.name,
      actor_role: actor.role,
    });
  }

  return {
    success: true,
    evidenceRecord,
    observationRecord,
    resolvedEntities,
    extractedRelationships,
    stagedBatchId,
    pipelineStages: {
      validation: "PASSED",
      normalization: "PASSED",
      classification: classificationCategory,
      metadataExtraction: {
        sha256: sha256Checksum,
        timestamp: now,
      },
      deduplication: {
        mergedCount,
        createdCount,
      },
      relationshipExtraction: {
        count: extractedRelationships.length,
        provenance: extractedRelationships[0]?.provenance || "FORENSIC_EXTRACTION",
      },
      canonicalStorage: stageOnly ? "STAGED_FOR_REVIEW" : "COMMITTED",
      eventEmission: "BROADCASTED",
    },
  };
}
