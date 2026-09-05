import { Router, Response } from "express";
import { db } from "../db";
import { authenticateToken, requireCaseMembership, requireRole, AuthenticatedRequest } from "../auth";
import { processIngestionPipeline } from "../services/ingestionPipeline";

const router = Router();

router.use(authenticateToken);

// 1. Get all field observations for a case
router.get("/:caseId/observations", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const observations = await db.observations.find({ case_id: caseId });
  res.json({ observations });
});

// 2. Submit new Field Observation via Unified Ingestion Pipeline
router.post("/:caseId/observations", requireCaseMembership, requireRole(["ADMIN", "LEAD_INVESTIGATOR", "INVESTIGATOR", "INSPECTOR"]), async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const {
    observationType,
    title,
    narrative,
    locationName,
    lat,
    lng,
    relatedEntities,
    observedRelationships,
    attachments,
    tags,
    confidenceScore,
  } = req.body;

  if (!title || !narrative) {
    res.status(400).json({ error: "Observation title and narrative are required." });
    return;
  }

  try {
    const result = await processIngestionPipeline({
      caseId,
      actor: {
        id: user._id,
        name: user.name,
        role: user.role,
        badge: user.official_id,
        agency: user.agency,
      },
      fileName: title,
      fileType: "FIELD_OBSERVATION",
      rawText: narrative,
      sourceAuthority: `${user.agency} Field Interdiction Unit`,
      summary: `Field observation '${title}' logged at ${locationName || "Field Location"} by Inspector ${user.name}.`,
      observationMetadata: {
        observationType: observationType || "SUSPECT_SIGHTING",
        locationName: locationName || "Field Location",
        lat,
        lng,
        relatedEntities: relatedEntities || [],
        observedRelationships: observedRelationships || [],
        attachments: attachments || [],
        tags: tags || ["FIELD_OBSERVATION"],
        confidenceScore: confidenceScore || 0.95,
      },
    });

    res.status(201).json({
      success: true,
      message: "Field observation successfully validated, processed, and integrated into canonical case dataset.",
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process field observation ingestion." });
  }
});

// 3. Submit Field Intelligence Report / Memo
router.post("/:caseId/field-report", requireCaseMembership, requireRole(["ADMIN", "LEAD_INVESTIGATOR", "INVESTIGATOR", "INSPECTOR"]), async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const user = req.user!;
  const { title, reportType, textContent, locationName } = req.body;

  if (!title || !textContent) {
    res.status(400).json({ error: "Report title and text content are required." });
    return;
  }

  try {
    const result = await processIngestionPipeline({
      caseId,
      actor: {
        id: user._id,
        name: user.name,
        role: user.role,
        badge: user.official_id,
        agency: user.agency,
      },
      fileName: title,
      fileType: reportType || "TEXT_DOC",
      rawText: textContent,
      sourceAuthority: `${user.agency} Field Unit`,
      summary: `Field Report submitted by ${user.name} (${user.official_id}).`,
    });

    res.status(201).json({
      success: true,
      message: "Field report processed and candidate intelligence committed to case graph.",
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to submit field report." });
  }
});

// 4. Live Case Activity Feed for Field Officers
router.get("/:caseId/field-feed", requireCaseMembership, async (req: AuthenticatedRequest, res: Response) => {
  const { caseId } = req.params;
  const [events, observations, evidence] = await Promise.all([
    db.investigation_events.find({ case_id: caseId }),
    db.observations.find({ case_id: caseId }),
    db.evidence.find({ case_id: caseId }),
  ]);

  res.json({
    events: events.slice(0, 20),
    observations: observations.slice(0, 10),
    recentEvidence: evidence.slice(0, 10),
  });
});

export default router;
