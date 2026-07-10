import React, { useState, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { 
  ShieldAlert, CheckCircle2, Clock, AlertOctagon, Wrench, RefreshCcw, 
  MapPin, AlertTriangle, Play, RefreshCw, ClipboardList, Loader2
} from "lucide-react";
import { PageHeader, SectionCard, StatCard, ProgressBar } from "@/components/ui-enterprise";
import { toast } from "sonner";

interface Stats {
  pending_schedules: number;
  completed_pms: number;
  active_action_items: number;
  replacement_needed: number;
}

interface ProblematicDevice {
  device_category: string;
  device_name: string;
  fail_count: number;
}

interface StoreHealth {
  store_code: string;
  store_name: string;
  good_count: number;
  total_count: number;
  health_percentage: number;
}

interface RecurringFailure {
  store_name: string;
  device_category: string;
  device_name: string;
  issues_found: string;
  execution_date: string;
  pic_name: string;
}

interface AnalyticsData {
  stats: Stats;
  problematicDevices: ProblematicDevice[];
  storeHealth: StoreHealth[];
  recurringFailures: RecurringFailure[];
}

const formatLocalDate = (dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return "";
  const cleanStr = dateStr.endsWith("Z") ? dateStr.slice(0, -1) : dateStr;
  return new Date(cleanStr).toLocaleDateString("id-ID", options);
};

export default function PMDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/trial/support-manager/analytics");
      if (!res.ok) throw new Error("Failed to load analytics data");
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      toast.error(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center bg-background/50">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-foreground-muted animate-pulse">Loading Support Manager Analytics...</p>
      </div>
    );
  }

  const stats = data?.stats || { pending_schedules: 0, completed_pms: 0, active_action_items: 0, replacement_needed: 0 };
  const problematicDevices = data?.problematicDevices || [];
  const storeHealth = data?.storeHealth || [];
  const recurringFailures = data?.recurringFailures || [];

  // Colors for chart bars
  const CHART_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];

  return (
    <div className="p-6 h-full flex flex-col gap-6 overflow-y-auto animate-fade-up">
      <PageHeader 
        title="PM Dashboard & Analytics" 
        subtitle="Preventive maintenance statistics, store device health index, and recurring issues tracking (Trial Mode)"
        actions={
          <button 
            onClick={fetchAnalytics}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-raised border border-border text-foreground rounded-lg font-medium hover:bg-surface-overlay transition-all shadow-sm text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Data
          </button>
        }
      />

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Completed PM Checklists" 
          value={stats.completed_pms} 
          icon={<CheckCircle2 className="w-5 h-5 text-success" />}
          variant="success"
          sub="Total store checkups completed"
        />
        <StatCard 
          label="Pending PM Schedules" 
          value={stats.pending_schedules} 
          icon={<Clock className="w-5 h-5 text-warning" />}
          variant="warning"
          sub="Schedules waiting execution"
        />
        <StatCard 
          label="Active Action Items" 
          value={stats.active_action_items} 
          icon={<Wrench className="w-5 h-5 text-danger" />}
          variant="danger"
          sub="Repairs & adjustments in progress"
        />
        <StatCard 
          label="Replacements Needed" 
          value={stats.replacement_needed} 
          icon={<RefreshCcw className="w-5 h-5 text-primary" />}
          variant="primary"
          sub="Devices flagged for swap/upgrade"
        />
      </div>

      {/* Main Charts & Rankings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Problematic Devices */}
        <SectionCard className="flex flex-col h-[400px]">
          <div className="mb-4">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Most Problematic Devices</h3>
            <p className="text-xs text-foreground-muted">Device components with the highest fail rates during PM checks</p>
          </div>
          <div className="flex-1 min-h-0">
            {problematicDevices.length === 0 ? (
              <div className="h-full flex items-center justify-center text-foreground-muted italic text-sm">
                No problematic devices recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={problematicDevices.slice(0, 7)}
                  margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="device_name" 
                    tick={{ fill: 'var(--foreground-muted)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis 
                    allowDecimals={false}
                    tick={{ fill: 'var(--foreground-muted)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--card)', 
                      borderColor: 'var(--border)', 
                      color: 'var(--foreground)',
                      fontSize: 12,
                      borderRadius: 8
                    }} 
                  />
                  <Bar dataKey="fail_count" radius={[4, 4, 0, 0]}>
                    {problematicDevices.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        {/* Store Device Health rankings */}
        <SectionCard className="flex flex-col h-[400px]">
          <div className="mb-4">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Store Device Health Rankings</h3>
            <p className="text-xs text-foreground-muted">Stores ordered by lowest percentage of operational devices checked</p>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {storeHealth.length === 0 ? (
              <div className="h-full flex items-center justify-center text-foreground-muted italic text-sm">
                No store health calculations available. Complete a PM first.
              </div>
            ) : (
              storeHealth.map((store) => {
                let colorClass = "bg-success";
                if (store.health_percentage < 60) colorClass = "bg-danger";
                else if (store.health_percentage < 85) colorClass = "bg-warning";
                
                return (
                  <div key={store.store_code} className="space-y-1.5 p-3 rounded-lg bg-surface-raised border border-border hover:border-foreground-subtle transition-all">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        {store.store_name} ({store.store_code})
                      </div>
                      <div className="font-mono font-bold text-foreground">
                        {store.good_count}/{store.total_count} ({store.health_percentage}%)
                      </div>
                    </div>
                    <ProgressBar value={store.health_percentage} colorClass={colorClass} />
                  </div>
                );
              })
            )}
          </div>
        </SectionCard>
      </div>

      {/* Recurring Issues & Tracking */}
      <SectionCard className="flex flex-col">
        <div className="mb-6 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning animate-pulse" />
          <div>
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">Frequently Broken / Recurring Issues</h3>
            <p className="text-xs text-foreground-muted">Devices flagged with issues in multiple PM checks (still problematic)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-raised">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Store Name</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Category</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Device Name</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Issue Details</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Checked Date</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">PIC Store</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recurringFailures.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted italic text-sm">
                    No recurring device issues detected. All resolved or in good state!
                  </td>
                </tr>
              ) : (
                recurringFailures.map((item, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3.5 font-medium text-sm text-foreground">{item.store_name}</td>
                    <td className="px-4 py-3.5 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                        {item.device_category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-foreground font-semibold">{item.device_name}</td>
                    <td className="px-4 py-3.5 text-sm text-danger-foreground bg-danger-dim/35 rounded-md px-2 py-1 max-w-xs truncate" title={item.issues_found}>
                      {item.issues_found}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground-muted">
                      {formatLocalDate(item.execution_date, { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-foreground-subtle">{item.pic_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
