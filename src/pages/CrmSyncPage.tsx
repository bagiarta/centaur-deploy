import React, { useState, useEffect, useCallback, useMemo } from "react";
import { 
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Package, Database, 
  Calendar, TrendingUp, AlertCircle, Search, Info, ShieldCheck, ShieldAlert 
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell 
} from 'recharts';

type SyncLog = {
  log_id: number;
  log_date: string;
  issue_date: string;
  item_code: string | null;
  item_name: string | null;
  item_stk_uom: string | null;
  item_vendor_cd: string | null;
  status: "SUCCESS" | "FAILED";
  message: string;
};

type SyncStatus = {
  totals: { total_items: number; synced: number; pending: number };
  process_exec_date: string | null;
  daily: { sync_date: string; synced_count: number; pending_count: number; total: number }[];
  recent_errors: { ITEM_CODE: string; ITEM_NAME: string; RESPONSE_MSG: string; LAST_TIMESTAMP: string }[];
};

// Helper: SQL Server GETDATE() returns local time, but mssql driver tags it with 'Z' (UTC).
// Strip 'Z' so the browser treats it as local time, avoiding a double timezone offset.
const toLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  return new Date(dateStr.replace(/Z$/i, ''));
};

export default function CrmSyncPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [lastResult, setLastResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [days, setDays] = useState(2);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/crm/sync-logs");
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      console.error("Failed to load sync logs", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/crm/sync-status");
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      console.error("Failed to load sync status", err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const testConnection = async () => {
    setTestingConn(true);
    setConnResult(null);
    try {
      const res = await fetch("/api/crm/test-connection");
      const data = await res.json();
      setConnResult({ success: data.success, message: "Connection check successful" });
    } catch (err: any) {
      setConnResult({ success: false, message: "Service unreachable" });
    } finally {
      setTestingConn(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStatus();
  }, [fetchLogs, fetchStatus]);

  const handleTriggerSync = async () => {
    setTriggering(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/crm/sync-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Execution failed");
      setLastResult({ type: "success", message: data.message });
      await Promise.all([fetchLogs(), fetchStatus()]);
    } catch (err: any) {
      setLastResult({ type: "error", message: err.message });
    } finally {
      setTriggering(false);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const s = searchTerm.toLowerCase();
    return logs.filter(l => 
      l.item_code?.toLowerCase().includes(s) || 
      l.item_name?.toLowerCase().includes(s) || 
      l.message?.toLowerCase().includes(s)
    );
  }, [logs, searchTerm]);

  const t = status?.totals;
  const syncRate = t && t.total_items > 0 ? ((t.synced / t.total_items) * 100).toFixed(1) : "0";

  const chartData = useMemo(() => {
    if (!status?.daily) return [];
    return [...status.daily].reverse().map(d => ({
      name: d.sync_date.split('-').slice(1).join('/'),
      Synced: d.synced_count,
      Failed: d.pending_count,
      Pending: 0 // No longer used separately
    }));
  }, [status?.daily]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <RefreshCw className="w-6 h-6 text-primary" />
            </div>
            CRM Item Sync Dashboard
          </h1>
          <p className="text-sm text-foreground-muted mt-1 ml-11">
            Monitoring & Manual Retry for Loyalty CRM Item Synchronization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={testConnection}
            disabled={testingConn}
            className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg border transition-all ${
              connResult?.success 
                ? "bg-success/10 border-success/30 text-success" 
                : connResult?.success === false 
                  ? "bg-danger/10 border-danger/30 text-danger" 
                  : "bg-surface border-border text-foreground-muted hover:text-foreground"
            }`}
          >
            {testingConn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : (connResult?.success ? <ShieldCheck className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />)}
            {testingConn ? "Checking..." : connResult ? (connResult.success ? "Service Online" : "Service Offline") : "Verify Service"}
          </button>
          <button
            onClick={() => { fetchStatus(); fetchLogs(); }}
            disabled={loadingStatus}
            className="flex items-center gap-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-lg transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Live Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Total Items", val: t?.total_items, icon: Package, color: "primary", sub: "Last 7 days window" },
          { label: "Synced", val: t?.synced, icon: CheckCircle2, color: "success", sub: `${syncRate}% success rate` },
          { label: "Pending/Failed", val: t?.pending, icon: Clock, color: "danger", sub: "Requires attention" }
        ].map((c, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full bg-${c.color}/5 group-hover:scale-110 transition-transform duration-500`} />
            <div className="flex items-start justify-between relative z-10">
              <div>
                <p className="text-[11px] font-bold text-foreground-muted uppercase tracking-[0.1em] mb-1">{c.label}</p>
                <p className={`text-3xl font-black text-foreground`}>{c.val?.toLocaleString() ?? "—"}</p>
                <p className="text-[10px] text-foreground-muted mt-2 font-medium">{c.sub}</p>
              </div>
              <div className={`p-3 rounded-xl bg-${c.color}/10 text-${c.color}`}>
                <c.icon className="w-6 h-6" />
              </div>
            </div>
            <div className={`absolute bottom-0 left-0 h-1 bg-${c.color}/30 transition-all duration-500`} style={{ width: c.val ? '100%' : '0%' }} />
          </div>
        ))}
      </div>

      {/* Charts & Trends row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Sync Performance (Last 7 Days)
            </h3>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-success" /><span className="text-[10px] font-bold text-foreground-muted">Synced</span></div>
               <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-danger" /><span className="text-[10px] font-bold text-foreground-muted">Pending/Failed</span></div>
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600 }} />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--primary) / 0.05)' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  labelStyle={{ fontSize: '12px', fontWeight: 'black', marginBottom: '4px' }}
                />
                <Bar dataKey="Synced" stackId="a" fill="hsl(var(--success))" radius={[0, 0, 0, 0]} barSize={32} />
                <Bar dataKey="Failed" stackId="a" fill="hsl(var(--danger))" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <h3 className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" /> Service Schedule
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface-raised border border-border/50">
                <p className="text-[10px] text-foreground-muted font-bold uppercase tracking-tight mb-1">Last Processed Date</p>
                <p className="text-xl font-black text-primary font-mono tracking-tight">
                  {status?.process_exec_date
                    ? new Date(status.process_exec_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}
                </p>
              </div>
              <div className="flex gap-3 p-3 rounded-xl bg-primary/5 text-[11px] text-foreground-muted border border-primary/10">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <p className="leading-relaxed">
                  This represents the current synchronization window. 
                  Manual retry will adjust this window to include missing records.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Operational Status
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-xs text-foreground-muted font-medium">Sync Service</span>
                <span className="text-xs font-bold text-success flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Running
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-xs text-foreground-muted font-medium">Log Retention</span>
                <span className="text-xs font-bold text-foreground">100 Entries</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-foreground-muted font-medium">Target Region</span>
                <span className="text-xs font-bold text-foreground">Head Office</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Errors */}
      {status?.recent_errors && status.recent_errors.length > 0 && (
        <div className="bg-card border border-danger/20 rounded-2xl p-6 shadow-lg shadow-danger/5">
          <h3 className="text-xs font-bold text-danger uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Recent Synchronization Issues
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {status.recent_errors.map((err, i) => (
              <div key={i} className="p-3 rounded-xl bg-danger/5 border border-danger/10 hover:border-danger/30 transition-all cursor-default">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[11px] text-foreground font-black tracking-tighter">{err.ITEM_CODE}</span>
                  <span className="text-[9px] text-foreground-muted font-medium">{toLocalDate(err.LAST_TIMESTAMP).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-[10px] text-foreground-muted truncate font-medium mb-2">{err.ITEM_NAME}</p>
                <div className="text-[10px] text-danger font-bold truncate p-1.5 bg-white/50 rounded border border-danger/5" title={err.RESPONSE_MSG}>
                  {err.RESPONSE_MSG}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trigger & History Section */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <RefreshCw className="w-16 h-16" />
            </div>
            <h2 className="text-lg font-black text-foreground flex items-center gap-2 mb-4">
              Execution Control
            </h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider ml-1">Time Range Window</label>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
                >
                  <option value={1}>Last 24 Hours</option>
                  <option value={2}>Last 48 Hours</option>
                  <option value={3}>Last 72 Hours</option>
                  <option value={7}>Last 7 Days</option>
                  <option value={14}>Last 14 Days</option>
                  <option value={30}>Last 30 Days</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-warning/5 border border-warning/10 space-y-2">
                <p className="text-[11px] font-bold text-warning flex items-center gap-1.5 uppercase">
                  <AlertTriangle className="w-3.5 h-3.5" /> Data Reset
                </p>
                <p className="text-[11px] text-foreground-muted leading-tight">
                  This action will re-queue failed records for processing within the selected window.
                </p>
              </div>

              <button
                onClick={handleTriggerSync}
                disabled={triggering}
                className="w-full group flex items-center justify-center gap-3 py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-primary/30 active:scale-[0.98]"
              >
                <RefreshCw className={`w-5 h-5 ${triggering ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
                {triggering ? "EXECUTING..." : "RETRY SYNC"}
              </button>

              {lastResult && (
                <div className={`p-4 rounded-xl border text-xs font-bold animate-in zoom-in-95 duration-200 ${
                  lastResult.type === "success" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"
                }`}>
                  <div className="flex items-start gap-3">
                    {lastResult.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
                    <span>{lastResult.message}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-3">
          <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col h-full shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-5 border-b border-border gap-4">
              <h2 className="font-black text-foreground flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Execution History
                <span className="text-[10px] font-bold bg-surface-raised px-2 py-0.5 rounded-full text-foreground-muted ml-2">{filteredLogs.length} Entries</span>
              </h2>
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                <input 
                  type="text"
                  placeholder="Filter records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-surface border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              {loadingLogs && logs.length === 0 ? (
                <div className="p-20 text-center space-y-4">
                  <RefreshCw className="w-10 h-10 mx-auto animate-spin text-primary/30" />
                  <p className="text-sm font-bold text-foreground-muted">Loading logs...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-20 text-center opacity-40">
                   <div className="p-5 rounded-full bg-surface-raised w-20 h-20 mx-auto flex items-center justify-center mb-4">
                      <Search className="w-10 h-10" />
                   </div>
                   <p className="text-sm font-bold">No entries found.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/50">
                      <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Timestamp</th>
                      <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Status</th>
                      <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Item Info</th>
                      <th className="text-left px-6 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Result Message</th>
                      <th className="text-right px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredLogs.map((log) => (
                      <tr key={log.log_id} className="hover:bg-primary/[0.02] transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-xs font-bold text-foreground">{toLocalDate(log.log_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                          <p className="text-[10px] text-foreground-muted font-medium">{toLocalDate(log.log_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            log.status === "SUCCESS" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${log.status === "SUCCESS" ? "bg-success" : "bg-danger"}`} />
                            {log.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-mono text-xs font-black text-foreground">{log.item_code ?? "SERVICE"}</p>
                          <p className="text-[11px] text-foreground-muted font-medium truncate max-w-[180px]">{log.item_name ?? "Background Task"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-foreground-muted truncate max-w-[250px] font-medium" title={log.message}>
                            {log.message}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => setSelectedLog(log)}
                            className="p-2 rounded-lg hover:bg-surface-raised text-foreground-muted hover:text-primary transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)} />
          <div className="relative w-full max-w-lg bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex items-center justify-between bg-primary/[0.03]">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl ${selectedLog.status === 'SUCCESS' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                  {selectedLog.status === 'SUCCESS' ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-black text-lg">Log Details</h3>
                  <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest">Entry #{selectedLog.log_id}</p>
                </div>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-surface-raised rounded-full transition-colors">
                <XCircle className="w-6 h-6 text-foreground-muted" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest mb-1">Execution Time</p>
                  <p className="text-sm font-black text-foreground">{toLocalDate(selectedLog.log_date).toLocaleString('id-ID')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest mb-1">Item Reference</p>
                  <p className="text-sm font-black text-primary font-mono">{selectedLog.item_code || '—'}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest mb-1">Description</p>
                <p className="text-sm font-bold text-foreground">{selectedLog.item_name || 'System Process'}</p>
              </div>

              <div className="p-4 rounded-2xl bg-surface-raised border border-border">
                <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest mb-2 flex items-center gap-2">
                   <Info className="w-3.5 h-3.5 text-primary" /> Full Message
                </p>
                <p className="text-sm font-medium text-foreground leading-relaxed whitespace-pre-wrap">
                  {selectedLog.message}
                </p>
              </div>
            </div>

            <div className="p-6 bg-surface-raised flex justify-end">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2.5 bg-foreground text-surface font-black rounded-xl hover:opacity-90 transition-all"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
