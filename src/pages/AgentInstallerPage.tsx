import { useState } from "react";
import { Search, Play, RefreshCw, Network, Shield, ChevronDown, ChevronRight, Wifi } from "lucide-react";
import { mockAgentJobs, mockAgentTargets } from "@/data/mockData";
import { StatusBadge, PageHeader, SectionCard, StatCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

export default function AgentInstallerPage() {
  const [showNewJob, setShowNewJob] = useState(false);
  const [expanded, setExpanded] = useState<string | null>("aj1");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

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

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Auto Agent Installer"
        subtitle="Scan IP ranges, discover Windows hosts, and silently push CentralDeployAgent MSI"
        actions={
          <button
            onClick={() => setShowNewJob(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
          >
            <Network className="w-3.5 h-3.5" /> New Install Job
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Jobs"    value={mockAgentJobs.length} icon={<Network className="w-5 h-5" />} />
        <StatCard label="Agents Installed" value={mockAgentJobs.reduce((a, j) => a + j.success_count, 0)} variant="success" icon={<Shield className="w-5 h-5" />} />
        <StatCard label="Failed"        value={mockAgentJobs.reduce((a, j) => a + j.failed_count, 0)}  variant="danger"  icon={<Shield className="w-5 h-5" />} />
        <StatCard label="Pending"       value={mockAgentJobs.reduce((a, j) => a + j.pending_count, 0)} variant="default" icon={<Shield className="w-5 h-5" />} />
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
                <input
                  defaultValue="192.168.1.1 – 192.168.1.254"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-background/50 border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                onClick={startScan}
                disabled={scanning}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow disabled:opacity-60"
              >
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
      <SectionCard title="Install Jobs">
        <div className="divide-y divide-border">
          {mockAgentJobs.map(job => (
            <div key={job.id}>
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface/40 transition-colors"
                onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              >
                <button className="text-foreground-muted shrink-0">
                  {expanded === job.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-sm text-foreground">{job.ip_range}</span>
                    <span className="badge-pill bg-surface-overlay text-foreground-muted text-xs">{job.total} hosts</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden flex w-48">
                    <div className="h-full bg-success transition-all" style={{ width: `${(job.success_count / job.total) * 100}%` }} />
                    <div className="h-full bg-danger transition-all" style={{ width: `${(job.failed_count / job.total) * 100}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-foreground-muted">
                  <span className="text-success font-semibold">{job.success_count} ✓</span>
                  <span className="text-danger font-semibold">{job.failed_count} ✗</span>
                  <span className="text-foreground-subtle">{job.pending_count} pending</span>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs text-foreground-muted">{job.created_by}</p>
                  <p className="text-xs font-mono text-foreground-subtle">{job.created_at}</p>
                </div>
              </div>

              {expanded === job.id && (
                <div className="bg-background-subtle border-t border-border overflow-x-auto">
                  <table className="table-enterprise">
                    <thead>
                      <tr>
                        <th>IP Address</th>
                        <th>Hostname</th>
                        <th>Status</th>
                        <th>Log</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockAgentTargets.filter(t => t.job_id === job.id).map(t => (
                        <tr key={t.device_ip}>
                          <td><span className="font-mono text-sm">{t.device_ip}</span></td>
                          <td><span className="font-mono text-sm text-foreground-muted">{t.hostname}</span></td>
                          <td><StatusBadge status={t.status} size="xs" /></td>
                          <td><span className="font-mono text-xs text-foreground-muted truncate max-w-64 block">{t.log}</span></td>
                          <td><span className="font-mono text-xs text-foreground-muted">{t.updated_at}</span></td>
                          <td>
                            {t.status === "failed" && (
                              <button className="text-xs text-warning hover:underline flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" /> Retry
                              </button>
                            )}
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

      {/* New Job Modal */}
      {showNewJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNewJob(false)}>
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-lg animate-fade-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground mb-4">New Agent Install Job</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-foreground-muted mb-1 block">IP Range</label>
                <input defaultValue="192.168.1.1 – 192.168.1.254" className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-foreground-muted mb-1 block">Admin Username</label>
                <input defaultValue="Administrator" className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs text-foreground-muted mb-1 block">Admin Password</label>
                <input type="password" className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-foreground-muted mb-1 block">Parallel Threads</label>
                  <input type="number" defaultValue={10} min={1} max={50} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="text-xs text-foreground-muted mb-1 block">Retry Attempts</label>
                  <input type="number" defaultValue={3} min={1} max={10} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              <p className="text-xs text-info bg-info-dim rounded p-2">Credentials are used once for WMI/SMB push and are not stored.</p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowNewJob(false)} className="flex-1 py-2 text-sm border border-border rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-raised transition-colors">Cancel</button>
                <button onClick={() => setShowNewJob(false)} className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow">Start Install Job</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
