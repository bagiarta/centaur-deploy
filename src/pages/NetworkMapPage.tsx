
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/components/ui-enterprise";
import {
  Server,
  Monitor,
  Activity,
  Globe,
  Link2,
  Trash2,
  Maximize2,
  Move,
  Filter,
  ChevronDown,
  Plus,
  Minus,
  Search,
  Share2,
  MousePointer2,
  LayoutGrid,
  Focus,
  ChevronsUpDown,
  X,
  FolderPlus,
  ScanLine,
  Ungroup,
  Lock,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compareIpAddresses, compareSubnetLabels, getSubnetLabel } from "@/lib/network";
import { AnimatePresence, motion, useDragControls } from "framer-motion";

interface Device {
  id: string;
  hostname: string;
  ip: string;
  status: string;
  os_version: string;
}

interface Connection {
  from: string;
  to: string;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MeshZone {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  collapsed: boolean;
  deviceIds: string[];
}

type LayoutMode = "topology" | "physical";
type InteractionMode = "select" | "pan";

const STORAGE_POSITIONS = "network-map-positions";
const STORAGE_CONNECTIONS = "network-map-connections";
const STORAGE_ZONES = "network-map-zones";

const DEVICE_NODE_SIZE = 64;
const DEVICE_CARD_WIDTH = 140;
const DEVICE_CARD_HEIGHT = 112;
const DEVICE_SPACING_X = 160;
const DEVICE_SPACING_Y = 120;
const ZONE_MIN_WIDTH = 320;
const ZONE_MIN_HEIGHT = 200;
const ZONE_HEADER_HEIGHT = 56;
const ZONE_COLLAPSED_HEIGHT = 76;
const ZONE_PADDING = 24;
const GRID_SIZE = 20;
const ZONE_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#fb7185", "#a78bfa", "#14b8a6"];

const loadJson = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeRect = (rect: Rect): Rect => ({
  x: rect.width >= 0 ? rect.x : rect.x + rect.width,
  y: rect.height >= 0 ? rect.y : rect.y + rect.height,
  width: Math.abs(rect.width),
  height: Math.abs(rect.height),
});

const rectsIntersect = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const uniq = (values: string[]) => Array.from(new Set(values));
const snapValue = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;
const snapPoint = (point: Point): Point => ({ x: snapValue(point.x), y: snapValue(point.y) });
const makeConnectionKey = (from: string, to: string) => [from, to].sort().join("::");

type ZoneCardProps = {
  zone: MeshZone;
  isActive: boolean;
  visibleMembers: number;
  zoom: number;
  locked: boolean;
  onSelect: () => void;
  onZoneDragStart: () => void;
  onZoneDrag: (info: { offset: Point }) => void;
  onZoneDragEnd: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
};

function ZoneCard({
  zone,
  isActive,
  visibleMembers,
  zoom,
  locked,
  onSelect,
  onZoneDragStart,
  onZoneDrag,
  onZoneDragEnd,
  onToggleCollapse,
  onDelete,
  onResizeStart,
}: ZoneCardProps) {
  const dragControls = useDragControls();

  return (
    <motion.div
      drag={!locked}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      data-mesh-interactive="true"
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDragStart={onZoneDragStart}
      onDrag={(_, info) => {
        onZoneDrag({ offset: { x: info.offset.x, y: info.offset.y } });
      }}
      onDragEnd={onZoneDragEnd}
      animate={{ x: zone.x, y: zone.y, width: zone.width, height: zone.collapsed ? ZONE_COLLAPSED_HEIGHT : zone.height }}
      transition={{ type: "spring", damping: 26, stiffness: 320 }}
      className={cn("absolute z-30 rounded-xl border shadow-2xl overflow-hidden", isActive ? "ring-2 ring-primary/50" : "ring-1 ring-transparent")}
      style={{ backgroundColor: "rgba(8, 15, 28, 0.82)", borderColor: `${zone.color}80` }}
    >
      <div
        data-mesh-interactive="true"
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect();
          if (!locked) {
            dragControls.start(event);
          }
        }}
        className={cn("h-14 px-4 flex items-center justify-between border-b", locked ? "cursor-default" : "cursor-grab active:cursor-grabbing")}
        style={{ borderColor: `${zone.color}35`, backgroundColor: "rgba(6, 12, 20, 0.95)" }}
      >
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-md border border-white/10 bg-white/5 text-white/60 shrink-0">
            <Move className="w-3.5 h-3.5" />
          </div>
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate uppercase tracking-wide">{zone.title}</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-black">
              {zone.deviceIds.length} node · {visibleMembers} visible · {locked ? "layout locked" : "drag header"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(event) => { event.stopPropagation(); onToggleCollapse(); }} className="p-2 rounded-lg bg-black/15 hover:bg-black/25 text-white/70 transition-colors" title={zone.collapsed ? "Expand group" : "Collapse group"}>
            {zone.collapsed ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          </button>
          <button onClick={(event) => { event.stopPropagation(); onDelete(); }} className="p-2 rounded-lg bg-black/15 hover:bg-danger/20 text-white/70 hover:text-danger transition-colors" title="Delete group">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!zone.collapsed && (
        <>
          <div className="absolute inset-x-0 top-14 bottom-0 pointer-events-none rounded-b-xl bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_60%)]" />
          <div className="absolute inset-x-3 top-[68px] bottom-3 pointer-events-none rounded-lg border border-dashed" style={{ borderColor: `${zone.color}35` }} />
        </>
      )}

      {!zone.collapsed && !locked && (
        <button
          data-mesh-interactive="true"
          onPointerDown={onResizeStart}
          className="absolute right-2 bottom-2 min-w-[98px] h-8 px-2 rounded-lg bg-black/30 hover:bg-black/45 border border-white/10 flex items-center justify-center gap-1.5 text-white/70 transition-colors"
          title="Resize group"
        >
          <ChevronsUpDown className="w-3.5 h-3.5 rotate-45" />
          <span className="text-[9px] font-black uppercase tracking-wider">Resize</span>
        </button>
      )}
    </motion.div>
  );
}

