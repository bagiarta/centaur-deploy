import { useState, useEffect } from "react";
import { 
  Database, Play, CheckCircle, XCircle, ChevronDown, ChevronRight, Server, 
  Activity, Search, Trash2, Filter, Info, Save, Clock, Download, ShieldAlert,
  BarChart, LineChart, PieChart, LayoutDashboard
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";
import { 
  BarChart as RechartsBar, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart as RechartsLine, Line, PieChart as RechartsPie, Pie, Cell
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

export default function RemoteSqlPage() {
  const [script, setScript] = useState("-- Write your SQL script here\nSELECT TOP 10 * FROM INFORMATION_SCHEMA.TABLES;");
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [results, setResults] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");

  // New Features State
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [force, setForce] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [editorView, setEditorView] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      console.log("RemoteSqlPage: Starting loadData...");
      try {
        setLoadError(null);
        
        // 1. Devices
        console.log("RemoteSqlPage: Fetching /api/devices...");
        const devRes = await fetch('/api/devices');
        const devType = devRes.headers.get("content-type") || "";
        if (!devRes.ok || !devType.includes("application/json")) {
           const txt = await devRes.text();
           throw new Error(`Devices API failed (${devRes.status}). Type: ${devType}. Content start: ${txt.substring(0, 50).replace(/</g, "&lt;")}`);
        }
        const devs = await devRes.json();
        console.log("RemoteSqlPage: Devs fetched:", devs?.length);
        
        // 2. Groups
        console.log("RemoteSqlPage: Fetching /api/groups...");
        const grpRes = await fetch('/api/groups');
        const grpType = grpRes.headers.get("content-type") || "";
        if (!grpRes.ok || !grpType.includes("application/json")) {
          const txt = await grpRes.text();
          throw new Error(`Groups API failed (${grpRes.status}). Type: ${grpType}. Content start: ${txt.substring(0, 50).replace(/</g, "&lt;")}`);
        }
        const grps = await grpRes.json();
        console.log("RemoteSqlPage: Grps fetched:", grps?.length);

        // 3. Templates (Optional)
        const tplRes = await fetch('/api/sql/templates').catch(() => null);
        const tpls = tplRes && tplRes.ok && (tplRes.headers.get("content-type") || "").includes("application/json") 
          ? await tplRes.json() : [];
        console.log("RemoteSqlPage: Tpls fetched:", tpls?.length);

        if (Array.isArray(devs)) setDevices(devs);
        if (Array.isArray(grps)) setGroups(grps);
        if (Array.isArray(tpls)) setTemplates(tpls);

      } catch (err: any) {
        console.error("RemoteSqlPage: Load error:", err);
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Activity className="w-12 h-12 text-primary animate-spin" />
        <p className="text-sm text-foreground-muted animate-pulse">Initializing Remote SQL Workspace...</p>
      </div>
    );
  }

  const handleExecute = async () => {
    console.log("RemoteSqlPage: handleExecute started. Targets:", selectedDeviceIds);
    if (selectedDeviceIds.length === 0) return alert("Select target devices.");
    if (!script.trim()) return alert("Enter script.");

    setIsExecuting(true);
    setResults(null);
    try {
      // Logic for selection execution
      let queryToRun = script;
      if (editorView) {
        const selection = editorView.state.selection.main;
        if (selection && !selection.empty) {
          queryToRun = editorView.state.sliceDoc(selection.from, selection.to);
          console.log("RemoteSqlPage: Executing selected text only.");
        }
      }

      const payload = {
        script: queryToRun,
        target_device_ids: selectedDeviceIds,
        force
      };
      console.log("RemoteSqlPage: Execution payload:", payload);

      const res = await fetch('/api/sql/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log("RemoteSqlPage: Execution response data:", data);
      
      if (res.status === 400) alert(data.error);
      else {
        setResults(data.results);
        if (!data.results || Object.keys(data.results).length === 0) {
          console.warn("RemoteSqlPage: Empty results object received from server.");
        }
      }
    } catch (err: any) {
      console.error("RemoteSqlPage: Execution error:", err);
      alert("Execution error: " + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const saveTemplate = async () => {
    let name = "";
    let desc = "";
    let method = 'POST';
    let url = '/api/sql/templates';

    if (activeTemplateId) {
      const existing = templates.find(t => t.id === activeTemplateId);
      if (confirm(`Update existing template "${existing?.name}"?`)) {
        method = 'PUT';
        url = `/api/sql/templates/${activeTemplateId}`;
        name = existing?.name || "";
        desc = existing?.description || "";
      } else {
        const newName = prompt("Enter new template name:");
        if (!newName) return;
        name = newName;
      }
    } else {
      const newName = prompt("Enter template name:");
      if (!newName) return;
      name = newName;
    }

    try {
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc, script })
      });
      // Refresh templates
      const res = await fetch('/api/sql/templates');
      const updatedTemplates = await res.json();
      setTemplates(updatedTemplates);
      if (method === 'POST') {
        const latest = updatedTemplates[0]; // Assuming order by created_at DESC
        setActiveTemplateId(latest.id);
      }
      alert(method === 'PUT' ? "Template updated!" : "Template saved!");
    } catch (err) {
      alert("Failed to save template.");
    }
  };

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await fetch(`/api/sql/templates/${id}`, { method: 'DELETE' });
      if (activeTemplateId === id) setActiveTemplateId(null);
      const res = await fetch('/api/sql/templates');
      setTemplates(await res.json());
    } catch (err) {
      alert("Failed to delete template.");
    }
  };

  const handleSchedule = async () => {
    if (!scheduleName || !scheduleTime) return alert("Fill all schedule fields.");
    try {
      await fetch('/api/sql/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scheduleName,
          script,
          target_device_ids: selectedDeviceIds,
          next_run_at: scheduleTime
        })
      });
      alert("Job scheduled successfully!");
      setShowSchedule(false);
    } catch (err) {
      alert("Failed to schedule job.");
    }
  };

  const exportCsv = async () => {
    if (!results) return;
    try {
      const res = await fetch('/api/sql/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sql_export_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert("Export failed.");
    }
  };

  const ALLOWED_GROUPS = ["POS OFFLINE", "SERVERS", "SERVER"];
  const allowedGroupIds = groups
    .filter(g => ALLOWED_GROUPS.includes(g.name?.toUpperCase()))
    .map(g => g.id);

  const filteredGroups = groups.filter(g => ALLOWED_GROUPS.includes(g.name?.toUpperCase()));

  const filteredDevices = devices.filter(d => {
    const gIds = typeof d.group_ids === 'string' ? d.group_ids.split(',').filter(Boolean) : (Array.isArray(d.group_ids) ? d.group_ids : []);
    const isInAllowedGroup = gIds.some(id => allowedGroupIds.includes(id));
    if (!isInAllowedGroup) return false;

    const hostname = d.hostname || d.id || "";
    const ip = d.ip || "";
    const matchesSearch = hostname.toLowerCase().includes(searchTerm.toLowerCase()) || ip.includes(searchTerm);
    if (groupFilter === "all") return matchesSearch;
    return matchesSearch && gIds.includes(groupFilter);
  });

  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-fade-up overflow-hidden bg-background">
      <PageHeader 
        title="Remote SQL Pro" 
        subtitle="Professional DB management with templates, scheduling, and visualization"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-lg border border-border mr-2">
              <ShieldAlert className={cn("w-4 h-4", force ? "text-danger" : "text-success")} />
              <span className="text-[10px] font-bold uppercase">Safe Mode</span>
              <button 
                onClick={() => setForce(!force)}
                className={cn(
                  "w-8 h-4 rounded-full relative transition-colors",
                  force ? "bg-danger" : "bg-success"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200",
                  force ? "translate-x-4" : "translate-x-0"
                )} />
              </button>
            </div>
            
            <button
              onClick={handleExecute}
              disabled={isExecuting || selectedDeviceIds.length === 0}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all shadow-glow",
                isExecuting || selectedDeviceIds.length === 0
                  ? "bg-muted text-foreground-muted cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 scale-105 active:scale-95"
              )}
            >
              {isExecuting ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isExecuting ? "Executing..." : `Run on ${selectedDeviceIds.length} Devices`}
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Target Selection */}
        <div className="lg:col-span-1 min-h-0 flex flex-col gap-4">
          <SectionCard title="Target Devices" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 p-4 pt-1">
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-foreground-muted" />
                  <input 
                    placeholder="Search host/IP..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-primary outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-foreground-muted" />
                  <select 
                    className="flex-1 text-xs bg-background border border-border rounded-md py-1 px-1 focus:ring-1 focus:ring-primary outline-none"
                    value={groupFilter}
                    onChange={e => setGroupFilter(e.target.value)}
                  >
                    <option value="all">All Allowed Groups ({filteredDevices.length})</option>
                    {filteredGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {loadError && (
                <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg">
                  <p className="text-[10px] font-bold text-danger flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5" /> FAILED TO LOAD DATA
                  </p>
                  <p className="text-[10px] text-danger/80 mt-1 leading-tight">{loadError}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="mt-2 w-full py-1 text-[10px] font-bold bg-danger/20 hover:bg-danger/30 text-danger rounded transition-colors"
                  >
                    RETRY
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-foreground-muted font-bold uppercase">Selection ({selectedDeviceIds.length}/{filteredDevices.length})</span>
                  <button 
                    onClick={() => setSelectedDeviceIds(selectedDeviceIds.length === filteredDevices.length ? [] : filteredDevices.map(d => d.id))}
                    className="text-[10px] text-primary hover:underline"
                  >
                    {selectedDeviceIds.length === filteredDevices.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                {filteredDevices.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-border rounded-lg">
                    <Server className="w-8 h-8 text-foreground-subtle mx-auto mb-2 opacity-20" />
                    <p className="text-xs text-foreground-muted">No matching devices.</p>
                  </div>
                ) : (
                  filteredDevices.map(device => (
                    <label 
                      key={device.id} 
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer group",
                        selectedDeviceIds.includes(device.id)
                          ? "bg-primary/5 border-primary/30 shadow-sm"
                          : "bg-surface border-border hover:border-primary/20"
                      )}
                    >
                      <input 
                        type="checkbox" 
                        className="accent-primary h-4 w-4"
                        checked={selectedDeviceIds.includes(device.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedDeviceIds(prev => [...prev, device.id]);
                          else setSelectedDeviceIds(prev => prev.filter(id => id !== device.id));
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-bold truncate group-hover:text-primary transition-colors leading-none">{device.hostname || device.id}</p>
                          <div className="flex gap-1">
                            {(typeof device.group_ids === 'string' ? device.group_ids.split(',') : (Array.isArray(device.group_ids) ? device.group_ids : [])).map(gid => {
                              const g = groups.find(gx => gx.id === gid);
                              if (!g || !ALLOWED_GROUPS.includes(g.name?.toUpperCase())) return null;
                              return (
                                <span key={gid} className={cn(
                                  "text-[8px] font-bold px-1 py-0.5 rounded uppercase",
                                  g.name?.toUpperCase().includes('SERVER') ? "bg-info/20 text-info" : "bg-danger/20 text-danger"
                                )}>
                                  {g.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <p className="text-[10px] font-mono text-foreground-muted">{device.ip}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="lg:col-span-3 min-h-0 flex flex-col gap-4">
          {/* SQL Editor */}
          <SectionCard className="h-[40%] flex flex-col overflow-hidden relative">
            <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm">Editor</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-surface-raised border border-border rounded hover:bg-surface-overlay transition-all"
                >
                  <LayoutDashboard className="w-3 h-3 text-info" /> Templates
                  <ChevronDown className={cn("w-3 h-3 transition-transform", showTemplates && "rotate-180")} />
                </button>
                <div className="h-4 w-px bg-border mx-1" />
                <button 
                  onClick={saveTemplate}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-success bg-success/5 border border-success/20 rounded hover:bg-success/10"
                >
                  <Save className="w-3 h-3" /> {activeTemplateId ? "Save Changes" : "Save"}
                </button>
                <button 
                  onClick={() => setShowSchedule(true)}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-info bg-info/5 border border-info/20 rounded hover:bg-info/10"
                >
                  <Clock className="w-3 h-3" /> Schedule
                </button>
              </div>
            </div>
            
            {showTemplates && (
              <div className="absolute top-12 right-6 z-20 w-64 bg-surface-overlay border border-border rounded-xl shadow-2xl p-2 animate-in fade-in slide-in-from-top-2">
                <p className="text-[10px] font-bold text-foreground-muted uppercase p-2 border-b border-border mb-1">Templates</p>
                <div className="max-h-48 overflow-y-auto">
                  {templates.map(t => (
                    <div key={t.id} className="group relative">
                      <button 
                        onClick={() => { setScript(t.script); setActiveTemplateId(t.id); setShowTemplates(false); }}
                        className={cn(
                          "w-full text-left p-2 hover:bg-primary/10 rounded-lg transition-colors group flex flex-col",
                          activeTemplateId === t.id && "bg-primary/10"
                        )}
                      >
                        <p className="text-xs font-bold truncate group-hover:text-primary">{t.name}</p>
                        <p className="text-[10px] text-foreground-muted truncate line-clamp-1">{t.description}</p>
                      </button>
                      <button 
                        onClick={(e) => deleteTemplate(t.id, e)}
                        className="absolute right-2 top-2 p-1 text-foreground-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-hidden rounded-lg border border-border shadow-inner bg-surface">
              <CodeMirror
                value={script}
                height="100%"
                theme={vscodeDark}
                extensions={[sql()]}
                onChange={(value) => setScript(value)}
                onUpdate={(v) => {
                  if (v.view !== editorView) {
                    setEditorView(v.view);
                  }
                }}
                className="text-sm font-mono h-full"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightSelectionMatches: true,
                  tabSize: 2,
                }}
              />
            </div>
          </SectionCard>

          {/* Results Pane */}
          <SectionCard className="flex-1 min-h-0 flex flex-col bg-background-subtle overflow-hidden">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-info" />
                <h3 className="font-bold text-sm">Execution Results</h3>
              </div>
              {results && (
                <button 
                  onClick={exportCsv}
                  className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-primary bg-primary/5 border border-primary/20 rounded hover:bg-primary/10 transition-all font-mono"
                >
                  <Download className="w-3 h-3" /> EXPORT TO CSV
                </button>
              )}
            </div>
            
            {!results && !isExecuting && (
              <div className="flex-1 flex flex-col items-center justify-center text-foreground-muted opacity-40">
                <Play className="w-12 h-12 mb-3" />
                <p className="text-sm font-medium">Ready for input.</p>
              </div>
            )}

            {results && (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                {Object.entries(results).map(([deviceId, res]: [string, any]) => (
                  <div key={deviceId} className="rounded-xl border border-border bg-surface overflow-hidden shadow-enterprise">
                    <div className={cn(
                      "px-4 py-2 flex items-center justify-between border-b border-border",
                      res.status === 'success' ? "bg-success/5" : "bg-danger/5"
                    )}>
                      <div className="flex items-center gap-3">
                        {res.status === 'success' ? <CheckCircle className="w-3 h-3 text-success" /> : <XCircle className="w-3 h-3 text-danger" />}
                        <p className="text-[10px] font-bold font-mono">{res.hostname || deviceId}</p>
                        <span className="text-[10px] text-foreground-muted">{res.duration_ms}ms</span>
                      </div>
                      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", res.status === 'success' ? "text-success" : "text-danger")}>
                        {res.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="p-1">
                      {res.status === 'success' && res.recordset && res.recordset.length > 0 ? (
                        <div className="space-y-4 p-2">
                          {/* Visual Chart if suggested */}
                          {res.chartSuggestions && (
                            <div className="h-40 w-full bg-surface-raised rounded-lg p-2 border border-border">
                              <p className="text-[9px] font-bold text-foreground-muted mb-2 flex items-center gap-1">
                                <BarChart className="w-2.5 h-2.5" /> AI SUGGESTED VISUALIZATION
                              </p>
                              <ChartContainer config={{ [res.chartSuggestions.yAxis]: { label: res.chartSuggestions.yAxis, color: "var(--primary)" } }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  {res.chartSuggestions.type === 'bar' ? (
                                    <RechartsBar data={res.recordset}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                      <XAxis dataKey={res.chartSuggestions.xAxis} hide />
                                      <Tooltip content={<ChartTooltipContent />} />
                                      <Bar dataKey={res.chartSuggestions.yAxis} fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
                                    </RechartsBar>
                                  ) : (
                                    <RechartsLine data={res.recordset}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                      <XAxis dataKey={res.chartSuggestions.xAxis} hide />
                                      <Tooltip content={<ChartTooltipContent />} />
                                      <Line type="monotone" dataKey={res.chartSuggestions.yAxis} stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                                    </RechartsLine>
                                  )}
                                </ResponsiveContainer>
                              </ChartContainer>
                            </div>
                          )}
                          
                          {/* Table view */}
                          <div className="overflow-x-auto max-h-48 custom-scrollbar border rounded">
                            <table className="w-full text-left font-mono border-collapse">
                              <thead className="bg-surface-raised sticky top-0 border-b border-border">
                                <tr>
                                  {Object.keys(res.recordset[0]).map(col => (
                                    <th key={col} className="px-2 py-1 text-[9px] font-bold text-foreground-muted uppercase tracking-tight">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/50">
                                {res.recordset.slice(0, 50).map((row: any, i: number) => (
                                  <tr key={i} className="hover:bg-primary/5 transition-colors">
                                    {Object.values(row).map((val: any, j) => (
                                      <td key={j} className="px-2 py-1 text-[10px] text-foreground truncate max-w-[150px]">{String(val)}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : res.status === 'error' ? (
                        <div className="p-3 bg-danger/5 m-1 rounded font-mono text-[10px] text-danger border border-danger/10">
                          {res.error}
                        </div>
                      ) : (
                        <div className="p-3 text-center text-[10px] italic text-foreground-muted">Query completed. No rows returned.</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Schedule Dialog (Simplified) */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm p-4 pt-10 overflow-y-auto pb-10 animate-in fade-in">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-enterprise overflow-hidden">
            <div className="p-6 border-b border-border bg-surface-raised">
              <h3 className="text-lg font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-info" /> Schedule SQL Job</h3>
              <p className="text-xs text-foreground-muted mt-1">This query will be executed automatically at the set time.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider mb-1 block">Job Name</label>
                <input 
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                  placeholder="e.g. Daily Inventory Clean"
                  value={scheduleName}
                  onChange={e => setScheduleName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider mb-1 block">Execution Time</label>
                <input 
                  type="datetime-local"
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                />
              </div>
              <div className="p-3 bg-info/5 rounded-xl border border-info/20">
                 <p className="text-[10px] font-bold text-info flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> RECURRENCE NOTE</p>
                 <p className="text-[10px] text-info/80 mt-1 leading-relaxed">Default behavior for this version is single execution. Recurrence patterns (daily/weekly) can be managed via API.</p>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 bg-surface-raised">
              <button onClick={() => setShowSchedule(false)} className="px-5 py-2 text-sm font-semibold hover:bg-surface-overlay rounded-lg transition-colors">Cancel</button>
              <button 
                onClick={handleSchedule}
                className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg shadow-glow hover:bg-primary/90 active:scale-95 transition-all"
              >
                Schedule Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
