import { useState, useEffect } from "react";
import { Plus, ChevronDown, ChevronRight, Rocket, Clock, CheckCircle, XCircle, Activity, RefreshCw, Search } from "lucide-react";
import { StatusBadge, PageHeader, SectionCard, DeployProgressSummary } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

export default function DeploymentsPage() {
  const [expanded, setExpanded] = useState<string | null>("dep1");
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  const [deployments, setDeployments] = useState<any[]>([]);
  const [targets, setTargets] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard Form State
  const [selectedPkg, setSelectedPkg] = useState<string>("");
  const [targetPath, setTargetPath] = useState<string>("C:\\Program Files\\");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<"immediate" | "scheduled">("immediate");
  const [scheduleTime, setScheduleTime] = useState<string>("");
  const [bandwidthLimit, setBandwidthLimit] = useState<string>("50");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [showAddTargets, setShowAddTargets] = useState<string | null>(null);
  const [addingTargets, setAddingTargets] = useState<string[]>([]);
  const [targetStatusFilter, setTargetStatusFilter] = useState<Record<string, string>>({});
  const [deviceSearch, setDeviceSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [addTargetSearch, setAddTargetSearch] = useState("");

  const refreshData = async () => {
    setLoading(true);
    try {
      const [depRes, tarRes] = await Promise.all([
        fetch('/api/deployments'),
        fetch('/api/deployment-targets')
      ]);
      setDeployments(await depRes.json());
      setTargets(await tarRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    const targetSet = new Map();
    // Add devices from groups
    for (const gid of selectedGroups) {
      const gDevices = devices.filter(d => (d.group_ids || []).includes(gid));
      gDevices.forEach(d => targetSet.set(d.id, d));
    }
    // Add individual devices
    for (const did of selectedDevices) {
      const d = devices.find(x => x.id === did);
      if (d) targetSet.set(d.id, d);
    }

    const uniqueTargets = Array.from(targetSet.values());
    if (uniqueTargets.length === 0) {
      alert("No targets selected!");
      return;
    }

    const pkg = packages.find(p => p.id === selectedPkg);
    if (!pkg) {
      alert("No package selected!");
      return;
    }

    const newDep = {
      id: `dep-${Date.now()}`,
      package_id: pkg.id,
      package_name: pkg.name,
      package_version: pkg.version,
      target_path: targetPath,
      schedule_time: scheduleType === "scheduled" && scheduleTime ? scheduleTime.replace("T", " ") : null,
      created_by: "admin",
      status: scheduleType === "scheduled" && scheduleTime ? "scheduled" : "running",
      targets: uniqueTargets.map(t => ({
        device_id: t.id,
        hostname: t.hostname,
        ip: t.ip
      }))
    };

    try {
      const res = await fetch('/api/deployments', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDep)
      });
      if (res.ok) {
        setShowWizard(false);
        setWizardStep(1);
        setSelectedPkg("");
        setSelectedGroups([]);
        setSelectedDevices([]);
        
        // refresh data
        const [depRes, tarRes] = await Promise.all([
          fetch('/api/deployments'),
          fetch('/api/deployment-targets')
        ]);
        setDeployments(await depRes.json());
        setTargets(await tarRes.json());
      } else {
        alert("Failed to create deployment");
      }
    } catch (err) {
      console.error(err);
      alert("Network error");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this deployment?")) return;
    try {
      const res = await fetch(`/api/deployments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeployments(prev => prev.filter(d => d.id !== id));
        setTargets(prev => prev.filter(t => t.deployment_id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [depRes, tarRes, pkgRes, devRes, grpRes] = await Promise.all([
          fetch('/api/deployments'),
          fetch('/api/deployment-targets'),
          fetch('/api/packages'),
          fetch('/api/devices'),
          fetch('/api/groups')
        ]);
        
        setDeployments(await depRes.json());
        setTargets(await tarRes.json());
        setPackages(await pkgRes.json());
        setDevices(await devRes.json());
        setGroups(await grpRes.json());
      } catch (err) {
        console.error("Failed to fetch deployments data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[50vh]"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Deployments"
        subtitle="Create, schedule and monitor software deployments across your fleet"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refreshData}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface border border-border text-foreground-muted text-xs font-semibold hover:bg-surface-raised transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              onClick={() => { setShowWizard(true); setWizardStep(1); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
            >
              <Plus className="w-3.5 h-3.5" /> New Deployment
            </button>
          </div>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Running",   count: deployments.filter(d => d.status === "running").length,   cls: "text-primary" },
          { label: "Scheduled", count: deployments.filter(d => d.status === "scheduled").length, cls: "text-info" },
          { label: "Success",   count: deployments.filter(d => d.status === "success").length,   cls: "text-success" },
          { label: "Failed",    count: deployments.filter(d => d.status === "failed").length,    cls: "text-danger" },
        ].map(s => (
          <div key={s.label} className="card-enterprise p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wider mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold", s.cls)}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* Deployment List */}
      <SectionCard title="Deployment History">
        <div className="divide-y divide-border">
          {deployments.map(dep => (
            <div key={dep.id}>
              {/* Header row */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface/40 transition-colors"
                onClick={() => setExpanded(expanded === dep.id ? null : dep.id)}
              >
                <button className="text-foreground-muted shrink-0">
                  {expanded === dep.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="font-semibold text-foreground text-sm">{dep.package_name}</span>
                    <span className="badge-pill bg-surface-overlay text-foreground-muted font-mono text-xs">v{dep.package_version}</span>
                    <StatusBadge status={dep.status} size="xs" />
                    {dep.schedule_time && (
                      <span className="flex items-center gap-1 text-xs text-foreground-muted">
                        <Clock className="w-3 h-3" /> {dep.schedule_time}
                      </span>
                    )}
                  </div>
                  <DeployProgressSummary
                    total={dep.total_targets}
                    success={dep.success_count}
                    failed={dep.failed_count}
                    pending={dep.pending_count}
                  />
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-foreground-muted">{dep.created_by}</p>
                    <p className="text-xs text-foreground-subtle font-mono">{dep.created_at}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowAddTargets(dep.id); }}
                      className="text-xs text-primary hover:underline transition-colors"
                    >
                      Add Devices
                    </button>
                    <span className="text-border">|</span>
                    <button 
                      onClick={(e) => handleDelete(dep.id, e)}
                      className="text-xs text-danger hover:text-danger-foreground transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded targets */}
              {expanded === dep.id && (
                <div className="bg-background-subtle border-t border-border">
                  {targets.filter(t => t.deployment_id === dep.id).length > 0 ? (
                    <div className="overflow-x-auto">
                          {(() => {
                            const depTargets = targets.filter(t => t.deployment_id === dep.id);
                            const activeFilter = targetStatusFilter[dep.id] || "all";
                            const filteredTargets = activeFilter === "all" 
                              ? depTargets 
                              : depTargets.filter(t => t.status === activeFilter);
                            
                            const searchFilteredTargets = filteredTargets.filter(t => 
                              t.hostname.toLowerCase().includes(targetSearch.toLowerCase()) || 
                              t.ip.includes(targetSearch)
                            );

                            // Stats for buttons
                            const stats = {
                              all: depTargets.length,
                              success: depTargets.filter(t => t.status === "success").length,
                              failed: depTargets.filter(t => t.status === "failed").length,
                              running: depTargets.filter(t => t.status === "running").length,
                              pending: depTargets.filter(t => t.status === "pending").length
                            };

                            return (
                              <>
                                {/* Filter Bar */}
                                <div className="px-5 py-3 flex gap-2 border-b border-border bg-surface-raised/40 overflow-x-auto no-scrollbar items-center">
                                  <div className="relative flex-shrink-0 mr-2">
                                    <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-foreground-muted" />
                                    <input 
                                      placeholder="Search target..." 
                                      value={targetSearch} 
                                      onChange={e => setTargetSearch(e.target.value)}
                                      className="w-48 pl-8 pr-3 py-1 text-xs bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  </div>
                                  {[
                                    { id: "all", label: "All", count: stats.all, color: "text-foreground" },
                                    { id: "success", label: "Success", count: stats.success, color: "text-success" },
                                    { id: "failed", label: "Failed", count: stats.failed, color: "text-danger" },
                                    { id: "running", label: "Processing", count: stats.running, color: "text-primary" },
                                    { id: "pending", label: "Pending", count: stats.pending, color: "text-foreground-muted" },
                                  ].map(f => (
                                    <button
                                      key={f.id}
                                      onClick={() => setTargetStatusFilter(prev => ({ ...prev, [dep.id]: f.id }))}
                                      className={cn(
                                        "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold transition-all border",
                                        activeFilter === f.id 
                                          ? "bg-surface border-primary text-primary shadow-sm ring-1 ring-primary/20" 
                                          : "bg-transparent border-transparent text-foreground-muted hover:bg-surface-raised/60 hover:border-border"
                                      )}
                                    >
                                      <span className={cn(f.color, activeFilter === f.id ? "opacity-100" : "opacity-70")}>{f.label}</span>
                                      <span className="bg-background/50 px-1.5 py-0.5 rounded text-[10px] opacity-70">{f.count}</span>
                                    </button>
                                  ))}
                                </div>

                                <table className="table-enterprise">
                                  <thead>
                                    <tr>
                                      <th>Device</th>
                                      <th>IP</th>
                                      <th>Status</th>
                                      <th>Progress</th>
                                      <th>Log</th>
                                      <th>Updated</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {searchFilteredTargets.map(t => (
                                      <tr key={t.device_id}>
                                        <td><span className="font-mono text-sm">{t.hostname}</span></td>
                                        <td><span className="font-mono text-xs text-foreground-muted">{t.ip}</span></td>
                                        <td><StatusBadge status={t.status} size="xs" /></td>
                                        <td>
                                          <div className="flex items-center gap-2 min-w-24">
                                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                              <div
                                                className={cn("h-full rounded-full transition-all", t.status === "failed" ? "bg-danger" : "bg-primary")}
                                                style={{ width: `${t.progress}%` }}
                                              />
                                            </div>
                                            <span className="text-xs font-mono text-foreground-muted w-8">{t.progress}%</span>
                                          </div>
                                        </td>
                                        <td>
                                          <button 
                                            onClick={() => setSelectedLog(t)}
                                            className="text-[10px] text-primary hover:underline font-mono truncate max-w-56 block text-left"
                                          >
                                            {t.log || "No log entries..."}
                                          </button>
                                        </td>
                                        <td><span className="text-xs font-mono text-foreground-muted">{t.updated_at}</span></td>
                                      </tr>
                                    ))}
                                    {searchFilteredTargets.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="py-8 text-center text-xs text-foreground-muted italic">
                                          No devices found matching your search.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </>
                            );
                          })()}
                    </div>
                  ) : (
                    <div className="px-5 py-3 text-xs text-foreground-muted">
                      Target details not loaded. Click refresh to fetch.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Deployment Wizard */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-10 overflow-y-auto pb-10" onClick={() => setShowWizard(false)}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-lg animate-fade-up" onClick={e => e.stopPropagation()}>
            {/* Steps */}
            <div className="flex border-b border-border">
              {[
                { n: 1, label: "Package" },
                { n: 2, label: "Targets" },
                { n: 3, label: "Schedule" },
                { n: 4, label: "Review" },
              ].map(s => (
                <button
                  key={s.n}
                  onClick={() => setWizardStep(s.n)}
                  className={cn(
                    "flex-1 py-3 text-xs font-semibold transition-colors border-b-2",
                    wizardStep === s.n
                      ? "border-primary text-primary"
                      : wizardStep > s.n
                        ? "border-success text-success"
                        : "border-transparent text-foreground-muted"
                  )}
                >
                  {s.n}. {s.label}
                </button>
              ))}
            </div>

            <div className="p-6 min-h-64">
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Select Package</h3>
                  {packages.map(pkg => (
                    <label key={pkg.id} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-surface-raised transition-all">
                      <input 
                        type="radio" 
                        name="pkg" 
                        className="accent-primary" 
                        checked={selectedPkg === pkg.id}
                        onChange={() => setSelectedPkg(pkg.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{pkg.name}</p>
                        <p className="text-xs text-foreground-muted">v{pkg.version} · {pkg.type.toUpperCase()} · {pkg.size}</p>
                      </div>
                    </label>
                  ))}
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">Target Path</label>
                    <input 
                      value={targetPath}
                      onChange={e => setTargetPath(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono" 
                    />
                  </div>
                </div>
              )}
              {wizardStep === 2 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Select Targets</h3>
                  <p className="text-xs text-foreground-muted mb-2">Groups</p>
                  {groups.map(g => (
                    <label key={g.id} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-surface-raised transition-all">
                      <input 
                        type="checkbox" 
                        className="accent-primary"
                        checked={selectedGroups.includes(g.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedGroups(prev => [...prev, g.id]);
                          else setSelectedGroups(prev => prev.filter(x => x !== g.id));
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{g.name}</p>
                        <p className="text-xs text-foreground-muted">{g.device_count} devices</p>
                      </div>
                    </label>
                  ))}
                  <p className="text-xs text-foreground-muted mt-3 mb-2">Individual Devices</p>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-foreground-muted" />
                    <input 
                      placeholder="Search devices..." 
                      value={deviceSearch} 
                      onChange={e => setDeviceSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {devices.filter(d => d.hostname.toLowerCase().includes(deviceSearch.toLowerCase()) || d.ip.includes(deviceSearch)).map(d => (
                      <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-raised cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="accent-primary" 
                          checked={selectedDevices.includes(d.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedDevices(prev => [...prev, d.id]);
                            else setSelectedDevices(prev => prev.filter(x => x !== d.id));
                          }}
                        />
                        <span className="text-sm font-mono text-foreground">{d.hostname}</span>
                        <span className="text-xs text-foreground-muted ml-auto">{d.ip}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Scheduling</h3>
                  <div className="space-y-3">
                    <label className={cn("flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border", scheduleType === "immediate" ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30")}>
                      <input type="radio" name="sched" checked={scheduleType === "immediate"} onChange={() => setScheduleType("immediate")} className="accent-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Deploy immediately</p>
                        <p className="text-xs text-foreground-muted">Start as soon as agents acknowledge</p>
                      </div>
                    </label>
                    <label className={cn("flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border", scheduleType === "scheduled" ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30")}>
                      <input type="radio" name="sched" checked={scheduleType === "scheduled"} onChange={() => setScheduleType("scheduled")} className="accent-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Schedule for later</p>
                        <input 
                          type="datetime-local" 
                          value={scheduleTime}
                          onChange={e => setScheduleTime(e.target.value)}
                          disabled={scheduleType !== "scheduled"}
                          className="mt-1 text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" 
                        />
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">Bandwidth Limit (MB/s)</label>
                    <input type="range" min="1" max="100" value={bandwidthLimit} onChange={e => setBandwidthLimit(e.target.value)} className="w-full accent-primary" />
                    <div className="flex justify-between text-xs text-foreground-muted"><span>1 MB/s</span><span className="font-mono text-primary">{bandwidthLimit} MB/s</span><span>100 MB/s</span></div>
                  </div>
                </div>
              )}
              {wizardStep === 4 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Review & Confirm</h3>
                  <div className="bg-background-subtle rounded-lg p-4 space-y-2 text-sm border border-border">
                    <div className="flex justify-between"><span className="text-foreground-muted">Package</span><span className="text-foreground font-medium">{packages.find(p => p.id === selectedPkg)?.name ?? "(None)"}</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Target Path</span><span className="text-foreground font-mono text-xs">{targetPath}</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Targets Groups</span><span className="text-foreground font-medium">{selectedGroups.length}</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Targets Individual</span><span className="text-foreground font-medium">{selectedDevices.length}</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Schedule</span><span className="text-foreground font-medium">{scheduleType === "scheduled" ? scheduleTime.replace('T', ' ') : "Immediate"}</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Bandwidth</span><span className="text-foreground font-medium">{bandwidthLimit} MB/s</span></div>
                  </div>
                  <p className="text-xs text-warning bg-warning-dim rounded p-2">⚠ Deployment will stop running processes in the target path. Ensure you have proper maintenance windows.</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setShowWizard(false)} className="px-4 py-2 text-sm border border-border rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors">Cancel</button>
              {wizardStep > 1 && (
                <button onClick={() => setWizardStep(s => s - 1)} className="px-4 py-2 text-sm border border-border rounded-md text-foreground hover:bg-surface-raised transition-colors">Back</button>
              )}
              <button
                onClick={() => wizardStep < 4 ? setWizardStep(s => s + 1) : handleDeploy()}
                className="ml-auto px-5 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow disabled:opacity-50"
                disabled={(wizardStep === 1 && !selectedPkg) || (wizardStep === 2 && selectedGroups.length === 0 && selectedDevices.length === 0)}
              >
                {wizardStep < 4 ? "Next →" : "🚀 Deploy"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add Targets Modal */}
      {showAddTargets && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-10 overflow-y-auto pb-10" onClick={() => setShowAddTargets(null)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-lg animate-fade-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground mb-4">Add Devices to Deployment</h2>
            <p className="text-xs text-foreground-muted mb-4">Select new devices to add to this deployment task.</p>
            
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-foreground-muted" />
              <input 
                placeholder="Search devices to add..." 
                value={addTargetSearch} 
                onChange={e => setAddTargetSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1 mb-4 border border-border rounded-md p-2 bg-background/50">
              {devices
                .filter(d => !targets.some(t => t.deployment_id === showAddTargets && t.device_id === d.id))
                .filter(d => d.hostname.toLowerCase().includes(addTargetSearch.toLowerCase()) || d.ip.includes(addTargetSearch))
                .map(d => (
                  <label key={d.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-surface-raised cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      className="accent-primary" 
                      checked={addingTargets.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) setAddingTargets(prev => [...prev, d.id]);
                        else setAddingTargets(prev => prev.filter(x => x !== d.id));
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-foreground">{d.hostname}</p>
                      <p className="text-xs text-foreground-muted">{d.ip}</p>
                    </div>
                  </label>
                ))}
              {devices.filter(d => !targets.some(t => t.deployment_id === showAddTargets && t.device_id === d.id)).length === 0 && (
                <div className="py-8 text-center text-xs text-foreground-muted">No new devices available to add.</div>
              )}
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => { setShowAddTargets(null); setAddingTargets([]); }} 
                className="flex-1 py-2 text-sm border border-border rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const selectedDevices = devices.filter(d => addingTargets.includes(d.id));
                  if (selectedDevices.length === 0) return;
                  
                  try {
                    const res = await fetch(`/api/deployments/${showAddTargets}/targets`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        targets: selectedDevices.map(d => ({
                          device_id: d.id,
                          hostname: d.hostname,
                          ip: d.ip
                        }))
                      })
                    });
                    if (res.ok) {
                      setShowAddTargets(null);
                      setAddingTargets([]);
                      refreshData();
                    } else {
                      alert("Failed to add devices: " + await res.text());
                    }
                  } catch (err) {
                    console.error(err);
                    alert("Error adding devices");
                  }
                }} 
                disabled={addingTargets.length === 0}
                className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow disabled:opacity-50"
              >
                Add {addingTargets.length} Devices
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
