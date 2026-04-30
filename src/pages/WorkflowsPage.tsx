import React, { useState, useEffect } from "react";
import { 
  BookOpen, Plus, Search, Edit2, Trash2, 
  Save, Folder, FileText, Loader2, Book, Download, ArrowLeft, Clock, File, X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";

interface Workflow {
  id: string;
  title: string;
  content: string;
  category: string;
  file_name?: string;
  file_path?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const getCardGradient = (id: string) => {
  const gradients = [
    "from-blue-500/20 to-purple-500/20",
    "from-emerald-500/20 to-teal-500/20",
    "from-orange-500/20 to-red-500/20",
    "from-pink-500/20 to-rose-500/20",
    "from-indigo-500/20 to-cyan-500/20",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
  return gradients[hash % gradients.length];
};

export default function WorkflowsPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_admin;

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Partial<Workflow> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    fetchWorkflows();
    fetchCategories();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/workflows");
      const data = await res.json();
      setWorkflows(data);
    } catch (err) {
      toast.error("Failed to fetch workflows");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/workflows/categories");
      const data = await res.json();
      setCategories(data);
    } catch (err) {
      console.error("Failed to fetch categories");
    }
  };

  const loadWorkflowDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows/${id}`);
      const data = await res.json();
      setSelectedWorkflow(data);
    } catch (err) {
      toast.error("Failed to load workflow content");
    }
  };

  const handleCreate = () => {
    setEditingWorkflow({
      id: `wf-${Date.now()}`,
      title: "",
      content: "",
      category: "General",
      created_by: user?.username || "admin"
    });
    setIsEditorOpen(true);
  };

  const handleEdit = (wf: Workflow) => {
    setEditingWorkflow({ ...wf });
    setIsEditorOpen(true);
  };

  const handleDelete = async (wf: Workflow) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    try {
      const res = await fetch(`/api/workflows/${wf.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Workflow deleted");
        if (selectedWorkflow?.id === wf.id) {
          setSelectedWorkflow(null);
        }
        fetchWorkflows();
      }
    } catch (err) {
      toast.error("Failed to delete workflow");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsExtracting(true);
    try {
      const res = await fetch("/api/workflows/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setEditingWorkflow(prev => ({
          ...prev,
          content: (prev?.content ? prev.content + "\n\n" : "") + data.text,
          file_name: data.fileName,
          file_path: data.filePath
        }));
        toast.success("Document uploaded and text extracted");
      } else {
        toast.error(data.error || "Failed to upload file");
      }
    } catch (err) {
      toast.error("Upload error");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!editingWorkflow?.title || !editingWorkflow?.content) {
      toast.error("Title and content are required");
      return;
    }

    setIsSaving(true);
    try {
      const isNew = !workflows.find(w => w.id === editingWorkflow.id);
      const url = isNew ? "/api/workflows" : `/api/workflows/${editingWorkflow.id}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user?.id || ""
        },
        body: JSON.stringify({
          ...editingWorkflow,
          fileName: editingWorkflow.file_name,
          filePath: editingWorkflow.file_path,
          userId: user?.id
        }),
      });

      if (res.ok) {
        toast.success(isNew ? "Workflow created" : "Workflow updated");
        setIsEditorOpen(false);
        fetchWorkflows();
        fetchCategories();
        if (selectedWorkflow && selectedWorkflow.id === editingWorkflow.id) {
          loadWorkflowDetail(editingWorkflow.id);
        }
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save workflow");
      }
    } catch (err) {
      toast.error("Connection error");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredWorkflows = workflows.filter(w => {
    const matchesSearch = w.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          w.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory ? w.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6 h-full flex flex-col gap-6 animate-fade-up overflow-y-auto">
      {!selectedWorkflow ? (
        <>
          <PageHeader 
            title="Knowledge Base & Workflows" 
            subtitle="Internal tutorials, Work Instructions (WI), and procedures"
            actions={
              isAdmin && (
                <button 
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-glow"
                >
                  <Plus className="w-4 h-4" />
                  New Article
                </button>
              )
            }
          />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                <input 
                  type="text"
                  placeholder="Search articles, procedures..."
                  className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                    !selectedCategory ? "bg-primary text-primary-foreground" : "bg-surface text-foreground-muted hover:bg-surface-raised"
                  )}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                      selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-surface text-foreground-muted hover:bg-surface-raised"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="py-20 text-center text-foreground-muted">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-medium">No articles found</h3>
                <p className="text-sm mt-1">Try adjusting your search or category filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredWorkflows.map(wf => (
                  <div 
                    key={wf.id}
                    onClick={() => loadWorkflowDetail(wf.id)}
                    className="group flex flex-col bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer h-72"
                  >
                    <div className={cn("h-32 w-full bg-gradient-to-br flex items-center justify-center p-4 relative", getCardGradient(wf.id))}>
                      {wf.file_path ? (
                        <FileText className="w-12 h-12 text-foreground/50 drop-shadow-md transition-transform group-hover:scale-110" />
                      ) : (
                        <BookOpen className="w-12 h-12 text-foreground/50 drop-shadow-md transition-transform group-hover:scale-110" />
                      )}
                      <div className="absolute top-3 left-3">
                        <span className="px-2 py-1 bg-background/80 backdrop-blur text-[10px] font-bold uppercase tracking-wider rounded text-foreground">
                          {wf.category}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-bold text-foreground text-lg line-clamp-2 leading-tight mb-2 group-hover:text-primary transition-colors">
                        {wf.title}
                      </h3>
                      <p className="text-xs text-foreground-muted flex-1 line-clamp-3">
                        Click to read this documentation and learn more about the procedure.
                      </p>
                      <div className="mt-4 flex items-center justify-between text-[11px] text-foreground-subtle font-medium border-t border-border pt-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                            {wf.created_by.charAt(0).toUpperCase()}
                          </div>
                          <span>{wf.created_by}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(wf.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full gap-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <button 
            onClick={() => setSelectedWorkflow(null)}
            className="flex items-center gap-2 text-sm text-foreground-muted hover:text-primary transition-colors self-start px-3 py-1.5 -ml-3 rounded-lg hover:bg-surface"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Articles
          </button>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider rounded-md">
                {selectedWorkflow.category}
              </span>
              <span className="text-xs text-foreground-muted flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Last updated {new Date(selectedWorkflow.updated_at).toLocaleDateString()}
              </span>
            </div>
            
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground leading-tight">
              {selectedWorkflow.title}
            </h1>
            
            <div className="flex items-center justify-between border-b border-border pb-6 pt-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center text-lg font-bold">
                  {selectedWorkflow.created_by.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Written by {selectedWorkflow.created_by}</p>
                  <p className="text-xs text-foreground-muted">Knowledge Base Contributor</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {selectedWorkflow.file_name && (
                  <a 
                    href={`/api/workflows/${selectedWorkflow.id}/download`}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-medium hover:bg-surface-raised transition-all text-foreground"
                    download
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                )}
                {isAdmin && (
                  <>
                    <button 
                      onClick={() => handleEdit(selectedWorkflow)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(selectedWorkflow)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-danger/10 text-danger rounded-lg text-xs font-medium hover:bg-danger/20 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex-1 min-h-[600px] flex flex-col bg-surface/30 rounded-xl border border-border overflow-hidden relative">
            {selectedWorkflow.file_path ? (
              <div className="flex-1 w-full h-full min-h-[600px] relative">
                <DocViewer 
                  documents={[{
                    uri: `${window.location.origin}/api/workflows/${selectedWorkflow.id}/view`,
                    fileType: selectedWorkflow.file_name?.split('.').pop() || 'pdf',
                    fileName: selectedWorkflow.file_name
                  }]} 
                  pluginRenderers={DocViewerRenderers} 
                  style={{ height: "100%", width: "100%", background: "transparent" }}
                  theme={{
                    primary: "#3b82f6",
                    secondary: "#1e293b",
                    tertiary: "#0f172a",
                    textPrimary: "#f1f5f9",
                    textSecondary: "#94a3b8",
                    textTertiary: "#cbd5e1",
                    disableThemeScrollbar: false,
                  }}
                  config={{
                    header: {
                      disableHeader: false,
                      disableFileName: false,
                      retainURLParams: false
                    }
                  }}
                />
              </div>
            ) : (
              <div className="p-8 md:p-12 prose prose-invert prose-blue max-w-none prose-headings:text-foreground prose-p:text-foreground/80 prose-strong:text-foreground prose-code:text-info prose-pre:bg-surface/50">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedWorkflow.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingWorkflow?.id && editingWorkflow.id.startsWith('wf-') ? "Create New Article" : "Edit Article"}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col gap-4 min-h-0 py-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Title</label>
                <input 
                  className="w-full px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary outline-none"
                  value={editingWorkflow?.title || ""}
                  onChange={e => setEditingWorkflow(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Troubleshooting Printer Connection"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Category</label>
                <div className="relative group">
                  <input 
                    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary outline-none"
                    value={editingWorkflow?.category || ""}
                    onChange={e => setEditingWorkflow(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g. Hardware"
                  />
                  
                  {/* Category Autocomplete */}
                  {categories.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-surface border border-border rounded-md shadow-xl z-50 max-h-32 overflow-y-auto hidden group-focus-within:block">
                      {categories.map(c => (
                        <button 
                          key={c}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEditingWorkflow(prev => ({ ...prev, category: c }));
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary/10 transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <File className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Document Attachment (Optional)</p>
                    <p className="text-xs text-foreground-muted">Upload Word/PDF to display the original document in the viewer</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    id="kb-file-upload" 
                    className="hidden" 
                    accept=".docx,.txt,.pdf"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById('kb-file-upload')?.click()}
                    disabled={isExtracting}
                    className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md text-xs font-bold hover:bg-surface transition-all disabled:opacity-50"
                  >
                    {isExtracting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {editingWorkflow?.file_name ? "Replace Document" : "Upload Document"}
                  </button>
                </div>
              </div>
              
              {editingWorkflow?.file_name && (
                <div className="flex items-center gap-2 px-3 py-2 bg-background/50 rounded-md border border-border mt-1">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium truncate flex-1">{editingWorkflow.file_name}</span>
                  <button 
                    onClick={() => setEditingWorkflow(prev => ({ ...prev, file_name: undefined, file_path: undefined }))}
                    className="p-1 hover:bg-danger/10 text-danger rounded transition-colors"
                    title="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-1.5 min-h-[300px]">
              <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted flex justify-between">
                <span>Text Content (Markdown)</span>
                <span className="text-[10px] lowercase normal-case opacity-70">Used for search and if no document is attached</span>
              </label>
              <textarea 
                className="flex-1 p-4 bg-background border border-border rounded-md font-mono text-xs focus:ring-1 focus:ring-primary outline-none resize-none"
                value={editingWorkflow?.content || ""}
                onChange={e => setEditingWorkflow(prev => ({ ...prev, content: e.target.value }))}
                placeholder="# Procedure Title\n\n1. Step one\n2. Step two..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border mt-auto">
            <DialogClose asChild>
              <button className="px-4 py-2 text-sm font-medium hover:bg-surface rounded-lg transition-colors">Cancel</button>
            </DialogClose>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all disabled:opacity-50 shadow-glow"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Article
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
