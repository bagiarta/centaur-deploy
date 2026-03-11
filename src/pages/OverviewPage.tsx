import { useState } from "react";
import { Monitor, Package, Rocket, Download, Activity, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { StatCard, StatusBadge, SectionCard, PageHeader, DeployProgressSummary } from "@/components/ui-enterprise";
import { mockDevices, mockDeployments, mockPackages, mockActivityLog } from "@/data/mockData";

export default function OverviewPage() {
  const online    = mockDevices.filter(d => d.status === "online").length;
  const offline   = mockDevices.filter(d => d.status === "offline").length;
  const deploying = mockDevices.filter(d => d.status === "deploying").length;
  const errored   = mockDevices.filter(d => d.status === "error").length;
  const activeDeployments = mockDeployments.filter(d => d.status === "running").length;
  const scheduledDeployments = mockDeployments.filter(d => d.status === "scheduled").length;

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title="Overview"
        subtitle="Central Software Deployment ULTIMATE — Enterprise Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-muted font-mono">Last refresh: just now</span>
            <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
          </div>
        }
      />

      {/* Hero Banner */}
      <div className="relative rounded-xl border border-primary/20 overflow-hidden p-6"
        style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: "repeating-linear-gradient(90deg, hsl(213 90% 55%) 0, hsl(213 90% 55%) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(0deg, hsl(213 90% 55%) 0, hsl(213 90% 55%) 1px, transparent 1px, transparent 60px)"
        }} />
        <div className="relative flex items-center gap-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/20 border border-primary/30 shadow-glow">
            <Activity className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">System Operational</h2>
            <p className="text-sm text-foreground-muted mt-0.5">
              {mockDevices.length} devices enrolled · {activeDeployments} active deployment{activeDeployments !== 1 ? "s" : ""} · {mockPackages.length} packages in repository
            </p>
          </div>
          {activeDeployments > 0 && (
            <div className="ml-auto flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse-dot" />
              <span className="text-sm text-primary font-semibold">{activeDeployments} deployment running</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Devices Online"
          value={online}
          sub={`of ${mockDevices.length} enrolled`}
          icon={<Monitor className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Active Deployments"
          value={activeDeployments}
          sub={`${scheduledDeployments} scheduled`}
          icon={<Rocket className="w-5 h-5" />}
          variant="primary"
        />
        <StatCard
          label="Packages"
          value={mockPackages.length}
          sub="in repository"
          icon={<Package className="w-5 h-5" />}
          variant="default"
        />
        <StatCard
          label="Devices with Issues"
          value={errored + offline}
          sub={`${errored} errors · ${offline} offline`}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant={errored > 0 ? "danger" : "warning"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device Status */}
        <SectionCard title="Device Status Breakdown" className="col-span-1">
          <div className="p-5 space-y-3">
            {[
              { label: "Online",    count: online,    total: mockDevices.length, color: "bg-success" },
              { label: "Deploying", count: deploying, total: mockDevices.length, color: "bg-primary" },
              { label: "Idle",      count: mockDevices.filter(d => d.status === "idle").length, total: mockDevices.length, color: "bg-foreground-subtle" },
              { label: "Offline",   count: offline,   total: mockDevices.length, color: "bg-muted-foreground" },
              { label: "Error",     count: errored,   total: mockDevices.length, color: "bg-danger" },
            ].map(row => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground-muted">{row.label}</span>
                  <span className="text-foreground font-semibold font-mono">{row.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${row.color} transition-all duration-700`}
                    style={{ width: `${(row.count / row.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Active Deployments */}
        <SectionCard title="Recent Deployments" className="col-span-1 lg:col-span-2">
          <div className="divide-y divide-border">
            {mockDeployments.slice(0, 4).map(dep => (
              <div key={dep.id} className="px-5 py-3 hover:bg-surface/40 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{dep.package_name}</p>
                    <p className="text-xs text-foreground-muted">v{dep.package_version} · by {dep.created_by}</p>
                  </div>
                  <StatusBadge status={dep.status} size="xs" />
                </div>
                <DeployProgressSummary
                  total={dep.total_targets}
                  success={dep.success_count}
                  failed={dep.failed_count}
                  pending={dep.pending_count}
                />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Activity Log */}
      <SectionCard title="Activity Log" subtitle="Real-time system events">
        <div className="divide-y divide-border max-h-64 overflow-y-auto">
          {mockActivityLog.map((entry, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-surface/40 transition-colors">
              <span className="text-xs font-mono text-foreground-subtle shrink-0 mt-0.5 w-10">{entry.time}</span>
              <span className="text-xs text-foreground-muted font-mono text-primary shrink-0">{entry.user}</span>
              <span className="text-xs text-foreground">{entry.action}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
