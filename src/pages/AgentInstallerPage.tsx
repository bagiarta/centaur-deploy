import { useState, useEffect } from "react";
import { Search, Play, RefreshCw, Network, Shield, ChevronDown, ChevronRight, Wifi, Activity, Trash2, Server, Users, CheckSquare, Square, Eye, EyeOff, Filter, X } from "lucide-react";
import { StatusBadge, PageHeader, SectionCard, StatCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────
interface Device {
  id: string;
  hostname: string;
  ip: string;
  status: string;
  agent_version?: string;
  group_ids?: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
}

interface DeviceCredRow {
  device: Device;
  username: string;
  password: string;
  showPass: boolean;
}

// ── Mode toggle ───────────────────────────────────
type JobMode = "ip_range" | "device_list";

export default function AgentInstallerPage() {
  const [showNewJob, setShowNewJob]   = useState(false);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [scanning, setScanning]       = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [jobs, setJobs]               = useState<any[]>([]);
  const [targets, setTargets]         = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab] = useState<'create' | 'jobs'>('jobs');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [startingJob, setStartingJob] = useState(false);

  // ── IP Range mode state ───────────────────────
  const [ipRange, setIpRange]     = useState("192.168.1.11");
  const [username, setUsername]   = useState("Administrator");
  const [password, setPassword]   = useState("");

  // ── Device List mode state ────────────────────
  const [jobMode, setJobMode]         = useState<JobMode>("device_list");
  const [devices, setDevices]         = useState<Device[]>([]);
  const [groups, setGroups]           = useState<Group[]>([]);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm]   = useState("");
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [credRows, setCredRows]       = useState<Record<string, { username: string; password: string; showPass: boolean }>>({});
  const [defaultUser, setDefaultUser] = useState("Administrator");
  const [defaultPass, setDefaultPass] = useState("");
  const [showDefaultPass, setShowDefaultPass] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [jobsRes, tarRes, devRes, grpRes] = await Promise.all([
        fetch('/api/agent-jobs'),
        fetch('/api/agent-install-targets'),
        fetch('/api/devices'),
        fetch('/api/groups'),
      ]);
      
      if (jobsRes.ok && tarRes.ok && devRes.ok && grpRes.ok) {
        setJobs(await jobsRes.json());
        setTargets(await tarRes.json());
        setDevices(await devRes.json());
        setGroups(await grpRes.json());
      }
    } catch (err) {
      console.error("Failed to load agent data:", err);
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 15000); // Polling every 15s
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData(true);
  };

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[50vh]"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  // ── Helpers ────────────────────────────────────
  const openModal = () => {
    setShowNewJob(true);
    setSelectedDevices([]);
    setCredRows({});
  };

  const closeModal = () => {
    setShowNewJob(false);
    setPassword("");
    setDefaultPass("");
    setSelectedDevices([]);
    setCredRows({});
  };

  // Field-level fallback: if credRows[id] has empty username/password, fall back to defaults
  const getCredForDevice = (id: string) => {
    const row = credRows[id];
    return {
      username: (row?.username?.trim()) || defaultUser,
      password: (row?.password?.trim()) || defaultPass,
      showPass: row?.showPass ?? false,
    };
  };

  const setCredForDevice = (id: string, field: "username" | "password" | "showPass", value: any) => {
    setCredRows(prev => ({
      ...prev,
      [id]: { ...getCredForDevice(id), [field]: value }
    }));
  };

  const filteredDevices = devices.filter(d => {
    const matchGroup = groupFilter === "all" || (d.group_ids || "").includes(groupFilter);
    const matchSearch = d.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.ip.toLowerCase().includes(searchTerm.toLowerCase());
    return matchGroup && matchSearch;
  });

  const allFilteredSelected = filteredDevices.length > 0 && filteredDevices.every(d => selectedDevices.includes(d.id));

  const toggleDevice = (id: string) => {
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    // pre-fill cred row with defaults when first selecting
    if (!credRows[id]) {
      setCredRows(prev => ({
        ...prev,
        [id]: { username: defaultUser, password: defaultPass, showPass: false }
      }));
    }
  };

  const toggleAll = () => {
    const ids = filteredDevices.map(d => d.id);
    if (allFilteredSelected) {
      setSelectedDevices(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedDevices(prev => Array.from(new Set([...prev, ...ids])));
      // pre-fill creds for newly selected
      const newCreds: typeof credRows = {};
      ids.forEach(id => {
        if (!credRows[id]) newCreds[id] = { username: defaultUser, password: defaultPass, showPass: false };
      });
      setCredRows(prev => ({ ...prev, ...newCreds }));
    }
  };

  // Apply default creds to all selected
  const applyDefaultToAll = () => {
    const updated: typeof credRows = {};
    selectedDevices.forEach(id => {
      updated[id] = { ...getCredForDevice(id), username: defaultUser, password: defaultPass };
    });
    setCredRows(prev => ({ ...prev, ...updated }));
  };

  // ── Scan (cosmetic) ────────────────────────────
  const startScan = () => {
    setScanning(true);
    setScanProgress(0);
    const iv = setInterval(() => {
      setScanProgress(p => {
        if (p >= 100) { clearInterval(iv); setScanning(false); return 100; }
        return p + 4;
      });
    }, 80);
  };

  // ── Start Job ─────────────────────────────────
  const startInstallJob = async () => {
    if (jobMode === "ip_range") {
      if (!ipRange || !username || !password) return alert("IP Range, Username and Password are required.");
      setStartingJob(true);
      try {
        const res = await fetch('/api/agent-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: `aj-${Date.now()}`, ip_range: ipRange, username, password, created_by: 'admin' })
        });
        if (res.ok) {
          closeModal();
          loadData();
        } else {
          alert("Failed to start job: " + await res.text());
        }
      } catch (err) {
        alert("Network error");
      } finally {
        setStartingJob(false);
      }
      return;
    }

    // Device list mode
    if (selectedDevices.length === 0) return alert("Please select at least one device.");

    // Auto-apply defaults for any device with empty creds (no need to click 'Apply to all' manually)
    const resolvedCreds: typeof credRows = {};
    selectedDevices.forEach(id => {
      const row = credRows[id];
      resolvedCreds[id] = {
        username: (row?.username?.trim()) || defaultUser,
        password: (row?.password?.trim()) || defaultPass,
        showPass: row?.showPass ?? false,
      };
    });

    const missingCreds = selectedDevices.filter(id => {
      const c = resolvedCreds[id];
      return !c.username || !c.password;
    });
    if (missingCreds.length > 0) {
      const names = missingCreds.map(id => devices.find(d => d.id === id)?.hostname || id).join(", ");
      return alert(`Missing credentials for: ${names}\n\nPlease fill in Username and Password above, then click "Apply to selected".`);
    }

    setStartingJob(true);
    try {
      // Build ip_range label from selected hostnames for display
      const selDevObjs = selectedDevices.map(id => devices.find(d => d.id === id)!).filter(Boolean);
      const ipLabel = selDevObjs.map(d => d.hostname).join(", ");

      // Create one job entry per unique credential group to allow per-device creds
      // We send all as a single job; server handles per-target creds
      const res = await fetch('/api/agent-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `aj-${Date.now()}`,
          ip_range: ipLabel,
          username: defaultUser || 'Administrator',
          password: defaultPass || '',
          created_by: 'admin',
          // Extended: per-device targeting
          device_targets: selDevObjs.map(d => ({
            device_id: d.id,
            hostname: d.hostname,
            ip: d.ip,
            username: resolvedCreds[d.id]?.username || defaultUser,
            password: resolvedCreds[d.id]?.password || defaultPass,
          }))
        })
      });

      if (res.ok) {
        closeModal();
        loadData();
      } else {
        alert("Failed to start job: " + await res.text());
      }
    } catch (err) {
      console.error(err);
      alert("Network error starting job");
    } finally {
      setStartingJob(false);
    }
  };

  const deleteJob = async (id: string) => {
    if (!confirm("Delete this job and all its logs?")) return;
    setDeleteLoading(id);
    try {
      const res = await fetch(`/api/agent-jobs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== id));
        setTargets(prev => prev.filter(t => t.job_id !== id));
      } else {
        alert("Failed to delete job");
      }
    } catch {
      alert("Error deleting job");
    } finally {
      setDeleteLoading(null);
    }
  };

  const retryTarget = async (jobId: string, ip: string) => {
    try {
      // Optimistic update
      setTargets(prev => prev.map(t => 
        (t.job_id === jobId && t.device_ip === ip) ? { ...t, status: 'running', log: 'Initiating retry...' } : t
      ));

      // Try to find if we have any cached creds or use the global defaults
      // For now, we'll use the defaults if none specified
      const res = await fetch('/api/agent-jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          job_id: jobId, 
          device_ip: ip,
          username: username, // From local state
          password: password  // From local state
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(`Failed to initiate retry: ${errData.error}`);
        loadData(true);
      }
    } catch (err) {
      alert("Error retrying target");
      loadData(true);
    }
  };

  const getGroupColor = (g: Group) => {
    const map: Record<string, string> = { primary: "bg-primary/20 text-primary", success: "bg-success/20 text-success", info: "bg-info/20 text-info", warning: "bg-warning/20 text-warning" };
    return map[g.color] || "bg-surface-raised text-foreground-muted";
  };

  // ── Render ────────────────────────────────────
  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Auto Agent Installer"
        subtitle="Push CentaurAgent v2.6.0 to devices — select from existing device list or by IP range"
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-raised border border-border text-foreground-subtle text-xs font-semibold hover:bg-surface-overlay transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={openModal}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
            >
              <Network className="w-3.5 h-3.5" /> New Install Job
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Jobs"       value={jobs.length} icon={<Network className="w-5 h-5" />} />
        <StatCard label="Agents Installed" value={jobs.reduce((a, j) => a + (j.success_count || 0), 0)} variant="success" icon={<Shield className="w-5 h-5" />} />
        <StatCard label="Failed"           value={jobs.reduce((a, j) => a + (j.failed_count  || 0), 0)} variant="danger"  icon={<Shield className="w-5 h-5" />} />
        <StatCard label="Pending"          value={jobs.reduce((a, j) => a + (j.pending_count || 0), 0)} variant="default" icon={<Shield className="w-5 h-5" />} />
      </div>

      {/* Network Scanner Card */}
      <div className="card-enterprise p-5 border-primary/20" style={{ background: "var(--gradient-hero)" }}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-64">
            <p className="text-sm font-semibold text-foreground mb-1">Network Scanner</p>
            <p className="text-xs text-foreground-muted mb-3">Discover Windows hosts via ICMP ping + SMB port probe</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
                <input defaultValue="192.168.1.1 – 192.168.1.254" className="w-full pl-9 pr-3 py-2 text-sm bg-background/50 border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <button onClick={startScan} disabled={scanning} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow disabled:opacity-60">
                {scanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {scanning ? "Scanning…" : "Scan"}
              </button>
            </div>
          </div>
          {scanning && (
            <div className="flex-1 min-w-48">
              <p className="text-xs text-foreground-muted mb-2">Probing hosts… {scanProgress}%</p>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gradient-primary transition-all duration-100" style={{ width: `${scanProgress}%` }} />
              </div>
              <p className="text-xs text-foreground-muted mt-1 font-mono">→ 192.168.1.{Math.round(scanProgress * 2.54)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Job List */}
      <SectionCard 
        title="Install Jobs"
        actions={
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 text-xs text-foreground-subtle hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} /> Sync Status
          </button>
        }
      >
        <div className="divide-y divide-border">
          {jobs.length === 0 && (
            <p className="text-center text-foreground-subtle text-sm py-10">No install jobs yet. Click "New Install Job" to begin.</p>
          )}
          {jobs.map(job => (
            <div key={job.id}>
              <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface/40 transition-colors" onClick={() => setExpanded(expanded === job.id ? null : job.id)}>
                <button className="text-foreground-muted shrink-0">
                  {expanded === job.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm text-foreground truncate max-w-xs">{job.ip_range}</span>
                    <span className="badge-pill bg-surface-overlay text-foreground-muted text-xs">{job.total || 0} hosts</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden flex w-48">
                    <div className="h-full bg-success transition-all" style={{ width: `${((job.success_count || 0) / Math.max(job.total || 1,1)) * 100}%` }} />
                    <div className="h-full bg-danger transition-all"  style={{ width: `${((job.failed_count  || 0) / Math.max(job.total || 1,1)) * 100}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-foreground-muted">
                  <span className="text-success font-semibold">{job.success_count || 0} ✓</span>
                  <span className="text-danger font-semibold">{job.failed_count || 0} ✗</span>
                  <span className="text-foreground-subtle">{job.pending_count || 0} pending</span>
                </div>
                <div className="text-right shrink-0 flex items-center gap-4">
                  <div>
                    <p className="text-xs text-foreground-muted">{job.created_by}</p>
                    <p className="text-xs font-mono text-foreground-subtle">{job.created_at}</p>
                  </div>
                  <button 
                    onClick={e => { e.stopPropagation(); deleteJob(job.id); }} 
                    disabled={deleteLoading === job.id}
                    className="p-1.5 rounded-md hover:bg-danger-dim text-foreground-subtle hover:text-danger transition-colors disabled:opacity-50"
                    title="Delete Job"
                  >
                    {deleteLoading === job.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {expanded === job.id && (
                <div className="bg-background-subtle border-t border-border overflow-x-auto">
                  <table className="table-enterprise">
                    <thead><tr><th>IP Address</th><th>Hostname</th><th>Status</th><th>Log</th><th>Updated</th><th>Actions</th></tr></thead>
                    <tbody>
                      {targets.filter(t => t.job_id === job.id).map(t => (
                        <tr key={t.device_ip}>
                          <td><span className="font-mono text-sm">{t.device_ip}</span></td>
                          <td><span className="font-mono text-sm text-foreground-muted">{t.hostname}</span></td>
                          <td><StatusBadge status={t.status} size="xs" /></td>
                          <td><span className="font-mono text-xs text-foreground-muted truncate max-w-64 block">{t.log}</span></td>
                          <td><span className="font-mono text-xs text-foreground-muted">{t.updated_at}</span></td>
                          <td>
                            <div className="flex items-center gap-2">
                              {t.status === "failed" && (
                                <button 
                                  onClick={() => retryTarget(job.id, t.device_ip)}
                                  className="text-xs text-warning hover:underline flex items-center gap-1"
                                >
                                  <RefreshCw className="w-3 h-3" /> Retry
                                </button>
                              )}
                              <button onClick={() => setSelectedLog(t)} className="text-xs text-primary hover:underline">View Log</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── New Job Modal ───────────────────────────────── */}
      {showNewJob && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-6 pb-6 overflow-y-auto" onClick={closeModal}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-3xl shadow-2xl animate-fade-up mx-4" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground">New Agent Install Job</h2>
              <button onClick={closeModal} className="text-foreground-muted hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Mode Toggle */}
              <div className="flex gap-2 p-1 bg-surface-raised rounded-lg">
                <button
                  onClick={() => setJobMode("device_list")}
                  className={cn("flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all",
                    jobMode === "device_list" ? "bg-primary text-primary-foreground shadow-glow" : "text-foreground-muted hover:text-foreground")}
                >
                  <Server className="w-3.5 h-3.5" /> From Device List
                </button>
                <button
                  onClick={() => setJobMode("ip_range")}
                  className={cn("flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all",
                    jobMode === "ip_range" ? "bg-primary text-primary-foreground shadow-glow" : "text-foreground-muted hover:text-foreground")}
                >
                  <Network className="w-3.5 h-3.5" /> By IP Range
                </button>
              </div>

              {/* ── Mode: IP Range (lama) ── */}
              {jobMode === "ip_range" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">IP Range / Specific IPs</label>
                    <input value={ipRange} onChange={e => setIpRange(e.target.value)} placeholder="e.g. 192.168.1.11, 192.168.1.12"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-foreground-muted mb-1 block">Admin Username</label>
                      <input value={username} onChange={e => setUsername(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-xs text-foreground-muted mb-1 block">Admin Password</label>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Mode: Device List ── */}
              {jobMode === "device_list" && (
                <div className="space-y-4">
                  {/* Default Credentials Bar */}
                  <div className="p-3 bg-surface-raised border border-border rounded-lg">
                    <p className="text-xs font-semibold text-foreground-muted mb-2 uppercase tracking-wider">Default Credentials (apply to all)</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <input
                        value={defaultUser}
                        onChange={e => setDefaultUser(e.target.value)}
                        placeholder="Default Username"
                        className="px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40"
                      />
                      <div className="relative">
                        <input
                          type={showDefaultPass ? "text" : "password"}
                          value={defaultPass}
                          onChange={e => setDefaultPass(e.target.value)}
                          placeholder="Default Password"
                          className="px-2 py-1.5 pr-8 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-44"
                        />
                        <button onClick={() => setShowDefaultPass(!showDefaultPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground">
                          {showDefaultPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                      <button
                        onClick={applyDefaultToAll}
                        disabled={selectedDevices.length === 0}
                        className="px-3 py-1.5 text-xs bg-primary/10 border border-primary/20 text-primary rounded-md hover:bg-primary/20 transition-all font-semibold disabled:opacity-40"
                      >
                        Apply to {selectedDevices.length > 0 ? `${selectedDevices.length} selected` : "selected"}
                      </button>
                    </div>
                  </div>

                  {/* Filters Row */}
                  <div className="flex gap-2 flex-wrap items-center">
                    {/* Group Filter */}
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-foreground-muted" />
                      <select
                        value={groupFilter}
                        onChange={e => setGroupFilter(e.target.value)}
                        className="text-xs bg-background border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="all">All Groups</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                    {/* Search */}
                    <div className="relative flex-1 min-w-40">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
                      <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search hostname or IP…"
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    {/* Select All */}
                    <button
                      onClick={toggleAll}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold"
                    >
                      {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      {allFilteredSelected ? "Deselect All" : "Select All"}
                    </button>
                    <span className="text-xs text-foreground-muted">{selectedDevices.length} selected</span>
                  </div>

                  {/* Device Table */}
                  <div className="border border-border rounded-lg overflow-hidden max-h-[340px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-surface-raised border-b border-border">
                        <tr>
                          <th className="w-8 px-3 py-2"><span className="sr-only">Select</span></th>
                          <th className="text-left px-3 py-2 text-foreground-muted font-semibold uppercase tracking-wider">Hostname</th>
                          <th className="text-left px-3 py-2 text-foreground-muted font-semibold uppercase tracking-wider">IP</th>
                          <th className="text-left px-3 py-2 text-foreground-muted font-semibold uppercase tracking-wider">Status</th>
                          <th className="text-left px-3 py-2 text-foreground-muted font-semibold uppercase tracking-wider">Agent</th>
                          <th className="text-left px-3 py-2 text-foreground-muted font-semibold uppercase tracking-wider w-48">Username</th>
                          <th className="text-left px-3 py-2 text-foreground-muted font-semibold uppercase tracking-wider w-48">Password</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredDevices.length === 0 && (
                          <tr><td colSpan={7} className="text-center text-foreground-subtle py-8">No devices found</td></tr>
                        )}
                        {filteredDevices.map(d => {
                          const sel = selectedDevices.includes(d.id);
                          const cred = getCredForDevice(d.id);
                          return (
                            <tr key={d.id} className={cn("transition-colors", sel ? "bg-primary/5" : "hover:bg-surface/40")}>
                              <td className="px-3 py-2">
                                <button onClick={() => toggleDevice(d.id)} className="text-primary">
                                  {sel ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-foreground-muted" />}
                                </button>
                              </td>
                              <td className="px-3 py-2 font-mono font-medium text-foreground">{d.hostname}</td>
                              <td className="px-3 py-2 font-mono text-foreground-muted">{d.ip}</td>
                              <td className="px-3 py-2">
                                <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                                  d.status === "online"  ? "bg-success/15 text-success"  :
                                  d.status === "offline" ? "bg-foreground-subtle/20 text-foreground-muted" : "bg-warning/15 text-warning"
                                )}>
                                  {d.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-foreground-muted">{d.agent_version || "—"}</td>
                              <td className="px-3 py-2">
                                {sel ? (
                                  <input
                                    value={cred.username}
                                    onChange={e => setCredForDevice(d.id, "username", e.target.value)}
                                    placeholder="Username"
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                ) : <span className="text-foreground-subtle">—</span>}
                              </td>
                              <td className="px-3 py-2">
                                {sel ? (
                                  <div className="relative">
                                    <input
                                      type={cred.showPass ? "text" : "password"}
                                      value={cred.password}
                                      onChange={e => setCredForDevice(d.id, "password", e.target.value)}
                                      placeholder="Password"
                                      className="w-full px-2 py-1 pr-7 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    <button
                                      onClick={() => setCredForDevice(d.id, "showPass", !cred.showPass)}
                                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                                    >
                                      {cred.showPass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    </button>
                                  </div>
                                ) : <span className="text-foreground-subtle">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Group Tags */}
                  {groups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-foreground-muted self-center">Filter:</span>
                      <button onClick={() => setGroupFilter("all")} className={cn("px-2 py-0.5 rounded-full text-xs font-semibold transition-all", groupFilter === "all" ? "bg-primary text-primary-foreground" : "bg-surface-raised text-foreground-muted hover:bg-surface-overlay")}>
                        All
                      </button>
                      {groups.map(g => (
                        <button key={g.id} onClick={() => setGroupFilter(g.id)} className={cn("px-2 py-0.5 rounded-full text-xs font-semibold transition-all", groupFilter === g.id ? "bg-primary text-primary-foreground" : getGroupColor(g))}>
                          {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Info note */}
              <p className="text-xs text-info bg-info/10 border border-info/20 rounded-lg px-3 py-2">
                🔒 Credentials are used once for WMI/SMB push and are <strong>not stored</strong> anywhere.
              </p>

              {/* Footer buttons */}
              <div className="flex gap-2 pt-1">
                <button onClick={closeModal} className="flex-1 py-2 text-sm border border-border rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors">
                  Cancel
                </button>
                <button
                  onClick={startInstallJob}
                  disabled={startingJob || (jobMode === "device_list" && selectedDevices.length === 0) || (jobMode === "ip_range" && (!ipRange || !username || !password))}
                  className="flex-1 flex items-center justify-center gap-2 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow disabled:opacity-50"
                >
                  {startingJob ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {jobMode === "device_list"
                    ? `Push to ${selectedDevices.length} device${selectedDevices.length !== 1 ? "s" : ""}`
                    : "Start Install Job"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-10 overflow-y-auto" onClick={() => setSelectedLog(null)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-2xl shadow-lg animate-fade-up max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground">Installation Log: {selectedLog.hostname} ({selectedLog.device_ip})</h2>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedLog.status} size="xs" />
                <button onClick={() => setSelectedLog(null)} className="text-foreground-muted hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-background/50 border border-border rounded-md p-4 font-mono text-xs text-foreground whitespace-pre-wrap">
              {selectedLog.log || "No log entries found."}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
