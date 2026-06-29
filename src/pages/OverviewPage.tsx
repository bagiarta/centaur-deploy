import { useState, useEffect } from "react";
import { Monitor, Package, Rocket, Download, Activity, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { StatCard, StatusBadge, SectionCard, PageHeader, DeployProgressSummary } from "@/components/ui-enterprise";
import { useAuth } from "@/contexts/AuthContext";

export default function OverviewPage() {
  const { user } = useAuth();
  const userKey = user?.id || user?.username;
  const [devices, setDevices] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userKey) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        const [devResult, depResult, pkgResult, actResult] = await Promise.allSettled([
          fetch('/api/devices'),
          fetch('/api/deployments'),
          fetch('/api/packages'),
          fetch('/api/activity-log', {
            headers: { 'X-User-Id': userKey }
          })
        ]);

        const loadJsonArray = async (result: PromiseSettledResult<Response>, label: string) => {
          if (result.status !== "fulfilled") {
            console.error(`Failed to load ${label}:`, result.reason);
            return [];
          }

          const payload = await result.value.json().catch(() => null);
          if (!result.value.ok) {
            console.error(`Failed to load ${label}:`, payload?.error || result.value.statusText);
            return [];
          }

          return Array.isArray(payload) ? payload : [];
        };

        const [devicesData, deploymentsData, packagesData, activityData] = await Promise.all([
          loadJsonArray(devResult, "devices"),
          loadJsonArray(depResult, "deployments"),
          loadJsonArray(pkgResult, "packages"),
          loadJsonArray(actResult, "activity log"),
        ]);

        setDevices(devicesData);
        setDeployments(deploymentsData);
        setPackages(packagesData);
        setActivityLog(activityData);
      } catch (err) {
        console.error("Failed to fetch overview data:", err);
        setDevices([]);
        setDeployments([]);
        setPackages([]);
        setActivityLog([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userKey]);

  const online    = devices.filter(d => d.status === "online").length;
  const offline   = devices.filter(d => d.status === "offline").length;
  const deploying = devices.filter(d => d.status === "deploying").length;
  const errored   = devices.filter(d => d.status === "error").length;
  const activeDeployments = deployments.filter(d => d.status === "running").length;
  const scheduledDeployments = deployments.filter(d => d.status === "scheduled").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 shadow-2xl">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-white">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                  <Activity className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Overview</h1>
                  <p className="text-blue-100 mt-1 text-lg">Central Software Deployment ULTIMATE — Enterprise Dashboard</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/30">
              <span className="text-sm font-mono">Last refresh: just now</span>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* System Status Banner */}
        {activeDeployments > 0 && (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-6 shadow-xl">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10 flex items-center gap-4 text-white">
              <div className="p-3 bg-white/20 rounded-lg">
                <Rocket className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">System Operational</h3>
                <p className="text-sm text-emerald-100">
                  {devices.length} devices enrolled · {activeDeployments} active deployment{activeDeployments !== 1 ? "s" : ""} · {packages.length} packages
                </p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/30">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span className="font-semibold">{activeDeployments} deployment running</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid with Gradient Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Devices Online */}
          <div className="border-0 shadow-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white overflow-hidden relative rounded-xl p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Monitor className="w-5 h-5" />
                </div>
                <CheckCircle className="w-4 h-4" />
              </div>
              <div className="text-3xl font-bold">{online}</div>
              <p className="text-xs text-emerald-100 uppercase tracking-wider mt-1">Devices Online</p>
              <p className="text-sm text-emerald-100/80 mt-2">of {devices.length} enrolled</p>
            </div>
          </div>

          {/* Active Deployments */}
          <div className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden relative rounded-xl p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Rocket className="w-5 h-5" />
                </div>
                <Activity className="w-4 h-4 animate-pulse" />
              </div>
              <div className="text-3xl font-bold">{activeDeployments}</div>
              <p className="text-xs text-blue-100 uppercase tracking-wider mt-1">Active Deployments</p>
              <p className="text-sm text-blue-100/80 mt-2">{scheduledDeployments} scheduled</p>
            </div>
          </div>

          {/* Packages */}
          <div className="border-0 shadow-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white overflow-hidden relative rounded-xl p-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Package className="w-5 h-5" />
                </div>
                <Download className="w-4 h-4" />
              </div>
              <div className="text-3xl font-bold">{packages.length}</div>
              <p className="text-xs text-purple-100 uppercase tracking-wider mt-1">Packages</p>
              <p className="text-sm text-purple-100/80 mt-2">in repository</p>
            </div>
          </div>

          {/* Devices with Issues */}
          <div className={`border-0 shadow-xl text-white overflow-hidden relative rounded-xl p-6 ${
            errored > 0 
              ? 'bg-gradient-to-br from-red-500 to-red-600' 
              : 'bg-gradient-to-br from-orange-500 to-orange-600'
          }`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <XCircle className="w-4 h-4" />
              </div>
              <div className="text-3xl font-bold">{errored + offline}</div>
              <p className={`text-xs uppercase tracking-wider mt-1 ${
                errored > 0 ? 'text-red-100' : 'text-orange-100'
              }`}>Devices with Issues</p>
              <p className={`text-sm mt-2 ${
                errored > 0 ? 'text-red-100/80' : 'text-orange-100/80'
              }`}>{errored} errors · {offline} offline</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device Status */}
          <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Device Status Breakdown</h3>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: "Online",    count: online,    total: devices.length, color: "bg-emerald-500" },
                { label: "Deploying", count: deploying, total: devices.length, color: "bg-blue-500" },
                { label: "Idle",      count: devices.filter(d => d.status === "idle").length, total: devices.length, color: "bg-gray-400" },
                { label: "Offline",   count: offline,   total: devices.length, color: "bg-gray-500" },
                { label: "Error",     count: errored,   total: devices.length, color: "bg-red-500" },
              ].map(row => (
                <div key={row.label} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{row.label}</span>
                    <span className="text-gray-800 font-semibold font-mono">{row.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${row.color} transition-all duration-700 shadow-sm`}
                      style={{ width: `${row.total > 0 ? (row.count / row.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Deployments */}
          <div className="col-span-1 lg:col-span-2 border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Recent Deployments</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {deployments.slice(0, 4).map(dep => (
                <div key={dep.id} className="px-6 py-4 hover:bg-blue-50/50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{dep.package_name}</p>
                      <p className="text-xs text-gray-500">v{dep.package_version} · by {dep.created_by}</p>
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
          </div>
        </div>

        {/* Activity Log */}
        <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Activity Log</h3>
            <p className="text-sm text-gray-500">Real-time system events</p>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {activityLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 px-6 py-3 hover:bg-blue-50/50 transition-colors">
                <span className="text-xs font-mono text-gray-400 shrink-0 mt-0.5 w-12">
                  <Clock className="w-3 h-3 inline mr-1" />
                  {entry.time}
                </span>
                <span className="text-xs text-blue-600 font-mono font-semibold shrink-0">{entry.user}</span>
                <span className="text-xs text-gray-700">{entry.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
