import React, { useState, useEffect } from "react";
import { 
  Scale, Plus, RefreshCw, AlertCircle, Play, CheckCircle2, XCircle, 
  Settings, Trash2, Edit, FileText, Upload, Database, Eye, 
  Terminal, Search, ChevronRight, PlayCircle, Info, ChevronDown
} from "lucide-react";
import { toast } from "sonner";

interface ScaleDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  model: string;
  status: string;
  last_seen: string | null;
  location: string;
  department: string;
  device_id: string;
  gateway_hostname?: string;
  gateway_ip?: string;
  gateway_status?: string;
}

interface PluTemplate {
  id: string;
  name: string;
  description: string;
  file_format: string;
  delimiter: string;
  header_structure: string;
  row_template: string;
}

interface PluItem {
  id: string;
  template_id: string;
  plu_number: number;
  name: string;
  price: number;
  unit: string;
  shelf_life: number;
  tare: number;
  barcode_prefix: string;
  ingredients: string;
}

interface ScaleJob {
  id: string;
  scale_id: string;
  scale_name: string;
  scale_ip: string;
  job_type: string;
  status: string;
  progress: number;
  log: string;
  payload_path: string;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

interface GatewayDevice {
  id: string;
  hostname: string;
  ip: string;
  status: string;
  device_type?: string;
  group_ids?: string[];
}

interface DeviceGroup {
  id: string;
  name: string;
}

interface StoreLocation {
  org_cd: string;
  org_name: string;
}

export default function ScaleManagerPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "templates" | "history">("dashboard");
  const [scales, setScales] = useState<ScaleDevice[]>([]);
  const [templates, setTemplates] = useState<PluTemplate[]>([]);
  const [gateways, setGateways] = useState<GatewayDevice[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [jobs, setJobs] = useState<ScaleJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  
  // Bulk Selection
  const [selectedScales, setSelectedScales] = useState<string[]>([]);
  const [isBulkSyncModalOpen, setIsBulkSyncModalOpen] = useState(false);
  
  // Real-time Control State
  const [selectedScaleControl, setSelectedScaleControl] = useState<string>("");
  const [measuredWeight, setMeasuredWeight] = useState<string>("0.000");
  const [weightUnit, setWeightUnit] = useState<string>("kg");
  const [scaleCommandLog, setScaleCommandLog] = useState<string[]>([]);
  const [isExecutingCmd, setIsExecutingCmd] = useState(false);
  const [digiNetPackages, setDigiNetPackages] = useState<any[]>([]);
  const [selectedDigiNetPackage, setSelectedDigiNetPackage] = useState<string>("");

  // Modals / Editors
  const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
  const [editingScale, setEditingScale] = useState<ScaleDevice | null>(null);
  const [scaleForm, setScaleForm] = useState({
    name: "", ip: "", port: 3001, model: "bPlus", location: "", department: "Meat", device_id: ""
  });

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PluTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "", description: "", file_format: "CSV", delimiter: ";", header_structure: "", row_template: "{plu_number};{name};{price};{shelf_life};{tare}"
  });

  const [selectedTemplateForPlu, setSelectedTemplateForPlu] = useState<PluTemplate | null>(null);
  const [pluItems, setPluItems] = useState<PluItem[]>([]);
  const [isPluModalOpen, setIsPluModalOpen] = useState(false);
  const [editingPlu, setEditingPlu] = useState<PluItem | null>(null);
  const [pluForm, setPluForm] = useState({
    plu_number: 1, name: "", price: 0.0, unit: "kg", shelf_life: 3, tare: 0.000, barcode_prefix: "22", ingredients: ""
  });

  const [csvFileContent, setCsvFileContent] = useState<string>("");

  // Load Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [scalesRes, templatesRes, gatewaysRes, jobsRes, storesRes, groupsRes, digiNetRes] = await Promise.all([
        fetch("/api/scales").then(r => r.json()),
        fetch("/api/scales/templates").then(r => r.json()),
        fetch("/api/devices").then(r => r.json()),
        fetch("/api/scales/jobs/history").then(r => r.json()),
        fetch("/api/crm/reports/stores").then(r => r.json().catch(() => [])),
        fetch("/api/groups").then(r => r.json().catch(() => [])),
        fetch("/api/scales/diginet/packages").then(r => r.json())
      ]);

      if (Array.isArray(scalesRes)) setScales(scalesRes);
      if (Array.isArray(templatesRes)) setTemplates(templatesRes);
      if (Array.isArray(gatewaysRes)) setGateways(gatewaysRes);
      if (Array.isArray(jobsRes)) setJobs(jobsRes);
      if (Array.isArray(storesRes)) setStores(storesRes);
      if (Array.isArray(groupsRes)) setGroups(groupsRes);
      if (Array.isArray(digiNetRes)) {
        setDigiNetPackages(digiNetRes);
        if (!selectedDigiNetPackage && digiNetRes.length > 0) {
          setSelectedDigiNetPackage(digiNetRes[0].name);
        }
      }

      if (scalesRes.length > 0 && !selectedScaleControl) {
        setSelectedScaleControl(scalesRes[0].id);
      }
    } catch (err: any) {
      toast.error("Failed to load data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const serverGroupIds = new Set(
    groups
      .filter(group => group.name.toLowerCase().includes("server"))
      .map(group => group.id)
  );

  const serverGateways = gateways.filter((gateway) => {
    const gatewayGroupIds = Array.isArray(gateway.group_ids) ? gateway.group_ids : [];
    const matchesGroup = serverGroupIds.size > 0 && gatewayGroupIds.some(id => serverGroupIds.has(id));
    const matchesFallback =
      gateway.device_type?.toLowerCase() === "server" ||
      gateway.hostname.toLowerCase().includes("server") ||
      gateway.hostname.toLowerCase().includes("svr");

    return serverGroupIds.size > 0 ? matchesGroup : matchesFallback;
  });

  useEffect(() => {
    fetchData();
    // Poll jobs status every 8 seconds if there are active jobs
    const interval = setInterval(() => {
      fetch("/api/scales/jobs/history")
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setJobs(data);
        }).catch(() => {});
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // Handle Scale CRUD
  const handleSaveScale = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingScale ? `/api/scales/${editingScale.id}` : "/api/scales";
    const method = editingScale ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scaleForm)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success(editingScale ? "Scale updated successfully" : "Scale registered successfully");
      setIsScaleModalOpen(false);
      setEditingScale(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEditScale = (scale: ScaleDevice) => {
    setEditingScale(scale);
    setScaleForm({
      name: scale.name,
      ip: scale.ip,
      port: scale.port,
      model: scale.model,
      location: scale.location,
      department: scale.department,
      device_id: scale.device_id
    });
    setIsScaleModalOpen(true);
  };

  const handleDeleteScale = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scale configuration?")) return;
    try {
      const res = await fetch(`/api/scales/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("Scale deleted successfully");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Handle Template CRUD
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingTemplate ? `/api/scales/templates/${editingTemplate.id}` : "/api/scales/templates";
    const method = editingTemplate ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success("PLU Template saved successfully");
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEditTemplate = (tpl: PluTemplate) => {
    setEditingTemplate(tpl);
    setTemplateForm({
      name: tpl.name,
      description: tpl.description,
      file_format: tpl.file_format,
      delimiter: tpl.delimiter,
      header_structure: tpl.header_structure || "",
      row_template: tpl.row_template
    });
    setIsTemplateModalOpen(true);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Deleting this template will delete all its PLU items. Proceed?")) return;
    try {
      const res = await fetch(`/api/scales/templates/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("Template deleted");
      if (selectedTemplateForPlu?.id === id) setSelectedTemplateForPlu(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Load PLUs for Selected Template
  const loadPluItems = async (tplId: string) => {
    try {
      const res = await fetch(`/api/scales/templates/${tplId}/items`);
      const data = await res.json();
      if (Array.isArray(data)) setPluItems(data);
    } catch (err: any) {
      toast.error("Failed to load PLUs");
    }
  };

  const handleOpenPluManager = (tpl: PluTemplate) => {
    setSelectedTemplateForPlu(tpl);
    loadPluItems(tpl.id);
  };

  // PLU Item CRUD
  const handleSavePlu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateForPlu) return;

    try {
      const res = await fetch(`/api/scales/templates/${selectedTemplateForPlu.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pluForm)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success("PLU item saved");
      setIsPluModalOpen(false);
      setEditingPlu(null);
      loadPluItems(selectedTemplateForPlu.id);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeletePlu = async (id: string) => {
    if (!confirm("Delete this PLU item?")) return;
    try {
      const res = await fetch(`/api/scales/items/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("PLU deleted");
      if (selectedTemplateForPlu) loadPluItems(selectedTemplateForPlu.id);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Import CSV PLUs
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTemplateForPlu) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      // Primitive CSV parser: splits rows by line, columns by delimiter
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase());
      
      const parsedRows = lines.slice(1).map(line => {
        const values = line.split(/[;,]/).map(v => v.replace(/^"|"$/g, '').trim());
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        return row;
      }).filter(row => row.plu_number && row.name && row.price);

      try {
        const res = await fetch(`/api/scales/templates/${selectedTemplateForPlu.id}/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv_data: parsedRows })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast.success(data.message);
        loadPluItems(selectedTemplateForPlu.id);
      } catch (err: any) {
        toast.error("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  // MT-SICS Real-time Command Execution
  const executeSicsCommand = async (commandStr: string, label: string) => {
    if (!selectedScaleControl) return;
    setIsExecutingCmd(true);
    const newLog = `[${new Date().toLocaleTimeString()}] Dispatching command '${commandStr}' (${label})...`;
    setScaleCommandLog(prev => [newLog, ...prev]);

    try {
      const res = await fetch(`/api/scales/${selectedScaleControl}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: commandStr })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // If the response already has a message (direct Digi F25), show it immediately
      if (data.message) {
        setScaleCommandLog(prev => [`[${new Date().toLocaleTimeString()}] ${data.message}`, ...prev]);
        setIsExecutingCmd(false);

        // If Digi ACK response, update weight display
        if (data.message.includes('ACK OK') || data.message.includes('F25 handshake OK')) {
          setMeasuredWeight('---');
          setWeightUnit('(Digi)');
        }
        return;
      }
      // Start Polling pending command result (Mettler only)
      pollCommandResult(data.exec_id, label);
    } catch (err: any) {
      setScaleCommandLog(prev => [`[${new Date().toLocaleTimeString()}] Connection error: ${err.message}`, ...prev]);
      setIsExecutingCmd(false);
    }
  };

  const pollCommandResult = (execId: string, label: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout
    
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/agent/commands/results?exec_id=${execId}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.is_complete || data.logs?.length > 0) {
          const logEntry = data.logs[0];
          if (logEntry.status !== 'pending') {
            clearInterval(interval);
            setIsExecutingCmd(false);
            
            const time = new Date().toLocaleTimeString();
            const rawLog = logEntry.log || '';
            let logMsg = rawLog;

            // Parse scale weight response if command was stable weight 'S' or immediate 'SI'
            if (rawLog.startsWith("STATUS:SUCCESS")) {
              const cleaned = rawLog.split("|LOG:")[1] || '';
              logMsg = cleaned;
              
              // MT-SICS S response format: "S S      1.250 kg" or "S D      1.250 kg"
              if (cleaned.startsWith("S S") || cleaned.startsWith("S D")) {
                const parts = cleaned.split(/\s+/).filter(Boolean);
                if (parts.length >= 4) {
                  setMeasuredWeight(parts[2]);
                  setWeightUnit(parts[3]);
                }
              }
            }

            setScaleCommandLog(prev => [
              `[${time}] Scale Response [${logEntry.status.toUpperCase()}]: ${logMsg}`,
              ...prev
            ]);
          }
        }
      } catch (e) {
        // silently retry
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setIsExecutingCmd(false);
        setScaleCommandLog(prev => [`[${new Date().toLocaleTimeString()}] Error: Command timeout (No response from gateway agent).`, ...prev]);
      }
    }, 1000);
  };

  // Sync PLU to Scale Job dispatch
  const dispatchSyncJob = async (scaleId: string, templateId: string) => {
    try {
      toast.info("Preparing sync payload and dispatching to Agent...");
      const res = await fetch(`/api/scales/${scaleId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success("Sync job started. Monitor progress in Sync History.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const dispatchBulkSyncJob = async (templateId: string) => {
    if (selectedScales.length === 0) return;
    try {
      toast.info(`Dispatching bulk sync for ${selectedScales.length} scales...`);
      const res = await fetch(`/api/scales/bulk-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scale_ids: selectedScales, template_id: templateId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success(data.message || "Bulk sync jobs queued successfully.");
      setIsBulkSyncModalOpen(false);
      setSelectedScales([]);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDispatchDigiNetUpdate = async () => {
    if (!selectedScaleControl || !selectedDigiNetPackage) return;

    const pkg = digiNetPackages.find((item) => item.name === selectedDigiNetPackage);
    if (!pkg) {
      toast.error("Selected DigiNET package is no longer available.");
      return;
    }

    try {
      const res = await fetch(`/api/scales/${selectedScaleControl}/update-diginet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_name: pkg.name, package_path: pkg.path })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success(data.message || "DigiNET update dispatched to gateway.");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleSelectAll = () => {
    if (selectedScales.length === filteredScales.length) {
      setSelectedScales([]);
    } else {
      setSelectedScales(filteredScales.map(s => s.id));
    }
  };

  const toggleSelectScale = (id: string) => {
    setSelectedScales(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  // Filters
  const filteredScales = scales.filter(scale => {
    const matchesSearch = 
      scale.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scale.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scale.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scale.department.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const onlineScalesCount = scales.filter(s => s.status === 'online').length;
  const errorScalesCount = scales.filter(s => s.status === 'error').length;
  const activeJobsCount = jobs.filter(j => j.status === 'pending' || j.status === 'running').length;

  return (
    <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6 text-slate-100 min-h-screen">
      
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-2xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Scale Manager
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Manage Mettler Toledo & Digi scales — PLU templates, real-time diagnostics, bulk sync via agent gateways or direct F25 TCP.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchData} 
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white transition-all hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => {
              setEditingScale(null);
              setScaleForm({ name: "", ip: "", port: 3001, model: "Mettler Toledo (bPlus)", location: "", department: "Meat", device_id: serverGateways[0]?.id || "" });
              setIsScaleModalOpen(true);
            }} 
            className="px-4 py-2.5 bg-gradient-to-br from-primary to-primary/80 hover:from-primary/95 text-white rounded-xl font-bold text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Scale Device
          </button>
        </div>
      </div>

      {/* ── STATS CARDS ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Scales Registered", val: scales.length, sub: "Devices config", bg: "from-slate-900/60 to-slate-900/40", border: "border-slate-800/80", icon: Database, color: "text-slate-400" },
          { label: "Online & Connected", val: onlineScalesCount, sub: "Responding scales", bg: "from-emerald-950/20 to-slate-900/40", border: "border-emerald-500/20", icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Offline / Errored", val: errorScalesCount, sub: "Requires checking", bg: "from-rose-950/20 to-slate-900/40", border: "border-rose-500/20", icon: AlertCircle, color: "text-rose-400" },
          { label: "Active Sync Tasks", val: activeJobsCount, sub: "Pending deployments", bg: "from-blue-950/20 to-slate-900/40", border: "border-blue-500/20", icon: RefreshCw, color: "text-blue-400", spin: activeJobsCount > 0 }
        ].map((c, i) => (
          <div key={i} className={`p-5 rounded-2xl border ${c.border} bg-gradient-to-br ${c.bg} flex items-center justify-between shadow-lg relative overflow-hidden group hover:scale-[1.01] transition-transform`}>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-2">{c.label}</p>
              <h3 className="text-3xl font-black leading-none">{c.val}</h3>
              <p className="text-[10px] text-slate-500 font-medium mt-2">{c.sub}</p>
            </div>
            <div className={`p-3 rounded-xl bg-slate-950/40 ${c.color}`}>
              <c.icon className={`w-5 h-5 ${c.spin ? 'animate-spin' : ''}`} />
            </div>
          </div>
        ))}
      </div>

      {/* ── TAB BAR ───────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-800/80 space-x-1.5 p-1 bg-slate-950/40 rounded-xl w-fit self-start">
        {[
          { key: "dashboard", label: "Dashboard & Control", icon: Scale },
          { key: "templates", label: "PLU Templates", icon: FileText },
          { key: "history", label: "Sync Job History", icon: Settings }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === tab.key 
                ? "bg-slate-800 text-white shadow-md border border-slate-700/50" 
                : "text-slate-400 hover:text-white hover:bg-slate-900/40"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ───────────────────────────────────────────────────── */}
      
      {/* 1. DASHBOARD & DIAGNOSTICS TAB */}
      {activeTab === "dashboard" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Scales List (Left - 2/3) */}
          <div className="lg:col-span-2 flex flex-col gap-4 bg-slate-900/30 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" /> Active Scale Devices
                </h2>
                {selectedScales.length > 0 && (
                  <button
                    onClick={() => setIsBulkSyncModalOpen(true)}
                    className="px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5" /> Bulk Sync ({selectedScales.length})
                  </button>
                )}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search scales by IP, location, brand..." 
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs placeholder:text-slate-600 focus:outline-none focus:border-primary/50 text-white transition-colors"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 font-bold text-slate-400">
                    <th className="p-3 w-10">
                      <input 
                        type="checkbox" 
                        checked={filteredScales.length > 0 && selectedScales.length === filteredScales.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-700 bg-slate-900"
                      />
                    </th>
                    <th className="p-3">Scale Name</th>
                    <th className="p-3">IP Address</th>
                    <th className="p-3">Store/Dept</th>
                    <th className="p-3">Gateway PC</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                        No scale devices registered or matching search filters.
                      </td>
                    </tr>
                  ) : (
                    filteredScales.map((scale) => (
                      <tr key={scale.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                        <td className="p-3">
                          <input 
                            type="checkbox" 
                            checked={selectedScales.includes(scale.id)}
                            onChange={() => toggleSelectScale(scale.id)}
                            className="rounded border-slate-700 bg-slate-900"
                          />
                        </td>
                        <td className="p-3 font-semibold text-white">
                          <div>{scale.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{scale.model}</div>
                        </td>
                        <td className="p-3 font-mono text-slate-300">
                          {scale.ip}:{scale.port}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400">
                            {scale.location || 'HQ'} - {scale.department || 'General'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-300">{scale.gateway_hostname || scale.device_id}</div>
                          <div className="text-[10px] text-slate-500">{scale.gateway_ip || 'Offline'}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              scale.status === 'online' ? 'bg-emerald-500 animate-pulse' :
                              scale.status === 'error' ? 'bg-rose-500' : 'bg-slate-500'
                            }`} />
                            <span className="font-bold text-[10px] uppercase tracking-wide">
                              {scale.status}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right flex items-center justify-end gap-1.5">
                          {templates.length > 0 && (
                            <div className="relative group inline-block">
                              <button 
                                className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/10 text-blue-400 font-bold text-[10px] uppercase flex items-center gap-1"
                              >
                                Sync PLU <ChevronDown className="w-3 h-3" />
                              </button>
                              <div className="absolute right-0 top-full mt-1 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 hidden group-hover:block z-50 animate-in fade-in duration-200">
                                <p className="px-2.5 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">Select PLU Template</p>
                                {templates.map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => dispatchSyncJob(scale.id, t.id)}
                                    className="w-full text-left px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                  >
                                    {t.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <button
                            onClick={() => handleEditScale(scale)}
                            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                            title="Edit scale configuration"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteScale(scale.id)}
                            className="p-1.5 rounded-lg border border-slate-800 text-rose-500 hover:bg-rose-500/10"
                            title="Delete scale device"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* MT-SICS Control Box (Right - 1/3) */}
          <div className="flex flex-col gap-4 bg-slate-900/30 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" /> Real-time Diagnostics
            </h2>

            {/* Select Scale */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Diagnostic Scale</label>
              <select
                value={selectedScaleControl}
                onChange={(e) => setSelectedScaleControl(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-primary/50 text-white"
              >
                {scales.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.ip})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 rounded-xl border border-slate-800/70 bg-slate-950/50 p-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DigiNET Update / Scale Setup</label>
              <select
                value={selectedDigiNetPackage}
                onChange={(e) => setSelectedDigiNetPackage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-primary/50 text-white"
              >
                {digiNetPackages.length === 0 ? (
                  <option value="">No packages found in DigiNET folder</option>
                ) : (
                  digiNetPackages.map((pkg) => (
                    <option key={pkg.name} value={pkg.name}>{pkg.name} ({pkg.type})</option>
                  ))
                )}
              </select>
              <button
                onClick={handleDispatchDigiNetUpdate}
                className="px-3 py-2 rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-bold hover:bg-blue-600/40 transition-all"
              >
                Dispatch DigiNET Update
              </button>
              <button
                onClick={() => {
                  const scale = scales.find((item) => item.id === selectedScaleControl);
                  if (scale) handleEditScale(scale);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold hover:bg-slate-700 transition-all"
              >
                Configure Selected Scale
              </button>
              <p className="text-[10px] text-slate-500">Packages are read from the DigiNET folder on the server and queued to the selected gateway device.</p>
            </div>

            {/* Premium LED Weight Display */}
            <div className="bg-black/90 rounded-2xl border border-slate-800 p-5 shadow-inner flex flex-col items-center justify-center relative overflow-hidden group">
              <div className="absolute top-2 left-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-bold tracking-widest font-mono text-emerald-500/80 uppercase">Scale Stream</span>
              </div>
              <div className="text-4xl font-mono font-black text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.3)] mt-3">
                {measuredWeight} <span className="text-xl text-emerald-500/60 font-semibold">{weightUnit}</span>
              </div>
              <p className="text-[8px] font-bold text-slate-500 font-mono tracking-widest uppercase mt-2">
                {scales.find(s => s.id === selectedScaleControl)?.model?.toLowerCase().includes('digi') ? 'Digi F25 Connection Status' : 'MT-SICS Stable Weigh Indicator'}
              </p>
              
              <div className="w-full bg-slate-900 h-1.5 rounded-full mt-4 overflow-hidden border border-slate-800">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (parseFloat(measuredWeight) || 0) * 10)}%` }}
                />
              </div>
            </div>

            {/* Diagnostic buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={isExecutingCmd || !selectedScaleControl}
                onClick={() => executeSicsCommand("Z", "Zero Scale")}
                className="py-2.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                Zero Scale
              </button>
              <button
                disabled={isExecutingCmd || !selectedScaleControl}
                onClick={() => executeSicsCommand("T", "Tare Scale")}
                className="py-2.5 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-600 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                Tare Scale
              </button>
              <button
                disabled={isExecutingCmd || !selectedScaleControl}
                onClick={() => executeSicsCommand("S", "Read Weight")}
                className="col-span-2 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-500/10 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isExecutingCmd ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <PlayCircle className="w-4 h-4 text-white" />
                )}
                Request Live Weight
              </button>
            </div>

            {/* Diagnostic Log */}
            <div className="flex flex-col gap-1.5 flex-1 min-h-[160px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diagnostics Output</label>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex-1 overflow-y-auto font-mono text-[10px] text-emerald-500/80 flex flex-col gap-1 shadow-inner h-44">
                {scaleCommandLog.length === 0 ? (
                  <p className="text-slate-600 italic">No diagnostics dispatched yet. Trigger actions to test connections.</p>
                ) : (
                  scaleCommandLog.map((log, index) => (
                    <div key={index} className="border-b border-slate-900 pb-1 break-all">{log}</div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. PLU TEMPLATES TAB */}
      {activeTab === "templates" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Templates CRUD panel (Left - 1/3) */}
          <div className="flex flex-col gap-4 bg-slate-900/30 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-2xl">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> PLU Templates
              </h2>
              <div className="flex items-center gap-1.5">
                <label
                  className="p-1.5 bg-slate-950 border border-slate-800 rounded-lg hover:border-emerald-500/60 text-slate-300 hover:text-emerald-400 cursor-pointer transition-all"
                  title="Upload PLU Template File"
                >
                  <Upload className="w-4 h-4" />
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const formData = new FormData();
                      formData.append('file', file);
                      try {
                        const res = await fetch('/api/templates/upload', {
                          method: 'POST',
                          body: formData,
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Upload failed');
                        toast.success(`Template "${file.name}" berhasil diupload ke ${data.path}`);
                      } catch (err: any) {
                        toast.error('Upload gagal: ' + err.message);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button 
                  onClick={() => {
                    setEditingTemplate(null);
                    setTemplateForm({ name: "", description: "", file_format: "CSV", delimiter: ";", header_structure: "", row_template: "{plu_number};{name};{price};{shelf_life};{tare}" });
                    setIsTemplateModalOpen(true);
                  }}
                  className="p-1.5 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-600 text-slate-300 hover:text-white transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {templates.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-4 text-center">No PLU templates defined. Add one to manage products.</p>
              ) : (
                templates.map(tpl => (
                  <div 
                    key={tpl.id} 
                    onClick={() => handleOpenPluManager(tpl)}
                    className={`p-4 rounded-xl border cursor-pointer hover:border-primary/50 transition-all flex flex-col gap-2 ${
                      selectedTemplateForPlu?.id === tpl.id 
                        ? "bg-slate-800/40 border-primary/60 shadow-lg shadow-primary/5" 
                        : "bg-slate-950/30 border-slate-800"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-bold text-white">{tpl.name}</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">{tpl.description || 'No description'}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 text-[9px] font-bold text-slate-400 border border-slate-800">
                        {tpl.file_format}
                      </span>
                    </div>

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800/40">
                      <span className="text-[9px] font-semibold text-slate-500 font-mono">Row layout: {tpl.row_template.substring(0, 30)}...</span>
                      <div className="flex gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleEditTemplate(tpl); }}
                          className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }}
                          className="p-1 rounded bg-slate-900 border border-slate-800 text-rose-500 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* PLU Items Manager (Right - 2/3) */}
          <div className="lg:col-span-2 flex flex-col gap-4 bg-slate-900/30 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-2xl">
            {selectedTemplateForPlu ? (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" /> PLUs for '{selectedTemplateForPlu.name}'
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Template format: {selectedTemplateForPlu.file_format} (delimiter: '{selectedTemplateForPlu.delimiter}')</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold uppercase cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" /> CSV Import
                      <input 
                        type="file" 
                        accept=".csv,.txt" 
                        onChange={handleCsvImport} 
                        className="hidden" 
                      />
                    </label>
                    <button
                      onClick={() => {
                        setEditingPlu(null);
                        setPluForm({ plu_number: pluItems.length + 1, name: "", price: 0, unit: "kg", shelf_life: 3, tare: 0, barcode_prefix: "22", ingredients: "" });
                        setIsPluModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-primary hover:bg-primary/95 text-white rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add PLU
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800/60 max-h-[500px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950/60 border-b border-slate-800 font-bold text-slate-400">
                        <th className="p-2.5">PLU #</th>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Price</th>
                        <th className="p-2.5">Tare</th>
                        <th className="p-2.5">Shelf Life</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pluItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                            No PLU items found under this template. Click Add PLU or Import CSV.
                          </td>
                        </tr>
                      ) : (
                        pluItems.map((plu) => (
                          <tr key={plu.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                            <td className="p-2.5 font-bold font-mono text-slate-300">{plu.plu_number}</td>
                            <td className="p-2.5">
                              <div className="font-semibold text-white">{plu.name}</div>
                              {plu.ingredients && (
                                <div className="text-[9px] text-slate-500 mt-0.5 truncate max-w-[200px]">{plu.ingredients}</div>
                              )}
                            </td>
                            <td className="p-2.5 font-bold text-slate-300">
                              Rp {plu.price.toLocaleString()}/{plu.unit}
                            </td>
                            <td className="p-2.5 font-mono text-slate-400">{plu.tare.toFixed(3)} kg</td>
                            <td className="p-2.5 text-slate-400">{plu.shelf_life} days</td>
                            <td className="p-2.5 text-right flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setEditingPlu(plu);
                                  setPluForm({
                                    plu_number: plu.plu_number,
                                    name: plu.name,
                                    price: plu.price,
                                    unit: plu.unit,
                                    shelf_life: plu.shelf_life,
                                    tare: plu.tare,
                                    barcode_prefix: plu.barcode_prefix,
                                    ingredients: plu.ingredients || ""
                                  });
                                  setIsPluModalOpen(true);
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeletePlu(plu.id)}
                                className="p-1 rounded hover:bg-rose-500/10 text-rose-500"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Database className="w-12 h-12 text-slate-700 mb-3" />
                <p className="font-bold text-xs">No Template Selected</p>
                <p className="text-[10px] text-slate-600 mt-1">Select a PLU template from the left pane to manage scale product lists.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. SYNC JOBS HISTORY TAB */}
      {activeTab === "history" && (
        <div className="bg-slate-900/30 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-2xl flex flex-col gap-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> Scale Job Sync Logs
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-800/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 font-bold text-slate-400">
                  <th className="p-3">Job ID</th>
                  <th className="p-3">Target Scale</th>
                  <th className="p-3">Job Type</th>
                  <th className="p-3">Progress</th>
                  <th className="p-3">Logs & Info</th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                      No synchronization jobs dispatched.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-300">{job.id}</td>
                      <td className="p-3 font-semibold text-white">
                        <div>{job.scale_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{job.scale_ip}</div>
                      </td>
                      <td className="p-3 font-semibold uppercase text-slate-400 text-[10px] tracking-wider">
                        {job.job_type.replace('_', ' ')}
                      </td>
                      <td className="p-3 w-48">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-slate-300 leading-none">{job.progress}%</span>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                job.status === 'success' ? 'bg-emerald-500' :
                                job.status === 'failed' ? 'bg-rose-500' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3 max-w-xs break-words text-slate-400">
                        {job.log}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-500">
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                          job.status === 'success' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35' :
                          job.status === 'failed' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/35' :
                          'bg-blue-500/15 text-blue-400 border border-blue-500/35 animate-pulse'
                        }`}>
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* ── MODAL: CREATE / EDIT SCALE ────────────────────────────────────── */}
      {isScaleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleSaveScale} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3">
              {editingScale ? 'Edit Scale Configuration' : 'Register Scale Device'}
            </h3>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Scale Name</label>
                <input 
                  type="text" 
                  value={scaleForm.name} 
                  onChange={(e) => setScaleForm({...scaleForm, name: e.target.value})} 
                  placeholder="Meat Weighing bPlus 01"
                  required
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Scale Brand & Model</label>
                  <select 
                    value={scaleForm.model} 
                    onChange={(e) => {
                      const newModel = e.target.value;
                      setScaleForm({
                        ...scaleForm, 
                        model: newModel,
                        port: newModel.includes('Digi') ? 4001 : 3001
                      });
                    }} 
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="Mettler Toledo (bPlus)">Mettler Toledo (bPlus)</option>
                    <option value="Mettler Toledo (UC)">Mettler Toledo (UC Line)</option>
                    <option value="Mettler Toledo (Tiger)">Mettler Toledo (Tiger)</option>
                    <option value="Digi (SM-series)">Digi (SM-series)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
                  <input 
                    type="text" 
                    value={scaleForm.department} 
                    onChange={(e) => setScaleForm({...scaleForm, department: e.target.value})} 
                    placeholder="Meat, Fresh, etc"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Store Map / Location</label>
                  <div className="relative flex items-center">
                    <select 
                      value={scaleForm.location}
                      onChange={(e) => setScaleForm({...scaleForm, location: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none appearance-none"
                    >
                      <option value="">-- Select Store Location --</option>
                      {stores.map(store => (
                        <option key={store.org_cd} value={store.org_name}>{store.org_name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                  {scaleForm.location === "" && (
                    <input 
                      type="text"
                      placeholder="Or enter custom location manually..."
                      onChange={(e) => setScaleForm({...scaleForm, location: e.target.value})}
                      className="mt-2 px-3 py-2 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">IP Address</label>
                  <input 
                    type="text" 
                    value={scaleForm.ip} 
                    onChange={(e) => setScaleForm({...scaleForm, ip: e.target.value})} 
                    placeholder="192.168.10.120"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary/50 font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Port</label>
                  <input 
                    type="number" 
                    value={scaleForm.port} 
                    onChange={(e) => setScaleForm({...scaleForm, port: parseInt(e.target.value)})} 
                    placeholder="3001"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary/50 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Gateway Device (Local Agent)</label>
                <select
                  value={scaleForm.device_id}
                  onChange={(e) => setScaleForm({...scaleForm, device_id: e.target.value})}
                  required
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="">-- Select Gateway PC --</option>
                  {serverGateways.map(g => (
                    <option key={g.id} value={g.id}>{g.hostname} ({g.ip}) - {g.status}</option>
                  ))}
                </select>
                {serverGateways.length === 0 && (
                  <p className="text-[10px] text-amber-400">No server-group gateway devices found.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4 mt-2">
              <button 
                type="button" 
                onClick={() => setIsScaleModalOpen(false)}
                className="px-4 py-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-black"
              >
                Save Device
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: CREATE / EDIT TEMPLATE ─────────────────────────────────── */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleSaveTemplate} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3">
              {editingTemplate ? 'Edit PLU Template' : 'Add PLU Template'}
            </h3>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Template Name</label>
                <input 
                  type="text" 
                  value={templateForm.name} 
                  onChange={(e) => setTemplateForm({...templateForm, name: e.target.value})} 
                  placeholder="Mettler bPlus Meat CSV Format"
                  required
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                <input 
                  type="text" 
                  value={templateForm.description} 
                  onChange={(e) => setTemplateForm({...templateForm, description: e.target.value})} 
                  placeholder="Export format for bPlus retail scales"
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">File Format</label>
                  <select
                    value={templateForm.file_format}
                    onChange={(e) => setTemplateForm({...templateForm, file_format: e.target.value})}
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                  >
                    <option value="CSV">CSV</option>
                    <option value="TXT">TXT Plain</option>
                    <option value="XML">XML Document</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Column Delimiter</label>
                  <input 
                    type="text" 
                    value={templateForm.delimiter} 
                    onChange={(e) => setTemplateForm({...templateForm, delimiter: e.target.value})} 
                    placeholder=";"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Header Row (Optional)</label>
                <input 
                  type="text" 
                  value={templateForm.header_structure} 
                  onChange={(e) => setTemplateForm({...templateForm, header_structure: e.target.value})} 
                  placeholder="plu_number;name;price;shelf_life;tare;barcode_prefix;ingredients"
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Line Structure Row Template</label>
                  <span className="text-[8px] text-slate-500 font-bold font-mono">Placeholders: {"{plu_number}"}, {"{name}"}, {"{price}"}, {"{shelf_life}"}, {"{tare}"}, {"{ingredients}"}</span>
                </div>
                <textarea 
                  value={templateForm.row_template} 
                  onChange={(e) => setTemplateForm({...templateForm, row_template: e.target.value})} 
                  placeholder="{plu_number};{name};{price};{shelf_life};{tare}"
                  required
                  rows={2}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4 mt-2">
              <button 
                type="button" 
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-black"
              >
                Save Template
              </button>
            </div>
          </form>
        </div>
      )}


      {/* ── MODAL: CREATE / EDIT PLU ITEM ────────────────────────────────── */}
      {isPluModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleSavePlu} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3">
              {editingPlu ? 'Edit PLU Item' : 'Add PLU Item'}
            </h3>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">PLU #</label>
                  <input 
                    type="number" 
                    value={pluForm.plu_number} 
                    onChange={(e) => setPluForm({...pluForm, plu_number: parseInt(e.target.value)})} 
                    placeholder="12"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none font-bold font-mono"
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Item Name</label>
                  <input 
                    type="text" 
                    value={pluForm.name} 
                    onChange={(e) => setPluForm({...pluForm, name: e.target.value})} 
                    placeholder="Daging Giling Istimewa"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Price (Rp)</label>
                  <input 
                    type="number" 
                    value={pluForm.price} 
                    onChange={(e) => setPluForm({...pluForm, price: parseFloat(e.target.value)})} 
                    placeholder="120000"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Unit Type</label>
                  <input 
                    type="text" 
                    value={pluForm.unit} 
                    onChange={(e) => setPluForm({...pluForm, unit: e.target.value})} 
                    placeholder="kg"
                    required
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Tare (kg)</label>
                  <input 
                    type="number" 
                    step="0.001"
                    value={pluForm.tare} 
                    onChange={(e) => setPluForm({...pluForm, tare: parseFloat(e.target.value)})} 
                    placeholder="0.005"
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Shelf Life (Days)</label>
                  <input 
                    type="number" 
                    value={pluForm.shelf_life} 
                    onChange={(e) => setPluForm({...pluForm, shelf_life: parseInt(e.target.value)})} 
                    placeholder="3"
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Barcode Prefix</label>
                  <input 
                    type="text" 
                    value={pluForm.barcode_prefix} 
                    onChange={(e) => setPluForm({...pluForm, barcode_prefix: e.target.value})} 
                    placeholder="22"
                    className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Ingredients / Composition</label>
                <textarea 
                  value={pluForm.ingredients} 
                  onChange={(e) => setPluForm({...pluForm, ingredients: e.target.value})} 
                  placeholder="Daging sapi murni segar pilihan tanpa bahan pengawet."
                  rows={3}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4 mt-2">
              <button 
                type="button" 
                onClick={() => setIsPluModalOpen(false)}
                className="px-4 py-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-black"
              >
                Save PLU
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: BULK SYNC ─────────────────────────────────────────────── */}
      {isBulkSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 animate-in zoom-in-95 duration-200 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Upload className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Bulk Sync PLU</h3>
                <p className="text-xs text-slate-400">Deploy PLU template to {selectedScales.length} selected devices</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 py-2">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-1 max-h-32 overflow-y-auto">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Target Devices</span>
                {scales.filter(s => selectedScales.includes(s.id)).map(s => (
                  <div key={s.id} className="text-xs text-slate-300 flex justify-between items-center">
                    <span>{s.name} <span className="text-slate-500">({s.location})</span></span>
                    <span className="font-mono text-[10px] text-slate-500">{s.ip}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select PLU Template</label>
                <div className="flex flex-col gap-2">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => dispatchBulkSyncJob(t.id)}
                      className="w-full text-left px-4 py-3 bg-slate-800/40 hover:bg-blue-600/20 border border-slate-800 hover:border-blue-500/50 rounded-xl transition-all group"
                    >
                      <div className="font-bold text-sm text-slate-200 group-hover:text-blue-400">{t.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{t.file_format} Format</div>
                    </button>
                  ))}
                  {templates.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4 italic">No PLU templates available.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4 mt-2">
              <button 
                type="button" 
                onClick={() => setIsBulkSyncModalOpen(false)}
                className="px-4 py-2 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold w-full"
              >
                Cancel Bulk Sync
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
