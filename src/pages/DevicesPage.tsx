import { useState, FormEvent, useEffect } from "react";
import { Search, Filter, RefreshCw, Plus, ChevronDown, Cpu, HardDrive, MemoryStick, Wifi, Edit, Trash2, Users, Activity, Database, Play, AlertTriangle, X, Package, ChevronRight, Eye, List, Map as MapIcon } from "lucide-react";
import { Device } from "@/types/inventory";
import DeviceMap from "@/components/DeviceMap";
import { StatusBadge, PageHeader, SectionCard } from "@/components/ui-enterprise";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { compareIpAddresses, compareSubnetLabels, getSubnetLabel } from "@/lib/network";

const defaultDeviceData: Partial<Device> = {
  hostname: "",
  ip: "",
  os_version: "Windows 11 22H2",
  cpu: "Intel i5",
  ram: "16 GB",
  disk: "256 GB SSD",
  agent_version: "2.4.1",
  status: "online",
  group_ids: ["g1"],
  last_seen: "Just now",
  device_type: "PC",
  location: "",
  latitude: 0,
  longitude: 0
};

export default function DevicesPage() {
  // Sync the table data with our backend store
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Device | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState<Partial<Device>>(defaultDeviceData);

  // DB Connection state
  const [dbConnection, setDbConnection] = useState<any>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);

  // Software Inventory state
  const [selectedSoftware, setSelectedSoftware] = useState<any[]>([]);
  const [loadingSoftware, setLoadingSoftware] = useState(false);
  const [showSoftware, setShowSoftware] = useState(false);

  useEffect(() => {
    if (selected) {
      setLoadingSoftware(true);
      setShowSoftware(false);
      fetch(`/api/devices/${selected.id}/software`)
        .then(res => res.json())
        .then(data => setSelectedSoftware(data || []))
        .catch(err => {
          console.error("Failed to fetch software:", err);
          setSelectedSoftware([]);
        })
        .finally(() => setLoadingSoftware(false));
    } else {
      setSelectedSoftware([]);
      setShowSoftware(false);
    }
  }, [selected]);

  // Fetch initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const [devRes, groupRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/groups'),
      ]);
      const devData = await devRes.json();
      const groupData = await groupRes.json();
      
      // Ensure group_ids is an array
      const processedDevs = devData.map((d: any) => ({
        ...d,
        group_ids: typeof d.group_ids === 'string' ? d.group_ids.split(',').filter(Boolean) : (Array.isArray(d.group_ids) ? d.group_ids : [])
      }));
      
      setDevices(processedDevs);
      setGroups(groupData);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch devices:", err);
      setLoading(false);
    }

  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = [...devices]
    .filter(d => {
      const matchSearch = d.hostname.toLowerCase().includes(search.toLowerCase())
        || d.ip.includes(search)
        || (d.location && d.location.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      const matchGroup = groupFilter === "all" || (Array.isArray(d.group_ids) && d.group_ids.includes(groupFilter));
      return matchSearch && matchStatus && matchGroup;
    })
    .sort((a, b) => {
      const subnetCompare = compareSubnetLabels(getSubnetLabel(a.ip), getSubnetLabel(b.ip));
      if (subnetCompare !== 0) return subnetCompare;

      const ipCompare = compareIpAddresses(a.ip, b.ip);
      if (ipCompare !== 0) return ipCompare;

      return a.hostname.localeCompare(b.hostname);
    });

  const handleOpenAddDialog = () => {
    setEditingDevice(null);
    setFormData({ ...defaultDeviceData, id: `d${Date.now()}` }); // generate fake ID
    setDbConnection(null);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = async (device: Device) => {
    setEditingDevice(device);
    setFormData({ ...device });
    
    // Fetch DB connection if applicable
    const isSpecialGroup = device.group_ids?.some(id => {
      const g = groups.find(x => x.id === id);
      const gName = g?.name?.toLowerCase();
      return gName?.includes('server') || gName?.includes('pos offline');
    });

    if (isSpecialGroup) {
      try {
        const res = await fetch(`/api/devices/${device.id}/db-connection`);
        const data = await res.json();
        setDbConnection(data || { db_name: "", db_user: "", db_password: "" });
      } catch (err) {
        console.error("Failed to fetch DB connection:", err);
      }
    } else {
      setDbConnection(null);
    }
    
    setIsDialogOpen(true);
  };

  const handleSaveDevice = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        latitude: formData.latitude ? parseFloat(String(formData.latitude)) : 0,
        longitude: formData.longitude ? parseFloat(String(formData.longitude)) : 0
      };

      if (editingDevice) {
        // Update via API
        const res = await fetch(`/api/devices/${formData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error(`Failed to update device: ${res.statusText}`);

        // Optimistic UI update
        const updatedList = devices.map(d => d.id === formData.id ? payload as Device : d);
        setDevices(updatedList);
        if (selected?.id === formData.id) {
          setSelected(payload as Device); // Update drawer if open
        }
      } else {
        // Add via API
        const res = await fetch('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`Failed to add device: ${res.statusText}`);
        
        // Optimistic UI update
        setDevices([...devices, payload as Device]);
      }

      // Save DB Connection if visible
      const isSpecialGroup = formData.group_ids?.some(id => {
        const g = groups.find(x => x.id === id);
        const gName = g?.name?.toLowerCase();
        return gName?.includes('server') || gName?.includes('pos offline');
      });

      if (isSpecialGroup && dbConnection) {
        await fetch(`/api/devices/${formData.id}/db-connection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbConnection)
        });
      }

      setIsDialogOpen(false);
    } catch (err) {
      console.error("Failed to save device:", err);
      // In a real app we would toast an error here
      alert("Failed to save device database changes");
    }
  };

  const handleDeleteDevice = async (id: string) => {
    setDeviceToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteDevice = async () => {
    if (!deviceToDelete) return;
    try {
      const res = await fetch(`/api/devices/${deviceToDelete}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete device");
      
      // Optimistic UI update
      const updatedList = devices.filter(d => d.id !== deviceToDelete);
      setDevices(updatedList);
      setSelected(null); // Close drawer
      setIsDeleteDialogOpen(false);
      setDeviceToDelete(null);
    } catch (err) {
      console.error("Failed to delete device:", err);
      alert("Failed to delete device from database");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      
      // Auto-fill coordinates if location name matches an existing device's location
      if (name === "location" && value.trim().length > 2) {
        const existingLoc = devices.find(d => 
          d.location && 
          d.location.toLowerCase() === value.toLowerCase() && 
          d.latitude && 
          d.longitude
        );
        if (existingLoc) {
          updated.latitude = existingLoc.latitude;
          updated.longitude = existingLoc.longitude;
        }
      }
      
      return updated;
    });
  };

  const handleTestConnection = async () => {
    if (!dbConnection?.db_name || !dbConnection?.db_user || !dbConnection?.db_password) {
      alert("Please fill in all database connection details first.");
      return;
    }
    setIsTestingConn(true);
    try {
      const res = await fetch('/api/sql/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server: formData.ip,
          database: dbConnection.db_name,
          user: dbConnection.db_user,
          password: dbConnection.db_password
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert("✅ Connection successful!");
      } else {
        alert("❌ Connection failed: " + data.error);
      }
    } catch (err: any) {
      alert("❌ Error: " + err.message);
    } finally {
      setIsTestingConn(false);
    }
  };

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Device Inventory"
        subtitle={`${devices.length} devices enrolled across ${groups.length} groups`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-border mr-2">
              <button 
                onClick={() => setViewMode('list')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === 'list' ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:bg-background"
                )}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setViewMode('map')}
                className={cn(
                  "p-1.5 rounded-md transition-all",
                  viewMode === 'map' ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:bg-background"
                )}
                title="Map View"
              >
                <MapIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <button 
              onClick={handleOpenAddDialog}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
            >
              <Plus className="w-3.5 h-3.5" /> Add Device
            </button>
          </div>
        }
      />


      {/* Groups summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {groups.slice(0, 4).map(g => {
          const count = devices.filter(d => Array.isArray(d.group_ids) && d.group_ids.includes(g.id)).length;
          const isActive = groupFilter === g.id;
          return (
            <div 
              key={g.id} 
              onClick={() => setGroupFilter(isActive ? "all" : g.id)}
              className={cn(
                "card-enterprise p-4 relative overflow-hidden cursor-pointer transition-all hover:translate-y-[-2px]",
                isActive ? "ring-1 ring-primary/50 shadow-md transform translate-y-[-2px]" : "hover:border-primary/30"
              )}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 w-1" 
                style={{ backgroundColor: g.color || "#3b82f6" }}
              />
              <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold mb-1 truncate">{g.name}</p>
              <p className="text-2xl font-bold text-foreground">{count}</p>
              <p className="text-xs text-foreground-muted">devices</p>
            </div>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hostname or IP..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {["all", "online", "offline", "deploying", "error", "idle"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md border transition-all capitalize",
              statusFilter === s
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-surface border-border text-foreground-muted hover:text-foreground"
            )}
          >
            {s}
          </button>
        ))}

        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground-muted" />
          <select
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs font-medium bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
          >
            <option value="all" className="bg-surface text-foreground">All Groups</option>
            {groups.map(g => (
              <option key={g.id} value={g.id} className="bg-surface text-foreground">{g.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground-muted pointer-events-none" />
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground-muted border border-border rounded-md hover:text-foreground hover:bg-surface transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} /> Refresh
        </button>
      </div>

      {/* Main Content Area */}
      {viewMode === 'list' ? (
        <SectionCard>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto max-h-[600px] overflow-y-auto pr-1">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Server (IP)</th>
                <th>OS Version</th>
                <th>CPU</th>
                <th>RAM / Disk</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                  <td>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          d.status === "online" ? "bg-success" :
                          d.status === "offline" ? "bg-muted-foreground" :
                          d.status === "deploying" ? "bg-primary animate-pulse-dot" :
                          d.status === "error" ? "bg-danger" : "bg-foreground-subtle"
                        )} />
                        <span className="font-mono text-sm font-medium flex items-center gap-2">
                          {d.device_type === 'Network' ? <Wifi className="w-3.5 h-3.5 text-primary" /> : <HardDrive className="w-3.5 h-3.5 text-foreground-muted" />}
                          {d.hostname}
                        </span>
                      </div>
                      {d.location && (
                        <div className="flex items-center gap-1.5 ml-4 text-[10px] text-primary font-bold uppercase tracking-wider">
                          <Wifi className="w-2.5 h-2.5" /> {d.location}
                        </div>
                      )}
                      {d.device_type === 'Network' && d.network_ports && (
                        <div className="flex flex-wrap gap-1 ml-4 mt-0.5">
                          {(() => {
                            try {
                              const ports = typeof d.network_ports === 'string' ? JSON.parse(d.network_ports) : d.network_ports;
                              return (ports || []).map((p: any, i: number) => (
                                <span key={i} className={cn("text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border", p.status === 'up' ? "bg-success/10 text-success border-success/20" : "bg-danger/10 text-danger border-danger/20")}>
                                  {p.name}
                                </span>
                              ));
                            } catch (e) { return null; }
                          })()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td><span className="font-mono text-foreground-muted">{d.ip}</span></td>
                  <td>
                    <span className="text-xs text-foreground-muted">
                      {d.device_type === 'Network' ? <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold border border-primary/20">AGENTLESS</span> : d.os_version}
                    </span>
                  </td>
                  <td><span className="text-xs text-foreground-muted truncate max-w-32 block">{d.device_type === 'Network' ? '-' : d.cpu}</span></td>
                  <td>
                    <span className="text-xs text-foreground-muted">{d.device_type === 'Network' ? '-' : `${d.ram} / ${d.disk}`}</span>
                  </td>
                  <td><span className="font-mono text-xs text-foreground-muted">{d.device_type === 'Network' ? '-' : d.agent_version}</span></td>
                  <td><StatusBadge status={d.status} /></td>
                  <td><span className="text-xs text-foreground-muted">{d.last_seen}</span></td>
                  <td className="text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelected(d); }}
                      className="p-1.5 hover:bg-surface-raised rounded-md text-foreground-muted hover:text-primary-foreground transition-colors mr-1"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(d); }}
                      className="p-1.5 hover:bg-surface-raised rounded-md text-foreground-muted hover:text-primary transition-colors"
                      title="Edit Device"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteDevice(d.id); }}
                      className="p-1.5 hover:bg-surface-raised rounded-md text-foreground-muted hover:text-danger transition-colors ml-1"
                      title="Delete Device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col gap-3 max-h-[65vh] overflow-y-auto pb-6">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-foreground-muted border border-dashed border-border rounded-xl">
              No devices found.
            </div>
          )}
          {filtered.map(d => (
            <div 
              key={d.id} 
              className="p-4 rounded-xl border border-border bg-surface-raised flex flex-col gap-3 cursor-pointer hover:border-primary/40 active:scale-[0.98] transition-all shadow-sm" 
              onClick={() => setSelected(d)}
            >
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <div className={cn(
                     "w-2.5 h-2.5 rounded-full shadow-sm", 
                     d.status === "online" ? "bg-success" :
                     d.status === "offline" ? "bg-muted-foreground" :
                     d.status === "deploying" ? "bg-primary animate-pulse-dot" :
                     d.status === "error" ? "bg-danger" : "bg-foreground-subtle"
                   )} />
                   <span className="font-bold text-sm text-foreground flex items-center gap-2">
                     {d.device_type === 'Network' ? <Wifi className="w-3.5 h-3.5 text-primary" /> : <HardDrive className="w-3.5 h-3.5 text-foreground-muted" />}
                     {d.hostname}
                   </span>
                 </div>
                 <StatusBadge status={d.status} />
               </div>
               
               <div className="flex items-center justify-between text-xs text-foreground-muted">
                 <div className="flex items-center gap-1.5 font-mono bg-background border border-border px-2 py-1 rounded-md shadow-inner">
                    {d.ip}
                 </div>
                 <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {d.last_seen}</span>
               </div>
               
               {d.location && (
                 <div className="text-[10px] text-primary font-bold uppercase tracking-wider flex items-center gap-1.5 bg-primary/5 p-1.5 rounded-md w-fit">
                    <MapIcon className="w-3 h-3" /> {d.location}
                 </div>
               )}
            </div>
          ))}
        </div>

        <div className="px-3 md:px-5 py-3 md:py-2.5 border-t border-border text-xs text-foreground-muted font-medium mt-2 md:mt-0 text-center md:text-left">
          Showing {filtered.length} of {devices.length} devices
        </div>
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden bg-surface/50 border-primary/20">
          <div className="h-[650px] w-full relative">
            <div className="absolute top-4 left-4 z-[1000] bg-background/80 backdrop-blur-md p-2.5 rounded-lg border border-primary/30 shadow-2xl">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Fleet Live Location Map
              </h3>
              <p className="text-[9px] text-foreground-muted">Interactive geographic visualization of {filtered.filter(d => d.latitude).length} devices</p>
            </div>
            <DeviceMap devices={filtered} />
          </div>
        </SectionCard>
      )}

      {/* Device Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" />
          <div
            className="w-full sm:w-96 max-w-full bg-surface border-l border-border overflow-y-auto animate-slide-in flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground font-mono">{selected.hostname}</p>
                <p className="text-xs text-foreground-muted">{selected.ip}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <button onClick={() => setSelected(null)} className="text-foreground-muted hover:text-foreground ml-2 text-lg">×</button>
              </div>
            </div>
            
            <div className="p-5 space-y-4 flex-1">
              {/* Common Info: Last Seen */}
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg">
                <p className="text-[10px] text-foreground-muted uppercase tracking-widest font-bold mb-1">Last Connection Status</p>
                <p className={cn(
                  "text-lg font-bold",
                  selected.last_seen?.toLowerCase().includes("invalid") || selected.last_seen === 'Never' 
                    ? "text-foreground-muted italic" 
                    : "text-foreground"
                )}>
                  {selected.last_seen?.toLowerCase().includes("invalid") || selected.last_seen === 'Never' 
                    ? "Waiting for first ping..." 
                    : selected.last_seen}
                </p>
              </div>

              {/* Location Info */}
              {selected.location && (
                <div className="p-4 bg-info/5 border border-info/10 rounded-lg space-y-3">
                  <div>
                    <p className="text-[10px] text-foreground-muted uppercase tracking-widest font-bold mb-1">Store / Location</p>
                    <p className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Wifi className="w-3.5 h-3.5 text-info" /> {selected.location}
                    </p>
                  </div>

                  {(selected.latitude !== undefined && selected.latitude !== 0 && selected.longitude !== undefined && selected.longitude !== 0) ? (
                    <div className="space-y-2">
                      <div className="w-full h-48 rounded-md overflow-hidden border border-border shadow-inner">
                        <DeviceMap devices={[selected]} singleDeviceMode={true} />
                      </div>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
                      >
                        <Play className="w-2.5 h-2.5" /> Open in Google Maps ({selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)})
                      </a>
                    </div>
                  ) : (
                    <div className="p-3 border border-dashed border-border rounded-md text-center bg-background/50">
                      <p className="text-[10px] text-foreground-muted italic">Coordinates not set. Edit device to add location data.</p>
                    </div>
                  )}
                </div>
              )}

              {/* SPECIFIC VIEW: Network Device */}
              {selected.device_type === 'Network' ? (
                <>
                  <div className="space-y-3">
                    <p className="text-xs text-foreground-muted uppercase tracking-wider font-bold flex items-center gap-2">
                       <Wifi className="w-3.5 h-3.5 text-primary" /> Network Interface / ISP Ports
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {(() => {
                        try {
                          if (!selected.network_ports) {
                            return (
                              <div className="p-6 border border-dashed border-border rounded-lg text-center bg-surface-raised/50">
                                <AlertTriangle className="w-5 h-5 text-warning mx-auto mb-2 opacity-50" />
                                <p className="text-xs text-foreground-muted">Belum ada data port yang diterima.</p>
                                <p className="text-[10px] text-foreground-muted/70 mt-1">Pastikan script MikroTik sudah dijalankan.</p>
                              </div>
                            );
                          }
                          const ports = typeof selected.network_ports === 'string' ? JSON.parse(selected.network_ports) : selected.network_ports;
                          if (!ports || ports.length === 0) return <p className="text-xs text-foreground-muted italic">No ports reported.</p>;
                          
                          return ports.map((p: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-3.5 bg-surface-raised rounded-xl border border-border shadow-sm group hover:border-primary/30 transition-all">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "p-2 rounded-lg transition-colors", 
                                  p.status === 'up' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                                )}>
                                  <Activity className="w-4 h-4" />
                                </div>
                                <span className="text-sm font-bold text-foreground">{p.name || `Interface ${i+1}`}</span>
                              </div>
                              <span className={cn(
                                "text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-tighter border shadow-sm",
                                p.status === 'up' ? "bg-success text-white border-success" : "bg-danger text-white border-danger"
                              )}>
                                {p.status || 'OFF'}
                              </span>
                            </div>
                          ));
                        } catch (e) {
                          return <p className="text-xs text-danger italic">Error rendering port data</p>;
                        }
                      })()}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border space-y-2">
                    <p className="text-xs text-foreground-muted uppercase tracking-wider font-bold">Device Info</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-surface-raised rounded-lg border border-border">
                        <p className="text-[10px] text-foreground-muted uppercase">Type</p>
                        <p className="text-sm font-bold text-primary">RouterOS / Radio</p>
                      </div>
                      <div className="p-3 bg-surface-raised rounded-lg border border-border">
                        <p className="text-[10px] text-foreground-muted uppercase">Version</p>
                        <p className="text-sm font-bold">Agentless</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* SPECIFIC VIEW: PC / Agent */
                <>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { icon: <Wifi className="w-4 h-4" />,        label: "OS Version",    value: selected.os_version },
                      { icon: <Cpu className="w-4 h-4" />,         label: "CPU",           value: selected.cpu },
                      { icon: <MemoryStick className="w-4 h-4" />, label: "RAM",           value: selected.ram },
                      { icon: <HardDrive className="w-4 h-4" />,   label: "Disk",          value: selected.disk },
                      { icon: <Activity className="w-4 h-4" />,    label: "Agent",         value: selected.agent_version },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-3 p-3 bg-surface-raised rounded-lg border border-border/50">
                        <div className="text-foreground-muted shrink-0 bg-background p-1.5 rounded-md border border-border">{row.icon}</div>
                        <div>
                          <p className="text-[10px] text-foreground-muted leading-none mb-1 uppercase tracking-tight">{row.label}</p>
                          <p className="text-sm font-bold text-foreground leading-none">{row.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-border">
                    <button
                      onClick={() => setShowSoftware(!showSoftware)}
                      className="flex items-center justify-between w-full py-2 text-left group hover:bg-surface-raised -mx-2 px-2 rounded-md transition-all"
                    >
                      <div className="flex items-center gap-2 text-xs text-foreground-muted uppercase tracking-wider font-bold group-hover:text-foreground">
                        <Package className="w-4 h-4" /> Installed Software ({selectedSoftware.length})
                      </div>
                      {showSoftware ? <ChevronDown className="w-4 h-4 text-foreground-muted" /> : <ChevronRight className="w-4 h-4 text-foreground-muted" />}
                    </button>
                    
                    {showSoftware && (
                      <div className="mt-2 space-y-2 max-h-64 overflow-y-auto custom-scrollbar border bg-background rounded-md p-3">
                        {loadingSoftware ? (
                          <div className="flex justify-center p-4">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                          </div>
                        ) : selectedSoftware.length > 0 ? (
                          selectedSoftware.map((app, i) => (
                            <div key={i} className="text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0">
                              <p className="font-medium text-foreground">{app.name}</p>
                              <div className="flex justify-between items-center mt-1 opacity-70 font-mono text-[10px]">
                                <span>{app.version || 'No Version'}</span>
                                <span className="truncate max-w-[120px]" title={app.publisher}>{app.publisher}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-foreground-muted italic text-center p-2">No software inventoried.</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Group Section (Visible to all) */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-foreground-muted mb-2 uppercase tracking-wider font-bold">Assigned Groups</p>
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(selected.group_ids) && selected.group_ids.length > 0 ? (
                    selected.group_ids.map(gid => {
                      const g = groups.find(g => g.id === gid);
                      return g ? (
                        <span key={gid} className="badge-pill text-[10px] font-bold" style={{ backgroundColor: `${g.color}20`, color: g.color, borderColor: `${g.color}40` }}>{g.name}</span>
                      ) : null;
                    })
                  ) : (
                    <span className="text-xs text-foreground-muted italic">No groups assigned</span>
                  )}
                </div>
              </div>

              {/* Actions Section (Conditional) */}
              {selected.device_type !== 'Network' && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-xs text-foreground-muted uppercase tracking-wider font-bold">Remote Actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {["Restart PC", "Run Script", "Update Agent", "View Logs"].map(action => (
                      <button key={action} className="px-3 py-2 text-[11px] font-semibold border border-border rounded-lg hover:bg-surface-raised hover:text-foreground text-foreground-muted transition-all">
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Actions */}
            <div className="p-5 border-t border-border bg-surface-raised flex gap-3">
              <button 
                onClick={() => handleOpenEditDialog(selected)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-surface hover:text-foreground text-foreground-muted transition-colors"
              >
                <Edit className="w-4 h-4" /> Edit
              </button>
              <button 
                onClick={() => handleDeleteDevice(selected.id)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium border border-danger/30 rounded-md hover:bg-danger/10 text-danger transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className={cn("transition-all duration-300", formData.device_type === 'Network' ? "sm:max-w-[600px]" : "sm:max-w-[425px]")}>
          <DialogHeader>
            <DialogTitle>{editingDevice ? "Edit Device" : "Add New Device"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveDevice} className="py-4" autoComplete="off">
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-4 custom-scrollbar">
              <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="hostname" className="text-right text-sm font-medium">Hostname</label>
              <input
                id="hostname"
                name="hostname"
                required
                value={formData.hostname}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="device_type" className="text-right text-sm font-medium">Type</label>
              <select
                id="device_type"
                name="device_type"
                value={formData.device_type}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="PC" className="bg-surface text-foreground">PC / Workstation</option>
                <option value="Server" className="bg-surface text-foreground">Server</option>
                <option value="Network" className="bg-surface text-foreground">Network Device</option>
                <option value="Router" className="bg-surface text-foreground">Router / Gateway</option>
                <option value="Other" className="bg-surface text-foreground">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="ip" className="text-right text-sm font-medium">Base IP</label>
              <input
                id="ip"
                name="ip"
                required
                value={formData.ip}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <label htmlFor="location" className="text-right text-sm font-medium pt-2">Store Name</label>
              <div className="col-span-3 space-y-2">
                <input
                  id="location"
                  name="location"
                  list="location-suggestions"
                  placeholder="e.g. Pepito Market Store"
                  value={formData.location || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <datalist id="location-suggestions">
                  {[...new Set(devices.filter(d => d.location).map(d => d.location))].map((loc) => (
                    <option key={loc} value={loc!} />
                  ))}
                </datalist>
                {/* Show hint when location has auto-filled coordinates */}
                {formData.location && devices.some(d => d.location?.toLowerCase() === formData.location?.toLowerCase() && d.latitude) && (
                  <p className="text-[10px] text-success flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                    Koordinat otomatis diisi dari lokasi yang sudah ada
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm font-medium">Coordinates</label>
              <div className="col-span-3 grid grid-cols-2 gap-2">
                <input
                  name="latitude"
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={formData.latitude || ""}
                  onChange={handleInputChange}
                  className="px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  name="longitude"
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={formData.longitude || ""}
                  onChange={handleInputChange}
                  className="px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
                   {formData.device_type === 'Network' && (
              <div className="col-span-4 bg-primary/5 p-4 rounded-lg border border-primary/20 mt-2">
                <h4 className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5"><Activity className="w-4 h-4"/> MikroTik Script Generator</h4>
                <p className="text-[10px] text-foreground-muted mb-2">Pindahkan script ini ke <b>System Scheduler</b> MikroTik (Interval 1 menit). Script ini otomatis mengambil nama router dari <b>System Identity</b>. Edit bagian <b>monitoredPorts</b> dengan format <b>"interface;label;target"</b> (Contoh: "ether1;Internet;8.8.8.8" atau "ether2;Lokal;192.168.1.1").</p>
                <div className="relative">
                  <pre className="text-[9.5px] font-mono bg-background text-foreground p-3.5 pr-14 rounded-md border border-border whitespace-pre-wrap break-words">
{`{
  :local hostName [/system identity get name];
  :local sysTime [/system clock get time];
  :local sysDate [/system clock get date];
  :local monitoredPorts {"ether1;Internet;8.8.8.8"; "ether2;Lokal;1.2.3.4"};
  :local portJson "";
  :local first true;

  :foreach item in=$monitoredPorts do={
    :local sep1 [:find $item ";"];
    :local iface [:pick $item 0 $sep1];
    :local rest [:pick $item ($sep1 + 1) [:len $item]];
    :local sep2 [:find $rest ";"];
    :local label "";
    :local target "8.8.8.8";
    :if ($sep2 < 0) do={
      :set label $rest;
    } else={
      :set label [:pick $rest 0 $sep2];
      :set target [:pick $rest ($sep2 + 1) [:len $rest]];
    };

    :local status "down";
    :do {
      # 1. Physical/Logical Link Check
      :if ([/interface get $iface running] = true) do={
        # Percobaan 1: Cek Jalur Fisik (Strict Interface)
        :if ([/ping $target interface=$iface count=3 interval=300ms] > 0) do={
          :set status "up"
        } else={
          # Percobaan 2: Cek Routing (Fallback) - Berguna untuk Bridge/VLAN
          if ([/ping $target count=2 interval=300ms] > 0) do={
            :set status "up"
          } else={
            :if ($target = "8.8.8.8") do={ :set status "no-internet" } else={ :set status "down" }
          }
        }
      } else={
        :set status "down"
      };
    } on-error={ :set status "error" };

    :local entry "{\\"name\\":\\"$label\\", \\"status\\":\\"$status\\"}";
    :if ($first = true) do={ :set portJson $entry; :set first false; } else={ :set portJson ($portJson . "," . $entry); }
  }
  :local finalJson "{\\"hostname\\":\\"$hostName\\", \\"date\\":\\"$sysDate\\", \\"time\\":\\"$sysTime\\", \\"ports\\":[$portJson]}";
  /tool fetch url="${window.location.protocol}//${window.location.host}/api/webhook/device-ping" mode=http http-method=post http-header-field="Content-Type: application/json" http-data=$finalJson keep-result=no check-certificate=no;
}`}
                  </pre>
                  <button 
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`{\n  :local hostName [/system identity get name];\n  :local sysTime [/system clock get time];\n  :local sysDate [/system clock get date];\n  :local monitoredPorts {"ether4;TELKOM;8.8.8.8"; "ether5;CGS;192.168.128.197"; "ether1;Local;192.168.85.7"};\n  :local portJson "";\n  :local first true;\n\n  :foreach item in=$monitoredPorts do={\n    :local sep1 [:find $item ";"];\n    :local iface [:pick $item 0 $sep1];\n    :local rest [:pick $item ($sep1 + 1) [:len $item]];\n    :local sep2 [:find $rest ";"];\n    :local label "";\n    :local target "8.8.8.8";\n    :if ($sep2 < 0) do={\n      :set label $rest;\n    } else={\n      :set label [:pick $rest 0 $sep2];\n      :set target [:pick $rest ($sep2 + 1) [:len $rest]];\n    };\n    :local status "down";\n    :do {\n      :if ([/interface get $iface running] = true) do={\n        :if ([/ping $target interface=$iface count=3 interval=300ms] > 0) do={ :set status "up" } else={\n          if ([/ping $target count=2 interval=300ms] > 0) do={ :set status "up" } else={\n            :if ($target = "8.8.8.8") do={ :set status "no-internet" } else={ :set status "down" }\n          }\n        }\n      } else={ :set status "down" }\n    } on-error={ :set status "error" };\n    :local entry "{\\"name\\":\\"$label\\", \\"status\\":\\"$status\\"}";\n    :if ($first = true) do={ :set portJson $entry; :set first false; } else={ :set portJson ($portJson . "," . $entry); }\n  }\n  :local finalJson "{\\"hostname\\":\\"$hostName\\", \\"date\\":\\"$sysDate\\", \\"time\\":\\"$sysTime\\", \\"ports\\":[$portJson]}";\n  /tool fetch url="${window.location.protocol}//${window.location.host}/api/webhook/device-ping" mode=http http-method=post http-header-field="Content-Type: application/json" http-data=$finalJson keep-result=no check-certificate=no;\n}`)}
                    className="absolute top-2 right-2 px-2 py-1 bg-primary text-white rounded text-[9px] font-bold hover:bg-primary/90"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {formData.device_type !== 'Network' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="os_version" className="text-right text-sm font-medium">OS Version</label>
                  <input
                    id="os_version"
                    name="os_version"
                    required
                    value={formData.os_version}
                    onChange={handleInputChange}
                    className="col-span-3 px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="status" className="text-sm font-medium">Status</label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="online" className="bg-surface text-foreground">Online</option>
                      <option value="offline" className="bg-surface text-foreground">Offline</option>
                      <option value="deploying" className="bg-surface text-foreground">Deploying</option>
                      <option value="error" className="bg-surface text-foreground">Error</option>
                      <option value="idle" className="bg-surface text-foreground">Idle</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="agent_version" className="text-sm font-medium">Agent Ver.</label>
                    <input
                      id="agent_version"
                      name="agent_version"
                      required
                      value={formData.agent_version}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Group Assignment</label>
              <div className="flex flex-wrap gap-1.5 p-3 bg-surface border border-border rounded-md min-h-12 overflow-y-auto max-h-32 shadow-inner">
                {groups.map(g => (
                  <label key={g.id} className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[10px] font-semibold transition-all border",
                    formData.group_ids?.includes(g.id) 
                      ? "border-primary/50 bg-primary/10 text-primary" 
                      : "border-border bg-background text-foreground-muted hover:border-primary/30"
                  )}>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={formData.group_ids?.includes(g.id) || false}
                      onChange={(e) => {
                        const current = Array.isArray(formData.group_ids) ? [...formData.group_ids] : [];
                        if (e.target.checked) {
                          setFormData({ ...formData, group_ids: [...current, g.id] });
                        } else {
                          setFormData({ ...formData, group_ids: current.filter(id => id !== g.id) });
                        }
                      }}
                    />
                    {g.name}
                  </label>
                ))}
                {groups.length === 0 && <span className="text-[10px] text-foreground-muted italic">No groups available. Create some in the Groups page.</span>}
              </div>
            </div>

            {/* Database Connection Section (Conditional) */}
            {(formData.group_ids?.some(id => {
              const g = groups.find(x => x.id === id);
              const gName = g?.name?.toLowerCase();
              return gName?.includes('server') || gName?.includes('pos offline');
            })) && (
              <div className="space-y-4 border-t border-border pt-4 bg-surface-raised/30 -mx-6 px-6 pb-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-primary">
                    <Database className="w-4 h-4" /> Database Configuration
                  </h4>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-[10px] font-bold text-primary uppercase">Remote SQL Enabled</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-4 items-center gap-3">
                    <label className="text-right text-xs font-medium text-foreground-muted">Host IP</label>
                    <div className="col-span-3 flex items-center gap-2 px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground-muted font-mono italic">
                      <Wifi className="w-3 h-3" /> {formData.ip || "No IP set"}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="db_name" className="text-right text-xs font-medium">DB Name</label>
                    <input
                      id="db_name"
                      name="db_name"
                      value={dbConnection?.db_name || ""}
                      onChange={(e) => setDbConnection({ ...dbConnection, db_name: e.target.value })}
                      placeholder="e.g. MasterDB"
                      autoComplete="off"
                      className="col-span-3 px-3 py-1.5 text-xs bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="db_user" className="text-right text-xs font-medium">Username</label>
                    <input
                      id="db_user"
                      name="db_user"
                      value={dbConnection?.db_user || ""}
                      onChange={(e) => setDbConnection({ ...dbConnection, db_user: e.target.value })}
                      placeholder="sa"
                      autoComplete="off"
                      className="col-span-3 px-3 py-1.5 text-xs bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label htmlFor="db_pass" className="text-right text-xs font-medium">Password</label>
                    <input
                      id="db_pass"
                      name="db_pass"
                      type="password"
                      value={dbConnection?.db_password || ""}
                      onChange={(e) => setDbConnection({ ...dbConnection, db_password: e.target.value })}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="col-span-3 px-3 py-1.5 text-xs bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex justify-between items-center mt-2 pl-4">
                    <p className="text-[10px] text-foreground-muted italic max-w-[60%] leading-tight">
                       Credentials are used for parallel SQL execution.
                    </p>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTestingConn}
                      className={cn(
                        "text-[10px] font-bold px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5",
                        isTestingConn 
                          ? "bg-muted text-foreground-muted border-border" 
                          : "bg-background text-primary border-primary/30 hover:bg-primary/5 hover:border-primary"
                      )}
                    >
                      {isTestingConn ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Test Connection
                    </button>
                  </div>
                </div>
              </div>
            )}

            </div>

            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <button type="button" className="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-surface transition-colors">
                  Cancel
                </button>
              </DialogClose>
              <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                {editingDevice ? "Save Changes" : "Add Device"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px] border-danger/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle className="w-5 h-5" /> Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-foreground-muted">
              Are you sure you want to delete this device? This action cannot be undone and will remove all associated logs and history.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setIsDeleteDialogOpen(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteDevice}
              className="px-4 py-2 text-sm font-medium bg-danger text-white rounded-md hover:bg-danger/90 transition-colors shadow-glow-danger"
            >
              Delete Permanently
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
