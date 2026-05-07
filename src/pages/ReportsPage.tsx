import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import {
  Activity, ShieldAlert, Package, CheckCircle, XCircle,
  Monitor, HardDrive, Cpu, AlertTriangle, ArrowUpRight, RefreshCw
} from "lucide-react";
import {
  StatCard, SectionCard, PageHeader, StatusBadge
} from "@/components/ui-enterprise";

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

export default function ReportsPage() {
  const [deploymentStats, setDeploymentStats] = useState<any>(null);
  const [ticketStats, setTicketStats] = useState<any[]>([]);
  const [healthData, setHealthData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [crmSyncData, setCrmSyncData] = useState<any[]>([]);
  const [crmLoading, setCrmLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [drawerPosition, setDrawerPosition] = useState<{ top: number; right: number; show: boolean }>({ top: 0, right: 0, show: false });

  const fetchCrmSync = async () => {
    setCrmLoading(true);
    try {
      const res = await fetch('/api/reports/crm-sync');
      if (res.ok) {
        const data = await res.json();
        // Sort: Yesterday (left/first) → Today (right/second)
        const sorted = [...data].sort((a: any, b: any) => {
          if (a.label.toLowerCase() === 'yesterday') return -1;
          if (b.label.toLowerCase() === 'yesterday') return 1;
          return 0;
        });
        // Normalize casing for display
        const normalized = sorted.map((r: any) => ({
          ...r,
          label: r.label.toLowerCase() === 'yesterday' ? 'Yesterday' : 'Today'
        }));
        setCrmSyncData(normalized);
      }
    } catch (err) {
      console.error("Failed to fetch CRM sync data:", err);
    } finally {
      setCrmLoading(false);
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const [depRes, healthRes, invRes, ticketRes] = await Promise.all([
          fetch('/api/reports/deployments'),
          fetch('/api/reports/health'),
          fetch('/api/reports/inventory'),
          fetch('/api/reports/tickets')
        ]);

        setDeploymentStats(await depRes.json());
        setHealthData(await healthRes.json());
        setInventoryData(await invRes.json());
        setTicketStats(await ticketRes.json());
      } catch (err) {
        console.error("Failed to fetch report data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    fetchCrmSync();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Activity className="w-12 h-12 text-primary animate-spin" />
        <p className="text-foreground-muted animate-pulse">Generating enterprise reports...</p>
      </div>
    );
  }

  // Process data for charts
  const depChartData = deploymentStats?.targets?.map((t: any) => ({
    name: t.status.charAt(0).toUpperCase() + t.status.slice(1),
    value: t.count
  })) || [];

  const ticketChartData = ticketStats?.map((t: any) => ({
    name: t.status,
    value: t.count
  })) || [];

  const TICKET_COLORS = ['#ef4444', '#f59e0b', '#eb0cd8ff', '#02f737ff'];

  const needsUpgrade = healthData.filter(d => d.needsUpgrade);
  const lowRam = healthData.filter(d => d.isLowRam).length;
  const lowDisk = healthData.filter(d => d.isLowDisk).length;

  // CRM derived stats
  const crmToday = crmSyncData.find((r: any) => r.label === 'Today');
  const crmTodayTotal = crmToday ? crmToday.total : 0;
  const crmTodaySynced = crmToday ? crmToday.synced_count : 0;
  const crmTodayPending = crmToday ? crmToday.pending_count : 0;
  const crmSuccessRate = crmTodayTotal > 0
    ? Math.round((crmTodaySynced / crmTodayTotal) * 100)
    : null;

  const handleShowDetails = (e: React.MouseEvent, device: any) => {
    e.stopPropagation();
    const button = e.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    const drawerWidth = 384;
    const spacing = 20;
    let rightPos = window.innerWidth - rect.right - spacing;
    if (rect.right + drawerWidth + spacing > window.innerWidth) {
      rightPos = spacing;
    }
    const topPosition = rect.bottom + spacing;
    setDrawerPosition({ top: topPosition, right: rightPos, show: true });
    setSelectedDevice(device);
  };

  const closeDrawer = () => {
    setSelectedDevice(null);
    setDrawerPosition({ top: 0, right: 0, show: false });
  };

  // Custom tooltip for CRM bar chart
  const CrmTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const synced = payload.find((p: any) => p.dataKey === 'synced_count')?.value || 0;
      const pending = payload.find((p: any) => p.dataKey === 'pending_count')?.value || 0;
      const total = synced + pending;
      const pct = total > 0 ? Math.round((synced / total) * 100) : 0;
      return (
        <div className="bg-surface border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
          <p className="font-bold text-foreground">{label}</p>
          <p className="text-success">✅ Sync Success: <strong>{synced}</strong></p>
          <p className="text-danger">❌ Pending/Failed: <strong>{pending}</strong></p>
          <p className="text-foreground-muted">Total: {total} ({pct}% sukses)</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Operational insights and hardware health monitoring"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Upgrade Alerts"
          value={needsUpgrade.length}
          sub={`${lowRam} Low RAM · ${lowDisk} Low Disk`}
          icon={<ShieldAlert className="w-5 h-5" />}
          variant={needsUpgrade.length > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Avg Deployment Success"
          value={
            deploymentStats?.targets?.length > 0
              ? Math.round((deploymentStats.targets.find((t: any) => t.status === 'success')?.count || 0) /
                deploymentStats.targets.reduce((acc: any, t: any) => acc + t.count, 0) * 100) + "%"
              : "0%"
          }
          sub="per target basis"
          icon={<CheckCircle className="w-5 h-5" />}
          variant="primary"
        />
        <StatCard
          label="Total Software Assets"
          value={inventoryData.reduce((acc, item) => acc + item.count, 0)}
          sub="across all managed devices"
          icon={<Package className="w-5 h-5" />}
          variant="default"
        />
        <StatCard
          label="Today's CRM Sync"
          value={crmLoading ? "..." : crmSuccessRate !== null ? `${crmSuccessRate}%` : "N/A"}
          sub={crmLoading ? "Loading..." : `${crmTodaySynced} success · ${crmTodayPending} pending`}
          icon={<RefreshCw className={cn("w-5 h-5", crmLoading && "animate-spin")} />}
          variant={crmTodayPending > 5 ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Deployment Performance Chart */}
        <SectionCard title="Deployments" subtitle="Success vs Failure">
          <div className="h-[240px] w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={depChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={65}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {depChartData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} verticalAlign="bottom" height={24} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Ticket Distribution Chart */}
        <SectionCard title="Ticket Status" subtitle="Helpdesk Overview">
          <div className="h-[240px] w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ticketChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={65}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {ticketChartData.map((entry: any, index: number) => (
                    <Cell key={`cell-t-${index}`} fill={TICKET_COLORS[index % TICKET_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} verticalAlign="bottom" height={24} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Software Inventory Chart - Spans 2 columns */}
        <div className="lg:col-span-2">
          <SectionCard title="Software Inventory" subtitle="Most common applications">
            <div className="h-[240px] w-full p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inventoryData.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }}
                    tickFormatter={(val) => val.length > 18 ? val.substring(0, 18) + '...' : val}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--surface-raised))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [value, "Installs"]}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={12}>
                    <LabelList dataKey="count" position="right" fill="hsl(var(--foreground))" fontSize={9} fontWeight={600} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* CRM Sync Monitoring Chart — Full Width */}
      <SectionCard
        title="LOYAL CRM ITEM SYNC"
        subtitle=" HOSERVER VS LOYAL CRM"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-4 text-xs text-foreground-muted">
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-success" /> Sync Success</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-danger" /> Pending/Failed</span>
          </div>
          <button
            onClick={fetchCrmSync}
            disabled={crmLoading}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", crmLoading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {crmLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-foreground-muted">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <span className="text-sm">Mengambil data dari HOSERVER...</span>
            </div>
          </div>
        ) : crmSyncData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-foreground-muted text-sm">
            No data CRM sync.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crmSyncData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} />
                  <Tooltip content={<CrmTooltip />} />
                  <Bar dataKey="synced_count" name="Success" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40}>
                    <LabelList dataKey="synced_count" position="top" fill="hsl(var(--foreground))" fontSize={11} fontWeight={700} />
                  </Bar>
                  <Bar dataKey="pending_count" name="Pending/Failed" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40}>
                    <LabelList dataKey="pending_count" position="top" fill="hsl(var(--foreground))" fontSize={11} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Stats Cards */}
            <div className="flex flex-col gap-3 justify-center">
              {crmSyncData.map((row: any) => {
                const pct = row.total > 0 ? Math.round((row.synced_count / row.total) * 100) : 0;
                const isGood = row.pending_count === 0;
                const isWarn = row.pending_count > 0 && row.pending_count <= 5;
                return (
                  <div key={row.label} className="bg-background border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-foreground">{row.label}</span>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full",
                        isGood ? "bg-success/10 text-success border border-success/20" :
                          isWarn ? "bg-warning/10 text-warning border border-warning/20" :
                            "bg-danger/10 text-danger border border-danger/20"
                      )}>
                        {isGood ? "✅ All Sync" : isWarn ? "⚠️ Some Pending" : "🔴 Need Attention"}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-surface-raised h-2 rounded-full overflow-hidden mb-2">
                      <div
                        className={cn("h-full rounded-full transition-all", isGood ? "bg-success" : "bg-warning")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-foreground-muted">
                      <span>✅ Success: <strong className="text-success">{row.synced_count}</strong></span>
                      <span>❌ Pending: <strong className={row.pending_count > 0 ? "text-danger" : "text-foreground-muted"}>{row.pending_count}</strong></span>
                      <span>Total: <strong>{row.total}</strong> ({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Hardware Health Alerts Table */}
      <SectionCard title="Hardware Health & Upgrade Recommendations" subtitle="Devices with low RAM or Disk space">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto pr-1">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface/30">
                <th className="px-6 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Hostname</th>
                <th className="px-6 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">RAM</th>
                <th className="px-6 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Disk (Free)</th>
                <th className="px-6 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Recommendation</th>
                <th className="px-6 py-3 text-xs font-semibold text-foreground-muted uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {needsUpgrade.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-foreground-muted">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle className="w-8 h-8 text-success" />
                      <p>All devices are healthy. No hardware upgrades needed.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                needsUpgrade.map((d: any) => (
                  <tr key={d.id} className="hover:bg-surface/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Monitor className="w-4 h-4 text-foreground-muted" />
                        <span className="font-medium text-foreground">{d.hostname}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Cpu className={cn("w-3.5 h-3.5", d.isLowRam ? "text-warning" : "text-foreground-muted")} />
                        <span className={cn("text-sm font-mono", d.isLowRam && "text-warning font-bold")}>
                          {d.totalRam || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <HardDrive className={cn("w-3.5 h-3.5", d.isLowDisk ? "text-danger" : "text-foreground-muted")} />
                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                          {d.freeDisk && d.freeDisk.split(' | ').map((part: string, idx: number) => {
                            const valMatch = part.match(/(\d+(?:\.\d+)?)/);
                            const val = valMatch ? parseFloat(valMatch[1]) : 100;
                            return (
                              <span key={idx} className={cn("text-sm font-mono whitespace-nowrap", val < 50 ? "text-danger font-bold" : "text-foreground-muted")}>
                                {part}{idx < d.freeDisk.split(' | ').length - 1 && <span className="text-foreground-muted ml-2">|</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/20">
                        <AlertTriangle className="w-3 h-3" />
                        {d.isLowRam && d.isLowDisk 
                          ? `Upgrade RAM & Disk (${d.lowDiskDrives.join(', ')})` 
                          : d.isLowRam ? "Upgrade RAM" 
                          : `Upgrade Disk (${d.lowDiskDrives.join(', ')})`}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={(e) => handleShowDetails(e, d)}
                        className="text-primary hover:text-primary-hover flex items-center gap-1 text-xs font-semibold">
                        Details <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Device Details Drawer */}
      {selectedDevice && (
        <div className="fixed inset-0 z-40 flex" onClick={closeDrawer}>
          <div className="flex-1 bg-black/50 backdrop-blur-sm" />
          <div
            className="w-96 bg-surface border border-border rounded-lg shadow-xl overflow-y-auto flex flex-col max-h-[90vh] animate-fade-up"
            style={{
              position: "fixed",
              top: `${drawerPosition.top}px`,
              right: `${drawerPosition.right}px`,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground font-mono">{selectedDevice.hostname}</p>
                <p className="text-xs text-foreground-muted">{selectedDevice.ip}</p>
              </div>
              <button
                onClick={closeDrawer}
                className="text-foreground-muted hover:text-foreground ml-2 text-lg"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 flex-1">
              <div className="space-y-3">
                <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold">Hardware Information</p>

                <div className="flex items-center gap-3">
                  <div className="text-foreground-muted shrink-0"><Cpu className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs text-foreground-muted">RAM</p>
                    <p className={cn("text-sm font-medium", selectedDevice.isLowRam ? "text-warning font-bold" : "text-foreground")}>
                      {selectedDevice.totalRam || "Unknown"}
                      {selectedDevice.isLowRam && " ⚠️ Low RAM"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-foreground-muted shrink-0"><HardDrive className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs text-foreground-muted">Disk (Free)</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                      {selectedDevice.freeDisk && selectedDevice.freeDisk.split(' | ').map((part: string, idx: number) => {
                        const valMatch = part.match(/(\d+(?:\.\d+)?)/);
                        const val = valMatch ? parseFloat(valMatch[1]) : 100;
                        return (
                          <span key={idx} className={cn("text-sm font-medium", val < 50 ? "text-danger font-bold" : "text-foreground")}>
                            {part}{selectedDevice.isLowDisk && val < 50 && " ⚠️"}
                            {idx < selectedDevice.freeDisk.split(' | ').length - 1 && <span className="text-foreground-muted ml-2">|</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold mb-2">Upgrade Recommendation</p>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/20">
                  <AlertTriangle className="w-3 h-3" />
                  {selectedDevice.isLowRam && selectedDevice.isLowDisk 
                    ? `Upgrade RAM & Disk (${selectedDevice.lowDiskDrives.join(', ')})` 
                    : selectedDevice.isLowRam ? "Upgrade RAM" 
                    : `Upgrade Disk (${selectedDevice.lowDiskDrives.join(', ')})`}
                </div>
              </div>

              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold">Device Details</p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">Hostname:</span>
                    <span className="font-mono text-foreground">{selectedDevice.hostname}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">IP Address:</span>
                    <span className="font-mono text-foreground">{selectedDevice.ip}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">OS Version:</span>
                    <span className="font-mono text-foreground">{selectedDevice.os_version || "Unknown"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">Agent Version:</span>
                    <span className="font-mono text-foreground">{selectedDevice.agent_version || "Unknown"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-border bg-surface-raised flex gap-3">
              <button
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-surface hover:text-foreground text-foreground-muted transition-colors"
              >
                <Monitor className="w-4 h-4" /> View Full Details
              </button>
              <button
                onClick={closeDrawer}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-surface-raised text-foreground-muted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
