import { Server, Shield, Download, Package } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";

const DOWNLOADS = [
  {
    name: "CentralDeployServer",
    version: "2.4.1",
    description: "Full web dashboard server with REST API, package repository, deployment engine, monitoring, RBAC, and scheduler.",
    icon: <Server className="w-6 h-6" />,
    color: "text-primary",
    bg: "bg-primary-dim",
    border: "border-primary/20",
    size: "~145 MB",
    file: "CentralDeployServer-Setup-2.4.1.exe",
    reqs: ["Windows Server 2016+ or Windows 10+", "4 GB RAM min (8 GB recommended)", ".NET 8.0 Runtime", "Port 8080 (configurable)"],
  },
  {
    name: "CentralDeployAgent",
    version: "2.4.1",
    description: "Lightweight Windows Service (3–5 MB). Registers with server, polls every 30–60s, downloads/verifies/installs packages, reports results.",
    icon: <Shield className="w-6 h-6" />,
    color: "text-success",
    bg: "bg-success-dim",
    border: "border-success/20",
    size: "~4.2 MB",
    file: "CentralDeployAgent-2.4.1.msi",
    reqs: ["Windows 7 SP1+ / Server 2008 R2+", "64 MB RAM", ".NET 4.8+ or .NET 8.0", "TCP outbound to server port"],
  },
  {
    name: "AutoAgentInstaller",
    version: "2.4.1",
    description: "Scans IP ranges, discovers Windows hosts, accepts admin credentials, silently pushes agent MSI to hundreds of PCs with retry.",
    icon: <Download className="w-6 h-6" />,
    color: "text-info",
    bg: "bg-info-dim",
    border: "border-info/20",
    size: "~22 MB",
    file: "AutoAgentInstaller-2.4.1.exe",
    reqs: ["Windows 10+ / Server 2016+", "Admin network access (SMB/WMI)", ".NET 8.0 Runtime", "Firewall: ports 135, 445 open on targets"],
  },
];

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title="Settings & Downloads"
        subtitle="Download installer packages and configure server settings"
      />

      {/* Download Packages */}
      <div>
        <h2 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider">📦 Installer Packages</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DOWNLOADS.map(pkg => (
            <div key={pkg.name} className={`card-enterprise p-5 border ${pkg.border} flex flex-col`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${pkg.bg} ${pkg.color}`}>
                  {pkg.icon}
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">{pkg.name}</p>
                  <p className="text-xs text-foreground-muted font-mono">v{pkg.version} · {pkg.size}</p>
                </div>
              </div>
              <p className="text-xs text-foreground-muted leading-relaxed mb-4 flex-1">{pkg.description}</p>
              <div className="mb-4">
                <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold mb-1.5">Requirements</p>
                <ul className="space-y-0.5">
                  {pkg.reqs.map(r => (
                    <li key={r} className="flex items-start gap-1.5 text-xs text-foreground-muted">
                      <span className="text-foreground-subtle shrink-0 mt-0.5">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <button className={`w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-all ${pkg.color} ${pkg.bg} border ${pkg.border} hover:brightness-125`}>
                <Download className="w-4 h-4" />
                Download {pkg.file.split(".").pop()?.toUpperCase()}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Server Config */}
      <SectionCard title="Server Configuration">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Server Port",              value: "8080" },
            { label: "Agent Poll Interval (sec)", value: "30" },
            { label: "Package Repository Path",   value: "C:\\CentralDeploy\\Repo" },
            { label: "Max Parallel Deployments",  value: "10" },
            { label: "Bandwidth Limit (MB/s)",    value: "50" },
            { label: "Log Retention (days)",       value: "90" },
          ].map(cfg => (
            <div key={cfg.label}>
              <label className="text-xs text-foreground-muted mb-1 block">{cfg.label}</label>
              <input
                defaultValue={cfg.value}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow">
            Save Configuration
          </button>
        </div>
      </SectionCard>

      {/* User Management */}
      <SectionCard title="User Management & RBAC">
        <div className="overflow-x-auto">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Last Login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[
                { user: "admin",  role: "Administrator", last: "2025-03-09 09:00", active: true },
                { user: "jsmith", role: "Operator",      last: "2025-03-09 08:15", active: true },
                { user: "lbrown", role: "Read-Only",     last: "2025-03-07 13:00", active: true },
                { user: "mking",  role: "Operator",      last: "2025-03-01 10:00", active: false },
              ].map(u => (
                <tr key={u.user}>
                  <td><span className="font-mono text-sm font-medium">{u.user}</span></td>
                  <td>
                    <span className={`badge-pill ${
                      u.role === "Administrator" ? "bg-primary-dim text-primary" :
                      u.role === "Operator"      ? "bg-info-dim text-info" :
                                                   "bg-surface-overlay text-foreground-muted"
                    }`}>{u.role}</span>
                  </td>
                  <td><span className="font-mono text-xs text-foreground-muted">{u.last}</span></td>
                  <td>
                    <span className={`badge-pill ${u.active ? "bg-success-dim text-success" : "bg-muted text-foreground-muted"}`}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button className="text-xs text-primary hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
