import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Users, UserPlus, Edit2, Trash2, Search, Shield, Save, X, Loader2 } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  username: string;
  full_name: string;
  role_id: string;
  role_name: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User & { password?: string }> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [uRes, rRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/roles")
      ]);
      const uData = await uRes.json();
      const rData = await rRes.json();
      setUsers(uData);
      setRoles(rData);
    } catch (err) {
      toast.error("Failed to fetch user data");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: User | null) => {
    setEditingUser(user || { username: "", full_name: "", role_id: roles[0]?.id || "", password: "" });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editingUser?.username || !editingUser?.role_id) {
      toast.error("Username and Role are required");
      return;
    }

    setIsSaving(true);
    try {
      const isNew = !editingUser.id;
      const url = isNew ? "/api/users" : `/api/users/${editingUser.id}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUser),
      });

      if (res.ok) {
        toast.success(isNew ? "User created" : "User updated");
        setIsEditing(false);
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save user");
      }
    } catch (err) {
      toast.error("Error connecting to server");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("User deleted");
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete user");
      }
    } catch (err) {
      toast.error("Error connecting to server");
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) || 
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.role_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 h-full flex flex-col gap-6 animate-fade-up">
      <PageHeader 
        title="User Management" 
        subtitle="Manage system users and assign roles"
        actions={
          <button 
            onClick={() => handleEdit(null)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-glow"
          >
            <UserPlus className="w-4 h-4" />
            Add New User
          </button>
        }
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* User List */}
        <div className="flex-1 min-h-0">
          <SectionCard className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="text-xs text-foreground-muted">
                Showing {filteredUsers.length} users
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">User</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Role</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Created</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-foreground-muted italic">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-foreground-muted italic">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{u.username}</div>
                            <div className="text-xs text-foreground-muted">{u.full_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-raised border border-border text-xs font-medium">
                          <Shield className="w-3 h-3 text-primary" />
                          {u.role_name}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs text-foreground-muted">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleEdit(u)}
                            className="p-1.5 rounded-md hover:bg-primary/20 text-primary transition-colors"
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(u.id)}
                            className="p-1.5 rounded-md hover:bg-danger/20 text-danger transition-colors"
                            title="Delete User"
                            disabled={u.username === 'admin'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Edit Modal / Right Side Panel */}
        {isEditing && (
          <div className="w-96 animate-fade-left">
            <SectionCard className="flex flex-col h-full bg-surface-raised border-primary/20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold flex items-center gap-2">
                  {editingUser?.id ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {editingUser?.id ? "Edit User" : "Create New User"}
                </h3>
                <button onClick={() => setIsEditing(false)} className="text-foreground-muted hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground-muted">Username</label>
                  <input
                    type="text"
                    value={editingUser?.username || ''}
                    onChange={(e) => setEditingUser(prev => ({ ...prev!, username: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all"
                    placeholder="e.g. jdoe"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground-muted">Full Name</label>
                  <input
                    type="text"
                    value={editingUser?.full_name || ''}
                    onChange={(e) => setEditingUser(prev => ({ ...prev!, full_name: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground-muted">Role</label>
                  <select
                    value={editingUser?.role_id || ''}
                    onChange={(e) => setEditingUser(prev => ({ ...prev!, role_id: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all select-none"
                  >
                    <option value="" disabled>Select a role</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground-muted">
                    {editingUser?.id ? "Reset Password (optional)" : "Password"}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                    <input
                      type="password"
                      value={editingUser?.password || ""}
                      onChange={(e) => setEditingUser(prev => ({ ...prev!, password: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm shadow-glow flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save User
                </button>
              </div>
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}

const Lock = (props: any) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
