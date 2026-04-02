import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Users, List, Eye } from "lucide-react";
import { StatusBadge, PageHeader, SectionCard } from "@/components/ui-enterprise";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Group {
  id: string;
  name: string;
  description?: string;
  color?: string;
  device_count?: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState<Partial<Group>>({
    name: "",
    description: "",
    color: "#3b82f6"
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [groupsRes, devicesRes] = await Promise.all([
        fetch('/api/groups'),
        fetch('/api/devices')
      ]);
      const groupsData = await groupsRes.json();
      const devicesData = await devicesRes.json();
      
      // Calculate device count for each group
      const groupsWithCount = groupsData.map((g: Group) => {
        const count = devicesData.filter((d: any) => {
          if (!d.group_ids) return false;
          const ids = typeof d.group_ids === 'string' ? d.group_ids.split(',').filter(Boolean) : d.group_ids;
          return Array.isArray(ids) && ids.includes(g.id);
        }).length;
        return { ...g, device_count: count };
      });
      
      setGroups(groupsWithCount);
      setDevices(devicesData);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : '/api/groups';
      const method = editingGroup ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        setIsDialogOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this group?")) return;
    try {
      const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [managingGroup, setManagingGroup] = useState<Group | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewingGroup, setViewingGroup] = useState<Group | null>(null);

  const handleOpenView = (group: Group) => {
    setViewingGroup(group);
    setIsViewOpen(true);
  };

  const handleOpenManage = (group: Group) => {
    setManagingGroup(group);
    // Find devices currently in this group
    const initialIds = devices
      .filter(d => {
        const ids = typeof d.group_ids === 'string' ? d.group_ids.split(',').filter(Boolean) : d.group_ids;
        return Array.isArray(ids) && ids.includes(group.id);
      })
      .map(d => d.id);
    setSelectedDeviceIds(initialIds);
    setIsManageOpen(true);
  };

  const handleSaveMembers = async () => {
    if (!managingGroup) return;
    try {
      const res = await fetch(`/api/groups/${managingGroup.id}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: selectedDeviceIds })
      });
      if (res.ok) {
        setIsManageOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to save members:", err);
    }
  };

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Device Groups"
        subtitle="Organize your devices into logical groups for easier management"
        actions={
          <button
            onClick={() => {
              setEditingGroup(null);
              setFormData({ name: "", description: "", color: "#3b82f6" });
              setIsDialogOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
          >
            <Plus className="w-3.5 h-3.5" /> New Group
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(group => (
          <SectionCard key={group.id} className="relative group overflow-hidden">
            <div 
              className="absolute top-0 left-0 w-1 h-full" 
              style={{ backgroundColor: group.color || "#3b82f6" }} 
            />
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-foreground">{group.name}</h3>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => handleOpenView(group)}
                  className="p-1 hover:bg-surface-raised rounded text-foreground-muted hover:text-primary transition-colors"
                  title="View Devices"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => handleOpenManage(group)}
                  className="p-1 hover:bg-surface-raised rounded text-foreground-muted hover:text-primary transition-colors"
                  title="Manage Devices"
                >
                  <Users className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => {
                    setEditingGroup(group);
                    setFormData(group);
                    setIsDialogOpen(true);
                  }}
                  className="p-1 hover:bg-surface-raised rounded text-foreground-muted hover:text-primary transition-colors"
                  title="Edit Group"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => handleDelete(group.id)}
                  className="p-1 hover:bg-surface-raised rounded text-foreground-muted hover:text-danger transition-colors"
                  title="Delete Group"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-foreground-muted mb-4 min-h-8">
              {group.description || "No description provided."}
            </p>
            <div className="flex items-center justify-between text-xs text-foreground-subtle">
              <div className="flex items-center gap-1.5 font-mono">
                <Users className="w-3.5 h-3.5" />
                <span>{group.device_count || 0} Devices</span>
              </div>
              <span className="font-mono">{group.id}</span>
            </div>
          </SectionCard>
        ))}
        {groups.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center text-foreground-muted bg-surface/30 rounded-xl border border-dashed border-border">
            No groups found. Create your first group to get started.
          </div>
        )}
      </div>

      {/* Group Info Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'New Group'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Group Name</label>
              <input
                required
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. POS Terminals"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-20"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional group description..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Theme Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  className="h-9 w-12 bg-background border border-border rounded-md cursor-pointer"
                  value={formData.color}
                  onChange={e => setFormData({ ...formData, color: e.target.value })}
                />
                <input
                  type="text"
                  className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono"
                  value={formData.color}
                  onChange={e => setFormData({ ...formData, color: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <button type="button" className="px-4 py-2 text-sm border border-border rounded-md hover:bg-surface-raised transition-colors">Cancel</button>
              </DialogClose>
              <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow">
                {editingGroup ? 'Save Changes' : 'Create Group'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Devices Dialog */}
      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Manage Group Devices: {managingGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-xs text-foreground-muted mb-2">Select devices that belong to this group:</p>
            <div className="max-h-64 overflow-y-auto border border-border rounded-lg bg-surface-raised divide-y divide-border">
              {(() => {
                const availableDevices = devices.filter(device => {
                  const ids = typeof device.group_ids === 'string' ? device.group_ids.split(',').filter(Boolean) : device.group_ids;
                  const inNoGroup = !ids || ids.length === 0;
                  const inThisGroup = Array.isArray(ids) && managingGroup && ids.includes(managingGroup.id);
                  return inNoGroup || inThisGroup;
                });

                if (availableDevices.length === 0) {
                  return <div className="p-8 text-center text-xs text-foreground-muted">No available devices to add.</div>;
                }

                return availableDevices.map(device => (
                  <label key={device.id} className="flex items-center gap-3 p-3 hover:bg-surface transition-colors cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="accent-primary"
                      checked={selectedDeviceIds.includes(device.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedDeviceIds(prev => [...prev, device.id]);
                        else setSelectedDeviceIds(prev => prev.filter(id => id !== device.id));
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{device.hostname}</p>
                      <p className="text-[10px] text-foreground-muted font-mono">{device.ip}</p>
                    </div>
                  </label>
                ));
              })()}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="px-4 py-2 text-sm border border-border rounded-md hover:bg-surface-raised transition-colors">Cancel</button>
            </DialogClose>
            <button 
              onClick={handleSaveMembers}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow"
            >
              Update Memberships
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* View Devices Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Devices in {viewingGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-foreground-muted px-2 py-1 bg-surface-raised rounded border border-border">
              <span>Hostname</span>
              <span>Status</span>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {devices
                .filter(d => {
                  const ids = typeof d.group_ids === 'string' ? d.group_ids.split(',').filter(Boolean) : d.group_ids;
                  return Array.isArray(ids) && ids.includes(viewingGroup?.id);
                })
                .map(device => (
                  <div key={device.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-raised transition-all group/item">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{device.hostname}</p>
                      <p className="text-[10px] text-foreground-muted font-mono">{device.ip}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={device.status} />
                    </div>
                  </div>
                ))}
              {devices.filter(d => {
                const ids = typeof d.group_ids === 'string' ? d.group_ids.split(',').filter(Boolean) : d.group_ids;
                return Array.isArray(ids) && ids.includes(viewingGroup?.id);
              }).length === 0 && (
                <div className="py-12 text-center bg-surface/30 rounded-lg border border-dashed border-border">
                  <p className="text-xs text-foreground-muted italic">No devices assigned to this group.</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button className="w-full sm:w-auto px-6 py-2 bg-surface-raised border border-border rounded-lg text-sm font-medium hover:bg-surface transition-colors">
                Close
              </button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
