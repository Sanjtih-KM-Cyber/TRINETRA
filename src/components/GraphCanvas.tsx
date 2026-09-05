import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as d3 from "d3";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  EntityType,
  RelationType,
  SyndicateCommunity,
  ShortestPathResult,
  InformationCategory,
  ReviewState,
  IntelligenceClassification,
} from "../types";
import { useAuth } from "../context/AuthContext";
import { canAccessIntel, getUserClearance } from "../services/accessControl";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Search,
  Filter,
  User,
  Phone,
  Landmark,
  MapPin,
  Truck,
  Building,
  AlertCircle,
  Eye,
  Crown,
  Share2,
  Scissors,
  Layers,
  ChevronDown,
  ChevronUp,
  Radio,
  SlidersHorizontal,
  X,
  Quote,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Sparkles,
  Zap,
} from "lucide-react";

interface GraphCanvasProps {
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  communities: SyndicateCommunity[];
  selectedNodeId: string | null;
  onSelectNode: (node: CrimeNetworkNode | null) => void;
  onSelectLink?: (link: CrimeNetworkLink) => void;
  shortestPath: ShortestPathResult | null;
  highlightedPatternNodeIds?: string[];
  highlightedPatternLinkIds?: string[];
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  links,
  communities,
  selectedNodeId,
  onSelectNode,
  onSelectLink,
  shortestPath,
  highlightedPatternNodeIds = [],
  highlightedPatternLinkIds = [],
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dual-Engine Mode Switcher: "svg" for High-Def Tactical vector icons, "canvas" for 60FPS massive dataset scale
  const [engineMode, setEngineMode] = useState<"svg" | "canvas">(
    nodes.length > 250 ? "canvas" : "svg"
  );

