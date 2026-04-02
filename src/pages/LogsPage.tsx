import { useEffect, useMemo, useState } from "react";
import { Search, Download, Activity } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type LogEntry = {
  id: number;
  time: string;
  user: string;
  action: string;
  level?: string;
  created_at?: string;
};

const levelStyles: Record<string, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-success-dim", text: "text-success", dot: "bg-success" },
  error: { bg: "bg-danger-dim", text: "text-danger", dot: "bg-danger" },
  warning: { bg: "bg-warning-dim", text: "text-warning", dot: "bg-warning" },
  info: { bg: "bg-surface-raised", text: "text-foreground-muted", dot: "bg-foreground-subtle" },
};

const parseContentDispositionFilename = (headerValue: string | null) => {
  if (!headerValue) return null;
  const match = headerValue.match(/filename="?(?<filename>[^"]+)"?/i);
  return match?.groups?.filename ?? null;
};

export default function LogsPage() {
  const { user } = useAuth();
  const userKey = user?.id || user?.username;
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!userKey) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (dateFilter) params.set("date", dateFilter);

        const res = await fetch(`/api/activity-log${params.toString() ? `?${params.toString()}` : ""}`, {
          headers: { "X-User-Id": userKey },
        });

        if (!res.ok) {
          throw new Error("Failed to fetch logs");
        }

        setLogs(await res.json());
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userKey, dateFilter]);

  const filtered = useMemo(() => {
    return logs.filter((entry) => {
      const normalizedSearch = search.toLowerCase();
      const matchSearch =
        entry.action?.toLowerCase().includes(normalizedSearch) ||
        entry.user?.toLowerCase().includes(normalizedSearch);
      const matchLevel = levelFilter === "all" || (entry.level ?? "info") === levelFilter;
      return matchSearch && matchLevel;
    });
  }, [logs, search, levelFilter]);

  const exportCsv = async () => {
    if (!userKey) {
      window.alert("Session user tidak ditemukan. Silakan login ulang.");
      return;
    }

    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);

      const res = await fetch(`/api/activity-log/export${params.toString() ? `?${params.toString()}` : ""}`, {
        headers: { "X-User-Id": userKey },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Export CSV gagal.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename =
        parseContentDispositionFilename(res.headers.get("Content-Disposition")) ||
        `activity-log-${dateFilter || "all-dates"}.csv`;

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Export CSV gagal.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Logs & History"
        subtitle={
          user?.is_admin
            ? "Complete audit trail across all users and system events"
            : `Audit trail untuk user ${user?.username}. Admin dapat melihat semua log.`
        }
        actions={
          <button
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-foreground-muted text-xs hover:bg-surface-raised hover:text-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" /> {exporting ? "Exporting..." : "Export CSV"}
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Events", count: logs.length, cls: "text-foreground" },
          { label: "Success", count: logs.filter((e) => e.level === "success").length, cls: "text-success" },
          { label: "Errors", count: logs.filter((e) => e.level === "error").length, cls: "text-danger" },
          { label: "Warnings", count: logs.filter((e) => e.level === "warning").length, cls: "text-warning" },
        ].map((stat) => (
          <div key={stat.label} className="card-enterprise p-4">
            <p className="text-xs text-foreground-muted uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={cn("text-2xl font-bold", stat.cls)}>{stat.count}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Filter by date"
        />

        {["all", "success", "error", "warning", "info"].map((level) => (
          <button
            key={level}
            onClick={() => setLevelFilter(level)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md border transition-all capitalize",
              levelFilter === level
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-surface border-border text-foreground-muted hover:text-foreground"
            )}
          >
            {level}
          </button>
        ))}
      </div>

      <SectionCard>
        <div className="divide-y divide-border max-h-[calc(100vh-20rem)] overflow-y-auto">
          {filtered.map((entry) => {
            const levelKey = entry.level ?? "info";
            const style = levelStyles[levelKey] ?? levelStyles.info;

            return (
              <div key={entry.id} className="flex items-start gap-3 px-5 py-2.5 hover:bg-surface/30 transition-colors">
                <span className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", style.dot)} />
                <span className="text-xs font-mono text-foreground-subtle shrink-0 w-36">{entry.time}</span>
                <span className={cn("badge-pill shrink-0 text-[10px]", style.bg, style.text, "capitalize")}>{levelKey}</span>
                <span className="text-xs font-mono text-primary shrink-0 w-24 truncate" title={entry.user}>
                  {entry.user}
                </span>
                <span className="text-xs text-foreground">{entry.action}</span>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-foreground-muted">No events match the current filter.</div>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-border text-xs text-foreground-muted flex items-center justify-between gap-3">
          <span>{filtered.length} of {logs.length} events</span>
          <span>Export mengambil semua log dalam scope akses Anda{dateFilter ? ` untuk tanggal ${dateFilter}` : ""}.</span>
        </div>
      </SectionCard>
    </div>
  );
}
