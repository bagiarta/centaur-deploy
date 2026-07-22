import { useState, useEffect } from "react";
import { Upload, Search, Download, Trash2, Edit, X, Plus, Activity, FileCode, Monitor, CheckCircle2, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Installer {
  id: string;
  name: string;
  version: string | null;
  file_name: string;
  file_path: string;
  file_size: string | null;
  file_type: string | null;
  description: string | null;
  uploaded_at: string;
  uploaded_by: string;
}

const typeIcons: Record<string, string> = {
  apk: "📱",
  exe: "🖥️",
  msi: "📦",
  zip: "🗜️",
  dmg: "🍎",
  ipa: "🍏",
  others: "📁"
};

const typeColors: Record<string, string> = {
  apk: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-400",
  exe: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-400",
  msi: "from-indigo-500/20 to-purple-500/20 border-indigo-500/30 text-indigo-400",
  zip: "from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-400",
  dmg: "from-slate-500/20 to-neutral-500/20 border-slate-500/30 text-slate-400",
  ipa: "from-rose-500/20 to-pink-500/20 border-rose-500/30 text-rose-400",
};

export default function InstallersPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true;

  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Modal controls
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInstaller, setEditingInstaller] = useState<Installer | null>(null);

  // Form states
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchInstallers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/installers", {
        headers: { "x-user-id": user?.id || "" }
      });
      if (res.ok) {
        const data = await res.json();
        setInstallers(data);
      } else {
        toast.error("Failed to load installation files");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to fetch installers repository");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstallers();
  }, [user]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    if (!newName) {
      const nameParts = file.name.split('.');
      nameParts.pop(); // Remove extension
      setNewName(nameParts.join('.'));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !selectedFile) {
      toast.error("Please fill in file and title name");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("name", newName);
    formData.append("version", newVersion);
    formData.append("description", newDescription);

    try {
      const res = await fetch("/api/installers", {
        method: "POST",
        headers: { "x-user-id": user?.id || "" },
        body: formData
      });

      if (res.ok) {
        toast.success("File uploaded successfully");
        setShowUploadModal(false);
        setNewName("");
        setNewVersion("");
        setNewDescription("");
        setSelectedFile(null);
        fetchInstallers();
      } else {
        const errMsg = await res.text();
        toast.error("Upload failed: " + errMsg);
      }
    } catch (err: any) {
      toast.error("Error uploading file: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstaller || !newName) return;

    try {
      const res = await fetch(`/api/installers/${editingInstaller.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user?.id || ""
        },
        body: JSON.stringify({
          name: newName,
          version: newVersion,
          description: newDescription
        })
      });

      if (res.ok) {
        toast.success("Metadata updated successfully");
        setShowEditModal(false);
        fetchInstallers();
      } else {
        toast.error("Failed to update installer details");
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this installation file? This action is permanent.")) return;

    try {
      const res = await fetch(`/api/installers/${id}`, {
        method: "DELETE",
        headers: { "x-user-id": user?.id || "" }
      });

      if (res.ok) {
        toast.success("File deleted successfully");
        fetchInstallers();
      } else {
        toast.error("Failed to delete installation file");
      }
    } catch (err: any) {
      toast.error("Error: " + err.message);
    }
  };

  const handleDownload = (id: string) => {
    window.location.href = `/api/installers/${id}/download`;
  };

  const openUploadModal = () => {
    setNewName("");
    setNewVersion("");
    setNewDescription("");
    setSelectedFile(null);
    setShowUploadModal(true);
  };

  const openEditModal = (inst: Installer) => {
    setEditingInstaller(inst);
    setNewName(inst.name);
    setNewVersion(inst.version || "");
    setNewDescription(inst.description || "");
    setShowEditModal(true);
  };

  const filteredInstallers = installers.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase())) ||
      item.file_name.toLowerCase().includes(search.toLowerCase());

    const type = item.file_type || "others";
    const matchesFilter = typeFilter === "all" || type === typeFilter;

    return matchesSearch && matchesFilter;
  });

  const getInstallerIcon = (ext: string | null) => {
    const key = (ext || "").toLowerCase();
    return typeIcons[key] || typeIcons.others;
  };

  const getInstallerColor = (ext: string | null) => {
    const key = (ext || "").toLowerCase();
    return typeColors[key] || "from-slate-500/10 to-neutral-500/10 border-border text-foreground-muted";
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Activity className="w-8 h-8 text-primary animate-spin" />
        <span className="text-xs text-foreground-muted animate-pulse">Loading files repository...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 animate-fade-in text-xs">
      <PageHeader
        title="Installation Files Repository"
        subtitle="Manage and download application installer files (APK, EXE, MSI, DMG, etc.)"
        actions={
          isAdmin && (
            <button
              onClick={openUploadModal}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-bold transition-all shadow-glow"
            >
              <Plus className="w-4 h-4" /> Upload Application
            </button>
          )
        }
      />

      {/* Main Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Applications", value: installers.length, color: "text-foreground" },
          { label: "Android Apps (APK)", value: installers.filter(i => i.file_type === "apk").length, color: "text-emerald-400" },
          { label: "Windows Apps (EXE/MSI)", value: installers.filter(i => i.file_type === "exe" || i.file_type === "msi").length, color: "text-blue-400" },
          { label: "Other Formats", value: installers.filter(i => !["apk", "exe", "msi"].includes(i.file_type || "")).length, color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="card-enterprise p-4 bg-surface-raised/30 border border-border">
            <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">{s.label}</p>
            <p className={cn("text-xl font-extrabold", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter and Search Section */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search app name, file, description..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-xl text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {["all", "apk", "exe", "msi", "zip", "dmg", "others"].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-2.5 py-1.5 font-bold uppercase rounded-lg border transition-all",
                typeFilter === t
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-surface border-border text-foreground-muted hover:text-foreground"
              )}
            >
              {t === "others" ? "others 📁" : t}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Installers */}
      {filteredInstallers.length === 0 ? (
        <SectionCard>
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-border/20 flex items-center justify-center text-foreground-muted text-lg">📁</div>
            <div>
              <p className="font-bold text-foreground">No installers found</p>
              <p className="text-foreground-muted mt-1 max-w-xs mx-auto">Try adjusting your search query, selecting another filter, or uploading a new file if you are an administrator.</p>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInstallers.map(item => (
            <div
              key={item.id}
              className="group card-enterprise overflow-hidden border border-border bg-surface-raised/20 hover:bg-surface-raised/40 hover:border-primary/40 transition-all duration-300 flex flex-col justify-between"
            >
              <div className="p-4 space-y-3.5">
                {/* Header of the Card */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center text-xl bg-gradient-to-br shadow-inner", getInstallerColor(item.file_type))}>
                      {getInstallerIcon(item.file_type)}
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-sm group-hover:text-primary transition-colors flex items-center gap-1.5">
                        {item.name}
                        {item.version && (
                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-foreground-muted">
                            v{item.version}
                          </span>
                        )}
                      </h3>
                      <p className="text-[10px] text-foreground-muted font-mono truncate max-w-[180px]" title={item.file_name}>
                        {item.file_name}
                      </p>
                    </div>
                  </div>

                  <span className="font-bold uppercase text-[9px] px-2 py-0.5 rounded-full border border-border/80 bg-surface text-foreground-muted">
                    {item.file_type || "File"}
                  </span>
                </div>

                {/* Description */}
                <p className="text-foreground-subtle text-[11px] leading-relaxed line-clamp-2 h-8">
                  {item.description || <span className="italic text-foreground-muted">No description provided</span>}
                </p>

                {/* Footer details */}
                <div className="pt-2.5 border-t border-border/60 flex items-center justify-between text-[9px] text-foreground-muted">
                  <span>Size: <strong className="font-mono font-bold text-foreground-subtle">{item.file_size || "N/A"}</strong></span>
                  <span className="truncate max-w-[120px]">By: <strong className="text-foreground-subtle">{item.uploaded_by}</strong></span>
                </div>
                <div className="text-[9px] text-foreground-muted text-right">
                  Uploaded: <span className="font-mono">{formatDate(item.uploaded_at)}</span>
                </div>
              </div>

              {/* Actions Section */}
              <div className="px-4 py-3 border-t border-border/60 bg-black/10 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleDownload(item.id)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-lg flex-1 transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>

                {isAdmin && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(item)}
                      className="p-2 bg-surface border border-border hover:border-primary/30 text-foreground-muted hover:text-primary rounded-lg transition-all"
                      title="Edit details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 bg-danger-dim border border-danger/30 text-danger hover:bg-danger hover:text-danger-foreground rounded-lg transition-all"
                      title="Delete file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Installer Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-xs">
          <div className="card-enterprise w-full max-w-md bg-background border border-border flex flex-col p-6 animate-fade-up relative">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute right-4 top-4 text-foreground-muted hover:text-foreground p-1 rounded-lg border border-border"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> Upload Application Installer
            </h2>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Drag & Drop File Upload Area */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center transition-all bg-surface-raised/20",
                  selectedFile ? "border-success/40 bg-success/5" : "border-border hover:border-primary/50 hover:bg-surface-raised/40"
                )}
              >
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={e => e.target.files && handleFileSelect(e.target.files[0])}
                />
                {selectedFile ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-success mb-2 animate-bounce-short" />
                    <p className="font-bold text-foreground max-w-xs truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-foreground-muted mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    <label htmlFor="file-upload" className="text-[10px] text-primary hover:underline font-bold mt-2 cursor-pointer">
                      Change File
                    </label>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-foreground-muted mb-2 group-hover:text-primary" />
                    <p className="font-bold text-foreground">Drag and drop file here</p>
                    <p className="text-[10px] text-foreground-muted mt-0.5">apk, exe, msi, zip, dmg, and other formats</p>
                    <label htmlFor="file-upload" className="mt-3 px-3 py-1.5 bg-surface hover:bg-surface-raised border border-border rounded-lg font-bold cursor-pointer transition-all">
                      Browse Files
                    </label>
                  </>
                )}
              </div>

              {/* Title / Name */}
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Application Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Centaur Update Agent"
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Version */}
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Version</label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={e => setNewVersion(e.target.value)}
                  placeholder="e.g. 2.6.4"
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Description / Notes</label>
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Describe what this installer is for or release notes..."
                  rows={3}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-border hover:bg-surface-raised rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-primary flex items-center gap-1.5"
                >
                  {uploading ? (
                    <>
                      <Activity className="w-3.5 h-3.5 animate-spin" /> Uploading...
                    </>
                  ) : (
                    "Upload App"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingInstaller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-xs">
          <div className="card-enterprise w-full max-w-md bg-background border border-border flex flex-col p-6 animate-fade-up relative">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute right-4 top-4 text-foreground-muted hover:text-foreground p-1 rounded-lg border border-border"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" /> Edit App Details
            </h2>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Application Name */}
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Application Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Version */}
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Version</label>
                <input
                  type="text"
                  value={newVersion}
                  onChange={e => setNewVersion(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Description / Notes</label>
                <textarea
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-border hover:bg-surface-raised rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-xl transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
