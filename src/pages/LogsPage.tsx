import { useState } from "react";
import { Search, Download, Filter } from "lucide-react";
import { mockActivityLog } from "@/data/mockData";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

const FULL_LOG = [
  { time: "2025-03-09 09:08", level: "info",    user: "system", action: "Deployment dep1 — WORKSTATION-03 downloading (74%)" },
  { time: "2025-03-09 09:07", level: "success",  user: "system", action: "Deployment dep1 — SERVER-APP-02 installed successfully" },
  { time: "2025-03-09 09:06", level: "success",  user: "system", action: "Deployment dep1 — SERVER-APP-01 installed successfully" },
  { time: "2025-03-09 09:05", level: "success",  user: "system", action: "Deployment dep1 — WORKSTATION-02 installed successfully" },
  { time: "2025-03-09 09:04", level: "success",  user: "system", action: "Deployment dep1 — WORKSTATION-01 installed successfully" },
  { time: "2025-03-09 09:03", level: "success",  user: "system", action: "Deployment dep1 — KIOSK-LOBBY-02 installed successfully" },
  { time: "2025-03-09 09:00", level: "info",     user: "admin",  action: "Started deployment dep1 (Security Patch KB5034441) to 10 devices" },
  { time: "2025-03-09 08:42", level: "info",     user: "admin",  action: "Package 'Security Patch KB5034441 v1.0.0' uploaded (87 MB)" },
  { time: "2025-03-09 08:40", level: "info",     user: "system", action: "Agent install job aj1 — LAPTOP-DEV-01 installing MSI" },
  { time: "2025-03-09 08:39", level: "success",  user: "system", action: "Agent install job aj1 — KIOSK-LOBBY-02 success" },
  { time: "2025-03-09 08:38", level: "error",    user: "system", action: "Agent install job aj1 — KIOSK-LOBBY-01 FAILED (port 445 closed)" },
  { time: "2025-03-09 08:37", level: "success",  user: "system", action: "Agent install job aj1 — SERVER-APP-01 success" },
  { time: "2025-03-09 08:36", level: "error",    user: "system", action: "Agent install job aj1 — WORKSTATION-04 FAILED (WMI access denied)" },
  { time: "2025-03-09 08:35", level: "success",  user: "system", action: "Agent install job aj1 — WORKSTATION-02, WORKSTATION-03 success" },
  { time: "2025-03-09 08:34", level: "success",  user: "system", action: "Agent install job aj1 — WORKSTATION-01 success" },
  { time: "2025-03-09 08:30", level: "info",     user: "admin",  action: "Started agent install job aj1 for range 192.168.1.1–254" },
  { time: "2025-03-08 15:00", level: "warning",  user: "system", action: "Device KIOSK-LOBBY-01 has not been seen for 30 minutes" },
  { time: "2025-03-08 09:30", level: "success",  user: "admin",  action: "Deployment dep2 — CRM Suite deployed to 12/12 devices" },
  { time: "2025-03-07 15:00", level: "error",    user: "jsmith", action: "Deployment dep4 — Office Config Pack FAILED on 2 devices" },
  { time: "2025-03-07 14:22", level: "info",     user: "admin",  action: "Security Patch uploaded by admin" },
  { time: "2025-03-06 12:00", level: "success",  user: "admin",  action: "Monitoring Agent v2.0.1 deployed to all 3 servers" },
  { time: "2025-03-05 14:00", level: "success",  user: "jsmith", action: "Agent install job aj2 — 15/15 devices installed successfully" },
  { time: "2025-03-01 09:00", level: "info",     user: "admin",  action: "CentralDeployServer v2.4.1 started" },
];

const levelStyles: Record<string, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-success-dim", text: "text-success",          dot: "bg-success" },
  error:   { bg: "bg-danger-dim",  text: "text-danger",           dot: "bg-danger" },
  warning: { bg: "bg-warning-dim", text: "text-warning",          dot: "bg-warning" },
  info:    { bg: "bg-surface-raised", text: "text-foreground-muted", dot: "bg-foreground-subtle" },
};

export default function LogsPage() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");

  const filtered = FULL_LOG.filter(e => {
    const matchSearch = e.action.toLowerCase().includes(search.toLowerCase()) || e.user.includes(search);
    const matchLevel = levelFilter === "all" || e.level === levelFilter;
    return matchSearch && matchLevel;
  });

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Logs & History"
        subtitle="Complete audit trail of all system events, deployments, and agent actions"
        actions={
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-foreground-muted text-xs hover:bg-surface-raised hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Events",  count: FULL_LOG.length,                                    cls: "text-foreground" },
          { label: "Success",       count: FULL_LOG.filter(e => e.level === "success").length, cls: "text-success" },
          { label: "Errors",        count: FULL_LOG.filter(e => e.level === "error").length,   cls: "text-danger" },
          { label: "Warnings",      count: FULL_LOG.filter(e => e.level === "warning").length, cls: "text-warning" },
        ].map(s => (
          <div key={s.label} className="card-enterprise p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wider mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold", s.cls)}>{s.count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {["all", "success", "error", "warning", "info"].map(l => (
          <button
            key={l}
            onClick={() => setLevelFilter(l)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md border transition-all capitalize",
              levelFilter === l
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-surface border-border text-foreground-muted hover:text-foreground"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <SectionCard>
        <div className="divide-y divide-border max-h-[calc(100vh-20rem)] overflow-y-auto">
          {filtered.map((entry, i) => {
            const s = levelStyles[entry.level] ?? levelStyles.info;
            return (
              <div key={i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-surface/30 transition-colors">
                <span className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", s.dot)} />
                <span className="text-xs font-mono text-foreground-subtle shrink-0 w-36">{entry.time}</span>
                <span className={cn("badge-pill shrink-0 text-[10px]", s.bg, s.text, "capitalize")}>{entry.level}</span>
                <span className="text-xs font-mono text-primary shrink-0 w-14">{entry.user}</span>
                <span className="text-xs text-foreground">{entry.action}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-foreground-muted">No events match the current filter.</div>
          )}
        </div>
        <div className="px-5 py-2.5 border-t border-border text-xs text-foreground-muted">
          {filtered.length} of {FULL_LOG.length} events
        </div>
      </SectionCard>
    </div>
  );
}
