import React, { useState, useEffect } from "react";
import { 
  Database, ShieldAlert, Cpu, Thermometer, RefreshCw, AlertTriangle, CheckCircle2, Search, ChevronLeft, ChevronRight
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
}

export default function DeviceHealthPage() {
  const [latestDevices, setLatestDevices] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search & Pagination States
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  const fetchHealthData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/devices");
      if (!res.ok) throw new Error("Failed to load health data");
      const data = await res.json();
      // Filter out Network/Agentless devices
      const agentDevices = (data || []).filter((d: any) => d.device_type !== 'Network');
      setLatestDevices(agentDevices);
    } catch (err: any) {
      toast.error(err.message || "Failed to load telemetry data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, []);

  // Filter based on search term
  const filteredDevices = latestDevices.filter(d => 
    d.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.ip && d.ip.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Stats computed from ALL agent devices
  const totalDevices = latestDevices.length;
  const failurePredictedCount = latestDevices.filter(d => d.disk_status && d.disk_status !== "Healthy").length;
  const criticalBadSectors = latestDevices.filter(d => d.bad_sectors && d.bad_sectors > 0).length;
  const devicesWithTemp = latestDevices.filter(d => d.disk_temp && d.disk_temp > 0);
  const avgTemp = devicesWithTemp.length > 0 
    ? (devicesWithTemp.reduce((sum, d) => sum + d.disk_temp, 0) / devicesWithTemp.length).toFixed(1)
    : "0.0";

  // Pagination calculations
  const totalItems = filteredDevices.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredDevices.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div className="p-6 h-full flex flex-col gap-6 overflow-y-auto animate-fade-up">
      <PageHeader
        title="Device Hardware Health Monitor"
        subtitle="Real-time storage status, bad sector diagnostics, temperatures, and power supply telemetry for all client devices"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          label="Avg Disk Temperature"
          value={`${avgTemp}°C`}
          icon={<Thermometer className="w-5 h-5 text-info" />}
          variant="default"
          sub="Average recorded temperature"
        />
      </div>

      {/* Main Table & Controls */}
      <SectionCard className="flex flex-col">
        {/* Search & Page Size Select */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b border-border bg-surface/50">
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
          
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-foreground-muted">
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
                <th className="px-4 py-3 bg-surface">Hostname</th>
                <th className="px-4 py-3 bg-surface">IP Address</th>
                <th className="px-4 py-3 bg-surface">Disk Health</th>
                <th className="px-4 py-3 bg-surface">Bad Sectors</th>
                <th className="px-4 py-3 bg-surface">Disk Temperature</th>
                <th className="px-4 py-3 bg-surface">PSU Health Status</th>
                <th className="px-4 py-3 bg-surface">Status</th>
                <th className="px-4 py-3 bg-surface">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs">
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-foreground-muted">
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
                    <tr key={dev.id} className="hover:bg-surface-raised transition-colors">
                      <td className="px-4 py-3.5 font-bold text-foreground">{dev.hostname}</td>
                      <td className="px-4 py-3.5 font-mono">{dev.ip || "N/A"}</td>
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
                      <td className="px-4 py-3.5">
                        <span className={`font-mono font-bold ${dev.bad_sectors > 0 ? "text-danger" : "text-foreground-muted"}`}>
                          {dev.bad_sectors || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={tempColor}>
                          {temp > 0 ? `${temp.toFixed(1)}°C` : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground-subtle font-medium">{dev.psu_status || "Not Supported"}</td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          dev.status === 'online' ? 'bg-success/10 text-success border border-success/20' : 'bg-muted-foreground/10 text-muted-foreground border border-border'
                        }`}>
                          {dev.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground-muted text-[11px]">
                        {dev.last_seen || "N/A"}
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
                    // Show first, last, current, and page adjacent to current
                    return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                  })
                  .map((page, idx, arr) => {
                    // Add ellipses if there are gaps
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
    </div>
  );
}
