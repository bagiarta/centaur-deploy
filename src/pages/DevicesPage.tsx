import { useState } from "react";
import { Search, Filter, RefreshCw, Plus, ChevronDown, Cpu, HardDrive, MemoryStick, Wifi } from "lucide-react";
import { mockDevices, mockGroups, Device } from "@/data/mockData";
import { StatusBadge, PageHeader, SectionCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

export default function DevicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Device | null>(null);

  const filtered = mockDevices.filter(d => {
    const matchSearch = d.hostname.toLowerCase().includes(search.toLowerCase())
      || d.ip.includes(search);
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Device Inventory"
        subtitle={`${mockDevices.length} devices enrolled across ${mockGroups.length} groups`}
        actions={
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-glow">
            <Plus className="w-3.5 h-3.5" /> Add Device
          </button>
        }
      />

      {/* Groups */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {mockGroups.map(g => (
          <div key={g.id} className="card-enterprise p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold mb-1">{g.name}</p>
            <p className="text-2xl font-bold text-foreground">{g.device_count}</p>
            <p className="text-xs text-foreground-muted">devices</p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hostname or IP..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {["all", "online", "offline", "deploying", "error", "idle"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md border transition-all capitalize",
              statusFilter === s
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-surface border-border text-foreground-muted hover:text-foreground"
            )}
          >
            {s}
          </button>
        ))}
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-foreground-muted border border-border rounded-md hover:text-foreground hover:bg-surface transition-all">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Table */}
      <SectionCard>
        <div className="overflow-x-auto">
          <table className="table-enterprise">
            <thead>
              <tr>
                <th>Hostname</th>
                <th>IP Address</th>
                <th>OS Version</th>
                <th>CPU</th>
                <th>RAM / Disk</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        d.status === "online" ? "bg-success" :
                        d.status === "offline" ? "bg-muted-foreground" :
                        d.status === "deploying" ? "bg-primary animate-pulse-dot" :
                        d.status === "error" ? "bg-danger" : "bg-foreground-subtle"
                      )} />
                      <span className="font-mono text-sm font-medium">{d.hostname}</span>
                    </div>
                  </td>
                  <td><span className="font-mono text-foreground-muted">{d.ip}</span></td>
                  <td><span className="text-xs text-foreground-muted">{d.os_version}</span></td>
                  <td><span className="text-xs text-foreground-muted truncate max-w-32 block">{d.cpu}</span></td>
                  <td>
                    <span className="text-xs text-foreground-muted">{d.ram} / {d.disk}</span>
                  </td>
                  <td><span className="font-mono text-xs text-foreground-muted">{d.agent_version}</span></td>
                  <td><StatusBadge status={d.status} /></td>
                  <td><span className="text-xs text-foreground-muted">{d.last_seen}</span></td>
                  <td>
                    <button className="text-xs text-primary hover:underline">Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t border-border text-xs text-foreground-muted">
          Showing {filtered.length} of {mockDevices.length} devices
        </div>
      </SectionCard>

      {/* Device Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" />
          <div
            className="w-96 bg-surface border-l border-border overflow-y-auto animate-slide-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground font-mono">{selected.hostname}</p>
                <p className="text-xs text-foreground-muted">{selected.ip}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <button onClick={() => setSelected(null)} className="text-foreground-muted hover:text-foreground ml-2 text-lg">×</button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {[
                { icon: <Wifi className="w-4 h-4" />,        label: "OS Version",    value: selected.os_version },
                { icon: <Cpu className="w-4 h-4" />,         label: "CPU",           value: selected.cpu },
                { icon: <MemoryStick className="w-4 h-4" />, label: "RAM",           value: selected.ram },
                { icon: <HardDrive className="w-4 h-4" />,   label: "Disk",          value: selected.disk },
                { icon: null,                                  label: "Agent Version", value: selected.agent_version },
                { icon: null,                                  label: "Last Seen",     value: selected.last_seen },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-3">
                  {row.icon && <div className="text-foreground-muted shrink-0">{row.icon}</div>}
                  <div>
                    <p className="text-xs text-foreground-muted">{row.label}</p>
                    <p className="text-sm font-medium text-foreground">{row.value}</p>
                  </div>
                </div>
              ))}

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-foreground-muted mb-2 uppercase tracking-wider font-semibold">Groups</p>
                <div className="flex flex-wrap gap-1">
                  {selected.group_ids.map(gid => {
                    const g = mockGroups.find(g => g.id === gid);
                    return g ? (
                      <span key={gid} className="badge-pill bg-primary-dim text-primary text-xs">{g.name}</span>
                    ) : null;
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold">Remote Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {["Restart PC", "Run Script", "Update Agent", "View Logs"].map(action => (
                    <button key={action} className="px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-surface-raised hover:text-foreground text-foreground-muted transition-colors">
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
