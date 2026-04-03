import { useState, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LabelList 
} from 'recharts';
import { 
  Activity, ShieldAlert, Package, CheckCircle, XCircle, 
  Monitor, HardDrive, Cpu, AlertTriangle, ArrowUpRight
} from "lucide-react";
import { 
  StatCard, SectionCard, PageHeader, StatusBadge 
} from "@/components/ui-enterprise";

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

export default function ReportsPage() {
  const [deploymentStats, setDeploymentStats] = useState<any>(null);
  const [healthData, setHealthData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [drawerPosition, setDrawerPosition] = useState<{ top: number; right: number; show: boolean }>({ top: 0, right: 0, show: false });

  useEffect(() => {
    async function fetchData() {
      try {
        const [depRes, healthRes, invRes] = await Promise.all([
          fetch('/api/reports/deployments'),
          fetch('/api/reports/health'),
          fetch('/api/reports/inventory')
        ]);
        
        setDeploymentStats(await depRes.json());
        setHealthData(await healthRes.json());
        setInventoryData(await invRes.json());
      } catch (err) {
        console.error("Failed to fetch report data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
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

  const needsUpgrade = healthData.filter(d => d.needsUpgrade);
  const lowRam = healthData.filter(d => d.isLowRam).length;
  const lowDisk = healthData.filter(d => d.isLowDisk).length;

  const handleShowDetails = (e: React.MouseEvent, device: any) => {
    e.stopPropagation();
    const button = e.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    
    // Calculate optimal position based on available space
    const drawerWidth = 384; // w-96 = 384px
    const spacing = 20;
    
    // Prefer right side, fallback to left if no space
    let rightPos = window.innerWidth - rect.right - spacing;
    if (rect.right + drawerWidth + spacing > window.innerWidth) {
      rightPos = spacing;
    }
    
    // Position drawer below button with some offset
    const topPosition = rect.bottom + spacing;
    
    setDrawerPosition({ 
      top: topPosition, 
      right: rightPos,
      show: true 
    });
    setSelectedDevice(device);
  };

  const closeDrawer = () => {
    setSelectedDevice(null);
    setDrawerPosition({ top: 0, right: 0, show: false });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Operational insights and hardware health monitoring"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              ? Math.round((deploymentStats.targets.find((t:any) => t.status === 'success')?.count || 0) / 
                deploymentStats.targets.reduce((acc:any, t:any) => acc + t.count, 0) * 100) + "%"
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deployment Performance Chart */}
        <SectionCard title="Deployment Target Status" subtitle="Success vs Failure Distribution">
          <div className="h-[300px] w-full p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={depChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
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
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Software Inventory Chart */}
        <SectionCard title="Top Software Inventory" subtitle="Most common applications installed">
          <div className="h-[500px] w-full p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inventoryData} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={220} 
                  tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                  tickFormatter={(val) => val.length > 32 ? val.substring(0, 32) + '...' : val}
                />
                <Tooltip 
                  cursor={{ fill: 'hsl(var(--surface-raised))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--surface))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number) => [value, "Installations"]}
                  labelFormatter={(label: string) => `Software: ${label}`}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={16}>
                  <LabelList dataKey="count" position="right" fill="hsl(var(--foreground))" fontSize={11} fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Hardware Health Alerts Table */}
      <SectionCard title="Hardware Health & Upgrade Recommendations" subtitle="Devices with low RAM or Disk space">
        <div className="overflow-x-auto">
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
                          {d.ram || "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <HardDrive className={cn("w-3.5 h-3.5", d.isLowDisk ? "text-danger" : "text-foreground-muted")} />
                        <span className={cn("text-sm font-mono", d.isLowDisk && "text-danger font-bold")}>
                          {d.disk ? d.disk.split('/')[0].replace('Free: ', '') : "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/20">
                        <AlertTriangle className="w-3 h-3" />
                        {d.isLowRam && d.isLowDisk ? "Upgrade RAM & Disk" : d.isLowRam ? "Upgrade RAM" : "Upgrade Disk"}
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
              {/* Hardware Information */}
              <div className="space-y-3">
                <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold">Hardware Information</p>
                
                <div className="flex items-center gap-3">
                  <div className="text-foreground-muted shrink-0"><Cpu className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs text-foreground-muted">RAM</p>
                    <p className={cn("text-sm font-medium", selectedDevice.isLowRam ? "text-warning font-bold" : "text-foreground")}>
                      {selectedDevice.ram || "Unknown"}
                      {selectedDevice.isLowRam && " ⚠️ Low RAM"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-foreground-muted shrink-0"><HardDrive className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs text-foreground-muted">Disk (Free)</p>
                    <p className={cn("text-sm font-medium", selectedDevice.isLowDisk ? "text-danger font-bold" : "text-foreground")}>
                      {selectedDevice.disk ? selectedDevice.disk.split('/')[0].replace('Free: ', '') : "Unknown"}
                      {selectedDevice.isLowDisk && " ⚠️ Low Disk"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recommendation */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold mb-2">Upgrade Recommendation</p>
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/20">
                  <AlertTriangle className="w-3 h-3" />
                  {selectedDevice.isLowRam && selectedDevice.isLowDisk ? "Upgrade RAM & Disk" : selectedDevice.isLowRam ? "Upgrade RAM" : "Upgrade Disk"}
                </div>
              </div>

              {/* Device Details */}
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

            {/* Footer Actions */}
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

// Utility class mimic if needed (assuming cn/lucide/StatCard etc are global or matched)
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
