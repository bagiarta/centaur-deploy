import React, { useState, useEffect } from "react";
import { 
  Database, ShieldAlert, Cpu, Thermometer, RefreshCw, AlertTriangle, CheckCircle2, 
  Search, ChevronLeft, ChevronRight, Server, Monitor, HardDrive, X, Terminal, Info, ArrowUpRight, Activity
} from "lucide-react";
import { PageHeader, SectionCard, StatCard } from "@/components/ui-enterprise";
import { toast } from "sonner";

interface HealthRecord {
  id: string;
  hostname: string;
  ip: string;
  disk_status: string;
  bad_sectors: number;
  disk_temp: number;
  psu_status: string;
  last_seen: string;
  status: string;
  
  // Extended reports/health fields
  totalRam?: string;
  freeDisk?: string;
  lowDiskDrives?: string[];
  isLowRam?: boolean;
  isLowDisk?: boolean;
  needsUpgrade?: boolean;
  groupNames?: string;
  ram?: string;
  disk?: string;
  cpu?: string;
  os_version?: string;
  agent_version?: string;
  device_type?: string;
  location?: string;
  ramThreshold?: number;
}

export default function DeviceHealthPage() {
  const [latestDevices, setLatestDevices] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [upgradeFilter, setUpgradeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Drawer state
  const [selectedDevice, setSelectedDevice] = useState<HealthRecord | null>(null);

  const fetchHealthData = async () => {
    setLoading(true);
    try {
      const [devicesRes, healthRes] = await Promise.all([
        fetch("/api/devices"),
        fetch("/api/reports/health")
      ]);
      if (!devicesRes.ok) throw new Error("Failed to load device telemetry data");
      if (!healthRes.ok) throw new Error("Failed to load health reports data");

      const devicesData = await devicesRes.json();
      const healthData = await healthRes.json();

      // Filter out Network/Agentless devices
      const agentDevices = (devicesData || []).filter((d: any) => d.device_type !== 'Network');

      // Merge data by device id
      const merged = agentDevices.map((dev: any) => {
        const h = (healthData || []).find((x: any) => x.id === dev.id);
        return {
          ...dev,
          totalRam: h?.totalRam || dev.ram || "Unknown",
          freeDisk: h?.freeDisk || dev.disk || "Unknown",
          lowDiskDrives: h?.lowDiskDrives || [],
          isLowRam: h?.isLowRam || false,
          isLowDisk: h?.isLowDisk || false,
          needsUpgrade: h?.needsUpgrade || false,
          groupNames: h?.groupNames || "",
          ramThreshold: h?.ramThreshold || 7
        };
      });

      setLatestDevices(merged);
    } catch (err: any) {
      toast.error(err.message || "Failed to load telemetry data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, []);

  // Filter based on search term & filters
  const filteredDevices = latestDevices.filter(d => {
    const matchSearch = d.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.ip && d.ip.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    
    let matchUpgrade = true;
    if (upgradeFilter === "upgrade") matchUpgrade = !!d.needsUpgrade;
    else if (upgradeFilter === "low-ram") matchUpgrade = !!d.isLowRam;
    else if (upgradeFilter === "low-disk") matchUpgrade = !!d.isLowDisk;
    else if (upgradeFilter === "healthy") matchUpgrade = !d.needsUpgrade;
    
    return matchSearch && matchStatus && matchUpgrade;
  });

  // Stats computed from ALL agent devices
  const totalDevices = latestDevices.length;
  const failurePredictedCount = latestDevices.filter(d => d.disk_status && d.disk_status !== "Healthy").length;
  const criticalBadSectors = latestDevices.filter(d => d.bad_sectors && d.bad_sectors > 0).length;
  const totalUpgradeAlerts = latestDevices.filter(d => d.needsUpgrade).length;
  const lowRamCount = latestDevices.filter(d => d.isLowRam).length;
  const lowDiskCount = latestDevices.filter(d => d.isLowDisk).length;
  
  const devicesWithTemp = latestDevices.filter(d => d.disk_temp && d.disk_temp > 0);
  const avgTemp = devicesWithTemp.length > 0 
    ? (devicesWithTemp.reduce((sum, d) => sum + d.disk_temp, 0) / devicesWithTemp.length).toFixed(1)
    : "0.0";

  // Pagination calculations
  const totalItems = filteredDevices.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, upgradeFilter, itemsPerPage]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredDevices.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="p-6 h-full flex flex-col gap-6 overflow-y-auto animate-fade-up">
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <PageHeader
        title="Device Hardware Health Monitor"
        subtitle="Real-time storage status, hardware capacity, diagnostics, and power supply telemetry for all client devices"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHealthData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-all shadow-sm text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Data
            </button>
          </div>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="Monitored Devices"
          value={totalDevices}
          icon={<Cpu className="w-5 h-5 text-primary" />}
          variant="primary"
          sub="Total unique client hosts reporting"
        />
        <StatCard
          label="Disk Failure Predicted"
          value={failurePredictedCount}
          icon={<ShieldAlert className="w-5 h-5 text-danger" />}
          variant={failurePredictedCount > 0 ? "danger" : "success"}
          sub="Devices predicting imminent failure"
        />
        <StatCard
          label="Bad Sectors Warning"
          value={criticalBadSectors}
          icon={<AlertTriangle className="w-5 h-5 text-warning" />}
          variant={criticalBadSectors > 0 ? "warning" : "success"}
          sub="Devices with non-zero bad sectors"
        />
        <StatCard
          label="Hardware Upgrade Alerts"
          value={totalUpgradeAlerts}
          icon={<ArrowUpRight className="w-5 h-5 text-warning" />}
          variant={totalUpgradeAlerts > 0 ? "warning" : "success"}
          sub={`${lowRamCount} Low RAM · ${lowDiskCount} Low Disk`}
        />
        <StatCard
          label="Avg Disk Temperature"
          value={`${avgTemp}°C`}
          icon={<Thermometer className="w-5 h-5 text-info" />}
          variant="default"
          sub="Average recorded temperature"
        />
      </div>

      {/* Main Table & Controls */}
      <SectionCard className="flex flex-col">
        {/* Search & Filter Controls */}
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 p-4 border-b border-border bg-surface/50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search by hostname or IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 w-full text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Filter by Status */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-muted whitespace-nowrap">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            {/* Filter by Upgrade Recommendation */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-muted whitespace-nowrap">Upgrade Needs:</span>
              <select
                value={upgradeFilter}
                onChange={(e) => setUpgradeFilter(e.target.value)}
                className="px-2 py-1.5 bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground text-xs"
              >
                <option value="all">All Hardware Healths</option>
                <option value="upgrade">Needs Upgrade</option>
                <option value="low-ram">Low RAM</option>
                <option value="low-disk">Low Disk Space</option>
                <option value="healthy">No Upgrade Needed (Healthy)</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-end xl:self-auto text-xs text-foreground-muted">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-2 py-1 bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground text-xs"
            >
              {[10, 15, 25, 50, 100].map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <span>entries</span>
          </div>
        </div>

        {/* Table wrapper */}
        <div className="overflow-auto max-h-[60vh] border-y border-border">
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 bg-surface z-10 shadow-sm">
              <tr className="border-b border-border text-foreground-muted text-[10px] uppercase font-bold tracking-wider">
                <th className="px-4 py-3 bg-surface">Device / System</th>
                <th className="px-4 py-3 bg-surface">Status</th>
                <th className="px-4 py-3 bg-surface">RAM Capacity</th>
                <th className="px-4 py-3 bg-surface">Disk Partitions (Free)</th>
                <th className="px-4 py-3 bg-surface">Disk SMART</th>
                <th className="px-4 py-3 bg-surface">Bad Sectors</th>
                <th className="px-4 py-3 bg-surface">Temp</th>
                <th className="px-4 py-3 bg-surface">PSU Status</th>
                <th className="px-4 py-3 bg-surface">Recommendation</th>
                <th className="px-4 py-3 bg-surface text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs">
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-foreground-muted">
                    No client devices found matching filter.
                  </td>
                </tr>
              ) : (
                currentItems.map(dev => {
                  const temp = dev.disk_temp || 0;
                  let tempColor = "text-foreground-muted font-mono";
                  if (temp >= 50) tempColor = "text-danger font-bold";
                  else if (temp >= 42) tempColor = "text-warning font-semibold";
                  else if (temp > 0) tempColor = "text-success font-semibold";

                  return (
                    <tr key={dev.id} className="hover:bg-surface-raised transition-colors group">
                      {/* Hostname & IP */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-surface border border-border group-hover:border-primary/20 group-hover:bg-primary/5 transition-all text-foreground-muted group-hover:text-primary">
                            {dev.groupNames?.toLowerCase().includes("server") ? (
                              <Server className="w-3.5 h-3.5" />
                            ) : (
                              <Monitor className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-foreground block group-hover:text-primary transition-colors">{dev.hostname}</span>
                            <span className="text-[10px] text-foreground-muted font-mono block">{dev.ip || "N/A"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className={`inline-flex items-center gap-1 w-max px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            dev.status === 'online' 
                              ? 'bg-success/10 text-success border border-success/20' 
                              : 'bg-muted-foreground/10 text-muted-foreground border border-border'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dev.status === 'online' ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                            {dev.status}
                          </span>
                          <span className="text-[9px] text-foreground-muted mt-1">
                            Seen: {dev.last_seen || "N/A"}
                          </span>
                        </div>
                      </td>

                      {/* RAM Capacity */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Cpu className={`w-3.5 h-3.5 ${dev.isLowRam ? "text-warning animate-bounce" : "text-foreground-muted"}`} />
                          <div className="flex flex-col">
                            <span className={`font-mono text-xs ${dev.isLowRam ? "text-warning font-bold" : "text-foreground-muted"}`}>
                              {dev.totalRam || "N/A"}
                            </span>
                            {dev.isLowRam && (
                              <span className="text-[9px] text-warning font-bold uppercase tracking-wide">
                                ⚠️ Low RAM
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Disk Capacity */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-1.5">
                          <HardDrive className={`w-3.5 h-3.5 mt-0.5 ${dev.isLowDisk ? "text-danger animate-pulse" : "text-foreground-muted"}`} />
                          <div className="flex flex-col gap-0.5">
                            {dev.freeDisk && dev.freeDisk !== "Unknown" ? (
                              dev.freeDisk.split(' | ').map((part: string, idx: number) => {
                                const valMatch = part.match(/(\d+(?:\.\d+)?)/);
                                const val = valMatch ? parseFloat(valMatch[1]) : 100;
                                const isPartLow = val < 50;
                                return (
                                  <span key={idx} className={`font-mono text-[11px] whitespace-nowrap ${isPartLow ? "text-danger font-bold" : "text-foreground-muted"}`}>
                                    {part} {isPartLow && "⚠️"}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-foreground-muted italic">N/A</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Disk S.M.A.R.T. Health */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          !dev.disk_status || dev.disk_status === "Healthy" 
                            ? "bg-success/10 text-success" 
                            : "bg-danger/10 text-danger animate-pulse"
                        }`}>
                          {!dev.disk_status || dev.disk_status === "Healthy" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <ShieldAlert className="w-3 h-3" />
                          )}
                          {dev.disk_status || "Healthy"}
                        </span>
                      </td>

                      {/* Bad Sectors */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className={`font-mono font-bold ${dev.bad_sectors > 0 ? "text-danger animate-pulse" : "text-foreground-muted"}`}>
                            {dev.bad_sectors || 0}
                          </span>
                          {dev.bad_sectors > 0 && (
                            <span className="text-[9px] text-danger font-bold uppercase tracking-wider">
                              CRITICAL
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Disk Temp */}
                      <td className="px-4 py-3.5">
                        <span className={tempColor}>
                          {temp > 0 ? `${temp.toFixed(1)}°C` : "N/A"}
                        </span>
                      </td>

                      {/* PSU Health */}
                      <td className="px-4 py-3.5 text-foreground-subtle font-medium">{dev.psu_status || "Not Supported"}</td>

                      {/* Upgrade Recommendations */}
                      <td className="px-4 py-3.5">
                        {dev.needsUpgrade ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-warning/10 text-warning border border-warning/20">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {dev.isLowRam && dev.isLowDisk 
                              ? "RAM & Disk" 
                              : dev.isLowRam ? "RAM Only" 
                              : "Disk Only"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-success/10 text-success border border-success/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Healthy
                          </span>
                        )}
                      </td>

                      {/* Action Details */}
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedDevice(dev)}
                          className="text-primary hover:text-primary-hover flex items-center justify-end gap-1 text-xs font-semibold ml-auto"
                        >
                          Details <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-surface/50 text-xs text-foreground-muted">
            <div>
              Showing <span className="font-semibold text-foreground">{indexOfFirstItem + 1}</span> to{" "}
              <span className="font-semibold text-foreground">
                {Math.min(indexOfLastItem, totalItems)}
              </span>{" "}
              of <span className="font-semibold text-foreground">{totalItems}</span> entries
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-border bg-background hover:bg-surface-raised disabled:opacity-50 disabled:hover:bg-background transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                  })
                  .map((page, idx, arr) => {
                    const showEllipsisBefore = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <React.Fragment key={page}>
                        {showEllipsisBefore && <span className="px-1 text-foreground-muted">...</span>}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
                            currentPage === page
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-border hover:bg-surface-raised"
                          }`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-border bg-background hover:bg-surface-raised disabled:opacity-50 disabled:hover:bg-background transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Device Details Slide-over Drawer */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
            onClick={() => setSelectedDevice(null)}
          />
          
          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-surface border-l border-border h-full shadow-2xl flex flex-col z-10 animate-slide-in-right">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-surface-raised/40">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {selectedDevice.groupNames?.toLowerCase().includes("server") ? (
                    <Server className="w-5 h-5" />
                  ) : (
                    <Monitor className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground font-mono truncate max-w-[200px]" title={selectedDevice.hostname}>
                    {selectedDevice.hostname}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${selectedDevice.status === 'online' ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                    <span className="text-xs text-foreground-muted font-mono">{selectedDevice.ip || "No IP Address"}</span>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => setSelectedDevice(null)}
                className="p-1.5 rounded-lg hover:bg-surface-raised border border-transparent hover:border-border text-foreground-muted hover:text-foreground transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Group Names (if any) */}
              {selectedDevice.groupNames && (
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-xs text-foreground-muted leading-normal">
                    Belongs to group: <strong className="text-primary">{selectedDevice.groupNames}</strong>
                  </div>
                </div>
              )}

              {/* Recommendation Alert */}
              {selectedDevice.needsUpgrade && (
                <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-warning font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 animate-pulse" />
                    Upgrade Required
                  </div>
                  <p className="text-xs text-foreground-subtle leading-relaxed">
                    This device falls below the performance thresholds for active systems. Upgrades are recommended to prevent latency.
                  </p>
                  <div className="bg-background/80 border border-warning/20 p-2.5 rounded-lg font-mono text-xs font-semibold text-warning">
                    💡 Recommendation: {
                      selectedDevice.isLowRam && selectedDevice.isLowDisk 
                        ? `Upgrade RAM & Disk (${selectedDevice.lowDiskDrives?.join(', ')})` 
                        : selectedDevice.isLowRam ? "Upgrade RAM (Memory capacity low)" 
                        : `Upgrade Disk partition (${selectedDevice.lowDiskDrives?.join(', ')})`
                    }
                  </div>
                </div>
              )}

              {/* Physical Storage Telemetry */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-foreground-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  Storage & Hardware Health
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-raised/40 border border-border/60 rounded-lg p-3">
                    <span className="text-[10px] text-foreground-muted uppercase block">S.M.A.R.T. Status</span>
                    <span className={`text-xs font-bold inline-flex items-center gap-1 mt-1 ${
                      !selectedDevice.disk_status || selectedDevice.disk_status === "Healthy" ? "text-success" : "text-danger font-extrabold animate-pulse"
                    }`}>
                      <Database className="w-3.5 h-3.5" />
                      {selectedDevice.disk_status || "Healthy"}
                    </span>
                  </div>

                  <div className="bg-surface-raised/40 border border-border/60 rounded-lg p-3">
                    <span className="text-[10px] text-foreground-muted uppercase block">Bad Sectors</span>
                    <span className={`text-xs font-bold inline-flex items-center gap-1 mt-1 ${
                      selectedDevice.bad_sectors > 0 ? "text-danger font-extrabold animate-pulse" : "text-success"
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {selectedDevice.bad_sectors || 0} sectors
                    </span>
                  </div>

                  <div className="bg-surface-raised/40 border border-border/60 rounded-lg p-3">
                    <span className="text-[10px] text-foreground-muted uppercase block">Disk Temp</span>
                    <span className={`text-xs font-bold inline-flex items-center gap-1 mt-1 ${
                      selectedDevice.disk_temp >= 50 ? "text-danger animate-pulse" : selectedDevice.disk_temp >= 42 ? "text-warning" : "text-success"
                    }`}>
                      <Thermometer className="w-3.5 h-3.5" />
                      {selectedDevice.disk_temp > 0 ? `${selectedDevice.disk_temp.toFixed(1)}°C` : "N/A"}
                    </span>
                  </div>

                  <div className="bg-surface-raised/40 border border-border/60 rounded-lg p-3">
                    <span className="text-[10px] text-foreground-muted uppercase block">Power Supply Unit</span>
                    <span className={`text-xs font-bold inline-flex items-center gap-1 mt-1 ${
                      !selectedDevice.psu_status || selectedDevice.psu_status.toLowerCase() === 'healthy' ? "text-success" : "text-danger"
                    }`}>
                      <Activity className="w-3.5 h-3.5" />
                      {selectedDevice.psu_status || "Healthy"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hardware Capacity Specifications */}
              <div className="space-y-3 pt-4 border-t border-border">
                <h4 className="text-xs font-bold text-foreground-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-primary" />
                  System Specifications
                </h4>
                
                <div className="bg-surface-raised/30 border border-border/50 rounded-xl p-4 space-y-3.5 text-xs">
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-foreground-muted shrink-0">CPU / Processor:</span>
                    <span className="font-semibold text-foreground text-right">{selectedDevice.cpu || "Intel Core i5 / General CPU"}</span>
                  </div>

                  <div className="flex justify-between items-center gap-4">
                    <span className="text-foreground-muted">Installed RAM:</span>
                    <div className="text-right">
                      <span className={`font-semibold font-mono ${selectedDevice.isLowRam ? "text-warning font-bold" : "text-foreground"}`}>
                        {selectedDevice.totalRam || selectedDevice.ram || "Unknown"}
                      </span>
                      {selectedDevice.isLowRam && (
                        <span className="text-[9px] text-warning font-bold uppercase tracking-wider block">
                          ⚠️ Below {selectedDevice.ramThreshold}GB Threshold
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-start gap-4">
                    <span className="text-foreground-muted shrink-0">Disk Capacity & Free Space:</span>
                    <div className="text-right flex flex-col gap-1 max-w-[200px]">
                      {selectedDevice.freeDisk && selectedDevice.freeDisk !== "Unknown" ? (
                        selectedDevice.freeDisk.split(' | ').map((part: string, idx: number) => {
                          const valMatch = part.match(/(\d+(?:\.\d+)?)/);
                          const val = valMatch ? parseFloat(valMatch[1]) : 100;
                          return (
                            <span key={idx} className={`font-mono text-xs leading-none ${val < 50 ? "text-danger font-bold animate-pulse" : "text-foreground-subtle"}`}>
                              {part}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-foreground-subtle font-mono">{selectedDevice.disk || "N/A"}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Software & Agent Info */}
              <div className="space-y-3 pt-4 border-t border-border">
                <h4 className="text-xs font-bold text-foreground-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  Software & Metadata
                </h4>

                <div className="bg-surface-raised/30 border border-border/50 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">OS Version:</span>
                    <span className="font-semibold text-foreground">{selectedDevice.os_version || "Unknown OS"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">Agent Version:</span>
                    <span className="font-semibold text-foreground font-mono">{selectedDevice.agent_version || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">Physical Location:</span>
                    <span className="font-semibold text-foreground truncate max-w-[200px]" title={selectedDevice.location}>
                      {selectedDevice.location || "Branch Outlet / HO"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">Last Active Seen:</span>
                    <span className="font-semibold text-foreground font-mono">{selectedDevice.last_seen || "N/A"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-border bg-surface-raised/50 flex gap-3">
              <a
                href={`/remote-sql?device=${selectedDevice.id}`}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold border border-border hover:border-primary/20 bg-background hover:bg-primary/5 text-foreground-muted hover:text-primary rounded-lg transition-all"
              >
                <Database className="w-3.5 h-3.5" /> Remote SQL
              </a>
              <a
                href={`/remote?device=${selectedDevice.id}`}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold border border-border hover:border-primary/20 bg-background hover:bg-primary/5 text-foreground-muted hover:text-primary rounded-lg transition-all"
              >
                <Terminal className="w-3.5 h-3.5" /> Execute CMD
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
