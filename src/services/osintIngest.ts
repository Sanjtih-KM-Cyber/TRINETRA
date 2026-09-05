import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SourceSnippet,
  EvidenceFileRecord,
} from "../types";
import { extractEntitiesUniversal, generateFileHash } from "./nlpExtractor";

export type OSINTPlatform = 
  | "TWITTER" 
  | "FACEBOOK" 
  | "INSTAGRAM" 
  | "TELEGRAM_PUBLIC" 
  | "YOUTUBE" 
  | "LINKEDIN"
  | "OTHER";

export interface OSINTIngestInput {
  platform: OSINTPlatform;
  sourceUrl: string;
  authorHandle: string;
  authorName?: string;
  content: string;
  postedAt: string;
  geoTag?: { lat: number; lng: number; placeName: string };
  mediaUrls?: string[];
  engagement?: { likes: number; shares: number; comments: number };
  caseId: string;
  ingestedBy: { id: string; name: string; role: string; badge: string };
}

export interface OSINTIngestResult {
  success: boolean;
  evidenceRecord?: EvidenceFileRecord;
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  docHash: string;
  error?: string;
}

function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").toLowerCase().trim();
}

function extractHandleFromUrl(url: string, platform: OSINTPlatform): string {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").filter(Boolean);
    if (platform === "TWITTER" || platform === "INSTAGRAM" || platform === "TELEGRAM_PUBLIC") {
      return path[0] || "";
    }
    if (platform === "FACEBOOK") {
      return path[path.length - 1] || "";
    }
    if (platform === "YOUTUBE") {
      return u.searchParams.get("@") || path[0] || "";
    }
    return path[0] || "";
  } catch {
    return "";
  }
}

async function fetchOSINTContent(input: OSINTIngestInput): Promise<string> {
  // In production, this would call platform APIs (Twitter API v2, Meta Graph API, etc.)
  // For now, return the provided content with metadata header
  const meta = [
    `PLATFORM: ${input.platform}`,
    `AUTHOR: ${input.authorHandle}${input.authorName ? ` (${input.authorName})` : ""}`,
    `POSTED: ${input.postedAt}`,
    `URL: ${input.sourceUrl}`,
    input.geoTag ? `LOCATION: ${input.geoTag.placeName} (${input.geoTag.lat}, ${input.geoTag.lng})` : "",
    input.engagement ? `ENGAGEMENT: ${input.engagement.likes} likes, ${input.engagement.shares} shares, ${input.engagement.comments} comments` : "",
    "",
    "CONTENT:",
    input.content,
  ].filter(Boolean).join("\n");
  
  return meta;
}

function createOSINTSourceSnippet(
  input: OSINTIngestInput, 
  docId: string, 
  excerpt: string
): SourceSnippet {
  return {
    docId,
    docName: `OSINT_${input.platform}_${normalizeHandle(input.authorHandle)}_${input.postedAt.split("T")[0]}`,
    locator: `Post URL: ${input.sourceUrl}`,
    snippet: excerpt,
    confidence: 0.85,
    timestamp: input.postedAt,
  };
}

function createOSINTNodesFromExtraction(
  extraction: Awaited<ReturnType<typeof extractEntitiesUniversal>>,
  input: OSINTIngestInput,
  docId: string,
  docHash: string
): CrimeNetworkNode[] {
  return extraction.nodes.map((node) => ({
    ...node,
    category: "OSINT" as const,
    reviewState: "NEEDS_REVIEW" as const,
    sourceDocumentIds: [docId, docHash],
    sourceSnippets: node.sourceSnippets?.map(s => ({ ...s, docId })) || [
      createOSINTSourceSnippet(input, docId, node.sourceSnippets?.[0]?.snippet || node.details?.notes || "")
    ],
    details: {
      ...node.details,
      osintPlatform: input.platform,
      osintSourceUrl: input.sourceUrl,
      osintAuthorHandle: input.authorHandle,
      osintAuthorName: input.authorName,
      osintPostedAt: input.postedAt,
      osintGeoTag: input.geoTag,
      osintEngagement: input.engagement,
    },
  }));
}

