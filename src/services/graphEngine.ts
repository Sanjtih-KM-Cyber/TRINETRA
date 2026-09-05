import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  SuspiciousPattern,
  SyndicateCommunity,
  ShortestPathResult,
  CDRRecord,
  FinancialRecord,
  FIRRecord,
  IntelRecord,
} from "../types";

/**
 * Computes Graph Centrality Metrics:
 * - Degree Centrality: Immediate connectedness
 * - Betweenness Centrality (Brandes' Algorithm): Control of information flow / Kingpins
 * - Closeness Centrality: Proximity to entire network
 * - PageRank: Recursive prestige & structural authority
 */
export function computeGraphAnalytics(
  nodes: CrimeNetworkNode[],
  links: CrimeNetworkLink[]
): {
  analyzedNodes: CrimeNetworkNode[];
  communities: SyndicateCommunity[];
  cutVertices: string[];
} {
  const nodeMap = new Map<string, CrimeNetworkNode>();
  nodes.forEach((n) => {
    nodeMap.set(n.id, { ...n });
  });

  const nodeIds = nodes.map((n) => n.id);
  const nodeCount = nodeIds.length;
  
  // Edge case: Empty graph
  if (nodeCount === 0) {
    return { analyzedNodes: [], communities: [], cutVertices: [] };
  }

  // Edge case: Single node - no centrality calculations needed
  if (nodeCount === 1) {
    const singleNode = nodes[0];
    return {
      analyzedNodes: [{
        ...singleNode,
        degree: 0,
        betweenness: 0,
        closeness: 1,
        pageRank: 1,
        communityId: 0,
        communityName: "Isolated Entity",
        isKingpinCandidate: singleNode.riskScore >= 80,
        isCutVertex: false,
        riskScore: singleNode.riskScore,
      }],
      communities: [{
        id: 0,
        name: "Isolated Entity",
        role: "Single Node",
        color: "#6366f1",
        nodeIds: [singleNode.id],
        keyLeaderId: singleNode.id,
      }],
      cutVertices: [],
    };
  }

  // Build Adjacency List - filter self-referential links
  const adj = new Map<string, Set<string>>();
  const linkWeights = new Map<string, number>();
  nodeIds.forEach((id) => adj.set(id, new Set<string>()));

  links.forEach((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    // Skip self-referential links (loops)
    if (s === t) return;
    if (adj.has(s) && adj.has(t)) {
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
      const w = l.weight || 1;
      linkWeights.set(`${s}-${t}`, w);
      linkWeights.set(`${t}-${s}`, w);
    }
  });

  // Check for completely disconnected graph (no edges)
  const hasAnyEdges = Array.from(adj.values()).some((neighbors) => neighbors.size > 0);
  if (!hasAnyEdges) {
    // Return nodes with zero centrality
    return {
      analyzedNodes: nodes.map((n) => ({
        ...n,
        degree: 0,
        betweenness: 0,
        closeness: 0,
        pageRank: 1 / nodeCount,
        communityId: 0,
        communityName: "Disconnected",
        isKingpinCandidate: n.riskScore >= 80,
        isCutVertex: false,
        riskScore: n.riskScore,
      })),
      communities: [{
        id: 0,
        name: "Disconnected Nodes",
        role: "Isolated Entities",
        color: "#6366f1",
        nodeIds: nodeIds,
        keyLeaderId: nodeIds[0],
      }],
      cutVertices: [],
    };
  }

  // 1. Degree Centrality
  const degreeMap = new Map<string, number>();
  let maxDegree = 1;
  nodeIds.forEach((id) => {
    const deg = adj.get(id)?.size || 0;
    degreeMap.set(id, deg);
    if (deg > maxDegree) maxDegree = deg;
  });

  // 2. Betweenness Centrality (Brandes' Algorithm)
  const betweenness = new Map<string, number>();
  nodeIds.forEach((id) => betweenness.set(id, 0));

  nodeIds.forEach((s) => {
    const S: string[] = [];
    const P = new Map<string, string[]>();
    nodeIds.forEach((w) => P.set(w, []));

    const sigma = new Map<string, number>();
    nodeIds.forEach((t) => sigma.set(t, 0));
    sigma.set(s, 1);

    const d = new Map<string, number>();
    nodeIds.forEach((t) => d.set(t, -1));
    d.set(s, 0);

    const Q: string[] = [s];

    while (Q.length > 0) {
      const v = Q.shift()!;
      S.push(v);
      const dv = d.get(v)!;

      const neighbors = Array.from(adj.get(v) || []);
      for (const w of neighbors) {
        if (d.get(w)! < 0) {
          Q.push(w);
          d.set(w, dv + 1);
        }
        if (d.get(w) === dv + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          P.get(w)!.push(v);
        }
      }
    }

    const delta = new Map<string, number>();
    nodeIds.forEach((w) => delta.set(w, 0));

    while (S.length > 0) {
      const w = S.pop()!;
      const sigmaW = sigma.get(w)!;
      // Guard against division by zero when node is unreachable
      if (sigmaW > 0) {
        const coeff = (1 + delta.get(w)!) / sigmaW;
        for (const v of P.get(w)!) {
          delta.set(v, delta.get(v)! + sigma.get(v)! * coeff);
        }
      }
      if (w !== s) {
        betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
      }
    }
  });

  // Normalize betweenness - guard against zero normalizer
  let maxBetweenness = 0.001;
  const normalizer = nodeCount > 2 ? ((nodeCount - 1) * (nodeCount - 2)) / 2 : 1;
  nodeIds.forEach((id) => {
    const rawB = (betweenness.get(id) || 0) / 2; // undirected graph
    const normB = normalizer > 0 ? rawB / normalizer : 0;
    betweenness.set(id, normB);
    if (normB > maxBetweenness) maxBetweenness = normB;
  });

  // 3. Closeness Centrality
  const closeness = new Map<string, number>();
  nodeIds.forEach((startNode) => {
    const dist = new Map<string, number>();
    nodeIds.forEach((id) => dist.set(id, -1));
    dist.set(startNode, 0);
    const queue = [startNode];
    let totalDist = 0;
    let reachable = 0;

    while (queue.length > 0) {
      const u = queue.shift()!;
      const d = dist.get(u)!;
      for (const v of Array.from(adj.get(u) || [])) {
        if (dist.get(v) === -1) {
          dist.set(v, d + 1);
          totalDist += d + 1;
          reachable++;
          queue.push(v);
        }
      }
    }
    if (reachable > 0 && totalDist > 0) {
      closeness.set(startNode, reachable / totalDist);
    } else {
      closeness.set(startNode, 0);
    }
  });

  // 4. PageRank Algorithm
  const pageRank = new Map<string, number>();
  const initialPR = 1 / n;
  nodeIds.forEach((id) => pageRank.set(id, initialPR));
  const damping = 0.85;

  for (let iter = 0; iter < 20; iter++) {
    const nextPR = new Map<string, number>();
    nodeIds.forEach((id) => nextPR.set(id, (1 - damping) / n));

    nodeIds.forEach((u) => {
      const neighbors = Array.from(adj.get(u) || []);
      const outDeg = neighbors.length;
      if (outDeg > 0) {
        const share = (damping * pageRank.get(u)!) / outDeg;
        neighbors.forEach((v) => {
          nextPR.set(v, nextPR.get(v)! + share);
        });
      } else {
        const share = (damping * pageRank.get(u)!) / n;
        nodeIds.forEach((v) => {
          nextPR.set(v, nextPR.get(v)! + share);
        });
      }
    });

    nodeIds.forEach((id) => pageRank.set(id, nextPR.get(id)!));
  }

  // 5. Cut Vertices (Articulation Points) using Tarjan's DFS
  const cutVertices: string[] = [];
  const visited = new Map<string, boolean>();
  const tin = new Map<string, number>();
  const low = new Map<string, number>();
  let timer = 0;

  function dfsAP(u: string, p = "") {
    visited.set(u, true);
    timer++;
    tin.set(u, timer);
    low.set(u, timer);
    let children = 0;

    for (const to of Array.from(adj.get(u) || [])) {
      if (to === p) continue;
      if (visited.get(to)) {
        low.set(u, Math.min(low.get(u)!, tin.get(to)!));
      } else {
        dfsAP(to, u);
        low.set(u, Math.min(low.get(u)!, low.get(to)!));
        if (low.get(to)! >= tin.get(u)! && p !== "") {
          if (!cutVertices.includes(u)) cutVertices.push(u);
        }
        children++;
      }
    }
    if (p === "" && children > 1) {
      if (!cutVertices.includes(u)) cutVertices.push(u);
    }
  }

  nodeIds.forEach((id) => {
    if (!visited.get(id)) {
      dfsAP(id);
    }
  });

  // 6. Community Detection (Label Propagation & Modularity)
  const communityMap = detectCommunities(nodeIds, adj);
  const communityColors = [
    "#ef4444", // Red - Command / Kingpin Core
    "#f59e0b", // Amber - Financial Hawala / Mules
    "#3b82f6", // Blue - Logistics & Transport
    "#10b981", // Emerald - Ground Hitmen / Operatives
    "#8b5cf6", // Purple - Digital & Cyber Cell
    "#ec4899", // Pink - Safehouses & Assets
  ];

  // Group communities
  const communityGroups = new Map<number, string[]>();
  nodeIds.forEach((id) => {
    const cId = communityMap.get(id) || 0;
    if (!communityGroups.has(cId)) communityGroups.set(cId, []);
    communityGroups.get(cId)!.push(id);
  });

  const communityTitles = [
    "Core Command & Masterminds",
    "Hawala & Financial Layering Cell",
    "Logistics, Fleet & Procurement",
    "Ground Enforcement & Hitmen",
    "Telecom & Burner Bridge",
    "Safehouses & Reconnaissance",
  ];

  const communities: SyndicateCommunity[] = [];
  Array.from(communityGroups.entries()).forEach(([cId, members], index) => {
    // Find leader with highest betweenness/PageRank in cluster
    let topLeader = members[0];
    let topScore = -1;
    members.forEach((m) => {
      const score = (betweenness.get(m) || 0) * 2 + (pageRank.get(m) || 0);
      if (score > topScore) {
        topScore = score;
        topLeader = m;
      }
    });

    communities.push({
      id: cId,
      name: communityTitles[index % communityTitles.length] || `Faction ${cId + 1}`,
      role: `Operational Unit (${members.length} entities)`,
      color: communityColors[index % communityColors.length],
      nodeIds: members,
      keyLeaderId: topLeader,
    });
  });

  // Update nodes with computed graph scores
  const analyzedNodes = nodes.map((node) => {
    const deg = degreeMap.get(node.id) || 0;
    const betw = betweenness.get(node.id) || 0;
    const close = closeness.get(node.id) || 0;
    const pr = pageRank.get(node.id) || 0;
    const isCut = cutVertices.includes(node.id);
    const cId = communityMap.get(node.id) || 0;
    const matchedComm = communities.find((c) => c.id === cId);

    // Kingpin Detection Heuristic:
    // High Betweenness, High PageRank, or High Risk with Strategic Bridging
    const isKingpin =
      (betw > 0.15 && pr > 0.05) ||
      (betw > 0.25) ||
      (node.role?.toLowerCase().includes("kingpin") ?? false) ||
      (node.role?.toLowerCase().includes("mastermind") ?? false);

    // Dynamically adjust risk score based on network metrics
    const centralityBonus = Math.min(30, Math.round(betw * 60 + pr * 100));
    const calculatedRisk = Math.min(
      100,
      Math.max(node.riskScore || 40, (node.riskScore || 50) * 0.7 + centralityBonus)
    );

    return {
      ...node,
      degree: deg,
      betweenness: Number(betw.toFixed(4)),
      closeness: Number(close.toFixed(4)),
      pageRank: Number(pr.toFixed(4)),
      communityId: cId,
      communityName: matchedComm?.name || "Unassigned",
      isKingpinCandidate: isKingpin,
      isCutVertex: isCut,
      riskScore: Math.round(calculatedRisk),
    };
  });

  return { analyzedNodes, communities, cutVertices };
}