  // Canvas Control State
  const [sizingMetric, setSizingMetric] = useState<"betweenness" | "degree" | "pageRank" | "risk">("betweenness");
  const [colorMode, setColorMode] = useState<"community" | "type" | "risk">("community");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<InformationCategory | "ALL">("ALL");
  const [selectedReviewState, setSelectedReviewState] = useState<ReviewState | "ALL">("ALL");
  const [selectedTypes, setSelectedTypes] = useState<EntityType[]>([
    "PERSON",
    "PHONE",
    "FINANCIAL",
    "LOCATION",
    "VEHICLE",
    "ORGANIZATION",
    "INCIDENT",
  ]);
  const [minRisk, setMinRisk] = useState<number>(0);
  const [onlyKingpins, setOnlyKingpins] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Zoom transform tracking for Canvas hit testing
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);

  // Hover state: Focused node ID when mouse hovers over a node or label
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Neighbor lookup map for instant O(1) connection testing
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    links.forEach((l) => {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    });
    return map;
  }, [links]);

  // Check if a node is the hovered node or directly connected to it
  const isNodeConnectedToHovered = useCallback(
    (nodeId: string) => {
      if (!hoveredNodeId) return true;
      if (nodeId === hoveredNodeId) return true;
      const neighbors = neighborMap.get(hoveredNodeId);
      return neighbors ? neighbors.has(nodeId) : false;
    },
    [hoveredNodeId, neighborMap]
  );

  // Check if a link is directly incident to the hovered node
  const isLinkConnectedToHovered = useCallback(
    (sourceId: string, targetId: string) => {
      if (!hoveredNodeId) return true;
      return sourceId === hoveredNodeId || targetId === hoveredNodeId;
    },
    [hoveredNodeId]
  );

  // Persistent node coordinate cache so nodes never jump or fly around on filter/mode/hover changes
  const nodePositionsRef = useRef<Map<string, { x: number; y: number; vx?: number; vy?: number }>>(new Map());

  // Spatial Grid Index for O(1) hit-testing
  const spatialIndexRef = useRef<{ index: Map<string, (CrimeNetworkNode & d3.SimulationNodeDatum)[]>; cellSize: number } | null>(null);
  const spatialIndexVersionRef = useRef<number>(0);

  // Refs for current visual states to avoid restarting physics simulation on hover/selection
  const hoveredNodeIdRef = useRef<string | null>(null);
  hoveredNodeIdRef.current = hoveredNodeId;

  const selectedNodeIdRef = useRef<string | null>(null);
  selectedNodeIdRef.current = selectedNodeId;

  const highlightedPatternNodeIdsRef = useRef<string[]>(highlightedPatternNodeIds);
  highlightedPatternNodeIdsRef.current = highlightedPatternNodeIds;

  const highlightedPatternLinkIdsRef = useRef<string[]>(highlightedPatternLinkIds);
  highlightedPatternLinkIdsRef.current = highlightedPatternLinkIds;

  const shortestPathRef = useRef<ShortestPathResult | null>(shortestPath);
  shortestPathRef.current = shortestPath;

  const canvasRenderRef = useRef<(() => void) | null>(null);
  const canvasSimRef = useRef<d3.Simulation<any, any> | null>(null);

  // Stable ref for hoveredNodeId to access within simulation callbacks
  const isNodeConnectedToHoveredRef = useRef(isNodeConnectedToHovered);
  isNodeConnectedToHoveredRef.current = isNodeConnectedToHovered;
  const isLinkConnectedToHoveredRef = useRef(isLinkConnectedToHovered);
  isLinkConnectedToHoveredRef.current = isLinkConnectedToHovered;

  // Dedicated dynamic update effect for SVG mode when hoveredNodeId or selectedNodeId changes without re-running simulation
  useEffect(() => {
    if (engineMode !== "svg" || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    
    // Smoothly transition links
    svg.selectAll<SVGLineElement, any>("g.links line")
      .transition()
      .duration(180)
      .attr("opacity", (d) => {
        if (!hoveredNodeId) return 0.8;
        return isLinkConnectedToHovered(
          typeof d.source === "object" ? d.source.id : d.source,
          typeof d.target === "object" ? d.target.id : d.target
        ) ? 1.0 : 0.08;
      })
      .attr("stroke", (d) => {
        const s = typeof d.source === "object" ? d.source.id : d.source;
        const t = typeof d.target === "object" ? d.target.id : d.target;
        const isPatternLink = highlightedPatternLinkIds.includes(d.id);
        const pathNodes = shortestPath?.path || shortestPath?.hops || [];
        const isShortestPathLink =
          shortestPath &&
          (shortestPath.links?.includes(d.id) ||
            pathNodes.some(
              (h, i) =>
                (h === s && pathNodes[i + 1] === t) ||
                (h === t && pathNodes[i + 1] === s)
            ));

        if (isShortestPathLink) return "#f59e0b";
        if (isPatternLink) return "#f43f5e";
        if (d.category === "INVESTIGATOR_KNOWLEDGE") return "#c084fc";
        if (hoveredNodeId && isLinkConnectedToHovered(s, t)) return "#38bdf8";
        return "rgba(100, 116, 139, 0.45)";
      })
      .attr("stroke-width", (d) => {
        const s = typeof d.source === "object" ? d.source.id : d.source;
        const t = typeof d.target === "object" ? d.target.id : d.target;
        const pathNodes = shortestPath?.path || shortestPath?.hops || [];
        const isShortestPathLink =
          shortestPath &&
          (shortestPath.links?.includes(d.id) ||
            pathNodes.some(
              (h, i) =>
                (h === s && pathNodes[i + 1] === t) ||
                (h === t && pathNodes[i + 1] === s)
            ));
        if (isShortestPathLink) return 3.5;
        if (highlightedPatternLinkIds.includes(d.id)) return 3;
        if (hoveredNodeId && isLinkConnectedToHovered(s, t)) return 2.5;
        return Math.min(4, Math.max(1.5, (d.weight || 1) * 0.8));
      });

    // Smoothly transition node groups opacity
    svg.selectAll<SVGGElement, any>("g.nodes g.node-group")
      .transition()
      .duration(180)
      .attr("opacity", (d) => {
        if (!hoveredNodeId) return 1.0;
        return isNodeConnectedToHovered(d.id) ? 1.0 : 0.12;
      });

    // Update node circle borders for selectedNodeId and hoveredNodeId
    svg.selectAll<SVGCircleElement, any>("g.nodes g.node-group > circle:last-of-type")
      .attr("stroke", (d) => {
        if (d.id === hoveredNodeId || d.id === selectedNodeId) return "#38bdf8";
        if (d.isCutVertex) return "#a855f7";
        if (d.category === "INVESTIGATOR_KNOWLEDGE") return "#c084fc";
        return "rgba(15, 23, 42, 0.9)";
      })
      .attr("stroke-width", (d) => (d.id === hoveredNodeId || d.id === selectedNodeId ? 3.5 : 2));

  }, [hoveredNodeId, selectedNodeId, isNodeConnectedToHovered, isLinkConnectedToHovered, engineMode, highlightedPatternLinkIds, shortestPath]);

  // Current officer clearance for classified-intel access control
  const { user: graphUser } = useAuth();
  const graphClearance = useMemo(() => getUserClearance(graphUser), [graphUser]);

  // Filtered nodes and links based on UI controls + clearance
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (!selectedTypes.includes(n.type)) return false;
      if (n.riskScore < minRisk) return false;
      if (onlyKingpins && !n.isKingpinCandidate) return false;

      // Classification access control: hide entities sourced from intel above clearance
      const nodeClass = (n.details as any)?.intelClassification as IntelligenceClassification | undefined;
      if (nodeClass && nodeClass !== "UNCLASSIFIED") {
        const access = canAccessIntel(graphClearance, {
          classification: nodeClass,
          compartment: (n.details as any)?.intelCompartment,
          caveats: ((n.details as any)?.intelCaveats || []) as any,
        });
        if (!access.allowed) return false;
      }

      // Category filter (Evidence vs Investigator Hypothesis)
      if (selectedCategory !== "ALL") {
        if (selectedCategory === "INVESTIGATOR_KNOWLEDGE" && n.category !== "INVESTIGATOR_KNOWLEDGE") return false;
        if (selectedCategory === "EVIDENCE" && n.category === "INVESTIGATOR_KNOWLEDGE") return false;
      }

      // Review State filter
      if (selectedReviewState !== "ALL") {
        const review = n.reviewState || "NEEDS_REVIEW";
        if (review !== selectedReviewState) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = n.label.toLowerCase().includes(q);
        const matchRole = (n.role || "").toLowerCase().includes(q);
        const matchAlias = (n.aliases || []).some((a) => a.toLowerCase().includes(q));
        const matchPhone = (n.details?.phone || "").includes(q);
        const matchPlate = (n.details?.vehiclePlate || "").toLowerCase().includes(q);
        if (!matchName && !matchRole && !matchAlias && !matchPhone && !matchPlate) return false;
      }
      return true;
    });
  }, [nodes, selectedTypes, minRisk, onlyKingpins, selectedCategory, selectedReviewState, searchQuery, graphClearance]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      return filteredNodeIds.has(s) && filteredNodeIds.has(t);
    });
  }, [links, filteredNodeIds]);

  // Color Mapping helpers
  const getEntityTypeColor = useCallback((type: EntityType) => {
    switch (type) {
      case "PERSON":
        return "#f97316"; // Orange
      case "PHONE":
        return "#38bdf8"; // Sky Blue
      case "FINANCIAL":
        return "#10b981"; // Emerald Green
      case "LOCATION":
        return "#a855f7"; // Purple
      case "VEHICLE":
        return "#eab308"; // Yellow
      case "ORGANIZATION":
        return "#06b6d4"; // Cyan
      case "INCIDENT":
        return "#f43f5e"; // Rose
      default:
        return "#94a3b8";
    }
  }, []);

  const getNodeColor = useCallback(
    (node: CrimeNetworkNode) => {
      if (colorMode === "type") {
        return getEntityTypeColor(node.type);
      }
      if (colorMode === "risk") {
        if (node.riskScore >= 85) return "#ef4444";
        if (node.riskScore >= 70) return "#f97316";
        if (node.riskScore >= 50) return "#eab308";
        return "#10b981";
      }
      // Default: community color
      const comm = communities.find((c) => c.id === node.communityId);
      return comm?.color || getEntityTypeColor(node.type);
    },
    [colorMode, communities, getEntityTypeColor]
  );

  // Node Size Calculator
  const getNodeRadius = useCallback(
    (node: CrimeNetworkNode) => {
      let base = 14;
      if (sizingMetric === "betweenness") {
        const b = node.betweenness || 0;
        base = 12 + Math.min(26, b * 70);
      } else if (sizingMetric === "degree") {
        const d = node.degree || 1;
        base = 12 + Math.min(24, d * 3);
      } else if (sizingMetric === "pageRank") {
        const pr = node.pageRank || 0.05;
        base = 12 + Math.min(26, pr * 200);
      } else if (sizingMetric === "risk") {
        base = 10 + (node.riskScore / 100) * 18;
      }
      if (node.isKingpinCandidate) base += 4;
      return base;
    },
    [sizingMetric]
  );

  // Fast reset / recenter zoom
  const handleResetZoom = () => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth || 900;
    const height = containerRef.current.clientHeight || 650;
    const initialTransform = d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85);

    if (engineMode === "svg" && svgRef.current) {
      d3.select(svgRef.current).transition().duration(500).call(d3.zoom().transform as any, initialTransform);
    } else if (engineMode === "canvas" && canvasRef.current) {
      zoomTransformRef.current = initialTransform;
      d3.select(canvasRef.current).transition().duration(500).call(d3.zoom().transform as any, initialTransform);
    }
  };

  // --- ENGINE 1: HIGH PERFORMANCE HTML5 CANVAS (60 FPS FOR MASSIVE SCALE) ---
  const canvasSimNodesRef = useRef<(CrimeNetworkNode & d3.SimulationNodeDatum)[]>([]);
  const canvasSimLinksRef = useRef<(CrimeNetworkLink & d3.SimulationLinkDatum<CrimeNetworkNode & d3.SimulationNodeDatum>)[]>([]);

  // Simulation setup effect: Only rebuilds when structural graph data changes
  useEffect(() => {
    if (engineMode !== "canvas" || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = containerRef.current.clientWidth || 900;
    const height = containerRef.current.clientHeight || 650;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Deep copy for simulation with cached positions
    const simNodes: (CrimeNetworkNode & d3.SimulationNodeDatum)[] = filteredNodes.map((n) => {
      const cached = nodePositionsRef.current.get(n.id);
      if (cached && typeof cached.x === "number" && typeof cached.y === "number") {
        return { ...n, x: cached.x, y: cached.y, vx: cached.vx ?? 0, vy: cached.vy ?? 0 };
      }
      return { ...n };
    });

    const simLinks: (CrimeNetworkLink & d3.SimulationLinkDatum<CrimeNetworkNode & d3.SimulationNodeDatum>)[] = filteredLinks.map((l) => ({
      ...l,
      source: typeof l.source === "object" ? (l.source as any).id : l.source,
      target: typeof l.target === "object" ? (l.target as any).id : l.target,
    }));

    canvasSimNodesRef.current = simNodes;
    canvasSimLinksRef.current = simLinks;

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<CrimeNetworkNode & d3.SimulationNodeDatum, any>(simLinks)
          .id((d) => d.id)
          .distance((d) => (d.weight ? 140 / d.weight : 110))
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide<CrimeNetworkNode>().radius((d) => getNodeRadius(d) + 16));

    simulationRef.current = simulation;
    canvasSimRef.current = simulation;

    // Build initial spatial index
    const buildSpatialIndex = (nodes: (CrimeNetworkNode & d3.SimulationNodeDatum)[]): { index: Map<string, (CrimeNetworkNode & d3.SimulationNodeDatum)[]>; cellSize: number } => {
      const index = new Map<string, (CrimeNetworkNode & d3.SimulationNodeDatum)[]>();
      const maxRadius = Math.max(...nodes.map(getNodeRadius), 10);
      const effectiveCellSize = Math.max(100, maxRadius * 2.5);
      
      nodes.forEach((node) => {
        if (node.x !== undefined && node.y !== undefined) {
          const col = Math.floor(node.x / effectiveCellSize);
          const row = Math.floor(node.y / effectiveCellSize);
          const key = `${col},${row}`;
          if (!index.has(key)) index.set(key, []);
          index.get(key)!.push(node);
        }
      });
      return { index, cellSize: effectiveCellSize };
    };

    // Update spatial index on every simulation tick
    spatialIndexRef.current = buildSpatialIndex(simNodes);
    spatialIndexVersionRef.current++;

    let transform = zoomTransformRef.current || d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85);

    // Hit-testing helper in graph coordinates using cached Spatial Grid Index
    const getHitNode = (graphX: number, graphY: number, tolerance = 10): (CrimeNetworkNode & d3.SimulationNodeDatum) | null => {
      const spatialData = spatialIndexRef.current;
      if (!spatialData) return null;
      
      const { index, cellSize } = spatialData;
      const col = Math.floor(graphX / cellSize);
      const row = Math.floor(graphY / cellSize);
      
      // Check current cell and 8 neighboring cells
      let closest: (CrimeNetworkNode & d3.SimulationNodeDatum) | null = null;
      let minDist = Infinity;
      
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const key = `${col + dc},${row + dr}`;
          const candidates = index.get(key) || [];
          for (const node of candidates) {
            if (node.x !== undefined && node.y !== undefined) {
              const r = getNodeRadius(node);
              const dist = Math.hypot(node.x - graphX, node.y - graphY);
              if (dist <= r + tolerance && dist < minDist) {
                minDist = dist;
                closest = node;
              }
            }
          }
        }
      }
      return closest;
    };

    // Render function with Level of Detail (LOD)
    const render = () => {
      if (!ctx || !canvas) return;
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      // Background Tactical Grid
      ctx.save();
      ctx.strokeStyle = "rgba(51, 65, 85, 0.2)";
      ctx.lineWidth = 1;
      const gridSize = 40 * transform.k;
      const offsetX = transform.x % gridSize;
      const offsetY = transform.y % gridSize;
      for (let x = offsetX; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = offsetY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      const activeHoverId = hoveredNodeIdRef.current;
      const activeSelectedId = selectedNodeIdRef.current;
      const activePatternNodeIds = highlightedPatternNodeIdsRef.current;
      const activePatternLinkIds = highlightedPatternLinkIdsRef.current;
      const activeShortest = shortestPathRef.current;

      // 1. Draw Links (Batched for speed)
      simLinks.forEach((link: any) => {
        if (!link.source || !link.target || typeof link.source !== "object" || typeof link.target !== "object") return;
        const isPattern = activePatternLinkIds.includes(link.id);
        const pathNodes = activeShortest?.path || activeShortest?.hops || [];
        const isShortest =
          activeShortest &&
          (activeShortest.links?.includes(link.id) ||
            pathNodes.some(
              (h, i) =>
                (h === link.source.id && pathNodes[i + 1] === link.target.id) ||
                (h === link.target.id && pathNodes[i + 1] === link.source.id)
            ));

        // Hover focus & fading: fade links that are not connected to the hovered node
        const isHoverConnected = isLinkConnectedToHoveredRef.current(link.source.id, link.target.id);
        const linkAlpha = activeHoverId ? (isHoverConnected ? 1.0 : 0.08) : 0.8;

        ctx.save();
        ctx.globalAlpha = linkAlpha;
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);

        if (isShortest) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 3.5;
        } else if (isPattern) {
          ctx.strokeStyle = "#f43f5e";
          ctx.lineWidth = 3;
        } else if (link.category === "INVESTIGATOR_KNOWLEDGE") {
          ctx.strokeStyle = "#c084fc";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
        } else if (activeHoverId && isHoverConnected) {
          ctx.strokeStyle = "#38bdf8"; // Highlight active hovered connections
          ctx.lineWidth = Math.min(4, Math.max(2, (link.weight || 1) * 1.2));
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
          ctx.lineWidth = Math.min(3.5, Math.max(1.2, (link.weight || 1) * 0.7));
          ctx.setLineDash([]);
        }

        ctx.stroke();
        ctx.setLineDash([]);

        // LOD: Draw link relation label only when zoomed in or directly hovered
        if ((transform.k > 1.2 || (activeHoverId && isHoverConnected)) && link.relationType && link.relationType !== "ASSOCIATED_WITH") {
          const midX = (link.source.x + link.target.x) / 2;
          const midY = (link.source.y + link.target.y) / 2;
          ctx.font = "8px monospace";
          ctx.fillStyle = activeHoverId && isHoverConnected ? "#38bdf8" : "rgba(148, 163, 184, 0.75)";
          ctx.textAlign = "center";
          ctx.fillText(link.relationType.replace(/_/g, " ").toLowerCase(), midX, midY - 4);
        }
        ctx.restore();
      });

      // 2. Draw Nodes
      simNodes.forEach((node: any) => {
        const r = getNodeRadius(node);
        const color = getNodeColor(node);
        const isSelected = node.id === activeSelectedId;
        const isHovered = node.id === activeHoverId;
        const isDirectNeighbor = isNodeConnectedToHoveredRef.current(node.id);
        const isKingpin = node.isKingpinCandidate;
        const isPattern = activePatternNodeIds.includes(node.id);
        const pathNodes = activeShortest?.path || activeShortest?.hops || [];
        const isShortest = activeShortest && pathNodes.includes(node.id);

        // Alpha fading for unconnected nodes during hover
        const nodeAlpha = activeHoverId ? (isDirectNeighbor ? 1.0 : 0.12) : 1.0;

        ctx.save();
        ctx.globalAlpha = nodeAlpha;

        // Outer Glow for Kingpin / Selected / Hovered
        if (isKingpin || isSelected || isHovered || isPattern || isShortest) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + (isSelected || isHovered ? 8 : 6), 0, Math.PI * 2);
          ctx.fillStyle = isHovered
            ? "rgba(56, 189, 248, 0.35)"
            : isSelected
            ? "rgba(56, 189, 248, 0.25)"
            : isPattern
            ? "rgba(244, 63, 94, 0.3)"
            : isShortest
            ? "rgba(245, 158, 11, 0.3)"
            : "rgba(234, 179, 8, 0.2)";
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = isHovered || isSelected ? "#38bdf8" : isPattern ? "#f43f5e" : isShortest ? "#f59e0b" : "#eab308";
          ctx.stroke();
        }

        // Main Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = isHovered ? 3.5 : isSelected ? 3 : node.isCutVertex ? 2.5 : 1.5;
        ctx.strokeStyle = isHovered || isSelected ? "#38bdf8" : node.isCutVertex ? "#a855f7" : "rgba(15, 23, 42, 0.9)";
        ctx.stroke();

        // Node Label (Always shown for hovered node & its direct neighbors; LOD for others)
        if (isHovered || (activeHoverId && isDirectNeighbor) || isKingpin || isSelected || transform.k > 0.6) {
          ctx.font = `${isKingpin || isHovered ? "bold 11px" : "10px"} sans-serif`;
          ctx.fillStyle = isHovered ? "#38bdf8" : isDirectNeighbor && activeHoverId ? "#f1f5f9" : "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText(node.label, node.x, node.y + r + 12);

          if (node.role && (isHovered || transform.k > 0.9)) {
            ctx.font = "8px monospace";
            ctx.fillStyle = isHovered ? "#bae6fd" : "rgba(148, 163, 184, 0.85)";
            ctx.fillText(node.role, node.x, node.y + r + 22);
          }
        }
        ctx.restore();
      });

      ctx.restore();
      ctx.restore();
    };

    canvasRenderRef.current = render;

    // Cache simulated coordinates on every tick
    simulation.on("tick", () => {
      simNodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
        }
      });
      // Update spatial index for O(1) hit-testing
      spatialIndexRef.current = (() => {
        const index = new Map<string, (CrimeNetworkNode & d3.SimulationNodeDatum)[]>();
        const maxRadius = Math.max(...simNodes.map(getNodeRadius), 10);
        const effectiveCellSize = Math.max(100, maxRadius * 2.5);
        
        simNodes.forEach((node) => {
          if (node.x !== undefined && node.y !== undefined) {
            const col = Math.floor(node.x / effectiveCellSize);
            const row = Math.floor(node.y / effectiveCellSize);
            const key = `${col},${row}`;
            if (!index.has(key)) index.set(key, []);
            index.get(key)!.push(node);
          }
        });
        return { index, cellSize: effectiveCellSize };
      })();
      spatialIndexVersionRef.current++;
      render();
    });

    // Zoom behavior for Canvas (configured to allow node dragging without conflict)
    let isInteractingWithNode = false;

    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 8])
      .filter((event) => {
        // If initiating a touch or mouse on a node, suppress canvas pan so node drag works cleanly
        if (event.type === "mousedown" || event.type === "touchstart") {
          const rect = canvas.getBoundingClientRect();
          const clientX = event.clientX ?? (event.touches ? event.touches[0].clientX : 0);
          const clientY = event.clientY ?? (event.touches ? event.touches[0].clientY : 0);
          const gX = (clientX - rect.left - transform.x) / transform.k;
          const gY = (clientY - rect.top - transform.y) / transform.k;
          const hit = getHitNode(gX, gY, 12);
          if (hit) {
            isInteractingWithNode = true;
            return false;
          }
          isInteractingWithNode = false;
        }
        return !event.ctrlKey && !event.button;
      })
      .on("zoom", (event) => {
        transform = event.transform;
        zoomTransformRef.current = transform;
        render();
      });

    d3.select(canvas).call(zoom as any);
    d3.select(canvas).call(zoom.transform as any, transform);

    // Direct, ultra-responsive pointer interaction for dragging and selection
    let pointerDownPos: { x: number; y: number } | null = null;
    let draggedNode: (CrimeNetworkNode & d3.SimulationNodeDatum) | null = null;
    let isNodeDragMode = false;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return; // Left click only
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      pointerDownPos = { x: event.clientX, y: event.clientY };

      const graphX = (clickX - transform.x) / transform.k;
      const graphY = (clickY - transform.y) / transform.k;

      const hit = getHitNode(graphX, graphY, 12);
      if (hit) {
        draggedNode = hit;
        draggedNode.fx = hit.x;
        draggedNode.fy = hit.y;
        isNodeDragMode = true;
        canvas.setPointerCapture(event.pointerId);
      } else {
        draggedNode = null;
        isNodeDragMode = false;
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const graphX = (mouseX - transform.x) / transform.k;
      const graphY = (mouseY - transform.y) / transform.k;

      if (isNodeDragMode && draggedNode) {
        draggedNode.fx = graphX;
        draggedNode.fy = graphY;
        simulation.alphaTarget(0.15).restart();
        render();
        return;
      }

      // Hover hit detection when not dragging
      const hovered = getHitNode(graphX, graphY, 10);
      const nextHoverId = hovered ? hovered.id : null;
      if (hoveredNodeIdRef.current !== nextHoverId) {
        hoveredNodeIdRef.current = nextHoverId;
        setHoveredNodeId(nextHoverId);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (isNodeDragMode && draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
        simulation.alphaTarget(0);
        isNodeDragMode = false;
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      }

      // Crisp click detection: if mouse moved <= 6px between down and up, trigger selection
      if (pointerDownPos) {
        const dist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
        if (dist <= 6) {
          const rect = canvas.getBoundingClientRect();
          const clickX = event.clientX - rect.left;
          const clickY = event.clientY - rect.top;
          const graphX = (clickX - transform.x) / transform.k;
          const graphY = (clickY - transform.y) / transform.k;

          const clickedSimNode = getHitNode(graphX, graphY, 12);
          if (clickedSimNode) {
            const originalNode = nodes.find((n) => n.id === clickedSimNode.id) || (clickedSimNode as CrimeNetworkNode);
            onSelectNode(originalNode);
          } else {
            // Clicked empty background: clear selection
            onSelectNode(null);
          }
        }
        pointerDownPos = null;
      }
    };

    const handlePointerLeave = () => {
      if (hoveredNodeIdRef.current !== null) {
        hoveredNodeIdRef.current = null;
        setHoveredNodeId(null);
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      simulation.stop();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [
    engineMode,
    filteredNodes,
    filteredLinks,
    getNodeRadius,
    getNodeColor,
    sizingMetric,
    nodes,
    onSelectNode,
  ]);

  // Secondary reactive effect: Instantly redraw canvas on visual/selection changes without restarting physics
  useEffect(() => {
    if (engineMode === "canvas" && canvasRenderRef.current) {
      canvasRenderRef.current();
    }
  }, [
    engineMode,
    hoveredNodeId,
    selectedNodeId,
    highlightedPatternNodeIds,
    highlightedPatternLinkIds,
    shortestPath,
    colorMode,
  ]);

  // --- ENGINE 2: HIGH-FIDELITY SVG TACTICAL MODE (DEFAULT VECTOR GLYPHS) ---
  useEffect(() => {
    if (engineMode !== "svg" || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 900;
    const height = containerRef.current.clientHeight || 650;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Background tactical grid
    const defs = svg.append("defs");
    const pattern = defs
      .append("pattern")
      .attr("id", "tactical-grid")
      .attr("width", 40)
      .attr("height", 40)
      .attr("patternUnits", "userSpaceOnUse");

    pattern
      .append("path")
      .attr("d", "M 40 0 L 0 0 0 40")
      .attr("fill", "none")
      .attr("stroke", "rgba(51, 65, 85, 0.25)")
      .attr("stroke-width", "0.75");

    svg
      .append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "url(#tactical-grid)")
      .style("pointer-events", "none");

    const g = svg.append("g").attr("class", "graph-container");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 6])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85));

    const simNodes: (CrimeNetworkNode & d3.SimulationNodeDatum)[] = filteredNodes.map((n) => {
      const cached = nodePositionsRef.current.get(n.id);
      if (cached && typeof cached.x === "number" && typeof cached.y === "number") {
        return { ...n, x: cached.x, y: cached.y, vx: cached.vx ?? 0, vy: cached.vy ?? 0 };
      }
      return { ...n };
    });
    const simLinks: (CrimeNetworkLink & d3.SimulationLinkDatum<CrimeNetworkNode & d3.SimulationNodeDatum>)[] = filteredLinks.map((l) => ({
      ...l,
      source: typeof l.source === "object" ? (l.source as any).id : l.source,
      target: typeof l.target === "object" ? (l.target as any).id : l.target,
    }));

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<CrimeNetworkNode & d3.SimulationNodeDatum, any>(simLinks)
          .id((d) => d.id)
          .distance((d) => (d.weight ? 150 / d.weight : 110))
      )
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide<CrimeNetworkNode>().radius((d) => getNodeRadius(d) + 18));

    // Render Links
    const linkGroup = g.append("g").attr("class", "links");
    const link = linkGroup
      .selectAll("line")
      .data(simLinks)
      .enter()
      .append("line")
      .style("cursor", "pointer")
      .style("transition", "opacity 0.2s ease, stroke-width 0.2s ease")
      .attr("stroke", (d) => {
        const isPatternLink = highlightedPatternLinkIds.includes(d.id);
        const sId = typeof d.source === "object" ? (d.source as any).id : d.source;
        const tId = typeof d.target === "object" ? (d.target as any).id : d.target;
        const pathNodes = shortestPath?.path || shortestPath?.hops || [];
        const isShortestPathLink =
          shortestPath &&
          (shortestPath.links?.includes(d.id) ||
            pathNodes.some(
              (h, i) =>
                (h === sId && pathNodes[i + 1] === tId) ||
                (h === tId && pathNodes[i + 1] === sId)
            ));

        if (isShortestPathLink) return "#f59e0b"; // Gold
        if (isPatternLink) return "#f43f5e"; // Rose Red
        if (d.category === "INVESTIGATOR_KNOWLEDGE") return "#c084fc"; // Purple for Hypotheses
        if (hoveredNodeId && isLinkConnectedToHovered(sId, tId)) return "#38bdf8";
        return "rgba(100, 116, 139, 0.45)"; // Slate
      })
      .attr("stroke-width", (d) => {
        const sId = typeof d.source === "object" ? (d.source as any).id : d.source;
        const tId = typeof d.target === "object" ? (d.target as any).id : d.target;
        const pathNodes = shortestPath?.path || shortestPath?.hops || [];
        const isShortestPathLink =
          shortestPath &&
          (shortestPath.links?.includes(d.id) ||
            pathNodes.some(
              (h, i) =>
                (h === sId && pathNodes[i + 1] === tId) ||
                (h === tId && pathNodes[i + 1] === sId)
            ));
        if (isShortestPathLink) return 3.5;
        if (highlightedPatternLinkIds.includes(d.id)) return 3;
        if (hoveredNodeId && isLinkConnectedToHovered(sId, tId)) return 2.5;
        return Math.min(4, Math.max(1.5, (d.weight || 1) * 0.8));
      })
      .attr("stroke-dasharray", (d) => {
        if (d.category === "INVESTIGATOR_KNOWLEDGE") return "3,3";
        return d.flags && d.flags.length > 0 ? "4,4" : "none";
      })
      .attr("opacity", (d) => {
        if (!hoveredNodeId) return 0.8;
        return isLinkConnectedToHovered((d.source as any).id, (d.target as any).id) ? 1.0 : 0.08;
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (onSelectLink) {
          const originalLink = links.find((l) => l.id === d.id) || (d as CrimeNetworkLink);
          onSelectLink(originalLink);
        }
      });

    // Render Nodes Group
    const nodeGroup = g.append("g").attr("class", "nodes");
    const node = nodeGroup
      .selectAll<SVGGElement, CrimeNetworkNode & d3.SimulationNodeDatum>("g")
      .data(simNodes)
      .enter()
      .append("g")
      .attr("class", "node-group")
      .style("cursor", "pointer")
      .style("transition", "opacity 0.2s ease")
      .attr("opacity", (d) => {
        if (!hoveredNodeId) return 1;
        return isNodeConnectedToHovered(d.id) ? 1 : 0.12;
      })
      .call(
        d3
          .drag<SVGGElement, CrimeNetworkNode & d3.SimulationNodeDatum>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Node Outer Glow / Halo
    node
      .filter((d) => {
        const pathNodes = shortestPath?.path || shortestPath?.hops || [];
        return (
          d.id === hoveredNodeId ||
          d.isKingpinCandidate ||
          (shortestPath && pathNodes.includes(d.id)) ||
          highlightedPatternNodeIds.includes(d.id)
        );
      })
      .append("circle")
      .attr("r", (d) => getNodeRadius(d) + (d.id === hoveredNodeId ? 9 : 8))
      .attr("fill", (d) => {
        const pathNodes = shortestPath?.path || shortestPath?.hops || [];
        if (d.id === hoveredNodeId) return "rgba(56, 189, 248, 0.35)";
        if (shortestPath && pathNodes.includes(d.id)) return "rgba(245, 158, 11, 0.25)";
        if (highlightedPatternNodeIds.includes(d.id)) return "rgba(244, 63, 94, 0.3)";
        return "rgba(245, 158, 11, 0.2)";
      })
      .attr("stroke", (d) => {
        const pathNodes = shortestPath?.path || shortestPath?.hops || [];
        if (d.id === hoveredNodeId) return "#38bdf8";
        if (shortestPath && pathNodes.includes(d.id)) return "#f59e0b";
        if (highlightedPatternNodeIds.includes(d.id)) return "#f43f5e";
        return "#eab308";
      })
      .attr("stroke-width", (d) => (d.id === hoveredNodeId ? 2 : 1.5))
      .attr("stroke-dasharray", "4,3");

    // Main Node Circle
    node
      .append("circle")
      .attr("r", (d) => getNodeRadius(d))
      .attr("fill", (d) => getNodeColor(d))
      .attr("stroke", (d) => {
        if (d.id === hoveredNodeId || d.id === selectedNodeId) return "#38bdf8";
        if (d.isCutVertex) return "#a855f7";
        if (d.category === "INVESTIGATOR_KNOWLEDGE") return "#c084fc";
        return "rgba(15, 23, 42, 0.9)";
      })
      .attr("stroke-width", (d) => (d.id === hoveredNodeId ? 3.5 : d.id === selectedNodeId ? 3.5 : 2))
      .attr("filter", "drop-shadow(0 2px 6px rgba(0,0,0,0.6))");

    // Node Icons
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", ".3em")
      .attr("font-size", (d) => `${Math.max(9, getNodeRadius(d) * 0.75)}px`)
      .attr("fill", "#0f172a")
      .attr("font-weight", "bold")
      .attr("font-family", "monospace")
      .style("pointer-events", "none")
      .text((d) => {
        switch (d.type) {
          case "PERSON":
            return "👤";
          case "PHONE":
            return "📱";
          case "FINANCIAL":
            return "💳";
          case "LOCATION":
            return "📍";
          case "VEHICLE":
            return "🚗";
          case "ORGANIZATION":
            return "🏢";
          default:
            return "•";
        }
      });

    // Node Labels
    node
      .append("text")
      .text((d) => d.label)
      .attr("dy", (d) => getNodeRadius(d) + 14)
      .attr("font-size", (d) => (d.isKingpinCandidate || d.id === hoveredNodeId ? "11px" : "10px"))
      .attr("font-weight", (d) => (d.isKingpinCandidate || d.id === hoveredNodeId ? "bold" : "normal"))
      .attr("fill", (d) => {
        if (d.id === hoveredNodeId) return "#38bdf8";
        if (hoveredNodeId && isNodeConnectedToHovered(d.id)) return "#f8fafc";
        if (d.isKingpinCandidate) return "#fef08a";
        return "#f1f5f9";
      })
      .attr("text-anchor", "middle")
      .attr("paint-order", "stroke")
      .attr("stroke", "#020617")
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .style("pointer-events", "none");

    node
      .on("mouseenter", (event, d) => {
        setHoveredNodeId(d.id);
      })
      .on("mouseleave", () => {
        setHoveredNodeId(null);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        const origNode = nodes.find((n) => n.id === d.id) || d;
        onSelectNode(origNode);
      });

    simulation.on("tick", () => {
      simNodes.forEach((n) => {
        if (n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
        }
      });

      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [
    engineMode,
    filteredNodes,
    filteredLinks,
    getNodeRadius,
    getNodeColor,
    sizingMetric,
    onSelectNode,
    onSelectLink,
    links,
    nodes,
  ]);

  const toggleTypeFilter = (type: EntityType) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
      {/* Top Floating Tactical Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left: Search & Filter Trigger */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search suspect, alias, phone, IMEI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-64 shadow-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-xl ${
              isFilterPanelOpen || selectedTypes.length < 7 || minRisk > 0 || selectedCategory !== "ALL"
                ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                : "bg-slate-900/90 border border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {(selectedTypes.length < 7 || minRisk > 0 || selectedCategory !== "ALL") && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Right: Engine Switcher (Canvas 60FPS vs SVG) + Zoom Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Dual-Engine Mode Switcher */}
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-1 flex items-center gap-1 shadow-xl">
            <button
              onClick={() => setEngineMode("svg")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition-colors ${
                engineMode === "svg" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-slate-400 hover:text-slate-200"
              }`}
              title="High-Definition Vector Tactical Mode"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>SVG Tactical</span>
            </button>
            <button
              onClick={() => setEngineMode("canvas")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition-colors ${
                engineMode === "canvas" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "text-slate-400 hover:text-slate-200"
              }`}
              title="High-Performance 60FPS Canvas for 1,000s of Entities"
            >
              <Cpu className="w-3 h-3 text-cyan-400" />
              <span>Canvas 60FPS</span>
              <span className="text-[9px] px-1 py-0.2 bg-cyan-950 border border-cyan-800 text-cyan-400 rounded">FAST</span>
            </button>
          </div>

          {/* Node Count & Metric Selector */}
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 flex items-center gap-2 shadow-xl">
            <span className="font-mono text-[11px] text-amber-400 font-bold">{filteredNodes.length}</span>
            <span className="text-slate-500">nodes</span>
            <span className="text-slate-700">|</span>
            <span className="font-mono text-[11px] text-sky-400 font-bold">{filteredLinks.length}</span>
            <span className="text-slate-500">links</span>
          </div>

          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl p-1 flex items-center gap-1 shadow-xl">
            <button
              onClick={handleResetZoom}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Recenter Canvas"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Filter Drawer */}
      {isFilterPanelOpen && (
        <div className="absolute top-18 left-4 z-20 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">
                Advanced Canvas Filters
              </span>
            </div>
            <button onClick={() => setIsFilterPanelOpen(false)} className="text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sizing Metric */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Node Size Dimension</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: "betweenness", label: "Betweenness (Kingpin)" },
                { id: "degree", label: "Degree (Connections)" },
                { id: "pageRank", label: "PageRank (Prestige)" },
                { id: "risk", label: "Threat Risk Score" },
              ].map((metric) => (
                <button
                  key={metric.id}
                  onClick={() => setSizingMetric(metric.id as any)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border text-left transition-colors ${
                    sizingMetric === metric.id
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>

          {/* Entity Classifications */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Entity Classifications</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { type: "PERSON" as const, label: "Persons", color: "text-orange-400" },
                { type: "PHONE" as const, label: "Phones / SIMs", color: "text-sky-400" },
                { type: "FINANCIAL" as const, label: "Bank / VPAs", color: "text-emerald-400" },
                { type: "LOCATION" as const, label: "Safehouses", color: "text-purple-400" },
                { type: "VEHICLE" as const, label: "Vehicles", color: "text-yellow-400" },
                { type: "ORGANIZATION" as const, label: "Front Shells", color: "text-cyan-400" },
              ].map((item) => {
                const isSelected = selectedTypes.includes(item.type);
                return (
                  <button
                    key={item.type}
                    onClick={() => toggleTypeFilter(item.type)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left flex items-center justify-between transition-colors ${
                      isSelected
                        ? "bg-slate-950 border-amber-500/40 text-slate-100"
                        : "bg-slate-950/40 border-slate-800 text-slate-500 line-through"
                    }`}
                  >
                    <span className={isSelected ? item.color : "text-slate-500"}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minimum Risk Threshold Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Min Threat Risk:</span>
              <span className="text-amber-400 font-bold">{minRisk} / 100</span>
            </div>
            <input
              type="range"
              min={0}
              max={95}
              step={5}
              value={minRisk}
              onChange={(e) => setMinRisk(parseInt(e.target.value))}
              className="w-full accent-amber-500 bg-slate-950 h-1.5 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Render Canvas Engine or SVG Engine */}
      {engineMode === "canvas" ? (
        <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      ) : (
        <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      )}

      {/* Floating Hover Focus Inspector Badge */}
      {hoveredNodeId && (() => {
        const hoveredNode = nodes.find((n) => n.id === hoveredNodeId);
        const directNeighbors = neighborMap.get(hoveredNodeId);
        const neighborCount = directNeighbors ? directNeighbors.size : 0;
        if (!hoveredNode) return null;

        return (
          <div className="absolute bottom-5 left-5 z-20 pointer-events-none bg-slate-900/90 backdrop-blur-md border border-cyan-500/40 rounded-xl px-3.5 py-2 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100">{hoveredNode.label}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                  {hoveredNode.type}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Directly connected:</span>
                <span className="font-mono text-cyan-400 font-bold">{neighborCount}</span>
                <span className="text-slate-500">nodes</span>
                <span className="text-slate-600">•</span>
                <span className="text-slate-400 text-[10px]">Unconnected nodes dimmed</span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
