import { useState, FormEvent, useEffect } from "react";
import { Search, Filter, RefreshCw, Plus, ChevronDown, Cpu, HardDrive, MemoryStick, Wifi, Edit, Trash2, Users, Activity, Database, Play, AlertTriangle, X } from "lucide-react";
import { Device } from "@/types/inventory";
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
};

export default function DevicesPage() {
  // Sync the table data with our backend store
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Device | null>(null);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState<Partial<Device>>(defaultDeviceData);

  // DB Connection state
  const [dbConnection, setDbConnection] = useState<any>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);

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
        || d.ip.includes(search);
      const matchStatus = statusFilter === "all" || d.status === statusFilter;
      return matchSearch && matchStatus;
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
      if (editingDevice) {
        // Update via API
        await fetch(`/api/devices/${formData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        // Optimistic UI update
        const updatedList = devices.map(d => d.id === formData.id ? formData as Device : d);
        setDevices(updatedList);
        if (selected?.id === formData.id) {
          setSelected(formData as Device); // Update drawer if open
        }
      } else {
        // Add via API
        await fetch('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        // Optimistic UI update
        setDevices([...devices, formData as Device]);
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
    if (confirm("Are you sure you want to delete this device?")) {
      try {
        await fetch(`/api/devices/${id}`, { method: 'DELETE' });
        
        // Optimistic UI update
        const updatedList = devices.filter(d => d.id !== id);
        setDevices(updatedList);
        setSelected(null); // Close drawer
      } catch (err) {
        console.error("Failed to delete device:", err);
        alert("Failed to delete device from database");
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
          <button 
            onClick={handleOpenAddDialog}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
          >
            <Plus className="w-3.5 h-3.5" /> Add Device
          </button>
        }
      />


      {/* Groups summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {groups.slice(0, 4).map(g => {
          const count = devices.filter(d => Array.isArray(d.group_ids) && d.group_ids.includes(g.id)).length;
          return (
            <div key={g.id} className="card-enterprise p-4 relative overflow-hidden">
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
        <button 
          onClick={loadData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground-muted border border-border rounded-md hover:text-foreground hover:bg-surface transition-all"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Table */}
      <SectionCard>
        <div className="overflow-x-auto">
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
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        d.status === "online" ? "bg-success" :
                        d.status === "offline" ? "bg-muted-foreground" :
                        d.status === "deploying" ? "bg-primary animate-pulse-dot" :
                        d.status === "error" ? "bg-danger" : "bg-foreground-subtle"
                      )} />
                      <span className="font-mono text-sm font-medium">{d.hostname}</span>
                    </div>
                  </td>
                  <td><span className="font-mono text-foreground-muted">{d.ip}</span></td>
                  <td><span className="text-xs text-foreground-muted">{d.os_version}</span></td>
                  <td><span className="text-xs text-foreground-muted truncate max-w-32 block">{d.cpu}</span></td>
                  <td>
                    <span className="text-xs text-foreground-muted">{d.ram} / {d.disk}</span>
                  </td>
                  <td><span className="font-mono text-xs text-foreground-muted">{d.agent_version}</span></td>
                  <td><StatusBadge status={d.status} /></td>
                  <td><span className="text-xs text-foreground-muted">{d.last_seen}</span></td>
                  <td className="text-right">
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
        <div className="px-5 py-2.5 border-t border-border text-xs text-foreground-muted">
          Showing {filtered.length} of {devices.length} devices
        </div>
      </SectionCard>

      {/* Device Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" />
          <div
            className="w-96 bg-surface border-l border-border overflow-y-auto animate-slide-in flex flex-col"
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
              {[
                { icon: <Wifi className="w-4 h-4" />,        label: "OS Version",    value: selected.os_version },
                { icon: <Cpu className="w-4 h-4" />,         label: "CPU",           value: selected.cpu },
                { icon: <MemoryStick className="w-4 h-4" />, label: "RAM",           value: selected.ram },
                { icon: <HardDrive className="w-4 h-4" />,   label: "Disk",          value: selected.disk },
                { icon: null,                                  label: "Agent Version", value: selected.agent_version },
                { icon: null,                                  label: "Last Seen",     value: selected.last_seen },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  {row.icon ? <div className="text-foreground-muted shrink-0">{row.icon}</div> : <div className="w-4 h-4 shrink-0" />}
                  <div>
                    <p className="text-xs text-foreground-muted">{row.label}</p>
                    <p className="text-sm font-medium text-foreground">{row.value}</p>
                  </div>
                </div>
              ))}

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-foreground-muted mb-2 uppercase tracking-wider font-semibold">Groups</p>
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(selected.group_ids) && selected.group_ids.length > 0 ? (
                    selected.group_ids.map(gid => {
                      const g = groups.find(g => g.id === gid);
                      return g ? (
                        <span key={gid} className="badge-pill text-xs" style={{ backgroundColor: `${g.color}20`, color: g.color }}>{g.name}</span>
                      ) : null;
                    })
                  ) : (
                    <span className="text-xs text-foreground-muted italic">No groups assigned</span>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold">Remote Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {["Restart PC", "Run Script", "Update Agent", "View Logs"].map(action => (
                    <button key={action} className="px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-surface-raised hover:text-foreground text-foreground-muted transition-colors">
                      {action}
                    </button>
                  ))}
                </div>
              </div>
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingDevice ? "Edit Device" : "Add New Device"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveDevice} className="space-y-4 py-4" autoComplete="off">
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
              <label htmlFor="ip" className="text-right text-sm font-medium">Server (IP)</label>
              <input
                id="ip"
                name="ip"
                required
                value={formData.ip}
                onChange={handleInputChange}
                className="col-span-3 px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
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
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="deploying">Deploying</option>
                  <option value="error">Error</option>
                  <option value="idle">Idle</option>
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
    </div>
  );
}