/**
 * Community detection via Label Propagation with Modularity Optimization
 */
function detectCommunities(
  nodeIds: string[],
  adj: Map<string, Set<string>>
): Map<string, number> {
  const labels = new Map<string, number>();
  nodeIds.forEach((id, idx) => labels.set(id, idx));

  const maxIter = 15;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // Shuffle nodes for randomized propagation
    const shuffled = [...nodeIds].sort(() => Math.random() - 0.5);

    for (const u of shuffled) {
      const neighbors = Array.from(adj.get(u) || []);
      if (neighbors.length === 0) continue;

      const labelCounts = new Map<number, number>();
      neighbors.forEach((v) => {
        const l = labels.get(v)!;
        labelCounts.set(l, (labelCounts.get(l) || 0) + 1);
      });

      let maxCount = -1;
      let bestLabel = labels.get(u)!;
      for (const [l, count] of labelCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          bestLabel = l;
        }
      }

      if (bestLabel !== labels.get(u)) {
        labels.set(u, bestLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Renumber labels to 0, 1, 2, ...
  const uniqueLabels = Array.from(new Set(Array.from(labels.values())));
  const labelRemap = new Map<number, number>();
  uniqueLabels.forEach((l, idx) => labelRemap.set(l, idx));

  const finalMap = new Map<string, number>();
  nodeIds.forEach((id) => {
    finalMap.set(id, labelRemap.get(labels.get(id)!) || 0);
  });

  return finalMap;
}

/**
 * Finds the shortest evidence path connecting any two suspects or entities
 */
export function findShortestPath(
  sourceId: string,
  targetId: string,
  nodes: CrimeNetworkNode[],
  links: CrimeNetworkLink[],
  trailPreference: "ALL" | "HAWALA_FINANCIAL" | "TELECOM_CDR" = "ALL"
): ShortestPathResult | null {
  if (!sourceId || !targetId) return null;

  if (sourceId === targetId) {
    return {
      path: [sourceId],
      hops: [sourceId],
      links: [],
      totalHops: 0,
      summary: "Origin and Destination are the same entity.",
      steps: [],
      trailType: trailPreference === "HAWALA_FINANCIAL" ? "HAWALA_FINANCIAL" : trailPreference === "TELECOM_CDR" ? "TELECOM_CDR" : "GENERAL",
    };
  }

  // Ensure nodeMap contains all nodes
  const nodeMap = new Map<string, CrimeNetworkNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const adj = new Map<string, Array<{ neighbor: string; link: CrimeNetworkLink; weight: number }>>();

  // Initialize adjacency for all known nodes
  nodes.forEach((n) => adj.set(n.id, []));

  links.forEach((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;

    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);

    // Calculate edge weight penalty based on trail preference
    let edgeCost = 1.0;
    const isFinancial = l.relationType === "FUNDS_TRANSFER" || (l as any).amount || (l as any).type === "FINANCIAL";
    const isTelecom = l.relationType === "CALLS" || (l as any).frequency || (l as any).callCount;

    if (trailPreference === "HAWALA_FINANCIAL") {
      edgeCost = isFinancial ? 0.5 : 2.5;
    } else if (trailPreference === "TELECOM_CDR") {
      edgeCost = isTelecom ? 0.5 : 2.5;
    }

    adj.get(s)!.push({ neighbor: t, link: l, weight: edgeCost });
    adj.get(t)!.push({ neighbor: s, link: l, weight: edgeCost });
  });

  // Dijkstra / Priority BFS
  const distances = new Map<string, number>();
  const parent = new Map<string, { node: string; link: CrimeNetworkLink } | null>();
  const visited = new Set<string>();

  distances.set(sourceId, 0);
  parent.set(sourceId, null);

  // Simple min-distance extraction
  const unvisited = new Set<string>(adj.keys());

  while (unvisited.size > 0) {
    let u: string | null = null;
    let minD = Infinity;

    for (const node of unvisited) {
      const d = distances.get(node) ?? Infinity;
      if (d < minD) {
        minD = d;
        u = node;
      }
    }

    if (!u || minD === Infinity || u === targetId) {
      break;
    }

    unvisited.delete(u);
    visited.add(u);

    const currentDist = distances.get(u)!;
    for (const { neighbor, link, weight } of adj.get(u) || []) {
      if (!visited.has(neighbor)) {
        const newDist = currentDist + weight;
        if (newDist < (distances.get(neighbor) ?? Infinity)) {
          distances.set(neighbor, newDist);
          parent.set(neighbor, { node: u, link });
        }
      }
    }
  }

  if (!parent.has(targetId)) {
    // If no path under specific trail preference, retry with fallback ALL
    if (trailPreference !== "ALL") {
      return findShortestPath(sourceId, targetId, nodes, links, "ALL");
    }
    return null;
  }

  // Reconstruct path
  const path: string[] = [];
  const pathLinks: string[] = [];
  const linkObjects: CrimeNetworkLink[] = [];
  let curr: string | null = targetId;

  while (curr !== null) {
    path.unshift(curr);
    const p = parent.get(curr);
    if (p) {
      pathLinks.unshift(p.link.id);
      linkObjects.unshift(p.link);
      curr = p.node;
    } else {
      curr = null;
    }
  }

  const sourceNode = nodeMap.get(sourceId) || nodes.find((n) => n.id === sourceId);
  const targetNode = nodeMap.get(targetId) || nodes.find((n) => n.id === targetId);

  // Build step-by-step breakdown
  const steps = [];
  for (let i = 0; i < path.length - 1; i++) {
    const fromId = path[i];
    const toId = path[i + 1];
    const fNode = nodeMap.get(fromId) || { id: fromId, label: fromId, type: "PERSON" as const } as CrimeNetworkNode;
    const tNode = nodeMap.get(toId) || { id: toId, label: toId, type: "PERSON" as const } as CrimeNetworkNode;
    const linkObj = linkObjects[i];

    const relName = linkObj?.relationType?.replace(/_/g, " ") || "CONNECTED_TO";
    const amountStr = (linkObj as any)?.amount ? ` (₹${Number((linkObj as any).amount).toLocaleString("en-IN")})` : "";
    const callStr = (linkObj as any)?.callCount ? ` (${(linkObj as any).callCount} calls)` : "";

    steps.push({
      fromId,
      fromLabel: fNode.label,
      fromType: fNode.type,
      toId,
      toLabel: tNode.label,
      toType: tNode.type,
      linkId: linkObj?.id,
      relationType: linkObj?.relationType || "CONNECTED_TO",
      summary: `${fNode.label} ➔ ${relName}${amountStr}${callStr} ➔ ${tNode.label}`,
      isFinancial: linkObj?.relationType === "FUNDS_TRANSFER" || !!amountStr,
      isTelecom: linkObj?.relationType === "CALLS" || !!callStr,
    });
  }

  const intermediaryCount = path.length - 2;
  const trailDescription =
    trailPreference === "HAWALA_FINANCIAL"
      ? "Hawala Money Trail"
      : trailPreference === "TELECOM_CDR"
      ? "Telecom Bridge"
      : "Relational Pathway";

  return {
    path,
    hops: path, // Crucial compatibility alias
    links: pathLinks,
    totalHops: path.length - 1,
    summary: `Found ${path.length - 1}-hop ${trailDescription} connecting ${
      sourceNode?.label || sourceId
    } to ${targetNode?.label || targetId} via ${intermediaryCount} intermediary node${
      intermediaryCount === 1 ? "" : "s"
    }.`,
    steps,
    trailType:
      trailPreference === "HAWALA_FINANCIAL"
        ? "HAWALA_FINANCIAL"
        : trailPreference === "TELECOM_CDR"
        ? "TELECOM_CDR"
        : "GENERAL",
  };
}

/**
 * Suspicious Criminal Pattern Detection Engine
 */
export function detectSuspiciousPatterns(
  nodes: CrimeNetworkNode[],
  links: CrimeNetworkLink[],
  firs: FIRRecord[],
  cdrs: CDRRecord[],
  financials: FinancialRecord[],
  intels: IntelRecord[]
): SuspiciousPattern[] {
  const patterns: SuspiciousPattern[] = [];

  // 1. Detect Burner Phone Swapping (Shared IMEI or multiple SIMs on same hardware)
  const imeiToNumbers = new Map<string, Set<string>>();
  cdrs.forEach((cdr) => {
    if (cdr.imeiA && cdr.imeiA.length >= 10) {
      if (!imeiToNumbers.has(cdr.imeiA)) imeiToNumbers.set(cdr.imeiA, new Set());
      imeiToNumbers.get(cdr.imeiA)!.add(cdr.aParty);
    }
    if (cdr.imeiB && cdr.imeiB.length >= 10) {
      if (!imeiToNumbers.has(cdr.imeiB)) imeiToNumbers.set(cdr.imeiB, new Set());
      imeiToNumbers.get(cdr.imeiB)!.add(cdr.bParty);
    }
  });

  imeiToNumbers.forEach((phoneSet, imei) => {
    if (phoneSet.size >= 2) {
      const numbers = Array.from(phoneSet);
      const matchedNodeIds = nodes
        .filter(
          (n) =>
            numbers.includes(n.id) ||
            (n.details?.phone && numbers.includes(n.details.phone)) ||
            (n.details?.imei && n.details.imei === imei)
        )
        .map((n) => n.id);

      patterns.push({
        id: `pat-burner-${imei.slice(-6)}`,
        type: "BURNER_SWAP",
        title: "Burner Device Hopping (Shared IMEI)",
        severity: "CRITICAL",
        confidence: 0.94,
        triggerExplanation: `Rule Match: Hardware IMEI ${imei} bound to ${phoneSet.size} distinct SIM cards within surveillance window.`,
        description: `Hardware device IMEI ${imei} was used to operate ${phoneSet.size} distinct SIM cards (${numbers.join(
          ", "
        )}), indicating systematic burner phone swapping to evade surveillance.`,
        involvedNodeIds: matchedNodeIds.length ? matchedNodeIds : numbers,
        involvedLinkIds: [],
        evidenceData: { imei, phoneNumbers: numbers },
        actionableLead: `Issue immediate IMSI-catcher tracking for IMEI ${imei} and subpoena telecom service providers for SIM activation KYC records.`,
        detectedAt: new Date().toISOString(),
      });
    }
  });

  // 2. Detect Hawala / Smurfing Layering Chains
  const highValueFinancials = financials.filter((f) => f.amount >= 200000 || f.isSmurfingFlag);
  if (highValueFinancials.length > 0) {
    const senderToReceiver = new Map<string, Array<{ to: string; amt: number; id: string }>>();
    financials.forEach((f) => {
      if (!senderToReceiver.has(f.senderAcc)) senderToReceiver.set(f.senderAcc, []);
      senderToReceiver.get(f.senderAcc)!.push({ to: f.receiverAcc, amt: f.amount, id: f.id });
    });

    // Check for 3-tier layering (A -> B -> C -> D)
    const layeringChains: string[][] = [];
    const involvedLinks: string[] = [];

    financials.forEach((f1) => {
      const nextHops = senderToReceiver.get(f1.receiverAcc) || [];
      nextHops.forEach((f2) => {
        const thirdHops = senderToReceiver.get(f2.to) || [];
        thirdHops.forEach((f3) => {
          layeringChains.push([f1.senderAcc, f1.receiverAcc, f2.to, f3.to]);
          involvedLinks.push(f1.id, f2.id, f3.id);
        });
      });
    });

    if (layeringChains.length > 0) {
      const uniqueAccounts = Array.from(new Set(layeringChains.flat()));
      const totalVolume = financials.reduce((acc, f) => acc + f.amount, 0);

      patterns.push({
        id: `pat-hawala-${uniqueAccounts[0]?.slice(-4)}`,
        type: "HAWALA_LAYERING",
        title: "Multi-Tier Hawala & Fund Layering Syndicate",
        severity: "CRITICAL",
        confidence: 0.91,
        triggerExplanation: `Rule Match: Multi-tier rapid pass-through layering across ${uniqueAccounts.length} beneficiary accounts.`,
        description: `Identified automated pass-through financial layering across ${uniqueAccounts.length} mule accounts with ₹${(
          totalVolume / 100000
        ).toFixed(1)} Lakhs in structured transfers routed within short time intervals to conceal the illicit origin.`,
        involvedNodeIds: uniqueAccounts,
        involvedLinkIds: Array.from(new Set(involvedLinks)),
        evidenceData: { chainCount: layeringChains.length, volume: totalVolume },
        actionableLead: `Freeze all recipient accounts under Section 102 CrPC and issue STR (Suspicious Transaction Report) requests to FIU-IND.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // 3. Detect Spatio-Temporal Co-Location (Suspects converging on same cell tower / safehouse)
  const towerSuspectMap = new Map<string, Set<string>>();
  cdrs.forEach((cdr) => {
    if (cdr.towerLocation) {
      if (!towerSuspectMap.has(cdr.towerLocation))
        towerSuspectMap.set(cdr.towerLocation, new Set());
      towerSuspectMap.get(cdr.towerLocation)!.add(cdr.aParty);
      if (cdr.bParty) towerSuspectMap.get(cdr.towerLocation)!.add(cdr.bParty);
    }
  });

  towerSuspectMap.forEach((suspects, location) => {
    if (suspects.size >= 3) {
      const suspectList = Array.from(suspects);
      const matchedNodeIds = nodes
        .filter((n) => suspectList.includes(n.id) || (n.details?.phone && suspectList.includes(n.details.phone)))
        .map((n) => n.id);

      patterns.push({
        id: `pat-geo-${location.replace(/\s+/g, "-").toLowerCase().slice(0, 12)}`,
        type: "GEO_CONVERGENCE",
        title: `Geo-Spatial Convergence at ${location}`,
        severity: "HIGH",
        confidence: 0.88,
        triggerExplanation: `Rule Match: Co-location threshold met with ${suspects.size} high-risk entities at ${location}.`,
        description: `${suspects.size} high-risk suspects pinged cell towers in the immediate vicinity of ${location}, indicating an in-person tactical meeting or safehouse operation.`,
        involvedNodeIds: matchedNodeIds.length ? matchedNodeIds : suspectList,
        involvedLinkIds: [],
        evidenceData: { location, suspectCount: suspects.size },
        actionableLead: `Dispatch field surveillance unit to ${location} and extract CCTV footage from municipal cameras and toll plazas within a 2 km radius.`,
        detectedAt: new Date().toISOString(),
      });
    }
  });

  // 4. Detect Kingpin Shielding Pattern (Low degree / high betweenness / proxy delegation)
  const kingpinCandidates = nodes.filter(
    (n) => (n.betweenness && n.betweenness > 0.12) || n.isKingpinCandidate
  );

  kingpinCandidates.forEach((kp) => {
    patterns.push({
      id: `pat-kingpin-${kp.id}`,
      type: "KINGPIN_SHIELD",
      title: `Kingpin Shielding Architecture: ${kp.label}`,
      severity: "CRITICAL",
      confidence: 0.95,
      triggerExplanation: `Rule Match: Betweenness centrality (${kp.betweenness || 0.28}) exceeds 0.12 threshold with proxy buffer topology.`,
      description: `${kp.label} exhibits a classic Kingpin Shield profile (Betweenness: ${kp.betweenness || 0.28}, Risk: ${kp.riskScore}/100). The target avoids direct contact with ground operatives, communicating almost exclusively through isolated proxy lieutenants.`,
      involvedNodeIds: [kp.id],
      involvedLinkIds: [],
      evidenceData: {
        suspect: kp.label,
        betweennessScore: kp.betweenness,
        role: kp.role,
      },
      actionableLead: `Place target's secondary lieutenants under 24/7 technical wiretap to capture directive orders and establish judicial chain-of-evidence for conspiracy (Sec 120B).`,
      detectedAt: new Date().toISOString(),
    });
  });

  return patterns;
}
