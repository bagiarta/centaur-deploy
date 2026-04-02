import { useState, useEffect } from "react";
import { Upload, Search, Package2, CheckCircle2, Download, Activity } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

const typeColors: Record<string, string> = {
  msi:    "bg-primary-dim text-primary",
  exe:    "bg-info-dim text-info",
  zip:    "bg-warning-dim text-warning",
  dll:    "bg-danger-dim text-danger",
  json:   "bg-success-dim text-success",
  xml:    "bg-success-dim text-success",
  config: "bg-surface-overlay text-foreground-muted",
};

export default function PackagesPage() {
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New package form state
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [newType, setNewType] = useState("msi");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    if (!newName) {
      const nameParts = file.name.split('.');
      nameParts.pop(); // remove extension
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

  const handleUpload = async () => {
    if (!newName || !selectedFile) return;
    
    setUploading(true);
    const id = `pkg-${Date.now()}`;
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('id', id);
    formData.append('name', newName);
    formData.append('version', newVersion || "1.0.0");
    formData.append('type', newType);
    formData.append('uploaded_by', "admin");

    try {
      const res = await fetch('/api/packages', {
        method: "POST",
        body: formData // Fetch automatically sets Content-Type to multipart/form-data
      });
      if (res.ok) {
        const result = await res.json();
        const newPackage = {
          id,
          name: newName,
          version: newVersion || "1.0.0",
          type: newType,
          checksum: `sha256:temp`,
          file_path: result.file_path,
          size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`,
          uploaded_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
          uploaded_by: "admin"
        };
        setPackages(prev => [newPackage, ...prev]);
        setUploading(false);
        setNewName("");
        setNewVersion("");
        setNewType("msi");
        setSelectedFile(null);
      } else {
        const errText = await res.text();
        console.error("Upload failed", errText);
        alert("Upload failed: " + errText);
      }
    } catch (err) {
      console.error(err);
      alert("Error: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this package?")) return;
    try {
      const res = await fetch(`/api/packages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPackages(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/packages');
        setPackages(await res.json());
      } catch (err) {
        console.error("Failed to fetch packages:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const types = ["all", ...Array.from(new Set(packages.map(p => p.type)))];
  const filtered = packages.filter(p =>
    ((p.name || "").toLowerCase().includes(search.toLowerCase()) || (p.version || "").includes(search))
    && (typeFilter === "all" || p.type === typeFilter)
  );

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[50vh]"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Package Repository"
        subtitle="Manage deployable packages: EXE, MSI, DLL, ZIP, JSON, XML, Config"
        actions={
          <button
            onClick={() => setUploading(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
          >
            <Upload className="w-3.5 h-3.5" /> Upload Package
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Packages", value: packages.length, color: "text-foreground" },
          { label: "MSI / EXE",      value: packages.filter(p => p.type === "msi" || p.type === "exe").length, color: "text-primary" },
          { label: "Archives (ZIP)",  value: packages.filter(p => p.type === "zip").length, color: "text-warning" },
          { label: "Config Files",   value: packages.filter(p => ["json","xml","config"].includes(p.type)).length, color: "text-success" },
        ].map(s => (
          <div key={s.label} className="card-enterprise p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wider mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search packages..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md border transition-all uppercase",
              typeFilter === t
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-surface border-border text-foreground-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      <SectionCard>
        <div className="overflow-x-auto">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th>Package Name</th>
                <th>Version</th>
                <th>Type</th>
                <th>Size</th>
                <th>Checksum</th>
                <th>Uploaded By</th>
                <th>Uploaded At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(pkg => (
                <tr key={pkg.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Package2 className="w-4 h-4 text-foreground-muted shrink-0" />
                      <span className="font-medium">{pkg.name}</span>
                    </div>
                  </td>
                  <td><span className="font-mono text-xs text-foreground-muted">{pkg.version}</span></td>
                  <td>
                    <span className={cn("badge-pill uppercase", typeColors[pkg.type] ?? "bg-muted text-foreground-muted")}>
                      {pkg.type}
                    </span>
                  </td>
                  <td><span className="font-mono text-xs text-foreground-muted">{pkg.size || '-'}</span></td>
                  <td>
                    <span className="font-mono text-xs text-foreground-subtle truncate max-w-40 block" title={pkg.checksum || 'No checksum'}>
                      {pkg.checksum ? pkg.checksum.slice(0, 20) + '…' : '-'}
                    </span>
                  </td>
                  <td><span className="text-xs text-foreground-muted">{pkg.uploaded_by}</span></td>
                  <td><span className="text-xs text-foreground-muted font-mono">{pkg.uploaded_at}</span></td>
                  <td>
                    <div className="flex items-center gap-2">
                       {/* Temporarily skipping deploy link here, users can use Deployments page */}
                      <button className="text-xs text-foreground-muted hover:text-foreground" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(pkg.id)} className="text-xs text-danger hover:text-danger-foreground transition-colors ml-2" title="Delete Package">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t border-border text-xs text-foreground-muted">
          {filtered.length} of {packages.length} packages
        </div>
      </SectionCard>

      {/* Upload Modal */}
      {uploading && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-10 overflow-y-auto pb-10" onClick={() => setUploading(false)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-lg animate-fade-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground mb-4">Upload Package</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-foreground-muted mb-1 block">Package Name</label>
                <input 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="e.g. My Application" 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-foreground-muted mb-1 block">Version</label>
                  <input 
                    value={newVersion}
                    onChange={e => setNewVersion(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="1.0.0" 
                  />
                </div>
                <div>
                  <label className="text-xs text-foreground-muted mb-1 block">Type</label>
                  <select 
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    {["exe","msi","dll","zip","json","xml","config"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <label 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              >
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={e => e.target.files && handleFileSelect(e.target.files[0])}
                />
                <Upload className={cn("w-8 h-8 mx-auto mb-2", selectedFile ? "text-primary" : "text-foreground-muted")} />
                <p className="text-sm text-foreground-muted">
                  {selectedFile ? <span className="text-foreground font-medium">{selectedFile.name}</span> : <><span className="text-primary">Browse</span> or drag file here</>}
                </p>
                {!selectedFile && <p className="text-xs text-foreground-subtle mt-1">Max 2 GB · EXE, MSI, DLL, ZIP, JSON, XML, CONFIG</p>}
              </label>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setUploading(false)} className="flex-1 py-2 text-sm border border-border rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors">Cancel</button>
                <button onClick={handleUpload} className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold disabled:opacity-50" disabled={!newName}>Upload</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Rocket2({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>;
}
