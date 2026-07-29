import React, { useState, useEffect } from "react";
import { 
  Cpu, RefreshCw, AlertCircle, CheckCircle2, XCircle, 
  Trash2, Database, Search, Info, Plus, Battery, BatteryMedium, BatteryLow, Radio,
  Activity, Tag, Calendar, LayoutGrid, Clock, ShieldCheck, Edit, Zap, RotateCcw, Pencil, Camera
} from "lucide-react";
import { PageHeader, SectionCard, StatCard } from "@/components/ui-enterprise";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface EslGateway {
  id: number;
  org_cd: string;
  gateway_ip: string;
  hostname: string;
  api_key: string | null;
  status: string;
  last_seen: string | null;
}

interface EslLabel {
  label_id: string;
  org_cd: string;
  itm_cd: string;
  item_name: string;
  current_price: number;
  battery_level: number;
  signal_strength: number;
  status: string;
  last_sync_dt: string | null;
}

interface EslSyncLog {
  id: number;
  org_cd: string;
  label_id: string;
  itm_cd: string;
  prev_price: number | null;
  new_price: number;
  status: string;
  error_msg: string | null;
  synced_at: string;
}

export default function EslManagerPage() {
  const [activeTab, setActiveTab] = useState<'labels' | 'gateways' | 'logs'>('labels');
  const [loading, setLoading] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("All Stores");
  const [statusFilter, setStatusFilter] = useState("All");

  const [gateways, setGateways] = useState<EslGateway[]>([]);
  const [labels, setLabels] = useState<EslLabel[]>([]);
  const [logs, setLogs] = useState<EslSyncLog[]>([]);

  // Dialog state
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [newLabelId, setNewLabelId] = useState("");
  const [newOrgCd, setNewOrgCd] = useState("");
  const [newItmCd, setNewItmCd] = useState("");
  
  // Scanner state
  const [scannerTarget, setScannerTarget] = useState<'label' | 'item' | null>(null);

  // Edit label state
  const [editingLabel, setEditingLabel] = useState<EslLabel | null>(null);
  const [showEditLabelModal, setShowEditLabelModal] = useState(false);
  const [editOrgCd, setEditOrgCd] = useState("");
  const [editItmCd, setEditItmCd] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Gateway management states
  const [editingGateway, setEditingGateway] = useState<EslGateway | null>(null);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [gwOrgCd, setGwOrgCd] = useState("");
  const [gwHostname, setGwHostname] = useState("");
  const [gwIp, setGwIp] = useState("");
  const [gwApiKey, setGwApiKey] = useState("");
  const [gwStatus, setGwStatus] = useState("online");

  const [stores, setStores] = useState<{ org_cd: string; org_name: string }[]>([]);

  const fetchStores = async () => {
    try {
      const res = await fetch("/api/crm/reports/stores");
      if (res.ok) {
        const data = await res.json();
        setStores(data);
        if (data.length > 0) {
          setNewOrgCd(data[0].org_cd);
          setGwOrgCd(data[0].org_cd);
        }
      }
    } catch (e) {
      console.error("Error fetching active stores", e);
    }
  };

  const fetchGateways = async () => {
    try {
      const res = await fetch("/api/esl/gateways");
      if (res.ok) {
        const data = await res.json();
        setGateways(data);
      }
    } catch (e) {
      console.error("Error fetching ESL gateways", e);
    }
  };

  const fetchLabels = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (searchQuery) q.append("search", searchQuery);
      if (storeFilter && storeFilter !== "All Stores") q.append("org_cd", storeFilter);
      if (statusFilter && statusFilter !== "All") q.append("status", statusFilter);
      
      const res = await fetch(`/api/esl/labels?${q}`);
      if (res.ok) {
        const data = await res.json();
        setLabels(data);
      }
    } catch (e) {
      toast.error("Failed to load shelf labels");
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/esl/logs?limit=50");
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Error fetching ESL logs", e);
    }
  };

  const loadAllData = () => {
    fetchGateways();
    fetchLabels();
    fetchLogs();
  };

  useEffect(() => {
    loadAllData();
  }, [storeFilter, statusFilter]);

  useEffect(() => {
    fetchStores();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLabels();
  };

  const handleTriggerSync = async () => {
    setSyncRunning(true);
    const toastId = toast.loading("Checking for POS price changes & syncing ESL screens...");
    try {
      const res = await fetch("/api/esl/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_cd: storeFilter === "All Stores" ? null : storeFilter })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Sync finished: Checked ${data.checkedCount || 0} labels, updated ${data.updatedCount || 0} screens.`, { id: toastId });
        loadAllData();
      } else {
        toast.error(data.error || "Sync failed", { id: toastId });
      }
    } catch (e) {
      toast.error("Error connecting to server sync engine", { id: toastId });
    } finally {
      setSyncRunning(false);
    }
  };

  const handleAssociate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelId.trim() || !newItmCd.trim()) {
      toast.error("Label ID and Item SKU are required.");
      return;
    }

    try {
      const res = await fetch("/api/esl/labels/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label_id: newLabelId,
          org_cd: newOrgCd,
          itm_cd: newItmCd
        })
      });
      
      const data = await res.json();
      if (data.success) {
        toast.success(`${data.message}. Ready for next scan.`);
        // Do not close the modal, so user can continuously scan.
        setNewLabelId("");
        setNewItmCd("");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to associate label");
      }
    } catch (err) {
      toast.error("Connection failed");
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    if (!confirm(`Are you sure you want to delete and unlink ESL label ${labelId}?`)) return;

    try {
      const res = await fetch(`/api/esl/labels/delete/${labelId}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        loadAllData();
      } else {
        toast.error(data.error || "Failed to delete label");
      }
    } catch (err) {
      toast.error("Connection error");
    }
  };

  const openEditLabel = (lbl: EslLabel) => {
    setEditingLabel(lbl);
    setEditOrgCd(lbl.org_cd);
    setEditItmCd(lbl.itm_cd);
    setShowEditLabelModal(true);
  };

  const handleUpdateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLabel || !editOrgCd.trim() || !editItmCd.trim()) {
      toast.error("Store branch and Item SKU are required.");
      return;
    }

    try {
      const res = await fetch(`/api/esl/labels/${editingLabel.label_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_cd: editOrgCd, itm_cd: editItmCd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message);
        setShowEditLabelModal(false);
        setEditingLabel(null);
        loadAllData();
      } else {
        toast.error(data.error || "Failed to update label");
      }
    } catch (err) {
      toast.error("Network error");
    }
  };

  const handleRefreshPending = async () => {
    setRefreshing(true);
    const toastId = toast.loading("Refreshing pending & failed labels...");
    try {
      const res = await fetch("/api/esl/labels/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_cd: storeFilter === "All Stores" ? null : storeFilter })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message, { id: toastId });
        loadAllData();
      } else {
        toast.error(data.error || "Refresh failed", { id: toastId });
      }
    } catch (e) {
      toast.error("Error connecting to server", { id: toastId });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gwHostname.trim() || !gwIp.trim()) {
      toast.error("Hostname and IP are required.");
      return;
    }

    try {
      const url = editingGateway ? `/api/esl/gateways/${editingGateway.id}` : "/api/esl/gateways";
      const method = editingGateway ? "PUT" : "POST";
      const body = {
        org_cd: gwOrgCd,
        hostname: gwHostname,
        gateway_ip: gwIp,
        api_key: gwApiKey,
        status: gwStatus
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message);
        setShowGatewayModal(false);
        setEditingGateway(null);
        fetchGateways();
      } else {
        toast.error(data.error || "Failed to save gateway");
      }
    } catch (err) {
      toast.error("Network error");
    }
  };

  const handleBlinkLED = async (labelId: string) => {
    try {
      const res = await fetch(`/api/esl/labels/blink/${labelId}`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.error || "Failed to trigger LED blink");
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        // Parse CSV lines
        const lines = text.split(/\r?\n/);
        const mappings: { label_id: string; org_cd: string; itm_cd: string }[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Split by comma
          const cols = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
          if (cols.length < 3) continue;

          const [label_id, org_cd, itm_cd] = cols;
          // Skip header row if matches
          if (label_id.toLowerCase() === "label_id" || label_id.toLowerCase() === "label mac") continue;

          mappings.push({ label_id, org_cd, itm_cd });
        }

        if (mappings.length === 0) {
          toast.error("No valid mappings found in the CSV file.");
          return;
        }

        // Post mappings array to the backend
        const res = await fetch("/api/esl/labels/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mappings })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          toast.success(data.message);
          loadAllData();
        } else {
          toast.error(data.error || "Failed to import label mappings");
        }
      } catch (err) {
        toast.error("Error reading or parsing CSV file.");
      }
    };
    reader.readAsText(file);
    // Reset file input value so it can trigger again on same file
    e.target.value = "";
  };

  const handleDeleteGateway = async (id: number) => {
    if (!confirm("Are you sure you want to remove this ESL Gateway Access Point?")) return;

    try {
      const res = await fetch(`/api/esl/gateways/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message);
        fetchGateways();
      } else {
        toast.error(data.error || "Failed to delete gateway");
      }
    } catch (err) {
      toast.error("Network error");
    }
  };

  // Helper values for Stats Cards
  const totalLabels = labels.length;
  const onlineGateways = gateways.filter(gw => gw.status === "online").length;
  const lowBatteryCount = labels.filter(lbl => lbl.battery_level < 25).length;
  const syncFailedCount = labels.filter(lbl => lbl.status === "sync_failed").length;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  const renderBatteryIcon = (level: number) => {
    if (level >= 60) return <Battery className="w-4 h-4 text-success inline mr-1" />;
    if (level >= 25) return <BatteryMedium className="w-4 h-4 text-warning inline mr-1" />;
    return <BatteryLow className="w-4 h-4 text-danger animate-pulse inline mr-1" />;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title="Electronic Shelf Label (ESL) Center"
        subtitle="Automated pricing synchronizer and hardware status monitor"
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleTriggerSync}
              disabled={syncRunning}
              className="flex items-center gap-2 px-4 py-2 bg-success text-success-foreground rounded-xl text-xs font-bold shadow-glow hover:translate-y-[-1px] transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", syncRunning && "animate-spin")} />
              {syncRunning ? "Syncing..." : "Sync Prices"}
            </button>
            <input
              type="file"
              id="csv-file-input"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
            <button
              onClick={() => document.getElementById("csv-file-input")?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-surface hover:bg-surface-raised border border-border text-foreground rounded-xl text-xs font-bold transition-all hover:translate-y-[-1px]"
              title="Import label mappings from a CSV file"
            >
              <Database className="w-4 h-4" /> Import Mappings
            </button>
            <button
              onClick={handleRefreshPending}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-bold transition-all hover:translate-y-[-1px] disabled:opacity-50"
              title="Re-sync all pending and failed labels"
            >
              <RotateCcw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing..." : "Refresh Pending"}
            </button>
            <button
              onClick={() => setShowAssociateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-glow hover:translate-y-[-1px] transition-all"
            >
              <Plus className="w-4 h-4" /> Link New Label
            </button>
          </div>
        }
      />

      {/* Analytics dashboard widgets */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Active Labels"
          value={totalLabels}
          icon={<Tag className="w-4 h-4 text-primary" />}
          variant="primary"
        />
        <StatCard
          label="Gateways Online"
          value={`${onlineGateways} / ${gateways.length}`}
          icon={<Radio className="w-4 h-4 text-success" />}
          variant="success"
        />
        <StatCard
          label="Low Battery Alerts"
          value={lowBatteryCount}
          icon={<BatteryLow className="w-4 h-4 text-warning" />}
          variant="warning"
        />
        <StatCard
          label="Sync Failure Alerts"
          value={syncFailedCount}
          icon={<AlertCircle className="w-4 h-4 text-danger" />}
          variant="danger"
        />
      </div>

      {/* Tabs configuration and filter selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border gap-4 pb-2">
        <div className="flex border-b border-transparent">
          <button
            onClick={() => setActiveTab('labels')}
            className={cn(
              "px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-px flex items-center gap-1.5",
              activeTab === 'labels' ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            <Tag className="w-4 h-4" /> Shelf Labels ({labels.length})
          </button>
          <button
            onClick={() => setActiveTab('gateways')}
            className={cn(
              "px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-px flex items-center gap-1.5",
              activeTab === 'gateways' ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            <Cpu className="w-4 h-4" /> Access Point Gateways ({gateways.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={cn(
              "px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-px flex items-center gap-1.5",
              activeTab === 'logs' ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            <Clock className="w-4 h-4" /> Sync Logs History
          </button>
        </div>

        {/* Global filter select widgets */}
        {activeTab === 'labels' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-2.5 py-1.5 text-[11px]">
              <span className="text-foreground-muted font-medium">Store:</span>
              <select
                value={storeFilter}
                onChange={e => setStoreFilter(e.target.value)}
                className="bg-transparent border-none outline-none focus:ring-0 p-0 text-foreground font-semibold cursor-pointer max-w-[120px]"
              >
                <option value="All Stores" className="bg-surface">All Stores</option>
                {stores.map(st => (
                  <option key={st.org_cd} value={st.org_cd} className="bg-surface">
                    {st.org_cd} - {st.org_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-2.5 py-1.5 text-[11px]">
              <span className="text-foreground-muted font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-transparent border-none outline-none focus:ring-0 p-0 text-foreground font-semibold cursor-pointer"
              >
                <option value="All" className="bg-surface">All States</option>
                <option value="healthy" className="bg-surface">Healthy Only</option>
                <option value="pending" className="bg-surface">Pending Sync</option>
                <option value="low_battery" className="bg-surface">Low Battery</option>
                <option value="offline" className="bg-surface">Offline Displays</option>
                <option value="sync_failed" className="bg-surface">Sync Failed</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Main Tab content switch */}
      {activeTab === 'labels' && (
        <SectionCard>
          {/* Label Search controls */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 mb-4 max-w-md">
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 flex-1">
              <Search className="w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search Label MAC, SKU code, or item name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1 text-foreground"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-glow"
            >
              Search
            </button>
          </form>

          {/* Labels Table */}
          <div className="relative overflow-x-auto border border-border rounded-2xl bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-raised/50 border-b border-border">
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Store</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Label Hardware ID</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Product Details</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-right">Price displayed</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center">Battery</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center">Signal</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Last Synced</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={9} className="px-4 py-7 bg-white/5" />
                    </tr>
                  ))
                ) : labels.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-foreground-muted italic text-xs">
                      No matching shelf labels found.
                    </td>
                  </tr>
                ) : labels.map(lbl => (
                  <tr key={lbl.label_id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-xs font-bold font-mono text-foreground/80">{lbl.org_cd}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-primary font-mono">{lbl.label_id}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold text-foreground">{lbl.item_name || 'N/A'}</div>
                      <div className="text-[10px] text-foreground-muted mt-0.5 font-mono">SKU: {lbl.itm_cd}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-right text-success font-mono">
                      {formatCurrency(lbl.current_price)}
                    </td>
                    <td className="px-4 py-3 text-xs text-center font-mono font-medium">
                      {renderBatteryIcon(lbl.battery_level)}
                      {lbl.battery_level}%
                    </td>
                    <td className="px-4 py-3 text-xs text-center font-mono text-foreground-muted">
                      {lbl.signal_strength} dBm
                    </td>
                    <td className="px-4 py-3 text-xs text-center">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                        lbl.status === "healthy" && "bg-success/15 text-success border border-success/30",
                        lbl.status === "pending" && "bg-amber-500/15 text-amber-400 border border-amber-500/30",
                        lbl.status === "low_battery" && "bg-warning/15 text-warning border border-warning/30",
                        lbl.status === "offline" && "bg-danger/15 text-danger border border-danger/30",
                        lbl.status === "sync_failed" && "bg-danger/25 text-danger border border-danger/40"
                      )}>
                        {lbl.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-foreground-muted font-mono">
                      {lbl.last_sync_dt ? new Date(lbl.last_sync_dt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditLabel(lbl)}
                          className="p-1 text-foreground-muted hover:bg-primary/10 hover:text-primary rounded-lg transition-colors"
                          title="Edit label mapping"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleBlinkLED(lbl.label_id)}
                          className="p-1 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Blink Solum Tag LED"
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLabel(lbl.label_id)}
                          className="p-1 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                          title="Delete shelf label"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {activeTab === 'gateways' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-surface border border-border p-4 rounded-2xl">
            <div>
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-primary" />
                Access Point Gateways
              </h3>
              <p className="text-xs text-foreground-muted">Configure and monitor ESL transceivers assigned to store branches.</p>
            </div>
            <button
              onClick={() => {
                setEditingGateway(null);
                setGwOrgCd(stores[0]?.org_cd || "ST001");
                setGwHostname("");
                setGwIp("");
                setGwApiKey("");
                setGwStatus("online");
                setShowGatewayModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl text-xs font-bold shadow-glow hover:translate-y-[-1px] transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Register Gateway
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {gateways.map(gw => (
              <div 
                key={gw.id} 
                className="p-5 border border-border bg-surface-raised rounded-2xl flex flex-col justify-between hover:shadow-lg transition-all relative overflow-hidden group"
              >
                {/* Active pulse effect */}
                {gw.status === "online" && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-success/5 rounded-full blur-xl animate-pulse" />
                )}

                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Radio className={cn("w-4 h-4", gw.status === "online" ? "text-success" : "text-danger")} />
                      <span className="font-bold text-sm text-foreground">{gw.hostname}</span>
                    </div>
                    <p className="text-[10px] text-foreground-muted">Store code: <strong className="text-foreground">{gw.org_cd}</strong></p>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "flex items-center gap-1 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full",
                      gw.status === "online" ? "bg-success/15 text-success border border-success/30" : "bg-danger/15 text-danger border border-danger/30"
                    )}>
                      <Activity className="w-2.5 h-2.5 animate-pulse" />
                      {gw.status}
                    </span>

                    <button
                      onClick={() => {
                        setEditingGateway(gw);
                        setGwOrgCd(gw.org_cd);
                        setGwHostname(gw.hostname);
                        setGwIp(gw.gateway_ip);
                        setGwApiKey(gw.api_key || "");
                        setGwStatus(gw.status);
                        setShowGatewayModal(true);
                      }}
                      className="p-1.5 text-foreground-muted hover:text-primary hover:bg-white/5 rounded-lg transition-colors ml-1"
                      title="Edit Gateway"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGateway(gw.id)}
                      className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                      title="Delete Gateway"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border/50 grid grid-cols-2 gap-4 text-[11px] font-mono">
                  <div>
                    <span className="text-[9px] text-foreground-muted block uppercase tracking-wider">Gateway IP</span>
                    <span className="text-foreground font-semibold">{gw.gateway_ip}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-foreground-muted block uppercase tracking-wider">Last Ping</span>
                    <span className="text-foreground font-semibold">
                      {gw.last_seen ? new Date(gw.last_seen).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <SectionCard>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm text-foreground">Recent Price Synchronization Timeline</h3>
          </div>

          <div className="relative overflow-x-auto border border-border rounded-2xl bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-raised/50 border-b border-border">
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Time</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Store</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Label ID</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">SKU</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-right">Previous Price</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-right">Synced Price</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center">Sync Result</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Remarks / Failure Cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-foreground-muted italic text-xs">
                      No price updates have logged yet.
                    </td>
                  </tr>
                ) : logs.map(lg => (
                  <tr key={lg.id} className="hover:bg-white/5 transition-colors font-mono text-xs">
                    <td className="px-4 py-2 text-foreground-muted text-[10px]">
                      {new Date(lg.synced_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-bold text-foreground">{lg.org_cd}</td>
                    <td className="px-4 py-2 text-primary font-semibold">{lg.label_id}</td>
                    <td className="px-4 py-2 text-foreground-subtle">{lg.itm_cd}</td>
                    <td className="px-4 py-2 text-right text-foreground-muted">
                      {lg.prev_price ? formatCurrency(lg.prev_price) : '-'}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-success">
                      {formatCurrency(lg.new_price)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {lg.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-success inline" />
                      ) : (
                        <XCircle className="w-4 h-4 text-danger inline" />
                      )}
                    </td>
                    <td className="px-4 py-2 text-[10px] text-foreground-muted max-w-xs truncate">
                      {lg.error_msg || 'pricing broadcast transmitted successfully.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Link New Label Dialog Overlay */}
      {showAssociateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Link New ESL Price Tag
            </h3>
            
            <form onSubmit={handleAssociate} className="space-y-3.5 text-xs text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Label Mac / Hardware ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. MAC-0011223344EE"
                    value={newLabelId}
                    onChange={e => setNewLabelId(e.target.value)}
                    className="flex-1 bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setScannerTarget('label')}
                    className="p-2 bg-surface-raised border border-border hover:bg-white/10 rounded-xl transition-colors flex items-center justify-center text-foreground-muted hover:text-primary"
                    title="Scan Barcode"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Assign Store Branch</label>
                <select
                  value={newOrgCd}
                  onChange={e => setNewOrgCd(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold cursor-pointer"
                >
                  {stores.map(st => (
                    <option key={st.org_cd} value={st.org_cd}>
                      {st.org_cd} - {st.org_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Product SKU / PLU Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 10001"
                    value={newItmCd}
                    onChange={e => setNewItmCd(e.target.value)}
                    className="flex-1 bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setScannerTarget('item')}
                    className="p-2 bg-surface-raised border border-border hover:bg-white/10 rounded-xl transition-colors flex items-center justify-center text-foreground-muted hover:text-primary"
                    title="Scan Barcode"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAssociateModal(false)}
                  className="px-4 py-2 border border-border bg-surface hover:bg-surface-raised rounded-xl text-foreground font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-glow transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Save & Scan Next
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {scannerTarget && (
        <BarcodeScanner
          title={scannerTarget === 'label' ? "Scan Label MAC Address" : "Scan Item Barcode (SKU)"}
          onClose={() => setScannerTarget(null)}
          onScanSuccess={(decodedText) => {
            if (scannerTarget === 'label') {
              setNewLabelId(decodedText);
            } else {
              setNewItmCd(decodedText);
            }
            setScannerTarget(null);
            toast.success("Barcode scanned successfully!");
          }}
        />
      )}

      {/* Gateway Modal Overlay */}
      {showGatewayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
              <Radio className="w-5 h-5 text-primary" />
              {editingGateway ? "Edit AP Gateway" : "Register New AP Gateway"}
            </h3>
            
            <form onSubmit={handleSaveGateway} className="space-y-3.5 text-xs text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Gateway Hostname</label>
                <input
                  type="text"
                  placeholder="e.g. ESL-GW-ST003"
                  value={gwHostname}
                  onChange={e => setGwHostname(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">IP Address</label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.95.12"
                  value={gwIp}
                  onChange={e => setGwIp(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Solum AIMS API Token / Key</label>
                <input
                  type="text"
                  placeholder="e.g. Bearer aims-sas-token-..."
                  value={gwApiKey}
                  onChange={e => setGwApiKey(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Assign Store Branch</label>
                <select
                  value={gwOrgCd}
                  onChange={e => setGwOrgCd(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold cursor-pointer"
                >
                  {stores.map(st => (
                    <option key={st.org_cd} value={st.org_cd}>
                      {st.org_cd} - {st.org_name}
                    </option>
                  ))}
                </select>
              </div>

              {editingGateway && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-foreground-muted uppercase">Status</label>
                  <select
                    value={gwStatus}
                    onChange={e => setGwStatus(e.target.value)}
                    className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold cursor-pointer"
                  >
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowGatewayModal(false);
                    setEditingGateway(null);
                  }}
                  className="px-4 py-2 border border-border bg-surface hover:bg-surface-raised rounded-xl text-foreground font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-glow transition-colors"
                >
                  {editingGateway ? "Save Changes" : "Register"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Label Modal */}
      {showEditLabelModal && editingLabel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-up">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Edit Label Mapping
            </h3>
            <p className="text-[11px] text-foreground-muted mb-4">
              Editing label: <span className="font-mono font-bold text-primary">{editingLabel.label_id}</span>
            </p>
            <form onSubmit={handleUpdateLabel} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Store Branch</label>
                <select
                  value={editOrgCd}
                  onChange={e => setEditOrgCd(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold cursor-pointer"
                >
                  {stores.map(st => (
                    <option key={st.org_cd} value={st.org_cd}>
                      {st.org_cd} - {st.org_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-foreground-muted uppercase">Item SKU / PLU Code</label>
                <input
                  type="text"
                  placeholder="e.g. 000000000089712345"
                  value={editItmCd}
                  onChange={e => setEditItmCd(e.target.value)}
                  className="w-full bg-background border border-border px-3 py-2 rounded-xl text-foreground font-semibold outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditLabelModal(false);
                    setEditingLabel(null);
                  }}
                  className="px-4 py-2 border border-border bg-surface hover:bg-surface-raised rounded-xl text-foreground font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-glow transition-colors"
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
