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
} from "lucide-react";

interface GeoTimelineViewProps {
  nodes: CrimeNetworkNode[];
  links: CrimeNetworkLink[];
  firs: FIRRecord[];
  cdrs: CDRRecord[];
  financials: FinancialRecord[];
  intels: IntelRecord[];
  onSelectNode: (node: CrimeNetworkNode) => void;
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
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);

  // Layer groups
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const towersLayerRef = useRef<L.LayerGroup | null>(null);
  const geofencesLayerRef = useRef<L.LayerGroup | null>(null);
  const trajectoryLayerRef = useRef<L.LayerGroup | null>(null);
  const activeHighlightLayerRef = useRef<L.LayerGroup | null>(null);

  // Layer Visibility Filters
  const [showTowers, setShowTowers] = useState(true);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [mapStyle, setMapStyle] = useState<"dark" | "satellite" | "streets">("dark");

  // Timeline events unified with accurate area coordinates
  const allEvents = useMemo(() => {
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
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [firs, cdrs, financials, intels]);

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(allEvents.length - 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Initialize Map with 100% Free, Public, Reliable Tile Layers (No API Key Required)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [18.98, 72.93],
      zoom: 11,
      attributionControl: false,
    });

    // Zero API key, highly reliable public tile providers
    const tileUrls = {
      dark: "https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
      satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    };

    const baseLayer = L.tileLayer(tileUrls[mapStyle], {
      maxZoom: 19,
      subdomains: "abcd",
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
      dark: "https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
      satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    };

    mapInstanceRef.current.removeLayer(baseTileLayerRef.current);
    const newBase = L.tileLayer(tileUrls[mapStyle], { maxZoom: 19, subdomains: "abcd" }).addTo(mapInstanceRef.current);
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
  }, [showTrajectories, currentStepIndex, allEvents]);

  // Render Network Entity Safehouses & Key Nodes
  useEffect(() => {
    if (!markersLayerRef.current || !mapInstanceRef.current) return;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    const geoNodes = nodes.filter((n) => n.details?.geo?.lat && n.details?.geo?.lng);
    geoNodes.forEach((node) => {
      const geo = node.details!.geo!;
      const isKingpin = node.isKingpinCandidate;

      const markerHtml = `
        <div style="
          background-color: ${isKingpin ? "#f59e0b" : "#3b82f6"};
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0f172a;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
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
    });
  }, [nodes, onSelectNode]);

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

  // Playback Auto-Stepper
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
      }, 2000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, allEvents.length]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Clean Header Bar without Clutter */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Geospatial & Spatio-Temporal Intelligence Map
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Accurate incident locations, suspect trajectories, and synchronized chronological playback.
            </p>
          </div>
        </div>

        {/* Clean Layer Toggles & Free Map Theme Switcher */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
          <button
            onClick={() => setShowTowers(!showTowers)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
              showTowers ? "bg-sky-500/20 text-sky-300 border border-sky-500/40" : "text-slate-500 line-through"
            }`}
            title="Toggle Cell Towers and 120° Azimuth Beam Cones"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Towers ({CELL_TOWER_SECTORS.length})</span>
          </button>

          <button
            onClick={() => setShowGeofences(!showGeofences)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
              showGeofences ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" : "text-slate-500 line-through"
            }`}
            title="Toggle Surveillance Geofences"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Geofences ({GEOFENCE_ZONES.length})</span>
          </button>

          <button
            onClick={() => setShowTrajectories(!showTrajectories)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
              showTrajectories ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-slate-500 line-through"
            }`}
            title="Toggle Suspect GPS Trajectory Trails"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Trajectories</span>
          </button>

          {/* Map Theme Switcher (100% Free Open Layers) */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            <button
              onClick={() => setMapStyle("dark")}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                mapStyle === "dark" ? "bg-slate-800 text-amber-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Dark
            </button>
            <button
              onClick={() => setMapStyle("satellite")}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                mapStyle === "satellite" ? "bg-slate-800 text-amber-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Satellite
            </button>
            <button
              onClick={() => setMapStyle("streets")}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                mapStyle === "streets" ? "bg-slate-800 text-amber-400 font-bold border border-slate-700" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Streets
            </button>
          </div>
        </div>
      </div>

      {/* Main Map & Interactive Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl h-[560px] relative">
          <div ref={mapContainerRef} className="w-full h-full z-10" />
        </div>

        {/* Chronological Incident Trail & Event Scrubber */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between h-[560px]">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Chronological Trail ({allEvents.length} Events)
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStepIndex(0);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg"
                  title="Reset"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Timeline Range Slider */}
            <input
              type="range"
              min="0"
              max={Math.max(0, allEvents.length - 1)}
              value={currentStepIndex}
              onChange={(e) => setCurrentStepIndex(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 mb-3 cursor-pointer"
            />

            {/* Event List with Click-to-Focus */}
            <div className="space-y-2.5 overflow-y-auto max-h-[410px] pr-1">
              {allEvents.map((ev, idx) => {
                const isActive = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div
                    key={ev.id}
                    onClick={() => setCurrentStepIndex(idx)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isCurrent
                        ? "bg-slate-800 border-amber-500 shadow-lg scale-[1.01]"
                        : isActive
                        ? "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
                        : "bg-slate-950/30 border-slate-900 opacity-40 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
                        style={{
                          backgroundColor: `${ev.color}20`,
                          color: ev.color,
                          border: `1px solid ${ev.color}40`,
                        }}
                      >
                        {ev.badge}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(ev.timestamp).toLocaleDateString()} {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <strong className="block text-slate-100 font-semibold mb-0.5">{ev.title}</strong>
                    <div className="text-[10px] font-mono text-amber-400/90 mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{ev.areaName}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">{ev.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
