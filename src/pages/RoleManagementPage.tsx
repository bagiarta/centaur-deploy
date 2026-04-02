import React, { useState, useEffect } from "react";
import { Shield, ShieldPlus, Edit2, Trash2, Save, X, Loader2, Check } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { navItems } from "@/components/AppShell";

interface Role {
  id: string;
  name: string;
  menu_permissions: string;
  is_admin: boolean;
}

const ALL_MENUS = navItems.map(item => ({ id: item.id, label: item.label }));

export default function RoleManagementPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);
  const [selectedMenus, setSelectedMenus] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/roles");
      const data = await res.json();
      setRoles(data);
    } catch (err) {
      toast.error("Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (role: Role | null) => {
    if (role) {
      setEditingRole(role);
      try {
        if (role.menu_permissions === "*") {
          setSelectedMenus(ALL_MENUS.map(m => m.id));
        } else {
          setSelectedMenus(JSON.parse(role.menu_permissions || "[]"));
        }
      } catch (e) {
        setSelectedMenus([]);
      }
    } else {
      setEditingRole({ name: "", is_admin: false });
      setSelectedMenus([]);
    }
    setIsEditing(true);
  };

  const toggleMenu = (menuId: string) => {
    setSelectedMenus(prev => 
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
    );
  };

  const handleSave = async () => {
    if (!editingRole?.name) {
      toast.error("Role name is required");
      return;
    }

    setIsSaving(true);
    try {
      const isNew = !editingRole.id;
      const url = isNew ? "/api/roles" : `/api/roles/${editingRole.id}`;
      const method = isNew ? "POST" : "PUT";

      // If is_admin or all menus selected, we can store '*' or all IDs
      const menu_permissions = editingRole.is_admin ? "*" : JSON.stringify(selectedMenus);

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editingRole, menu_permissions }),
      });

      if (res.ok) {
        toast.success(isNew ? "Role created" : "Role updated");
        setIsEditing(false);
        fetchRoles();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save role");
      }
    } catch (err) {
      toast.error("Error connecting to server");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;
    try {
      const res = await fetch(`/api/roles/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Role deleted");
        fetchRoles();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete role");
      }
    } catch (err) {
      toast.error("Error connecting to server");
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 animate-fade-up">
      <PageHeader 
        title="Roles & Access Control" 
        subtitle="Define roles and map specific menu permissions"
        actions={
          <button 
            onClick={() => handleEdit(null)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-glow"
          >
            <ShieldPlus className="w-4 h-4" />
            Create New Role
          </button>
        }
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* Role List */}
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max">
          {loading ? (
            <div className="col-span-full py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="mt-2 text-foreground-muted">Loading roles...</p>
            </div>
          ) : roles.map(role => (
            <SectionCard key={role.id} className="group hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    role.is_admin ? "bg-primary/10 text-primary" : "bg-info/10 text-info"
                  )}>
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base leading-tight">{role.name}</h4>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-foreground-muted mt-1">
                      {role.is_admin ? "Full System Access" : "Custom Permissions"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(role)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4 text-primary" />
                  </button>
                  <button 
                    onClick={() => handleDelete(role.id)} 
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                    disabled={role.id === 'role-admin'}
                  >
                    <Trash2 className="w-4 h-4 text-danger" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {role.is_admin || role.menu_permissions === "*" ? (
                  <span className="px-2 py-0.5 bg-primary/5 text-primary border border-primary/20 rounded text-[10px] font-bold">ALL MENUS ACCESSIBLE</span>
                ) : (
                  (() => {
                    try {
                      const perms = JSON.parse(role.menu_permissions || "[]") as string[];
                      return perms.length > 0 ? perms.map(p => (
                        <span key={p} className="px-2 py-0.5 bg-surface-raised border border-border rounded text-[10px] text-foreground-muted">
                          {ALL_MENUS.find(m => m.id === p)?.label || p}
                        </span>
                      )) : <span className="text-[10px] text-foreground-muted italic">No menus accessible</span>;
                    } catch (e) {
                      return null;
                    }
                  })()
                )}
              </div>
            </SectionCard>
          ))}
        </div>

        {/* Edit Panel */}
        {isEditing && (
          <div className="w-[400px] animate-fade-left shrink-0">
            <SectionCard className="h-full flex flex-col border-primary/20 shadow-2xl relative overflow-hidden bg-surface-raised">
              <div className="absolute top-0 right-0 p-4">
                 <button onClick={() => setIsEditing(false)} className="text-foreground-muted hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-8">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-1">
                  {editingRole?.id ? "Modify Role" : "New Role Configuration"}
                </h3>
                <p className="text-xs text-foreground-muted italic">Configure identity and access boundaries</p>
              </div>

              <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider ml-1">Role Name</label>
                  <input
                    type="text"
                    value={editingRole?.name || ''}
                    onChange={(e) => setEditingRole(prev => ({ ...prev!, name: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    placeholder="e.g. Technician, Support, QA"
                  />
                </div>

                <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-bold">Administrator Status</h5>
                    <p className="text-xs text-foreground-muted">Grants full system override</p>
                  </div>
                  <button 
                    onClick={() => setEditingRole(prev => ({ ...prev!, is_admin: !prev?.is_admin }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative px-1 flex items-center",
                      editingRole?.is_admin ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                      editingRole?.is_admin ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>

                {!editingRole?.is_admin && (
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider ml-1">Menu Mapping Access</label>
                    <div className="grid grid-cols-1 gap-2">
                      {ALL_MENUS.map(menu => (
                        <button
                          key={menu.id}
                          onClick={() => toggleMenu(menu.id)}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                            selectedMenus.includes(menu.id)
                              ? "bg-primary/5 border-primary/30 text-primary shadow-sm"
                              : "bg-surface border-border text-foreground-muted hover:border-white/10"
                          )}
                        >
                          <span className="text-sm font-medium">{menu.label}</span>
                          {selectedMenus.includes(menu.id) && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {editingRole?.is_admin && (
                  <div className="p-6 text-center border border-dashed border-primary/30 rounded-2xl bg-primary/5 animate-pulse-slow">
                    <Shield className="w-10 h-10 text-primary mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-primary font-medium tracking-wide">ADMINISTRATOR OVERRIDE ACTIVE</p>
                    <p className="text-[10px] text-foreground-muted mt-2">All current and future menus will be accessible to this role automatically.</p>
                  </div>
                )}
              </div>

              <div className="mt-8">
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm shadow-glow flex items-center justify-center gap-2 hover:translate-y-[-2px] active:translate-y-[0] transition-all"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Finalize Role Config
                </button>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}
