import React, { useState, useEffect } from "react";
import { 
  BookOpen, Plus, Search, ChevronRight, Edit2, Trash2, 
  Save, X, Folder, FileText, Loader2, Book, AlertCircle, Download
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";

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

export default function WorkflowsPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_admin;

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
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
      if (data.length > 0 && !selectedWorkflow) {
        // Fetch the full content of the first one
        loadWorkflowDetail(data[0].id);
      }
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

  const handleEdit = () => {
    if (!selectedWorkflow) return;
    setEditingWorkflow({ ...selectedWorkflow });
    setIsEditorOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedWorkflow || !confirm("Are you sure you want to delete this workflow?")) return;
    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Workflow deleted");
        setSelectedWorkflow(null);
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
        toast.success("Text extracted from document");
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
        if (editingWorkflow.id) loadWorkflowDetail(editingWorkflow.id);
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

  // Grouping
  const groupedWorkflows = workflows.reduce((acc, wf) => {
    const cat = wf.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(wf);
    return acc;
  }, {} as Record<string, Workflow[]>);

  const filteredGroups = Object.entries(groupedWorkflows).map(([cat, items]) => {
    const filteredItems = items.filter(w => 
      w.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      cat.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return { cat, items: filteredItems };
  }).filter(group => group.items.length > 0);

  return (
    <div className="p-6 h-full flex flex-col gap-6 animate-fade-up">
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
              New Instruction
            </button>
          )
        }
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* Sidebar: Document List */}
        <div className="w-full lg:w-80 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input 
              type="text"
              placeholder="Search instructions..."
              className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-10 text-center text-foreground-muted text-sm italic">No documents found</div>
            ) : filteredGroups.map(group => (
              <div key={group.cat} className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                  <Folder className="w-3 h-3" />
                  {group.cat}
                </div>
                {group.items.map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => loadWorkflowDetail(wf.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left",
                      selectedWorkflow?.id === wf.id 
                        ? "bg-primary/10 text-primary font-medium" 
                        : "text-foreground-muted hover:bg-surface hover:text-foreground"
                    )}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{wf.title}</span>
                    {selectedWorkflow?.id === wf.id && <ChevronRight className="w-4 h-4 ml-auto" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content: Viewer */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">
          {selectedWorkflow ? (
            <SectionCard className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-4 bg-surface/30">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{selectedWorkflow.title}</h2>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-foreground-muted flex items-center gap-1">
                      <Folder className="w-3 h-3" /> {selectedWorkflow.category}
                    </span>
                    <span className="text-xs text-foreground-muted flex items-center gap-1">
                      <Book className="w-3 h-3" /> By {selectedWorkflow.created_by}
                    </span>
                  </div>
                </div>
                {selectedWorkflow.file_name && (
                  <a 
                    href={`/api/workflows/${selectedWorkflow.id}/download`}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-medium hover:bg-surface/50 transition-all text-primary"
                    download
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Original
                  </a>
                )}
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleEdit}
                      className="p-2 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                      title="Edit Document"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handleDelete}
                      className="p-2 text-foreground-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                      title="Delete Document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground-muted prose-strong:text-foreground prose-code:text-info prose-pre:bg-surface/50">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedWorkflow.content}
                </ReactMarkdown>
              </div>
            </SectionCard>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-surface/20 rounded-xl border border-dashed border-border text-foreground-muted">
              <BookOpen className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="text-lg font-medium">Select a workflow to read</h3>
              <p className="max-w-xs mx-auto text-sm mt-1">
                Choose a document from the sidebar to view detailed Work Instructions and tutorials.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingWorkflow?.id ? "Edit Work Instruction" : "Create New Instruction"}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col gap-4 min-h-0 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Title</label>
                <input 
                  className="w-full px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary outline-none"
                  value={editingWorkflow?.title || ""}
                  onChange={e => setEditingWorkflow(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Restart POS Agent Service"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Category</label>
                <div className="relative">
                  <input 
                    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:ring-1 focus:ring-primary outline-none"
                    value={editingWorkflow?.category || ""}
                    onChange={e => setEditingWorkflow(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g. Troubleshooting..."
                  />
                  
                  {/* Category Autocomplete */}
                  {categories.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-surface border border-border rounded-md shadow-xl z-50 max-h-32 overflow-y-auto hidden group-focus-within:block">
                      {categories.map(c => (
                        <button 
                          key={c}
                          onClick={() => setEditingWorkflow(prev => ({ ...prev, category: c }))}
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

            <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Knowledge Ingestion</p>
                  <p className="text-xs text-foreground-muted">Upload Word/Text to extract content automatically</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editingWorkflow?.file_name && (
                  <span className="text-[10px] bg-surface-subtle px-2 py-1 rounded border border-border truncate max-w-[150px]">
                    {editingWorkflow.file_name}
                  </span>
                )}
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
                  {editingWorkflow?.file_name ? "Change File" : "Upload & Extract"}
                </button>
              </div>
            </div>

            <div className="flex-1 flex gap-4 min-h-0">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Content (Markdown)</label>
                <textarea 
                  className="flex-1 p-4 bg-background border border-border rounded-md font-mono text-xs focus:ring-1 focus:ring-primary outline-none resize-none"
                  value={editingWorkflow?.content || ""}
                  onChange={e => setEditingWorkflow(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="# Procedure Title\n\n1. Step one\n2. Step two..."
                />
              </div>
              <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Preview</label>
                <div className="flex-1 p-4 bg-surface/50 border border-border rounded-md overflow-y-auto prose prose-invert prose-xs max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {editingWorkflow?.content || "*No content to preview*"}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button className="px-4 py-2 text-sm font-medium hover:bg-surface rounded-lg transition-colors">Cancel</button>
            </DialogClose>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingWorkflow?.id ? "Update Document" : "Save Document"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
