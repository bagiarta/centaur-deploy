import { useState, useEffect } from "react";
import {
  Monitor, Package, Rocket, Download, Activity, CheckCircle, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, BarChart3, RefreshCw,
  Database, ClipboardList, Video, HardDrive, Signal, MapPin, ShoppingCart, Users, Calendar
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList, LineChart, Line
} from 'recharts';
import { StatCard, StatusBadge, SectionCard, PageHeader, DeployProgressSummary } from "@/components/ui-enterprise";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'];
const TICKET_COLORS = ['#ef4444', '#f59e0b', '#eb0cd8ff', '#02f737ff'];

export default function OverviewPage() {
  const { user } = useAuth();
  const userKey = user?.id || user?.username;
  const [devices, setDevices] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [ticketStats, setTicketStats] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [crmSyncData, setCrmSyncData] = useState<any[]>([]);
  const [dbwhJobs, setDbwhJobs] = useState<any[]>([]);
  const [cctvDashboard, setCctvDashboard] = useState<any>(null);
  const [wiseTransactions, setWiseTransactions] = useState<any>(null);
  const [crmLoading, setCrmLoading] = useState(true);
  const [dbwhLoading, setDbwhLoading] = useState(true);
  const [cctvLoading, setCctvLoading] = useState(true);
  const [wiseLoading, setWiseLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [autoSlide, setAutoSlide] = useState(true);

  const fetchCrmSync = async () => {
    setCrmLoading(true);
    try {
      const res = await fetch('/api/reports/crm-sync');
      if (res.ok) {
        const data = await res.json();
        const sorted = [...data].sort((a: any, b: any) => {
          if (a.label.toLowerCase() === 'yesterday') return -1;
          if (b.label.toLowerCase() === 'yesterday') return 1;
          return 0;
        });
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

  const fetchDbwhJobs = async () => {
    setDbwhLoading(true);
    try {
      const res = await fetch('/api/reports/dbwh-jobs');
      if (res.ok) {
        const data = await res.json();
        setDbwhJobs(data);
      }
    } catch (err) {
      console.error("Failed to fetch DBWH jobs:", err);
    } finally {
      setDbwhLoading(false);
    }
  };

  const fetchCctvDashboard = async () => {
    setCctvLoading(true);
    try {
      const timestamp = new Date().getTime();
      const res = await fetch(`/api/cctv/dashboard?_t=${timestamp}`, { cache: 'no-store' });
      if (res.ok) {
        const result = await res.json();
        console.log('CCTV Dashboard Response:', result);
        // Data ada di result.data, bukan result langsung
        setCctvDashboard(result.data || null);
      } else {
        console.error('CCTV Dashboard failed:', res.status, res.statusText);
      }
    } catch (err) {
      console.error("Failed to fetch CCTV dashboard:", err);
    } finally {
      setCctvLoading(false);
    }
  };

  const fetchWiseTransactions = async () => {
    setWiseLoading(true);
    try {
      // Gunakan periode yang sama seperti CrmReportsPage
      // fromDate: Tanggal 1 bulan ini
      // toDate: Hari ini
      const toDate = new Date();
      const fromDate = new Date(new Date().setDate(1)); // Tanggal 1 bulan ini
      
      const fromDateStr = fromDate.toISOString().split('T')[0];
      const toDateStr = toDate.toISOString().split('T')[0];
      
      const params = new URLSearchParams({
        fromDate: fromDateStr,
        toDate: toDateStr,
        store: 'All Store',
        search: '',
        page: '1',
        perPage: '10000', // Ambil banyak data untuk hitung unique customers
        sortBy: 'txn_date',
        sortDir: 'desc'
      });
      
      const res = await fetch(`/api/crm/reports/txn-analysis?${params.toString()}`);
      console.log('Wise Transaction URL:', `/api/crm/reports/txn-analysis?${params.toString()}`);
      
      if (res.ok) {
        const result = await res.json();
        console.log('Wise Transaction Response:', result);
        
        // Data ada di result.summary (dari backend)
        const summary = result.summary || {};
        const transactions = result.rows || [];
        
        console.log('Summary from backend:', summary);
        console.log('Transactions count:', transactions.length);
        
        // Hitung unique customers dari data transaksi yang diambil
        const uniqueCustomers = new Set(
          transactions
            .filter((t: any) => t.card_no) // Filter out null/undefined
            .map((t: any) => t.card_no)
        ).size;
        
        console.log('Unique customers calculated:', uniqueCustomers);
        
        // Gunakan data summary dari backend
        const summaryData = {
          totalTransactions: summary.total || 0,
          totalCustomers: uniqueCustomers || 0,
          totalPoints: summary.total_points_earned || 0,
          totalBillValue: summary.total_bill_value || 0,
          period: `${fromDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} - ${toDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`,
          fromDate: fromDateStr,
          toDate: toDateStr
        };
        console.log('Summary Data for Overview:', summaryData);
        setWiseTransactions(summaryData);
      } else {
        console.error('Wise Transaction failed:', res.status, res.statusText);
      }
    } catch (err) {
      console.error("Failed to fetch Wise transactions:", err);
    } finally {
      setWiseLoading(false);
    }
  };

  useEffect(() => {
    if (!userKey) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        const [devResult, depResult, pkgResult, ticketRes, invRes] = await Promise.allSettled([
          fetch('/api/devices'),
          fetch('/api/deployments'),
          fetch('/api/packages'),
          fetch('/api/reports/tickets'),
          fetch('/api/reports/inventory')
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

        const [devicesData, deploymentsData, packagesData, ticketsData, inventData] = await Promise.all([
          loadJsonArray(devResult, "devices"),
          loadJsonArray(depResult, "deployments"),
          loadJsonArray(pkgResult, "packages"),
          loadJsonArray(ticketRes, "tickets"),
          loadJsonArray(invRes, "inventory")
        ]);

        setDevices(devicesData);
        setDeployments(deploymentsData);
        setPackages(packagesData);
        setTicketStats(ticketsData);
        setInventoryData(inventData);
      } catch (err) {
        console.error("Failed to fetch overview data:", err);
        setDevices([]);
        setDeployments([]);
        setPackages([]);
        setTicketStats([]);
        setInventoryData([]);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    fetchCrmSync();
    fetchDbwhJobs();
    fetchCctvDashboard();
    fetchWiseTransactions();
  }, [userKey]);

  // Auto-slide effect - setiap 3 detik
  useEffect(() => {
    if (!autoSlide) return;
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, 20000); // 20 detik

    return () => clearInterval(interval);
  }, [autoSlide]);

  const online    = devices.filter(d => d.status === "online").length;
  const offline   = devices.filter(d => d.status === "offline").length;
  const deploying = devices.filter(d => d.status === "deploying").length;
  const errored   = devices.filter(d => d.status === "error").length;
  const idle      = devices.filter(d => d.status === "idle").length;
  const activeDeployments = deployments.filter(d => d.status === "running").length;
  const scheduledDeployments = deployments.filter(d => d.status === "scheduled").length;
  const completedDeployments = deployments.filter(d => d.status === "completed").length;
  const failedDeployments = deployments.filter(d => d.status === "failed").length;

  // Charts data
  const ticketChartData = ticketStats?.map((t: any) => ({
    name: t.status,
    value: t.count
  })) || [];

  // CRM derived stats
  const crmToday = crmSyncData.find((r: any) => r.label === 'Today');
  const crmTodayTotal = crmToday ? crmToday.total : 0;
  const crmTodaySynced = crmToday ? crmToday.synced_count : 0;
  const crmTodayPending = crmToday ? crmToday.pending_count : 0;
  const crmSuccessRate = crmTodayTotal > 0
    ? Math.round((crmTodaySynced / crmTodayTotal) * 100)
    : null;

  // DBWH derived stats
  const dbwhSummary = dbwhJobs.reduce((acc: any, job: any) => {
    acc[job.StatusJob] = (acc[job.StatusJob] || 0) + 1;
    return acc;
  }, {});
  const failedDbwhCount = dbwhSummary['Failed'] || 0;

  const totalSlides = 6; // Ditambah jadi 6 slide (tambah CCTV + Wise Transaction)

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setAutoSlide(false); // Pause auto-slide when manually navigating
    setTimeout(() => setAutoSlide(true), 10000); // Resume after 10 seconds
  };

  const CrmTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const synced = payload.find((p: any) => p.dataKey === 'synced_count')?.value || 0;
      const pending = payload.find((p: any) => p.dataKey === 'pending_count')?.value || 0;
      const total = synced + pending;
      const pct = total > 0 ? Math.round((synced / total) * 100) : 0;
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs space-y-1">
          <p className="font-bold text-gray-800">{label}</p>
          <p className="text-emerald-600">✅ Sync Success: <strong>{synced}</strong></p>
          <p className="text-red-600">❌ Pending/Failed: <strong>{pending}</strong></p>
          <p className="text-gray-600">Total: {total} ({pct}% sukses)</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto p-6 h-screen flex flex-col">
        {/* Header with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 shadow-2xl mb-6">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-white">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                  <Activity className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">Overview Dashboard</h1>
                  <p className="text-blue-100 mt-1 text-lg">Central Software Deployment & Monitoring</p>
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
        {/* {activeDeployments > 0 && (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-6 shadow-xl mb-6">
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
        )}*/}

        {/* Slide Container - No Scrolling */}
        <div className="flex-1 relative overflow-hidden">
          {/* Slide Content */}
          <div className="absolute inset-0 flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
            
            {/* Slide 1 - Device Stats */}
            <div className="w-full h-full overflow-y-auto flex-shrink-0 space-y-6 pr-2 sm:pr-6 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Monitor className="w-6 h-6 text-blue-600" />
                  Device Statistics
                </h2>
                <span className="text-sm text-gray-500">Slide 1 of {totalSlides}</span>
              </div>

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

              {/* Device Status Breakdown */}
              <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800">Device Status Breakdown</h3>
                </div>
                <div className="p-6 space-y-4">
                  {[
                    { label: "Online",    count: online,    total: devices.length, color: "bg-emerald-500" },
                    { label: "Deploying", count: deploying, total: devices.length, color: "bg-blue-500" },
                    { label: "Idle",      count: idle, total: devices.length, color: "bg-gray-400" },
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
            </div>

            {/* Slide 2 - Deployment & Tickets */}
            <div className="w-full h-full overflow-y-auto flex-shrink-0 space-y-6 px-2 sm:px-6 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
                  Deployments & Tickets
                </h2>
                <span className="text-sm text-gray-500">Slide 2 of {totalSlides}</span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Deployments */}
                <div className="border-0 shadow-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="text-3xl font-bold">{deployments.length}</div>
                    <p className="text-xs text-indigo-100 uppercase tracking-wider mt-1">Total Deployments</p>
                    <p className="text-sm text-indigo-100/80 mt-2">all time</p>
                  </div>
                </div>

                {/* Completed */}
                <div className="border-0 shadow-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div className="text-3xl font-bold">{completedDeployments}</div>
                    <p className="text-xs text-emerald-100 uppercase tracking-wider mt-1">Completed</p>
                    <p className="text-sm text-emerald-100/80 mt-2">successful</p>
                  </div>
                </div>

                {/* Running */}
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
                    <p className="text-xs text-blue-100 uppercase tracking-wider mt-1">Running</p>
                    <p className="text-sm text-blue-100/80 mt-2">{scheduledDeployments} scheduled</p>
                  </div>
                </div>

                {/* Failed */}
                <div className="border-0 shadow-xl bg-gradient-to-br from-red-500 to-red-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <XCircle className="w-5 h-5" />
                      </div>
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <div className="text-3xl font-bold">{failedDeployments}</div>
                    <p className="text-xs text-red-100 uppercase tracking-wider mt-1">Failed</p>
                    <p className="text-sm text-red-100/80 mt-2">needs attention</p>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Ticket Status Chart */}
                <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden p-6">
                  <h3 className="font-semibold text-gray-800 mb-2">Ticket Status</h3>
                  <p className="text-sm text-gray-500 mb-4">Helpdesk Overview</p>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={ticketChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {ticketChartData.map((entry: any, index: number) => (
                            <Cell key={`cell-t-${index}`} fill={TICKET_COLORS[index % TICKET_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: 'white', borderColor: '#e5e7eb', borderRadius: '8px' }}
                          itemStyle={{ color: '#1f2937' }}
                        />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Software Inventory Chart */}
                <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden p-6">
                  <h3 className="font-semibold text-gray-800 mb-2">Software Inventory</h3>
                  <p className="text-sm text-gray-500 mb-4">Most common applications</p>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={inventoryData.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={120}
                          tick={{ fontSize: 10, fill: '#4b5563' }}
                          tickFormatter={(val) => val.length > 18 ? val.substring(0, 18) + '...' : val}
                        />
                        <Tooltip
                          cursor={{ fill: '#f3f4f6' }}
                          contentStyle={{ backgroundColor: 'white', borderColor: '#e5e7eb', borderRadius: '8px' }}
                          itemStyle={{ color: '#1f2937' }}
                          formatter={(value: number) => [value, "Installs"]}
                        />
                        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={12}>
                          <LabelList dataKey="count" position="right" fill="#1f2937" fontSize={9} fontWeight={600} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Slide 3 - CRM Sync Monitoring */}
            <div className="w-full h-full overflow-y-auto flex-shrink-0 space-y-6 px-2 sm:px-6 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <RefreshCw className="w-6 h-6 text-blue-600" />
                  CRM Sync Monitoring
                </h2>
                <span className="text-sm text-gray-500">Slide 3 of {totalSlides}</span>
              </div>

              {/* CRM Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="border-0 shadow-xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <RefreshCw className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{crmTodayTotal}</div>
                    <p className="text-xs text-cyan-100 uppercase tracking-wider mt-1">Total Items</p>
                    <p className="text-sm text-cyan-100/80 mt-2">today</p>
                  </div>
                </div>

                <div className="border-0 shadow-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{crmTodaySynced}</div>
                    <p className="text-xs text-emerald-100 uppercase tracking-wider mt-1">Synced Success</p>
                    <p className="text-sm text-emerald-100/80 mt-2">HOSERVER</p>
                  </div>
                </div>

                <div className="border-0 shadow-xl bg-gradient-to-br from-orange-500 to-red-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{crmTodayPending}</div>
                    <p className="text-xs text-orange-100 uppercase tracking-wider mt-1">Pending/Failed</p>
                    <p className="text-sm text-orange-100/80 mt-2">needs sync</p>
                  </div>
                </div>

                <div className="border-0 shadow-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{crmSuccessRate !== null ? `${crmSuccessRate}%` : "N/A"}</div>
                    <p className="text-xs text-purple-100 uppercase tracking-wider mt-1">Success Rate</p>
                    <p className="text-sm text-purple-100/80 mt-2">today</p>
                  </div>
                </div>
              </div>

              {/* CRM Sync Chart */}
              <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">LOYAL CRM ITEM SYNC</h3>
                    <p className="text-sm text-gray-500">HOSERVER VS LOYAL CRM</p>
                  </div>
                  <button
                    onClick={fetchCrmSync}
                    disabled={crmLoading}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", crmLoading && "animate-spin")} />
                    Refresh
                  </button>
                </div>

                {crmLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-gray-600">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                      <span className="text-sm">Mengambil data dari HOSERVER...</span>
                    </div>
                  </div>
                ) : crmSyncData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">
                    No data CRM sync.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                    {/* Bar Chart */}
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={crmSyncData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 12, fill: '#1f2937' }}
                          />
                          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                          <Tooltip content={<CrmTooltip />} />
                          <Bar dataKey="synced_count" name="Success" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40}>
                            <LabelList dataKey="synced_count" position="top" fill="#1f2937" fontSize={11} fontWeight={700} />
                          </Bar>
                          <Bar dataKey="pending_count" name="Pending/Failed" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40}>
                            <LabelList dataKey="pending_count" position="top" fill="#1f2937" fontSize={11} fontWeight={700} />
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
                          <div key={row.label} className="bg-white border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-gray-800">{row.label}</span>
                              <span className={cn(
                                "text-xs font-bold px-2 py-0.5 rounded-full",
                                isGood ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                                  isWarn ? "bg-orange-100 text-orange-700 border border-orange-200" :
                                    "bg-red-100 text-red-700 border border-red-200"
                              )}>
                                {isGood ? "✅ All Sync" : isWarn ? "⚠️ Some Pending" : "🔴 Need Attention"}
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-2">
                              <div
                                className={cn("h-full rounded-full transition-all", isGood ? "bg-emerald-500" : "bg-orange-500")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>✅ Success: <strong className="text-emerald-600">{row.synced_count}</strong></span>
                              <span>❌ Pending: <strong className={row.pending_count > 0 ? "text-red-600" : "text-gray-600"}>{row.pending_count}</strong></span>
                              <span>Total: <strong>{row.total}</strong> ({pct}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Slide 4 - DBWH Jobs Monitoring */}
            <div className="w-full h-full overflow-y-auto flex-shrink-0 space-y-6 px-2 sm:px-6 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Database className="w-6 h-6 text-blue-600" />
                  DBWH SQL Agent Jobs
                </h2>
                <span className="text-sm text-gray-500">Slide 4 of {totalSlides}</span>
              </div>

              {/* DBWH Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="border-0 shadow-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <Database className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{dbwhJobs.length}</div>
                    <p className="text-xs text-indigo-100 uppercase tracking-wider mt-1">Total Jobs</p>
                    <p className="text-sm text-indigo-100/80 mt-2">today</p>
                  </div>
                </div>

                <div className="border-0 shadow-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{dbwhSummary['Succeeded'] || 0}</div>
                    <p className="text-xs text-emerald-100 uppercase tracking-wider mt-1">Succeeded</p>
                    <p className="text-sm text-emerald-100/80 mt-2">completed</p>
                  </div>
                </div>

                <div className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <Activity className="w-5 h-5 animate-pulse" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{dbwhSummary['In Progress'] || 0}</div>
                    <p className="text-xs text-blue-100 uppercase tracking-wider mt-1">In Progress</p>
                    <p className="text-sm text-blue-100/80 mt-2">running now</p>
                  </div>
                </div>

                <div className="border-0 shadow-xl bg-gradient-to-br from-red-500 to-red-600 text-white overflow-hidden relative rounded-xl p-6">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <XCircle className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-3xl font-bold">{failedDbwhCount}</div>
                    <p className="text-xs text-red-100 uppercase tracking-wider mt-1">Failed</p>
                    <p className="text-sm text-red-100/80 mt-2">needs attention</p>
                  </div>
                </div>
              </div>

              {/* DBWH Jobs Table */}
              <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">Today's SQL Agent Jobs</h3>
                    <p className="text-sm text-gray-500">DBWH SERVER (192.168.85.55)</p>
                  </div>
                  <button
                    onClick={fetchDbwhJobs}
                    disabled={dbwhLoading}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", dbwhLoading && "animate-spin")} />
                    Refresh
                  </button>
                </div>

                {dbwhLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-gray-600">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                      <span className="text-sm">Querying DBWH Server...</span>
                    </div>
                  </div>
                ) : dbwhJobs.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">
                    No jobs found for today.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-gray-50 z-10">
                        <tr className="border-b border-gray-200">
                          <th className="px-5 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-wider">Job Name</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-wider">Step</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-wider">Start Time</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-wider">Duration</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {dbwhJobs.slice(0, 10).map((job, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                  <ClipboardList className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-sm font-semibold text-gray-800 truncate max-w-[180px]" title={job.JobName}>
                                  {job.JobName}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-600 font-mono">{job.StepName}</td>
                            <td className="px-5 py-3">
                              <div className="flex flex-col">
                                <span className="text-xs text-gray-800 font-medium">
                                  {new Date(job.StartDateTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  {new Date(job.StartDateTime).toLocaleDateString('id-ID')}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs font-mono text-gray-600">{job.Duration_HHMMSS}</td>
                            <td className="px-5 py-3">
                              <StatusBadge status={job.StatusJob} size="xs" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Slide 5 - CCTV Monitoring Dashboard */}
            <div className="w-full h-full overflow-y-auto flex-shrink-0 space-y-6 px-2 sm:px-6 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Video className="w-6 h-6 text-blue-600" />
                  CCTV Monitoring
                </h2>
                <span className="text-sm text-gray-500">Slide 5 of {totalSlides}</span>
              </div>

              {cctvLoading ? (
                <div className="h-[400px] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-gray-600">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="text-sm">Loading CCTV data...</span>
                  </div>
                </div>
              ) : !cctvDashboard ? (
                <div className="h-[400px] flex items-center justify-center text-gray-500 text-sm">
                  No CCTV data available.
                </div>
              ) : (
                <>
                  {/* CCTV Stats Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden relative rounded-xl p-6">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2 bg-white/20 rounded-lg">
                            <Monitor className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-3xl font-bold">{cctvDashboard.devices?.total_devices || 0}</div>
                        <p className="text-xs text-blue-100 uppercase tracking-wider mt-1">Total Devices</p>
                        <p className="text-sm text-blue-100/80 mt-2">NVR/DVR/Hybrid</p>
                      </div>
                    </div>

                    <div className="border-0 shadow-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white overflow-hidden relative rounded-xl p-6">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2 bg-white/20 rounded-lg">
                            <Signal className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-3xl font-bold">{cctvDashboard.devices?.online_devices || 0}</div>
                        <p className="text-xs text-emerald-100 uppercase tracking-wider mt-1">Online Devices</p>
                        <p className="text-sm text-emerald-100/80 mt-2">{cctvDashboard.devices?.offline_devices || 0} offline</p>
                      </div>
                    </div>

                    <div className="border-0 shadow-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white overflow-hidden relative rounded-xl p-6">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2 bg-white/20 rounded-lg">
                            <Video className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-3xl font-bold">{cctvDashboard.channels?.total_channels || 0}</div>
                        <p className="text-xs text-purple-100 uppercase tracking-wider mt-1">Total Channels</p>
                        <p className="text-sm text-purple-100/80 mt-2">{cctvDashboard.channels?.recording_channels || 0} recording</p>
                      </div>
                    </div>

                    <div className="border-0 shadow-xl bg-gradient-to-br from-orange-500 to-red-600 text-white overflow-hidden relative rounded-xl p-6">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2 bg-white/20 rounded-lg">
                            <HardDrive className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="text-3xl font-bold">{cctvDashboard.storage?.total_disks || 0}</div>
                        <p className="text-xs text-orange-100 uppercase tracking-wider mt-1">Storage Disks</p>
                        <p className="text-sm text-orange-100/80 mt-2">{cctvDashboard.storage?.critical_disks || 0} running full</p>
                      </div>
                    </div>
                  </div>

                  {/* CCTV Details */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden p-6">
                      <h3 className="font-semibold text-gray-800 mb-4">Device Status</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Online</span>
                          <span className="font-bold text-emerald-600">{cctvDashboard.devices?.online_devices || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Offline</span>
                          <span className="font-bold text-gray-500">{cctvDashboard.devices?.offline_devices || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Error</span>
                          <span className="font-bold text-red-600">{cctvDashboard.devices?.error_devices || 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden p-6">
                      <h3 className="font-semibold text-gray-800 mb-4">Channel Status</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Online</span>
                          <span className="font-bold text-emerald-600">{cctvDashboard.channels?.online_channels || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Offline</span>
                          <span className="font-bold text-gray-500">{cctvDashboard.channels?.offline_channels || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Recording</span>
                          <span className="font-bold text-blue-600">{cctvDashboard.channels?.recording_channels || 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden p-6">
                      <h3 className="font-semibold text-gray-800 mb-4">Storage Health</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Normal</span>
                          <span className="font-bold text-emerald-600">{cctvDashboard.storage?.normal_disks || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Warning</span>
                          <span className="font-bold text-orange-600">{cctvDashboard.storage?.warning_disks || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Critical</span>
                          <span className="font-bold text-red-600">{cctvDashboard.storage?.critical_disks || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Slide 6 - Wise Customer Transaction */}
            <div className="w-full h-full overflow-y-auto flex-shrink-0 space-y-6 px-2 sm:px-6 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                  Wise Customer Transactions
                </h2>
                <span className="text-sm text-gray-500">Slide 6 of {totalSlides}</span>
              </div>

              {wiseLoading ? (
                <div className="h-[400px] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-gray-600">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <span className="text-sm">Loading transaction data...</span>
                  </div>
                </div>
              ) : !wiseTransactions ? (
                <div className="h-[400px] flex items-center justify-center text-gray-500 text-sm">
                  No transaction data available.
                </div>
              ) : (
                <>
                  {/* Period Info */}
                  <div className="border-0 shadow-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white overflow-hidden relative rounded-xl p-6">
                    <div className="absolute inset-0 bg-black/10"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-lg shrink-0">
                          <Calendar className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base sm:text-lg font-bold">Transaction Period</h3>
                          <p className="text-xs sm:text-sm text-indigo-100">{wiseTransactions.period}</p>
                        </div>
                      </div>
                      <button
                        onClick={fetchWiseTransactions}
                        disabled={wiseLoading}
                        className="flex items-center justify-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors w-full sm:w-auto"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", wiseLoading && "animate-spin")} />
                        Refresh
                      </button>
                    </div>
                  </div>

                  {/* Wise Stats Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="border-0 shadow-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white overflow-hidden relative rounded-xl p-8">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-3 bg-white/20 rounded-lg shrink-0">
                            <ShoppingCart className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-2xl sm:text-3xl lg:text-4xl font-bold truncate">{wiseTransactions.totalTransactions.toLocaleString()}</div>
                            <p className="text-xs sm:text-sm text-cyan-100 mt-1 truncate">Total Transactions</p>
                          </div>
                        </div>
                        <p className="text-xs text-cyan-100/80">This month period</p>
                      </div>
                    </div>

                    <div className="border-0 shadow-xl bg-gradient-to-br from-purple-500 to-pink-600 text-white overflow-hidden relative rounded-xl p-8">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-3 bg-white/20 rounded-lg shrink-0">
                            <Users className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-2xl sm:text-3xl lg:text-4xl font-bold truncate">{wiseTransactions.totalCustomers.toLocaleString()}</div>
                            <p className="text-xs sm:text-sm text-purple-100 mt-1 truncate">Unique Customers</p>
                          </div>
                        </div>
                        <p className="text-xs text-purple-100/80">Active members</p>
                      </div>
                    </div>

                    <div className="border-0 shadow-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white overflow-hidden relative rounded-xl p-8">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-3 bg-white/20 rounded-lg shrink-0">
                            <TrendingUp className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-2xl sm:text-3xl lg:text-4xl font-bold truncate">{wiseTransactions.totalPoints.toLocaleString()}</div>
                            <p className="text-xs sm:text-sm text-emerald-100 mt-1 truncate">Points Earned</p>
                          </div>
                        </div>
                        <p className="text-xs text-emerald-100/80">Loyalty rewards</p>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Summary */}
                  <div className="border-0 shadow-xl bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden p-6">
                    <h3 className="font-semibold text-gray-800 mb-4">Transaction Summary</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">Avg. Transaction/Day</p>
                        <p className="text-xl sm:text-2xl font-bold text-blue-600">
                          {Math.round(wiseTransactions.totalTransactions / new Date().getDate())}
                        </p>
                      </div>
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">Avg. Points/Transaction</p>
                        <p className="text-xl sm:text-2xl font-bold text-purple-600">
                          {wiseTransactions.totalTransactions > 0 ? Math.round(wiseTransactions.totalPoints / wiseTransactions.totalTransactions) : 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Slide Navigation */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <button
            onClick={prevSlide}
            className="p-3 bg-white/80 backdrop-blur-sm hover:bg-white shadow-xl rounded-xl transition-all duration-300 hover:scale-110"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>

          <div className="flex gap-2">
            {Array.from({ length: totalSlides }).map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`transition-all duration-300 rounded-full ${
                  currentSlide === index
                    ? 'w-8 h-3 bg-blue-600'
                    : 'w-3 h-3 bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          <button
            onClick={nextSlide}
            className="p-3 bg-white/80 backdrop-blur-sm hover:bg-white shadow-xl rounded-xl transition-all duration-300 hover:scale-110"
            aria-label="Next slide"
          >
            <ChevronRight className="w-6 h-6 text-gray-700" />
          </button>
        </div>
      </div>
    </div>
  );
}