function createOSINTLinksFromExtraction(
  extraction: Awaited<ReturnType<typeof extractEntitiesUniversal>>,
  input: OSINTIngestInput,
  docId: string,
  docHash: string
): CrimeNetworkLink[] {
  return extraction.links.map((link, idx) => ({
    ...link,
    id: `link-osint-${input.platform.toLowerCase()}-${Date.now()}-${idx}`,
    category: "OSINT" as const,
    reviewState: "NEEDS_REVIEW" as const,
    provenance: "SOCIAL_MEDIA" as const,
    sourceDocumentId: docId,
    evidenceDetail: {
      ...link.evidenceDetail,
      sourceDocumentId: docId,
      sourceDocumentName: `OSINT_${input.platform}_${normalizeHandle(input.authorHandle)}`,
      locator: `Post: ${input.sourceUrl}`,
      excerpt: link.details || link.evidenceDetail?.excerpt || "OSINT extracted relationship",
      basis: `Social media intelligence from ${input.platform}`,
    },
  }));
}

export async function ingestOSINT(input: OSINTIngestInput): Promise<OSINTIngestResult> {
  try {
    // 1. Fetch/prepare content
    const rawContent = await fetchOSINTContent(input);
    
    // 2. Generate deterministic hash for chain of custody
    const docHash = generateFileHash(rawContent, `OSINT_${input.platform}_${normalizeHandle(input.authorHandle)}`);
    const docId = `OSINT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    // 3. Extract entities using universal pipeline
    const extraction = await extractEntitiesUniversal(rawContent, `OSINT_${input.platform}`, "LOCAL_OFFLINE");
    
    // 4. Stamp with OSINT metadata
    const nodes = createOSINTNodesFromExtraction(extraction, input, docId, docHash);
    const links = createOSINTLinksFromExtraction(extraction, input, docId, docHash);
    
    // 5. Create evidence record
    const evidenceRecord: EvidenceFileRecord = {
      id: docId,
      fileName: `OSINT_${input.platform}_${normalizeHandle(input.authorHandle)}_${input.postedAt.split("T")[0]}.txt`,
      fileSize: new Blob([rawContent]).size,
      fileSizeFormatted: `${(rawContent.length / 1024).toFixed(1)} KB`,
      fileType: "TEXT_DOC",
      fileHash: docHash,
      uploadedAt: new Date().toISOString(),
      processingStatus: "PROCESSED",
      extractedEntitiesCount: nodes.length,
      extractedRelationsCount: links.length,
      summary: `OSINT ingestion from ${input.platform}: @${input.authorHandle} - ${extraction.summary}`,
      sourceAuthority: `${input.ingestedBy.name} (${input.ingestedBy.role}) - ${input.ingestedBy.badge}`,
      rawTextPreview: rawContent.substring(0, 500),
    };
    
    return {
      success: true,
      evidenceRecord,
      nodes,
      links,
      docHash,
    };
  } catch (error: any) {
    console.error("OSINT ingestion failed:", error);
    return {
      success: false,
      nodes: [],
      links: [],
      docHash: "",
      error: error.message || "OSINT ingestion failed",
    };
  }
}

// Batch ingestion for multiple URLs
export async function ingestOSINTBatch(
  inputs: OSINTIngestInput[]
): Promise<OSINTIngestResult[]> {
  const results: OSINTIngestResult[] = [];
  for (const input of inputs) {
    const result = await ingestOSINT(input);
    results.push(result);
    // Small delay to avoid rate limiting in production
    await new Promise(r => setTimeout(r, 100));
  }
  return results;
}

// Platform-specific URL validation
export function validateOSINTUrl(platform: OSINTPlatform, url: string): { valid: boolean; handle?: string } {
  try {
    const u = new URL(url);
    const handle = extractHandleFromUrl(url, platform);
    
    const platformDomains: Record<OSINTPlatform, string[]> = {
      TWITTER: ["twitter.com", "x.com"],
      FACEBOOK: ["facebook.com", "fb.com"],
      INSTAGRAM: ["instagram.com"],
      TELEGRAM_PUBLIC: ["t.me", "telegram.me"],
      YOUTUBE: ["youtube.com", "youtu.be"],
      LINKEDIN: ["linkedin.com"],
      OTHER: [],
    };
    
    const validDomains = platformDomains[platform] || [];
    const isValidDomain = validDomains.length === 0 || validDomains.some(d => u.hostname.includes(d));
    
    return { valid: isValidDomain && handle.length > 0, handle };
  } catch {
    return { valid: false };
  }
}

// Quick preview extraction without full ingestion
export async function previewOSINTEntities(input: OSINTIngestInput): Promise<{
  entities: string[];
  summary: string;
}> {
  const rawContent = await fetchOSINTContent(input);
  const extraction = await extractEntitiesUniversal(rawContent, `OSINT_${input.platform}`, "LOCAL_OFFLINE");
  return {
    entities: extraction.nodes.map(n => `${n.label} [${n.type}]`),
    summary: extraction.summary,
  };
}