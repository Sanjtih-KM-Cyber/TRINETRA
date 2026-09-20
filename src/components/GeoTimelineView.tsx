import React, { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import {
  CrimeNetworkNode,
  CrimeNetworkLink,
  CDRRecord,
  FinancialRecord,
  FIRRecord,
  IntelRecord,
  CellTowerSector,
  GeofenceZone,
  SuspectTrajectoryPoint,
} from "../types";
import {
  CELL_TOWER_SECTORS,
  GEOFENCE_ZONES,
  SUSPECT_TRAJECTORIES,
} from "../data/mockDatasets";
import {
  MapPin,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Navigation,
  Shield,
  Radio,
  Compass,
  Expand,
  Minimize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export interface MapFocusSignal {
  nodeId: string;
  nonce: number;
}

interface GeoTimelineViewProps {
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  firs: FIRRecord[];
  cdrs: CDRRecord[];
  financials: FinancialRecord[];
  intels: IntelRecord[];
  onSelectNode: (node: CrimeNetworkNode) => void;
  /** Phase 2 — graph → map sync: pan + pop the marker for this node. */
  focusSignal?: MapFocusSignal | null;
  highlightedPatternNodeIds?: string[];
  highlightedPatternLinkIds?: string[];
}

// Utility to create a polygon representing a cell tower azimuth sector wedge
function calculateSectorPoints(
  lat: number,
  lng: number,
  azimuthDeg: number,
  beamWidthDeg: number,
  radiusMeters: number,
  numPoints: number = 24
): [number, number][] {
  const points: [number, number][] = [[lat, lng]];
  const startAngle = (azimuthDeg - beamWidthDeg / 2) * (Math.PI / 180);
  const endAngle = (azimuthDeg + beamWidthDeg / 2) * (Math.PI / 180);
  const step = (endAngle - startAngle) / numPoints;

  // Approximate lat/lng delta in degrees (Earth radius ~ 6,371,000 m)
  const latDeltaDeg = radiusMeters / 111139;
  const lngDeltaDeg = radiusMeters / (111139 * Math.cos((lat * Math.PI) / 180));

  for (let i = 0; i <= numPoints; i++) {
    const angle = startAngle + i * step;
    const pLat = lat + latDeltaDeg * Math.cos(angle);
    const pLng = lng + lngDeltaDeg * Math.sin(angle);
    points.push([pLat, pLng]);
  }

  points.push([lat, lng]);
  return points;
}

export const GeoTimelineView: React.FC<GeoTimelineViewProps> = ({
  nodes,
  firs,
  cdrs,
  financials,
  intels,
  onSelectNode,
  focusSignal = null,
  highlightedPatternNodeIds = [],
  highlightedPatternLinkIds = [],
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);

  // Layer groups
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  /** Phase 2 — graph ↔ map coordinate sync registry. */
  const markerByNodeIdRef = useRef<Map<string, L.Marker>>(new Map());
  const towersLayerRef = useRef<L.LayerGroup | null>(null);
  const geofencesLayerRef = useRef<L.LayerGroup | null>(null);
  const trajectoryLayerRef = useRef<L.LayerGroup | null>(null);
  const activeHighlightLayerRef = useRef<L.LayerGroup | null>(null);

  // Layer Visibility Filters
  const [showTowers, setShowTowers] = useState(true);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [mapStyle, setMapStyle] = useState<"satellite" | "streets">("satellite");
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);

  // Phase 8: Entity Tracking Feature
  const [selectedTarget, setSelectedTarget] = useState<string>("ALL");
  const uniqueTargets = useMemo(() => Array.from(new Set(SUSPECT_TRAJECTORIES.map((pt) => pt.suspectName))), []);

  // Timeline events unified with accurate area coordinates and trajectory waypoints
  const unfilteredEvents = useMemo(() => {
    return [
      ...firs.map((f) => {
        const isVashi = f.briefNarrative?.toLowerCase().includes("vashi") || f.policeStation?.toLowerCase().includes("vashi");
        return {
          id: f.id,
          type: "FIR",
          title: `${f.firNumber} Registered`,
          timestamp: f.date,
          description: f.briefNarrative,
          badge: "POLICE FIR",
          color: "#ef4444",
          lat: isVashi ? 19.0688 : 18.9614,
          lng: isVashi ? 72.9984 : 72.8373,
          areaName: isVashi ? "Vashi Sector 17, Navi Mumbai" : "Dongri Crime Branch, South Mumbai",
        };
      }),
      ...cdrs.map((c) => ({
        id: c.id,
        type: "CDR",
        title: `Call Intercept: ${c.aParty} → ${c.bParty}`,
        timestamp: c.timestamp,
        description: `Duration: ${c.durationSec}s at ${c.towerLocation} (IMEI: ${c.imeiA})`,
        badge: "CDR LOG",
        color: "#38bdf8",
        lat: c.lat,
        lng: c.lng,
        areaName: c.towerLocation || "Cell Tower Sector",
      })),
      ...financials.map((fn) => {
        const isSurat = fn.receiverName?.toLowerCase().includes("surat") || fn.senderName?.toLowerCase().includes("angadia");
        return {
          id: fn.id,
          type: "FINANCIAL",
          title: `₹${(fn.amount / 100000).toFixed(1)}L Transfer: ${fn.senderName} → ${fn.receiverName}`,
          timestamp: fn.timestamp,
          description: `Mode: ${fn.mode} [UTR: ${fn.utrNumber}]`,
          badge: "HAWALA / BANK",
          color: "#10b981",
          lat: isSurat ? 21.1702 : 18.9507,
          lng: isSurat ? 72.8311 : 72.8315,
          areaName: isSurat ? "Surat Angadia Diamond Hub" : "Zaveri Bazaar Hawala Hub, Mumbai",
        };
      }),
      ...intels.map((it) => ({
        id: it.id,
        type: "INTEL",
        title: `Surveillance Sighting at ${it.location}`,
        timestamp: it.date,
        description: it.description,
        badge: "HUMINT / INTEL",
        color: "#f59e0b",
        lat: it.lat,
        lng: it.lng,
        areaName: it.location || "Surveillance Location",
      })),
      ...SUSPECT_TRAJECTORIES.map((pt) => ({
        id: pt.id,
        type: "TRAJECTORY",
        title: `Movement: ${pt.suspectName}`,
        timestamp: pt.timestamp,
        description: `Logged at ${pt.speedKmh} km/h - ${pt.activityType}`,
        badge: "GPS WAYPOINT",
        color: pt.suspectId === "p-feroz" || pt.suspectId === "p-farooq" ? "#f59e0b" : "#a855f7",
        lat: pt.lat,
        lng: pt.lng,
        areaName: pt.locationLabel,
        targetTag: pt.suspectName,
      }))
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [firs, cdrs, financials, intels]);

  const allEvents = useMemo(() => {
    if (selectedTarget === "ALL") return unfilteredEvents;
    return unfilteredEvents.filter((ev) => (ev as any).targetTag === selectedTarget);
  }, [unfilteredEvents, selectedTarget]);

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(unfilteredEvents.length - 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Reset scrubber when filter changes
  useEffect(() => {
    setCurrentStepIndex(allEvents.length > 0 ? allEvents.length - 1 : 0);
  }, [selectedTarget, allEvents.length]);
  // TRINETRA spec — chronological playback paced at 4,000ms per step (default).
  const [playbackSpeed, setPlaybackSpeed] = useState<"slow" | "normal" | "fast">("slow");
  const PLAYBACK_MS = { slow: 4000, normal: 2500, fast: 1200 } as const;
  // Phase 7 Req31 — viewport expansion toggle.
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      viewRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  };

  // Initialize Map with 100% Free, Public, Reliable Tile Layers (No API Key Required)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [18.98, 72.93],
      zoom: 11,
      attributionControl: true,
    });

    // Reverting to reliable public ESRI / OSM endpoints since local ports caused auth conflicts
    const tileUrls = {
      satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    };
    const tileCredits = {
      satellite: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      streets: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

    const baseLayer = L.tileLayer(tileUrls[mapStyle], {
      maxZoom: 19,
      subdomains: "abcd",
      attribution: tileCredits[mapStyle],
    }).addTo(map);
    baseTileLayerRef.current = baseLayer;

    // Sublayers
    towersLayerRef.current = L.layerGroup().addTo(map);
    geofencesLayerRef.current = L.layerGroup().addTo(map);
    trajectoryLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    activeHighlightLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Base Tile Map Style
  useEffect(() => {
    if (!mapInstanceRef.current || !baseTileLayerRef.current) return;
    const tileUrls = {
      satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    };
    const tileCredits = {
      satellite: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      streets: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };

    mapInstanceRef.current.removeLayer(baseTileLayerRef.current);
    const newBase = L.tileLayer(tileUrls[mapStyle], { maxZoom: 19, attribution: tileCredits[mapStyle] }).addTo(mapInstanceRef.current);
    baseTileLayerRef.current = newBase;
  }, [mapStyle]);

  // Render Cell Towers & Azimuth Cones
  useEffect(() => {
    if (!towersLayerRef.current || !mapInstanceRef.current) return;
    const layer = towersLayerRef.current;
    layer.clearLayers();

    if (!showTowers) return;

    CELL_TOWER_SECTORS.forEach((twr) => {
      const sectorPolygon = calculateSectorPoints(
        twr.lat,
        twr.lng,
        twr.azimuthDeg,
        twr.beamWidthDeg,
        twr.radiusMeters
      );

      const sector = L.polygon(sectorPolygon, {
        color: "#38bdf8",
        weight: 1.5,
        fillColor: "#0284c7",
        fillOpacity: 0.16,
        dashArray: "3,3",
      }).addTo(layer);

      sector.bindPopup(`
        <div class="p-2.5 font-mono text-xs text-slate-900">
          <strong class="text-sky-700 block text-sm font-bold">${twr.towerName}</strong>
          <span class="text-slate-600 block">BTS ID: ${twr.towerId}</span>
          <div class="mt-2 border-t pt-1.5 space-y-0.5">
            <div>Azimuth Angle: <strong>${twr.azimuthDeg}° (Beam: ${twr.beamWidthDeg}°)</strong></div>
            <div>Coverage Radius: <strong>${(twr.radiusMeters / 1000).toFixed(1)} km</strong></div>
            <div>Operator: <strong>${twr.operator}</strong></div>
            <div>Logged Calls: <strong>${twr.activeCallsCount} intercepts</strong></div>
          </div>
        </div>
      `);

      const towerIcon = L.divIcon({
        className: "custom-tower-marker",
        html: `
          <div style="background-color: #0284c7; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold; box-shadow: 0 0 8px rgba(0,0,0,0.6);">
            📡
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      L.marker([twr.lat, twr.lng], { icon: towerIcon })
        .bindTooltip(`${twr.towerName} (${twr.azimuthDeg}°)`, { sticky: true })
        .addTo(layer);
    });
  }, [showTowers]);

  // Render Geofences with Blinking Caution Pins for Alert Zones
  useEffect(() => {
    if (!geofencesLayerRef.current || !mapInstanceRef.current) return;
    const layer = geofencesLayerRef.current;
    layer.clearLayers();

    if (!showGeofences) return;

    GEOFENCE_ZONES.forEach((zone) => {
      L.circle([zone.center.lat, zone.center.lng], {
        radius: zone.radiusMeters,
        color: zone.alertTriggered ? "#ef4444" : "#f59e0b",
        weight: 2,
        fillColor: zone.alertTriggered ? "#ef4444" : "#f59e0b",
        fillOpacity: 0.16,
        dashArray: "5,5",
      }).addTo(layer);

      // Blinking caution pin on the alert zone center
      if (zone.alertTriggered) {
        const cautionIcon = L.divIcon({
          className: "geofence-alert-marker",
          html: `
            <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
              <div class="map-radar-pulse" style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(239, 68, 68, 0.6);"></div>
              <div class="caution-blinking-pin" style="width: 26px; height: 26px; border-radius: 50%; background: #dc2626; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 14px rgba(239, 68, 68, 0.9); cursor: pointer; z-index: 10;">
                ⚠️
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const alertMarker = L.marker([zone.center.lat, zone.center.lng], { icon: cautionIcon });
        alertMarker.bindPopup(`
          <div class="p-2.5 font-mono text-xs text-slate-900">
            <strong class="text-rose-700 block text-sm font-bold">⚠️ ${zone.name}</strong>
            <span class="text-slate-600 block">Surveillance Zone: ${zone.category}</span>
            <div class="mt-2 border-t pt-1.5 space-y-1">
              <div>Perimeter: <strong>${zone.radiusMeters}m radius</strong></div>
              <div>Suspects Tracked: <strong class="text-rose-800">${zone.activeSuspectsInside.join(", ")}</strong></div>
              <div class="text-rose-600 font-bold">Active Geofence Breach</div>
            </div>
          </div>
        `);
        alertMarker.addTo(layer);
      }
    });
  }, [showGeofences]);

  // Render Suspect Trajectories & Pins with Blinking Caution on Co-Location / Dead-Drop
  useEffect(() => {
    if (!trajectoryLayerRef.current || !mapInstanceRef.current) return;
    const layer = trajectoryLayerRef.current;
    layer.clearLayers();

    if (!showTrajectories) return;

    // Filter points up to the current event timestamp if scrubbing or playing
    const activeEvent = allEvents[currentStepIndex];
    const maxTimestamp = activeEvent ? new Date(activeEvent.timestamp).getTime() : Infinity;

    // Group trajectory points by suspect
    const suspectTrajectories: { [suspectId: string]: SuspectTrajectoryPoint[] } = {};
    SUSPECT_TRAJECTORIES.forEach((pt) => {
      const ptTime = new Date(pt.timestamp).getTime();
      // Show points that occurred up to the active event timestamp + small window
      if (ptTime <= maxTimestamp || currentStepIndex === allEvents.length - 1) {
        if (!suspectTrajectories[pt.suspectId]) suspectTrajectories[pt.suspectId] = [];
        suspectTrajectories[pt.suspectId].push(pt);
      }
    });

    const suspectColors: { [id: string]: string } = {
      "p-feroz": "#f59e0b", // Amber
      "p-tariq": "#06b6d4", // Cyan
    };

    Object.entries(suspectTrajectories).forEach(([suspectId, points]) => {
      if (points.length === 0) return;
      const color = suspectColors[suspectId] || "#a855f7";
      const coords: [number, number][] = points.map((p) => [p.lat, p.lng]);

      if (coords.length > 1) {
        L.polyline(coords, {
          color: color,
          weight: 3.5,
          opacity: 0.85,
          dashArray: "8,6",
        })
          .bindTooltip(`Trajectory: ${points[0].suspectName}`, { sticky: true })
          .addTo(layer);
      }

      points.forEach((pt, idx) => {
        const isHazardOrCoLocation =
          pt.locationLabel.includes("Dead-Drop") ||
          pt.locationLabel.includes("Co-Location") ||
          pt.locationLabel.includes("Nhava Sheva");

        let icon: L.DivIcon;

        if (isHazardOrCoLocation) {
          // Blinking caution pin without clunky text overlay
          icon = L.divIcon({
            className: "hazard-co-location-pin",
            html: `
              <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
                <div class="map-radar-pulse" style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(239, 68, 68, 0.6);"></div>
                <div class="caution-blinking-pin" style="width: 28px; height: 28px; border-radius: 50%; background: #dc2626; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-size: 15px; box-shadow: 0 0 16px rgba(239, 68, 68, 1); cursor: pointer; z-index: 10;">
                  ⚠️
                </div>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });
        } else {
          // Clean circular waypoint number
          icon = L.divIcon({
            className: "traj-breadcrumb",
            html: `
              <div style="background-color: ${color}; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; color: #0f172a; font-weight: bold; font-size: 9px; box-shadow: 0 0 8px ${color};">
                ${idx + 1}
              </div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
        }

        const marker = L.marker([pt.lat, pt.lng], { icon });
        marker.bindPopup(`
          <div class="p-2.5 font-mono text-xs text-slate-900">
            <strong class="block text-sm font-bold" style="color: ${isHazardOrCoLocation ? "#dc2626" : color}">${pt.suspectName}</strong>
            <div class="text-slate-700 font-semibold mt-0.5">${pt.locationLabel}</div>
            <div class="mt-2 border-t pt-1.5 space-y-0.5">
              <div>Time: <strong>${pt.timestamp}</strong></div>
              <div>Movement Speed: <strong>${pt.speedKmh} km/h</strong></div>
              <div>Activity: <strong>${pt.activityType}</strong></div>
              ${pt.towerAzimuth ? `<div>Azimuth Alignment: <strong>${pt.towerAzimuth}°</strong></div>` : ""}
            </div>
          </div>
        `);
        marker.addTo(layer);
      });
    });
  }, [showTrajectories, currentStepIndex, allEvents, selectedTarget]);

  // Render Network Entity Safehouses & Key Nodes
  useEffect(() => {
    if (!markersLayerRef.current || !mapInstanceRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();
    markerByNodeIdRef.current.clear();

    const geoNodes = nodes.filter((n) => n.details?.geo?.lat && n.details?.geo?.lng);
    geoNodes.forEach((node) => {
      const geo = node.details!.geo!;
      const isKingpin = node.isKingpinCandidate;

      // Pattern Isolation Blur for map nodes
      const isHighlighted = highlightedPatternNodeIds && highlightedPatternNodeIds.length > 0
        ? highlightedPatternNodeIds.includes(node.id)
        : true;
      const opacity = isHighlighted ? 1 : 0.12;
      const filter = isHighlighted ? "none" : "grayscale(100%)";

      const markerHtml = `
        <div style="
          background-color: ${isKingpin ? "#f59e0b" : "#3b82f6"};
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          box-shadow: ${isHighlighted ? '0 0 10px rgba(0,0,0,0.8)' : 'none'};
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0f172a;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
          opacity: ${opacity};
          filter: ${filter};
          transition: all 0.3s ease;
        ">
          ${isKingpin ? "★" : "⚲"}
        </div>
      `;

      const customIcon = L.divIcon({
        className: "custom-geo-marker",
        html: markerHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([geo.lat, geo.lng], { icon: customIcon });
      marker.bindPopup(`
        <div class="p-2.5 font-mono text-xs text-slate-900">
          <strong class="text-sm font-bold block">${node.label}</strong>
          <span class="text-slate-600 block">${node.role || node.type}</span>
          <p class="mt-1 text-slate-700 font-semibold">${geo.name || "Identified Location"}</p>
        </div>
      `);
      marker.on("click", () => onSelectNode(node));
      marker.addTo(layer);
      markerByNodeIdRef.current.set(node.id, marker);
    });
  }, [nodes, onSelectNode, highlightedPatternNodeIds]);

  // Phase 2 — graph → map sync: pan to the focused node and pop its marker.
  useEffect(() => {
    if (!focusSignal || !mapInstanceRef.current) return;
    const marker = markerByNodeIdRef.current.get(focusSignal.nodeId);
    if (!marker) return;
    const latlng = marker.getLatLng();
    mapInstanceRef.current.setView(latlng, Math.max(mapInstanceRef.current.getZoom(), 13), { animate: true });
    // Defer popup so the pan animation settles first
    setTimeout(() => marker.openPopup(), 450);
  }, [focusSignal]);

  // Synchronized Event Highlight & Map Panning during Timeline Playback
  useEffect(() => {
    if (!activeHighlightLayerRef.current || !mapInstanceRef.current) return;
    const layer = activeHighlightLayerRef.current;
    layer.clearLayers();

    const activeEvent = allEvents[currentStepIndex];
    if (!activeEvent || !activeEvent.lat || !activeEvent.lng) return;

    // Smoothly pan map to the active event's location
    mapInstanceRef.current.panTo([activeEvent.lat, activeEvent.lng], {
      animate: true,
      duration: 0.6,
    });

    // Create expanding radar pulse highlight on the active location
    const pulseIcon = L.divIcon({
      className: "active-event-pulse-marker",
      html: `
        <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
          <div class="map-radar-pulse" style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: ${activeEvent.color}; opacity: 0.8;"></div>
          <div style="width: 28px; height: 28px; border-radius: 50%; background: ${activeEvent.color}; border: 3px solid #ffffff; box-shadow: 0 0 16px ${activeEvent.color}; display: flex; align-items: center; justify-content: center; color: #0f172a; font-weight: bold; font-size: 13px; z-index: 10;">
            📍
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    const highlightMarker = L.marker([activeEvent.lat, activeEvent.lng], { icon: pulseIcon });
    highlightMarker
      .bindTooltip(
        `<div class="font-mono text-xs"><strong>${activeEvent.title}</strong><div class="text-[10px] text-slate-300">${activeEvent.areaName}</div></div>`,
        { permanent: true, direction: "top", offset: [0, -18], className: "custom-map-tooltip" }
      )
      .addTo(layer);
  }, [currentStepIndex, allEvents]);

  // Playback Auto-Stepper — Phase 7 Req30 human pacing (Slow 4s / Normal 2.5s / Fast 1.2s).
  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= allEvents.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, PLAYBACK_MS[playbackSpeed]);
    }
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playbackSpeed, allEvents.length]);

  return (
    <div ref={viewRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Clean Header Bar without Clutter */}
      <div className="glass-panel border-white/5 rounded-2xl p-4 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Side: Title */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/20">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-on-surface">Spatial Intelligence Map</h2>
            <p className="text-[10px] text-on-surface-variant mt-0.5 max-w-sm leading-snug">
              Secure Local Topology (Titiler & PMTiles). Threat patterns are optically isolated.
            </p>
          </div>
        </div>

        {/* Right Side: Re-imagined Segmented Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Section A: Overlay Analysis Layers */}
          <div className="flex items-center p-1 bg-surface-container-lowest/50 border border-white/5 rounded-xl shadow-inner">
            <button
              onClick={() => setShowTowers(!showTowers)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all ${showTowers ? "bg-primary-container text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                }`}
              title="Toggle Azimuth Beam Cones"
            >
              <Radio className="w-3 h-3" />
              <span>Towers</span>
            </button>
            <button
              onClick={() => setShowGeofences(!showGeofences)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all ${showGeofences ? "bg-error-container text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                }`}
              title="Toggle Surveillance Zones"
            >
              <Shield className="w-3 h-3" />
              <span>Geofences</span>
            </button>
            <button
              onClick={() => setShowTrajectories(!showTrajectories)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all ${showTrajectories ? "bg-secondary-container text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                }`}
            >
              <Navigation className="w-3 h-3" />
              <span>Trails</span>
            </button>
          </div>

          {/* Section B: Base Maps (Dark option removed) */}
          <div className="flex items-center p-1 bg-surface-container-lowest/50 border border-white/5 rounded-xl shadow-inner">
            <button
              onClick={() => setMapStyle("satellite")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all ${mapStyle === "satellite" ? "bg-surface-container-high text-primary font-bold shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                }`}
            >
              Sat (COG)
            </button>
            <button
              onClick={() => setMapStyle("streets")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono transition-all ${mapStyle === "streets" ? "bg-surface-container-high text-primary font-bold shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                }`}
            >
              Streets (PMTiles)
            </button>
          </div>

          {/* Section C: Viewport utility */}
          <div className="flex items-center p-1 bg-surface-container-lowest/50 border border-white/5 rounded-xl">
            <button
              onClick={toggleFullscreen}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center transition-all ${isFullscreen ? "bg-primary-container text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                }`}
              title={isFullscreen ? "Exit Fullscreen" : "Expand Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Map & Interactive Side Panel - Reimagined Fullscreen floating style */}
      <div className="relative w-full h-[650px] lg:h-[750px] rounded-2xl overflow-hidden shadow-2xl glass-panel border border-white/5">

        {/* Full span map */}
        <div ref={mapContainerRef} className="absolute inset-0 z-10" />

        {/* Collapsible toggle */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-[450]">
          <button
            onClick={() => setIsTimelineOpen(!isTimelineOpen)}
            className="p-1.5 glass-panel backdrop-blur-md bg-slate-950/80 border-l border-y border-white/10 rounded-l-xl shadow-xl hover:bg-slate-900 transition-colors text-white"
            title={isTimelineOpen ? "Collapse Timeline" : "Expand Timeline"}
          >
            {isTimelineOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        {/* Floating Timeline Panel */}
        <div className={`absolute right-4 top-4 bottom-4 w-96 flex flex-col justify-end z-[400] pointer-events-none transition-transform duration-300 ease-in-out ${isTimelineOpen ? 'translate-x-0' : 'translate-x-[120%]'}`}>
          <div className="glass-strong border border-white/10 rounded-2xl p-5 shadow-2xl h-full flex flex-col justify-between pointer-events-auto backdrop-blur-3xl bg-slate-950/60">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Chronological Trail ({allEvents.length})
                </h3>

                {/* Target Isolation Filter */}
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="bg-surface-container-highest text-on-surface text-[10px] font-mono font-bold rounded-lg px-2 py-1 border border-white/10 outline-none hover:bg-surface-container transition-colors max-w-[120px]"
                >
                  <option value="ALL">ALL TARGETS</option>
                  {uniqueTargets.map(t => <option key={t} value={t}>{t.substring(0, 15)}...</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-1 items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-1.5 bg-primary hover:bg-primary/90 text-on-primary rounded-xl transition-all shadow-[0_0_15px_rgba(226,194,104,0.3)]"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-[1px]" />}
                  </button>
                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentStepIndex(allEvents.length > 0 ? allEvents.length - 1 : 0);
                    }}
                    className="p-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-xl transition-all"
                    title="Reset"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {/* Phase 7 Req30 — playback velocity */}
                  <div className="flex items-center gap-0.5 ml-1 bg-surface-container-lowest/50 border border-white/5 rounded-xl p-1" title="Timeline playback speed">
                    {(["slow", "normal", "fast"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setPlaybackSpeed(s)}
                        className={`px-1.5 py-1 rounded-md text-[9px] font-mono capitalize transition-all ${playbackSpeed === s ? "bg-primary-container text-on-surface font-bold shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                          }`}
                        title={s === "slow" ? "Slow · 4s per event" : s === "normal" ? "Normal · 2.5s per event" : "Fast · 1.2s per event"}
                      >
                        {s === "slow" ? "0.5×" : s === "normal" ? "1×" : "2×"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline Range Slider */}
              <input
                type="range"
                min="0"
                max={Math.max(0, allEvents.length - 1)}
                value={currentStepIndex}
                onChange={(e) => setCurrentStepIndex(parseInt(e.target.value, 10))}
                className="w-full h-1 bg-surface-container-high rounded-full appearance-none mb-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
              />

              {/* Event List with Click-to-Focus */}
              <div className="space-y-3 overflow-y-auto max-h-[550px] pr-2 custom-scrollbar">
                {allEvents.map((ev, idx) => {
                  const isActive = idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <div
                      key={ev.id}
                      onClick={() => setCurrentStepIndex(idx)}
                      className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${isCurrent
                        ? "bg-surface-container border-primary shadow-[0_0_15px_rgba(226,194,104,0.15)] scale-[1.01]"
                        : isActive
                          ? "bg-surface-container-low border-white/5 text-on-surface-variant hover:bg-surface-container"
                          : "bg-surface-container-lowest border-transparent opacity-40 text-on-surface-variant/50"
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="px-2 py-0.5 rounded text-[9px] font-mono font-bold"
                          style={{
                            backgroundColor: `${ev.color}20`,
                            color: ev.color,
                            border: `1px solid ${ev.color}40`,
                          }}
                        >
                          {ev.badge}
                        </span>
                        <span className="text-[10px] font-mono opacity-60">
                          {new Date(ev.timestamp).toLocaleDateString()} {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <strong className="block text-on-surface font-semibold mb-1 text-sm">{ev.title}</strong>
                      <div className="text-[10px] font-mono text-primary mb-1.5 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{ev.areaName}</span>
                      </div>
                      <p className="text-[11px] opacity-80 leading-relaxed font-sans">{ev.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
