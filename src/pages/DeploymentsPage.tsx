import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, Rocket, Clock, CheckCircle, XCircle } from "lucide-react";
import { mockDeployments, mockDeploymentTargets, mockPackages, mockDevices, mockGroups } from "@/data/mockData";
import { StatusBadge, PageHeader, SectionCard, DeployProgressSummary } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

export default function DeploymentsPage() {
  const [expanded, setExpanded] = useState<string | null>("dep1");
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Deployments"
        subtitle="Create, schedule and monitor software deployments across your fleet"
        actions={
          <button
            onClick={() => { setShowWizard(true); setWizardStep(1); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow"
          >
            <Plus className="w-3.5 h-3.5" /> New Deployment
          </button>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Running",   count: mockDeployments.filter(d => d.status === "running").length,   cls: "text-primary" },
          { label: "Scheduled", count: mockDeployments.filter(d => d.status === "scheduled").length, cls: "text-info" },
          { label: "Success",   count: mockDeployments.filter(d => d.status === "success").length,   cls: "text-success" },
          { label: "Failed",    count: mockDeployments.filter(d => d.status === "failed").length,    cls: "text-danger" },
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
          {mockDeployments.map(dep => (
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

                <div className="text-right shrink-0">
                  <p className="text-xs text-foreground-muted">{dep.created_by}</p>
                  <p className="text-xs text-foreground-subtle font-mono">{dep.created_at}</p>
                </div>
              </div>

              {/* Expanded targets */}
              {expanded === dep.id && (
                <div className="bg-background-subtle border-t border-border">
                  {dep.id === "dep1" ? (
                    <div className="overflow-x-auto">
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
                          {mockDeploymentTargets.filter(t => t.deployment_id === dep.id).map(t => (
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
                                <span className="text-xs text-foreground-muted font-mono truncate max-w-56 block">{t.log}</span>
                              </td>
                              <td><span className="text-xs font-mono text-foreground-muted">{t.updated_at}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowWizard(false)}>
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
                  {mockPackages.map(pkg => (
                    <label key={pkg.id} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-surface-raised transition-all">
                      <input type="radio" name="pkg" className="accent-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{pkg.name}</p>
                        <p className="text-xs text-foreground-muted">v{pkg.version} · {pkg.type.toUpperCase()} · {pkg.size}</p>
                      </div>
                    </label>
                  ))}
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">Target Path</label>
                    <input defaultValue="C:\Program Files\" className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
                  </div>
                </div>
              )}
              {wizardStep === 2 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Select Targets</h3>
                  <p className="text-xs text-foreground-muted mb-2">Groups</p>
                  {mockGroups.map(g => (
                    <label key={g.id} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-surface-raised transition-all">
                      <input type="checkbox" className="accent-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{g.name}</p>
                        <p className="text-xs text-foreground-muted">{g.device_count} devices</p>
                      </div>
                    </label>
                  ))}
                  <p className="text-xs text-foreground-muted mt-3 mb-2">Individual Devices</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {mockDevices.map(d => (
                      <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-raised cursor-pointer">
                        <input type="checkbox" className="accent-primary" />
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
                    <label className="flex items-center gap-3 p-3 border border-primary/30 bg-primary/5 rounded-lg cursor-pointer">
                      <input type="radio" name="sched" defaultChecked className="accent-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Deploy immediately</p>
                        <p className="text-xs text-foreground-muted">Start as soon as agents acknowledge</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-primary/30">
                      <input type="radio" name="sched" className="accent-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Schedule for later</p>
                        <input type="datetime-local" className="mt-1 text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">Bandwidth Limit (MB/s)</label>
                    <input type="range" min="1" max="100" defaultValue="50" className="w-full accent-primary" />
                    <div className="flex justify-between text-xs text-foreground-muted"><span>1 MB/s</span><span>Unlimited</span></div>
                  </div>
                </div>
              )}
              {wizardStep === 4 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Review & Confirm</h3>
                  <div className="bg-background-subtle rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-foreground-muted">Package</span><span className="text-foreground font-medium">CRM Suite v4.2.1</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Target Path</span><span className="text-foreground font-mono text-xs">C:\Program Files\</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Targets</span><span className="text-foreground font-medium">All Workstations (5 devices)</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Schedule</span><span className="text-foreground font-medium">Immediate</span></div>
                    <div className="flex justify-between"><span className="text-foreground-muted">Bandwidth</span><span className="text-foreground font-medium">50 MB/s</span></div>
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
                onClick={() => wizardStep < 4 ? setWizardStep(s => s + 1) : setShowWizard(false)}
                className="ml-auto px-5 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow"
              >
                {wizardStep < 4 ? "Next →" : "🚀 Deploy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