export default function NetworkMapPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("topology");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("select");
  const [linkModeFrom, setLinkModeFrom] = useState<string | null>(null);
  const [subnetFilter, setSubnetFilter] = useState<string>("all");
  const [zoom, setZoom] = useState(0.85);
  const [searchTerm, setSearchTerm] = useState("");
  const [canvasOffset, setCanvasOffset] = useState<Point>({ x: 0, y: 0 });
  const [layoutLocked, setLayoutLocked] = useState(false);
  const [positions, setPositions] = useState<Record<string, Point>>(() => loadJson(STORAGE_POSITIONS, {}));
  const [connections, setConnections] = useState<Connection[]>(() => loadJson(STORAGE_CONNECTIONS, []));
  const [zones, setZones] = useState<MeshZone[]>(() => loadJson(STORAGE_ZONES, []));
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasDragControls = useDragControls();
  const canvasDragStartRef = useRef<Point>({ x: 0, y: 0 });
  const selectionStartRef = useRef<Point | null>(null);
  const selectionBaseRef = useRef<string[]>([]);
  const zoneDragStateRef = useRef<{ zoneId: string; startX: number; startY: number; memberPositions: Record<string, Point> } | null>(null);
  const [activeResize, setActiveResize] = useState<{ zoneId: string; startClientX: number; startClientY: number; startWidth: number; startHeight: number } | null>(null);

  useEffect(() => {
    fetch("/api/devices")
      .then((res) => res.json())
      .then((data) => {
        setDevices(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch devices for map", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => localStorage.setItem(STORAGE_POSITIONS, JSON.stringify(positions)), [positions]);
  useEffect(() => localStorage.setItem(STORAGE_CONNECTIONS, JSON.stringify(connections)), [connections]);
  useEffect(() => localStorage.setItem(STORAGE_ZONES, JSON.stringify(zones)), [zones]);

  const sortedDevices = useMemo(() => {
    return [...devices].sort((a, b) => {
      const subnetCompare = compareSubnetLabels(getSubnetLabel(a.ip), getSubnetLabel(b.ip));
      if (subnetCompare !== 0) return subnetCompare;
      const ipCompare = compareIpAddresses(a.ip, b.ip);
      if (ipCompare !== 0) return ipCompare;
      return a.hostname.localeCompare(b.hostname);
    });
  }, [devices]);

  const stablePositions = useMemo(() => {
    const map: Record<string, Point> = {};
    sortedDevices.forEach((dev, idx) => {
      map[dev.id] = { x: 1800 + (idx % 12) * 220, y: 1800 + Math.floor(idx / 12) * 180 };
    });
    return map;
  }, [sortedDevices]);

  const deviceMap = useMemo(() => sortedDevices.reduce<Record<string, Device>>((acc, device) => {
    acc[device.id] = device;
    return acc;
  }, {}), [sortedDevices]);

  const zoneByDeviceId = useMemo(() => {
    const map: Record<string, MeshZone> = {};
    zones.forEach((zone) => zone.deviceIds.forEach((deviceId) => {
      map[deviceId] = zone;
    }));
    return map;
  }, [zones]);

  const subnets = useMemo(() => {
    return sortedDevices.reduce((acc, dev) => {
      if (!dev.ip) return acc;
      const subnet = getSubnetLabel(dev.ip);
      if (!acc[subnet]) acc[subnet] = [];
      acc[subnet].push(dev);
      return acc;
    }, {} as Record<string, Device[]>);
  }, [sortedDevices]);

  const subnetKeys = useMemo(() => Object.keys(subnets).sort(compareSubnetLabels), [subnets]);

  const filteredDevices = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    return sortedDevices.filter((device) => {
      const matchFilter = subnetFilter === "all" || (device.ip || "").startsWith(subnetFilter.replace(".x", ""));
      const matchSearch = device.hostname.toLowerCase().includes(normalizedSearch) || device.ip.toLowerCase().includes(normalizedSearch);
      return matchFilter && matchSearch;
    });
  }, [sortedDevices, subnetFilter, searchTerm]);

  const visibleDeviceIds = useMemo(() => new Set(filteredDevices.map((device) => device.id)), [filteredDevices]);
  const getDevicePos = (id: string) => positions[id] || stablePositions[id] || { x: 1800, y: 1800 };
  const deviceBounds = (id: string): Rect => {
    const pos = getDevicePos(id);
    return { x: pos.x - (DEVICE_CARD_WIDTH - DEVICE_NODE_SIZE) / 2, y: pos.y, width: DEVICE_CARD_WIDTH, height: DEVICE_CARD_HEIGHT };
  };

  const clientPointToCanvas = (clientX: number, clientY: number): Point | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left - canvasOffset.x) / zoom, y: (clientY - rect.top - canvasOffset.y) / zoom };
  };

  const centerCanvasOnRect = (rect: Rect) => {
    if (!containerRef.current) return;
    const viewport = containerRef.current.getBoundingClientRect();
    setCanvasOffset({
      x: viewport.width / 2 - (rect.x + rect.width / 2) * zoom,
      y: viewport.height / 2 - (rect.y + rect.height / 2) * zoom,
    });
  };

  const centerMapOn = (targetDevices: Device[]) => {
    if (targetDevices.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    targetDevices.forEach((device) => {
      const bounds = deviceBounds(device.id);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    });
    centerCanvasOnRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
  };

  const getViewportCanvasCenter = (): Point => {
    if (!containerRef.current) return { x: 1900, y: 1900 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (rect.width / 2 - canvasOffset.x) / zoom, y: (rect.height / 2 - canvasOffset.y) / zoom };
  };
  const arrangeZoneMembers = (zone: MeshZone, basePositions: Record<string, Point>) => {
    const memberIds = zone.deviceIds.filter((id) => deviceMap[id]);
    if (zone.collapsed) {
      return { zone: { ...zone, deviceIds: memberIds, height: ZONE_COLLAPSED_HEIGHT }, nextPositions: basePositions };
    }

    const availableWidth = Math.max(zone.width - ZONE_PADDING * 2, DEVICE_SPACING_X);
    const columns = Math.max(1, Math.floor(availableWidth / DEVICE_SPACING_X));
    const rows = Math.max(1, Math.ceil(memberIds.length / columns));
    const requiredHeight = Math.max(ZONE_MIN_HEIGHT, ZONE_HEADER_HEIGHT + ZONE_PADDING + rows * DEVICE_SPACING_Y);
    const nextPositions = { ...basePositions };

    memberIds.forEach((deviceId, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      nextPositions[deviceId] = {
        x: Math.round(zone.x + ZONE_PADDING + col * DEVICE_SPACING_X + (DEVICE_SPACING_X - DEVICE_NODE_SIZE) / 2),
        y: Math.round(zone.y + ZONE_HEADER_HEIGHT + ZONE_PADDING + row * DEVICE_SPACING_Y),
      };
    });

    return {
      zone: { ...zone, deviceIds: memberIds, height: Math.max(zone.height, requiredHeight) },
      nextPositions,
    };
  };

  const focusZone = (zone: MeshZone) => {
    centerCanvasOnRect({ x: zone.x, y: zone.y, width: zone.width, height: zone.collapsed ? ZONE_COLLAPSED_HEIGHT : zone.height });
    setSelectedZoneId(zone.id);
  };

  const createZone = (deviceIds: string[] = []) => {
    const selectedIds = uniq(deviceIds.filter((id) => deviceMap[id]));
    const center = getViewportCanvasCenter();
    let zoneX = center.x - ZONE_MIN_WIDTH / 2;
    let zoneY = center.y - ZONE_MIN_HEIGHT / 2;
    let zoneWidth = ZONE_MIN_WIDTH;
    let zoneHeight = ZONE_MIN_HEIGHT;

    if (selectedIds.length > 0) {
      const bounds = selectedIds.reduce<Rect | null>((acc, id) => {
        const rect = deviceBounds(id);
        if (!acc) return rect;
        const minX = Math.min(acc.x, rect.x);
        const minY = Math.min(acc.y, rect.y);
        const maxX = Math.max(acc.x + acc.width, rect.x + rect.width);
        const maxY = Math.max(acc.y + acc.height, rect.y + rect.height);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }, null);

      if (bounds) {
        zoneX = bounds.x - 28;
        zoneY = bounds.y - 36;
        zoneWidth = Math.max(ZONE_MIN_WIDTH, bounds.width + 56);
        zoneHeight = Math.max(ZONE_MIN_HEIGHT, bounds.height + 88);
      }
    }

    const nextZone: MeshZone = {
      id: `zone-${Date.now()}`,
      title: `Group ${zones.length + 1}`,
      x: Math.round(zoneX),
      y: Math.round(zoneY),
      width: Math.round(zoneWidth),
      height: Math.round(zoneHeight),
      color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
      collapsed: false,
      deviceIds: selectedIds,
    };

    const detachedZones = zones.map((zone) => ({ ...zone, deviceIds: zone.deviceIds.filter((id) => !selectedIds.includes(id)) }));
    const arranged = arrangeZoneMembers(nextZone, positions);
    setZones([...detachedZones, arranged.zone]);
    setPositions(arranged.nextPositions);
    setSelectedZoneId(nextZone.id);
    setSelectedDeviceIds(selectedIds);
  };

  const assignDevicesToZone = (zoneId: string, deviceIds: string[]) => {
    const cleanIds = uniq(deviceIds.filter((id) => deviceMap[id]));
    if (cleanIds.length === 0) return;

    const detachedZones = zones.map((zone) => ({ ...zone, deviceIds: zone.deviceIds.filter((id) => !cleanIds.includes(id)) }));
    const targetZone = detachedZones.find((zone) => zone.id === zoneId);
    if (!targetZone) return;

    const arranged = arrangeZoneMembers({ ...targetZone, deviceIds: uniq([...targetZone.deviceIds, ...cleanIds]) }, positions);
    setZones(detachedZones.map((zone) => (zone.id === zoneId ? arranged.zone : zone)));
    setPositions(arranged.nextPositions);
    setSelectedZoneId(zoneId);
  };

  const removeDevicesFromZones = (deviceIds: string[]) => {
    const cleanIds = new Set(deviceIds);
    if (cleanIds.size === 0) return;
    setZones((prev) => prev.map((zone) => ({ ...zone, deviceIds: zone.deviceIds.filter((id) => !cleanIds.has(id)) })));
  };

  const updateZone = (zoneId: string, patch: Partial<MeshZone>) => {
    setZones((prev) => prev.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)));
  };

  const toggleZoneCollapsed = (zoneId: string) => {
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone) return;
    const arranged = arrangeZoneMembers({ ...zone, collapsed: !zone.collapsed }, positions);
    setZones((prev) => prev.map((item) => (item.id === zoneId ? arranged.zone : item)));
    setPositions(arranged.nextPositions);
    setSelectedZoneId(zoneId);
  };

  const deleteZone = (zoneId: string) => {
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone) return;
    if (!window.confirm(`Delete group "${zone.title}"? Devices will remain on the canvas.`)) return;
    setZones((prev) => prev.filter((item) => item.id !== zoneId));
    if (selectedZoneId === zoneId) setSelectedZoneId(null);
  };

  const addConnection = (toId: string) => {
    if (!linkModeFrom || linkModeFrom === toId) {
      setLinkModeFrom(null);
      return;
    }

    const exists = connections.some((connection) =>
      (connection.from === linkModeFrom && connection.to === toId) ||
      (connection.from === toId && connection.to === linkModeFrom)
    );

    if (!exists) {
      setConnections([...connections, { from: linkModeFrom, to: toId }]);
    }
    setLinkModeFrom(null);
  };

  const removeConnection = (from: string, to: string) => {
    setConnections((prev) => prev.filter((connection) => !((connection.from === from && connection.to === to) || (connection.from === to && connection.to === from))));
  };

  const autoArrange = () => {
    let nextPositions: Record<string, Point> = {};
    const nextZones = zones.map((zone) => {
      const arranged = arrangeZoneMembers(zone, nextPositions);
      nextPositions = arranged.nextPositions;
      return arranged.zone;
    });

    const groupedIds = new Set(nextZones.flatMap((zone) => zone.deviceIds));
    const freeDevices = filteredDevices.filter((device) => !groupedIds.has(device.id));
    const itemsPerRow = Math.max(1, Math.ceil(Math.sqrt(freeDevices.length || 1)));

    freeDevices.forEach((device, index) => {
      const row = Math.floor(index / itemsPerRow);
      const col = index % itemsPerRow;
      nextPositions[device.id] = { x: 1800 + col * 220, y: 1800 + row * 180 };
    });

    setZones(nextZones);
    setPositions(nextPositions);
    centerMapOn(filteredDevices);
  };

  const hiddenDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    zones.forEach((zone) => {
      if (!zone.collapsed) return;
      zone.deviceIds.forEach((deviceId) => ids.add(deviceId));
    });
    return ids;
  }, [zones]);

  const visibleConnections = useMemo(() => {
    return connections.map((connection) => {
      if (hiddenDeviceIds.has(connection.from) || hiddenDeviceIds.has(connection.to)) return null;
      const firstDevice = deviceMap[connection.from];
      const secondDevice = deviceMap[connection.to];
      if (!firstDevice || !secondDevice) return null;
      const pointA = getDevicePos(connection.from);
      const pointB = getDevicePos(connection.to);
      const isAlert = firstDevice.status === "offline" || secondDevice.status === "offline";
      const x1 = pointA.x + 32;
      const y1 = pointA.y + 32;
      const x2 = pointB.x + 32;
      const y2 = pointB.y + 32;
      const elbowX = Math.round((x1 + x2) / 2);
      return {
        fromId: connection.from,
        toId: connection.to,
        x1,
        y1,
        x2,
        y2,
        elbowX,
        midX: elbowX,
        midY: Math.round((y1 + y2) / 2),
        path: `M ${x1} ${y1} L ${elbowX} ${y1} L ${elbowX} ${y2} L ${x2} ${y2}`,
        status: isAlert ? "offline" : firstDevice.status === "online" && secondDevice.status === "online" ? "online" : "unknown",
      };
    }).filter(Boolean);
  }, [connections, deviceMap, hiddenDeviceIds, positions, stablePositions]);

  useEffect(() => {
    if (!loading && layoutMode === "physical") {
      const timer = window.setTimeout(() => centerMapOn(filteredDevices), 100);
      return () => window.clearTimeout(timer);
    }
  }, [subnetFilter, layoutMode, loading]);

  useEffect(() => {
    if (!activeResize) return;

    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const deltaX = (event.clientX - activeResize.startClientX) / zoom;
      const deltaY = (event.clientY - activeResize.startClientY) / zoom;
      setZones((prev) =>
        prev.map((zone) =>
          zone.id === activeResize.zoneId
            ? {
                ...zone,
                width: Math.max(ZONE_MIN_WIDTH, Math.round(activeResize.startWidth + deltaX)),
                height: Math.max(ZONE_MIN_HEIGHT, Math.round(activeResize.startHeight + deltaY)),
              }
            : zone
        )
      );
    };

    const handlePointerUp = () => {
      const zone = zones.find((item) => item.id === activeResize.zoneId);
      setActiveResize(null);
      if (!zone) return;

      const snappedZone = {
        ...zone,
        width: Math.max(ZONE_MIN_WIDTH, snapValue(zone.width)),
        height: Math.max(ZONE_MIN_HEIGHT, snapValue(zone.height)),
      };
      const arranged = arrangeZoneMembers(snappedZone, positions);
      setZones((prev) => prev.map((item) => (item.id === zone.id ? arranged.zone : item)));
      setPositions(arranged.nextPositions);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeResize, positions, zones, zoom]);
  useEffect(() => {
    if (!selectionStartRef.current) return;

    const handlePointerMove = (event: PointerEvent) => {
      const start = selectionStartRef.current;
      if (!start) return;
      const point = clientPointToCanvas(event.clientX, event.clientY);
      if (!point) return;
      setSelectionRect({ x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y });
    };

    const handlePointerUp = () => {
      const start = selectionStartRef.current;
      const activeRect = selectionRect;
      selectionStartRef.current = null;
      if (!start || !activeRect) {
        setSelectionRect(null);
        return;
      }

      const normalized = normalizeRect(activeRect);
      if (normalized.width < 8 && normalized.height < 8) {
        setSelectionRect(null);
        return;
      }

      const hits = filteredDevices.filter((device) => rectsIntersect(normalized, deviceBounds(device.id))).map((device) => device.id);
      setSelectedDeviceIds(uniq([...selectionBaseRef.current, ...hits]));
      setSelectedZoneId(null);
      setSelectionRect(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [filteredDevices, selectionRect, zoom]);

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (layoutMode !== "physical") return;
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest("[data-mesh-interactive='true']")) return;

    if (interactionMode === "pan") {
      canvasDragStartRef.current = canvasOffset;
      canvasDragControls.start(event);
      return;
    }

    if (layoutLocked) return;
    if (linkModeFrom) return;

    const point = clientPointToCanvas(event.clientX, event.clientY);
    if (!point) return;
    selectionBaseRef.current = event.metaKey || event.ctrlKey ? selectedDeviceIds : [];
    selectionStartRef.current = point;
    setSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
    if (!(event.metaKey || event.ctrlKey)) {
      setSelectedZoneId(null);
    }
  };

  const handleDeviceSelection = (event: React.MouseEvent, deviceId: string) => {
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      setSelectedDeviceIds((prev) => prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]);
    } else {
      setSelectedDeviceIds([deviceId]);
    }
    setSelectedZoneId(zoneByDeviceId[deviceId]?.id || null);
  };

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null;
  const renderedDevices = filteredDevices.filter((device) => !hiddenDeviceIds.has(device.id));
  const selectedGroupDeviceIds = selectedZone ? selectedZone.deviceIds : [];
  const deleteEnabledConnectionKeys = useMemo(() => {
    const targets = new Set([...selectedDeviceIds, ...selectedGroupDeviceIds]);
    if (targets.size === 0) return new Set<string>();

    return new Set(
      visibleConnections
        .filter((line) => targets.has(line!.fromId) || targets.has(line!.toId))
        .map((line) => makeConnectionKey(line!.fromId, line!.toId))
    );
  }, [selectedDeviceIds, selectedGroupDeviceIds, visibleConnections]);

  return (
    <div className="p-3 bg-background h-screen flex flex-col gap-4 animate-fade-up overflow-hidden relative">
      <div className="flex justify-between items-center shrink-0 z-50 bg-slate-900/60 p-3 rounded-2xl border border-white/5 backdrop-blur-3xl shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20"><Globe className="w-5 h-5 text-primary" /></div>
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-[0.18em] leading-none">Mesh Board v2.7.1</h1>
            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">{devices.length} Nodes Total · {zones.length} Groups</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden group/filter transition-all focus-within:border-primary/50">
            <div className="relative px-2 flex items-center">
              <Search className="w-3.5 h-3.5 text-primary/60 group-focus-within/filter:text-primary transition-colors" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search Intel..." className="bg-transparent text-[10px] font-black text-white placeholder:text-white/20 focus:outline-none w-24 hover:w-32 transition-all ml-1.5" />
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 rounded-lg transition-all cursor-pointer">
              <Filter className="w-3 h-3 text-primary" />
              <select value={subnetFilter} onChange={(event) => setSubnetFilter(event.target.value)} className="bg-transparent text-[10px] font-black text-white/90 outline-none cursor-pointer appearance-none uppercase tracking-tighter">
                <option value="all" className="bg-slate-900 text-white">GLOBAL_MESH</option>
                {subnetKeys.map((subnet) => <option key={subnet} value={subnet} className="bg-slate-900 text-white">{subnet}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 text-white/40" />
            </div>
          </div>

          <div className="flex bg-slate-900 border border-white/10 p-0.5 rounded-xl shadow-inner">
            <button onClick={() => setLayoutMode("topology")} className={cn("px-4 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all flex items-center gap-1.5", layoutMode === "topology" ? "bg-primary text-white shadow-glow" : "text-white/40 hover:text-white hover:bg-white/5")}><Maximize2 className="w-3 h-3" /> Logical</button>
            <button onClick={() => setLayoutMode("physical")} className={cn("px-4 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all flex items-center gap-1.5", layoutMode === "physical" ? "bg-primary text-white shadow-glow" : "text-white/40 hover:text-white hover:bg-white/5")}><Move className="w-3 h-3" /> Mesh</button>
          </div>
        </div>
      </div>

      <SectionCard className="flex-1 w-full overflow-hidden relative border-border/40 bg-slate-950/20 glass group rounded-[2rem]">
        {layoutMode === "physical" && (
          <>
            <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
              <div className="flex p-1 bg-slate-900/90 border border-white/10 rounded-xl backdrop-blur-3xl shadow-2xl">
                <button onClick={() => setZoom(Math.min(zoom + 0.1, 2))} className="p-2 hover:bg-white/10 text-white rounded-lg transition-all"><Plus className="w-3.5 h-3.5" /></button>
                <button onClick={() => setZoom(Math.max(zoom - 0.1, 0.2))} className="p-2 hover:bg-white/10 text-white rounded-lg transition-all"><Minus className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setZoom(0.85); centerMapOn(filteredDevices); }} className="p-2 hover:bg-white/10 text-primary rounded-lg transition-all" title="Reset view"><Focus className="w-3.5 h-3.5" /></button>
              </div>

              <div className="flex bg-slate-900/90 border border-white/10 p-1 rounded-xl backdrop-blur-3xl shadow-2xl">
                <button onClick={() => setInteractionMode("select")} className={cn("px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all", interactionMode === "select" ? "bg-primary text-white shadow-glow" : "text-white/45 hover:text-white hover:bg-white/10")}><MousePointer2 className="w-3 h-3" /> Select</button>
                <button onClick={() => setInteractionMode("pan")} className={cn("px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all", interactionMode === "pan" ? "bg-primary text-white shadow-glow" : "text-white/45 hover:text-white hover:bg-white/10")}><Move className="w-3 h-3" /> Pan</button>
              </div>

              <button onClick={autoArrange} className="px-3 py-2 bg-primary/20 hover:bg-primary border border-primary/40 text-primary hover:text-white rounded-xl backdrop-blur-xl shadow-glow transition-all flex items-center gap-1.5 text-[9px] font-black uppercase"><LayoutGrid className="w-3 h-3" /> Auto Arrange</button>
              <button
                onClick={() => setLayoutLocked((prev) => !prev)}
                className={cn(
                  "px-3 py-2 rounded-xl backdrop-blur-xl transition-all flex items-center gap-1.5 text-[9px] font-black uppercase border",
                  layoutLocked
                    ? "bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30"
                    : "bg-slate-900/90 border-white/10 text-white/80 hover:bg-white/10"
                )}
              >
                {layoutLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {layoutLocked ? "Layout Locked" : "Layout Free"}
              </button>
            </div>

            <div className="absolute top-4 left-4 z-50 w-[340px] rounded-[1.5rem] border border-white/10 bg-slate-900/88 backdrop-blur-3xl shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.25em]">Mesh Grouping</p>
                  <h3 className="text-sm font-black text-white tracking-tight">Work Zones</h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40 uppercase font-black tracking-wider">Selected</p>
                  <p className="text-sm font-black text-primary">{selectedDeviceIds.length}</p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => createZone()} className="px-3 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"><FolderPlus className="w-3.5 h-3.5" /> Empty Group</button>
                  <button onClick={() => createZone(selectedDeviceIds)} disabled={selectedDeviceIds.length === 0} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"><ScanLine className="w-3.5 h-3.5" /> Group Selected</button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => selectedZone && assignDevicesToZone(selectedZone.id, selectedDeviceIds)} disabled={!selectedZone || selectedDeviceIds.length === 0} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"><Plus className="w-3.5 h-3.5" /> Add To Active</button>
                  <button onClick={() => removeDevicesFromZones(selectedDeviceIds)} disabled={selectedDeviceIds.length === 0} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"><Ungroup className="w-3.5 h-3.5" /> Ungroup</button>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-[11px] text-white/65 leading-relaxed">
                  Gunakan <span className="text-primary font-black">drag box</span> di mode Select untuk memilih banyak device.
                  <span className="block mt-1">Untuk group: <span className="text-white font-bold">drag header</span> untuk pindah posisi dan <span className="text-white font-bold">tarik handle pojok kanan bawah</span> untuk ubah ukuran.</span>
                  <span className="block mt-1">Saat <span className="text-white font-bold">Layout Locked</span> aktif, group dan device tidak bisa digeser.</span>
                </div>

                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {zones.length === 0 && <div className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-sm text-white/45">Belum ada group card. Buat group kosong atau pilih device lalu `Group Selected`.</div>}
                  {zones.map((zone) => {
                    const visibleCount = zone.deviceIds.filter((deviceId) => visibleDeviceIds.has(deviceId)).length;
                    const isActive = zone.id === selectedZoneId;
                    return (
                      <div key={zone.id} className={cn("rounded-xl border p-3 transition-all", isActive ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/5")}>
                        <div className="flex items-start gap-3">
                          <div className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                          <div className="min-w-0 flex-1 space-y-2">
                            <input value={zone.title} onChange={(event) => updateZone(zone.id, { title: event.target.value })} onFocus={() => setSelectedZoneId(zone.id)} className="w-full bg-transparent text-sm font-black text-white outline-none border-none p-0" />
                            <p className="text-[10px] text-white/45 uppercase font-black tracking-wider">{zone.deviceIds.length} device · {visibleCount} visible</p>
                          </div>
                          <button onClick={() => setSelectedZoneId(zone.id)} className="p-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Set active group"><ChevronsUpDown className="w-3.5 h-3.5" /></button>
                        </div>

                        <div className="mt-3 grid grid-cols-4 gap-2">
                          <button onClick={() => focusZone(zone)} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1"><Focus className="w-3 h-3" /> Focus</button>
                          <button onClick={() => assignDevicesToZone(zone.id, selectedDeviceIds)} disabled={selectedDeviceIds.length === 0} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-[9px] font-black uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add</button>
                          <button onClick={() => toggleZoneCollapsed(zone.id)} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1">{zone.collapsed ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}{zone.collapsed ? "Open" : "Fold"}</button>
                          <button onClick={() => deleteZone(zone.id)} className="px-2 py-2 rounded-lg bg-danger/10 hover:bg-danger/20 border border-danger/20 text-[9px] font-black uppercase tracking-wider text-danger transition-all flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> Del</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="absolute inset-0 z-0 pointer-events-none" style={{ backgroundImage: `radial-gradient(circle, #ffffff08 1.5px, transparent 1.5px)`, backgroundSize: "120px 120px", opacity: 0.2 }} />

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-md z-50">
            <Activity className="w-12 h-12 text-primary animate-spin" />
            <p className="text-foreground-muted font-black tracking-widest uppercase text-[10px] animate-pulse">Syncing Intel Mesh...</p>
          </div>
        ) : (
          <div className="w-full h-full relative group/canvas overflow-hidden" ref={containerRef}>
            {layoutMode === "topology" ? (
              <div className="flex flex-col items-center gap-12 p-12 overflow-auto h-full w-full custom-scrollbar">
                <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative mb-8 text-center group">
                  <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 group-hover:bg-primary/30 transition-all duration-500" />
                  <div className="relative w-64 p-8 bg-slate-900 border-2 border-primary/50 rounded-3xl shadow-glow overflow-hidden">
                    <div className="absolute -top-10 -left-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
                    <Server className="w-12 h-12 text-primary mx-auto mb-4 drop-shadow-glow" />
                    <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-1">Master Controller</h2>
                    <span className="text-[11px] text-primary/70 font-mono font-black tracking-widest bg-primary/5 px-4 py-1 rounded-full border border-primary/10 inline-block">127.0.0.1</span>
                  </div>
                  <div className="absolute left-1/2 bottom-[-48px] w-0.5 h-12 bg-gradient-to-b from-primary to-primary/0 -translate-x-1/2 shadow-glow shadow-primary/50" />
                </motion.div>

                <div className="flex gap-10 flex-wrap justify-center w-full">
                  {subnetKeys.map((subnet) => (
                    <motion.div key={subnet} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col gap-6">
                      <div className="w-[360px] p-5 bg-slate-900/60 border border-white/10 rounded-3xl backdrop-blur-xl flex items-center justify-between shadow-2xl relative group/sub">
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/sub:opacity-100 rounded-3xl transition-opacity pointer-events-none" />
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20"><Globe className="w-6 h-6 text-primary" /></div>
                          <div>
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] leading-none mb-1">Subnet Segment</p>
                            <h3 className="text-base font-black text-white tracking-tighter">{subnet}</h3>
                          </div>
                        </div>
                        <div className="h-12 w-12 flex items-center justify-center bg-slate-950/80 rounded-2xl border border-white/5 text-sm font-black text-white/40 shadow-inner">{subnets[subnet].length}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pb-6">
                        {subnets[subnet].map((device) => (
                          <motion.div key={device.id} whileHover={{ x: 4 }} className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl border text-[10px] font-black uppercase transition-all shadow-xl", device.status === "online" ? "bg-green-500/5 border-green-500/20 text-green-400/90 shadow-green-500/5" : "bg-red-500/5 border-red-500/20 text-red-400/50")}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", device.status === "online" ? "bg-green-400 shadow-glow shadow-green-400/50" : "bg-red-400/40")} />
                            <span className="truncate tracking-widest">{device.hostname}</span>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <motion.div
                drag
                dragListener={false}
                dragControls={canvasDragControls}
                dragMomentum={false}
                dragConstraints={false}
                onDragStart={() => { canvasDragStartRef.current = canvasOffset; }}
                onDrag={(_, info) => {
                  if (interactionMode !== "pan") return;
                  setCanvasOffset({ x: canvasDragStartRef.current.x + info.offset.x, y: canvasDragStartRef.current.y + info.offset.y });
                }}
                animate={{ x: canvasOffset.x, y: canvasOffset.y, scale: zoom }}
                transition={{ type: "spring", damping: 28, stiffness: 220 }}
                style={{ width: "5000px", height: "5000px" }}
                className="absolute origin-top-left"
                onPointerDown={handleCanvasPointerDown}
              >
                {zones.map((zone) => {
                  const isActive = zone.id === selectedZoneId;
                  const visibleMembers = zone.deviceIds.filter((deviceId) => visibleDeviceIds.has(deviceId)).length;
                  return (
                    <ZoneCard
                      key={zone.id}
                      zone={zone}
                      isActive={isActive}
                      visibleMembers={visibleMembers}
                      zoom={zoom}
                      locked={layoutLocked}
                      onSelect={() => setSelectedZoneId(zone.id)}
                      onZoneDragStart={() => {
                        zoneDragStateRef.current = {
                          zoneId: zone.id,
                          startX: zone.x,
                          startY: zone.y,
                          memberPositions: zone.deviceIds.reduce<Record<string, Point>>((acc, deviceId) => {
                            acc[deviceId] = getDevicePos(deviceId);
                            return acc;
                          }, {}),
                        };
                      }}
                      onZoneDrag={(info) => {
                        const state = zoneDragStateRef.current;
                        if (!state || state.zoneId !== zone.id) return;
                        const deltaX = info.offset.x / zoom;
                        const deltaY = info.offset.y / zoom;
                        setZones((prev) => prev.map((item) => item.id === zone.id ? { ...item, x: Math.round(state.startX + deltaX), y: Math.round(state.startY + deltaY) } : item));
                        setPositions((prev) => {
                          const next = { ...prev };
                          zone.deviceIds.forEach((deviceId) => {
                            const base = state.memberPositions[deviceId] || getDevicePos(deviceId);
                            next[deviceId] = { x: Math.round(base.x + deltaX), y: Math.round(base.y + deltaY) };
                          });
                          return next;
                        });
                      }}
                      onZoneDragEnd={() => {
                        zoneDragStateRef.current = null;
                        setZones((prev) => prev.map((item) => item.id === zone.id ? { ...item, x: snapValue(item.x), y: snapValue(item.y) } : item));
                        setPositions((prev) => {
                          const next = { ...prev };
                          zone.deviceIds.forEach((deviceId) => {
                            next[deviceId] = snapPoint(next[deviceId] || getDevicePos(deviceId));
                          });
                          return next;
                        });
                      }}
                      onToggleCollapse={() => toggleZoneCollapsed(zone.id)}
                      onDelete={() => deleteZone(zone.id)}
                      onResizeStart={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setActiveResize({
                          zoneId: zone.id,
                          startClientX: event.clientX,
                          startClientY: event.clientY,
                          startWidth: zone.width,
                          startHeight: zone.height,
                        });
                        setSelectedZoneId(zone.id);
                      }}
                    />
                  );
                })}

                <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
                  <defs>
                    <filter id="glow-line">
                      <feGaussianBlur stdDeviation="3.2" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <AnimatePresence>
                    {visibleConnections.map((line, index) => (
                      <g key={`line-${index}`} className="group/line cursor-pointer pointer-events-none">
                        <path
                          d={line!.path}
                          fill="none"
                          stroke="#020617"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="opacity-90 pointer-events-none"
                        />
                        <path
                          d={line!.path}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="22"
                          className="pointer-events-auto"
                          onClick={(event) => { event.stopPropagation(); removeConnection(line!.fromId, line!.toId); }}
                        />
                        <motion.path
                          d={line!.path}
                          fill="none"
                          stroke={line!.status === "online" ? "#22c55e" : "#ef4444"}
                          strokeWidth="5.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter="url(#glow-line)"
                          className={cn(
                            "transition-all opacity-90 group-hover/line:opacity-100 pointer-events-none",
                            line!.status === "online" ? "" : "opacity-75"
                          )}
                        />
                        <path
                          d={line!.path}
                          fill="none"
                          stroke={line!.status === "online" ? "#dcfce7" : "#fee2e2"}
                          strokeWidth="2.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={line!.status === "online" ? "0" : "5,5"}
                          className="opacity-100 pointer-events-none"
                        />
                        <circle cx={line!.x1} cy={line!.y1} r="4.6" fill="#020617" className="pointer-events-none" />
                        <circle cx={line!.x2} cy={line!.y2} r="4.6" fill="#020617" className="pointer-events-none" />
                        <circle cx={line!.x1} cy={line!.y1} r="3.2" fill={line!.status === "online" ? "#22c55e" : "#ef4444"} className="pointer-events-none" />
                        <circle cx={line!.x2} cy={line!.y2} r="3.2" fill={line!.status === "online" ? "#22c55e" : "#ef4444"} className="pointer-events-none" />
                        <circle cx={line!.elbowX} cy={line!.y1} r="2.7" fill="#e2e8f0" className="opacity-85 pointer-events-none" />
                        <circle cx={line!.elbowX} cy={line!.y2} r="2.7" fill="#e2e8f0" className="opacity-85 pointer-events-none" />
                      </g>
                    ))}
                  </AnimatePresence>
                </svg>

                {selectionRect && <div className="absolute border-2 border-primary bg-primary/10 rounded-xl pointer-events-none z-[25]" style={normalizeRect(selectionRect)} />}

                {renderedDevices.map((device) => {
                  const pos = getDevicePos(device.id);
                  const isLinking = linkModeFrom === device.id;
                  const isSelected = selectedDeviceIds.includes(device.id);
                  const zone = zoneByDeviceId[device.id];
                  return (
                    <motion.div
                      key={device.id}
                      drag={!layoutLocked}
                      dragMomentum={false}
                      data-mesh-interactive="true"
                      onDrag={(event, info) => {
                        event.stopPropagation();
                        setPositions((prev) => ({ ...prev, [device.id]: { x: Math.round(pos.x + info.delta.x / zoom), y: Math.round(pos.y + info.delta.y / zoom) } }));
                      }}
                      onDragEnd={() => {
                        if (layoutLocked) return;
                        setPositions((prev) => ({
                          ...prev,
                          [device.id]: snapPoint(prev[device.id] || getDevicePos(device.id)),
                        }));
                      }}
                      onClick={(event) => handleDeviceSelection(event, device.id)}
                      animate={{ x: pos.x, y: pos.y }}
                      transition={{ type: "spring", damping: 30, stiffness: 400 }}
                      style={{ position: "absolute" }}
                      className={cn("flex flex-col items-center group/node cursor-grab active:cursor-grabbing z-30", device.status !== "online" && "opacity-75")}
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className={cn("w-16 h-16 rounded-lg flex flex-col items-center justify-center border transition-all shadow-2xl relative", device.status === "online" ? "bg-slate-950 border-success/50 shadow-success/10" : "bg-slate-950/90 border-white/10", isLinking && "border-primary border-2 scale-110 shadow-glow shadow-primary/40 animate-pulse", isSelected && "border-primary-light ring-4 ring-primary/25 scale-110", searchTerm && (device.hostname.toLowerCase().includes(searchTerm.toLowerCase()) || device.ip.toLowerCase().includes(searchTerm.toLowerCase())) && "border-primary-light ring-4 ring-primary/20 scale-110")} style={zone ? { boxShadow: `0 0 0 1px ${zone.color}66, 0 18px 50px rgba(0, 0, 0, 0.35)` } : undefined}>
                        {device.hostname.includes("SRVR") || device.hostname.includes("HUB") ? <Server className="w-7 h-7" /> : <Monitor className="w-7 h-7" />}

                        <button onClick={(event) => { event.stopPropagation(); setLinkModeFrom((current) => current === device.id ? null : device.id); }} className={cn("absolute -bottom-2 px-3 py-1 bg-slate-900 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-2xl opacity-0 scale-50 group-hover/node:opacity-100 group-hover/node:scale-100", isLinking ? "bg-primary text-white" : "text-primary hover:bg-primary hover:text-white")}>{isLinking ? <Focus className="w-2.5 h-2.5" /> : <Link2 className="w-2.5 h-2.5" />}{isLinking ? "Cancel" : "Connect"}</button>

                        {linkModeFrom && linkModeFrom !== device.id && <button onClick={(event) => { event.stopPropagation(); addConnection(device.id); }} className="absolute inset-0 bg-primary/20 flex items-center justify-center rounded-[22px] backdrop-blur-sm z-20 group-hover/node:bg-primary/40"><Plus className="w-8 h-8 text-white drop-shadow-glow" /></button>}
                        {device.status === "online" && <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-success rounded-full border-2 border-slate-900 animate-pulse shadow-glow shadow-success" />}
                      </div>

                      <div className="mt-3 text-center pointer-events-none select-none">
                        <p className="text-[10px] font-black text-white px-2 py-1 bg-slate-950 border border-white/10 rounded-md uppercase truncate max-w-[148px] shadow-xl tracking-wide">{device.hostname}</p>
                        <p className="text-[9px] text-sky-300/80 font-mono font-black mt-0.5 tracking-[0.12em]">{device.ip}</p>
                      </div>
                    </motion.div>
                  );
                })}

                {visibleConnections
                  .filter((line) => deleteEnabledConnectionKeys.has(makeConnectionKey(line!.fromId, line!.toId)))
                  .map((line, index) => (
                    <div
                      key={`delete-connection-${index}`}
                      className="absolute z-40 pointer-events-none"
                      style={{ left: line!.midX - 34, top: line!.midY - 16 }}
                    >
                      <button
                        onClick={(event) => { event.stopPropagation(); removeConnection(line!.fromId, line!.toId); }}
                        className="h-6 px-2 bg-danger rounded-full flex items-center justify-center gap-1 text-white shadow-glow animate-in zoom-in-50 pointer-events-auto text-[9px] font-black uppercase tracking-wider"
                        title="Delete connection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  ))}
              </motion.div>
            )}

            {layoutMode === "physical" && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2.5 bg-slate-900/80 backdrop-blur-3xl border border-white/10 rounded-full shadow-2xl z-50 flex items-center gap-6">
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-success rounded-full" /><span className="text-[9px] font-black text-white uppercase tracking-wider">Online</span></div>
                <div className="h-3 w-px bg-white/10" />
                <div className="flex items-center gap-2"><div className="w-2 h-2 bg-danger rounded-full" /><span className="text-[9px] font-black text-white uppercase tracking-wider">Offline</span></div>
                <div className="h-3 w-px bg-white/10" />
                <div className="flex items-center gap-2 font-black text-[9px] text-primary uppercase tracking-wider"><Share2 className="w-3 h-3" />{interactionMode === "select" ? "Drag on empty canvas to multi-select" : "Pan mode active"}</div>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

