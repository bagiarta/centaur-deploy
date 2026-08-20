import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Trophy, Award, RefreshCw, Calendar, Search, Database,
  TrendingUp, Users, UserPlus, Activity, Sparkles, ChevronDown, 
  ChevronUp, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, FileSpreadsheet
} from "lucide-react";
import { PageHeader, SectionCard, StatCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Achievement {
  name: string;
  unlocked_at: string;
  criteria_met: string;
}

interface MemberProfile {
  member_id: string;
  name: string;
  mobile_no: string;
  join_date: string;
  city: string;
  total_spent: number;
  total_transactions: number;
  last_active_date: string;
  favorite_store: string;
  points_balance: number;
  achievements: Achievement[];
}

interface DailySummary {
  member_id: string;
  summary_date: string;
  org_cd: string;
  total_sales: number;
  total_cost: number;
  total_promo: number;
  total_margin: number;
  total_qty: number;
  total_txn: number;
  last_purchase_time: string;
  categories_bought: string;
  name?: string;
  mobile_no?: string;
}

interface OverallStats {
  totalProfiles: number;
  totalSpend: number;
  totalTransactions: number;
  totalAchievements: number;
}

interface Store {
  org_cd: string;
  org_name: string;
}

const ACHIEVEMENT_BADGES: Record<string, { icon: string; color: string; desc: string }> = {
  'Ultimate Explorer': { icon: "🌍", color: "bg-blue-500/10 text-blue-500 border-blue-500/30", desc: "Bought items from 10 or more different stores" },
  'Alcohol Enthusiast': { icon: "🍷", color: "bg-purple-500/10 text-purple-500 border-purple-500/30", desc: "Purchased alcohol items QTY >= 5 or total sales >= Rp 500,000" },
  'Fruit Lover': { icon: "🍎", color: "bg-red-500/10 text-red-500 border-red-500/30", desc: "Purchased fruit items QTY >= 10" },
  'Vegetable Lover': { icon: "🥦", color: "bg-green-500/10 text-green-500 border-green-500/30", desc: "Purchased vegetable items QTY >= 10" },
  'Coffee Addict': { icon: "☕", color: "bg-amber-700/10 text-amber-700 border-amber-700/30", desc: "Purchased coffee items QTY >= 10" },
  'Seafood Hunter': { icon: "🐟", color: "bg-sky-500/10 text-sky-500 border-sky-500/30", desc: "Purchased seafood items QTY >= 5" },
  'Meat Lover': { icon: "🥩", color: "bg-rose-600/10 text-rose-600 border-rose-600/30", desc: "Purchased meat items QTY >= 10" },
  'Baby Care Hero': { icon: "🍼", color: "bg-pink-500/10 text-pink-500 border-pink-500/30", desc: "Purchased baby care items QTY >= 5" },
  'Big Spender': { icon: "💰", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", desc: "Total spent >= Rp 5,000,000" },
  'Premium Shopper': { icon: "💎", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30", desc: "Avg basket >= Rp 1,000,000 & transactions >= 3" },
  'Frequent Shopper': { icon: "⚡", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", desc: "Total transactions >= 20" },
  'Weekend Shopper': { icon: "📅", color: "bg-teal-500/10 text-teal-500 border-teal-500/30", desc: "Completed 10 or more transactions during weekends" },
  'Promo Hunter': { icon: "🏷️", color: "bg-orange-500/10 text-orange-500 border-orange-500/30", desc: "Saved Promo value >= 20% of total spent" }
};

// Helper to get local date string YYYY-MM-DD
const getLocalYYYYMMDD = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const getFirstDayOfCurrentMonth = () => {
  const now = new Date();
  return getLocalYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1));
};

const getTodayDateString = () => {
  return getLocalYYYYMMDD(new Date());
};

export default function CrmDevLoyaltyPage() {
  const [activeTab, setActiveTab] = useState<'profiles' | 'summaries' | 'item-sales'>('profiles');
  const [loading, setLoading] = useState(true);

  // Overall Stats
  const [stats, setStats] = useState<OverallStats>({
    totalProfiles: 0,
    totalSpend: 0,
    totalTransactions: 0,
    totalAchievements: 0
  });

  // Global Filters
  const [filterStore, setFilterStore] = useState("All Stores");
  const [filterFromDate, setFilterFromDate] = useState(getFirstDayOfCurrentMonth());
  const [filterToDate, setFilterToDate] = useState(getTodayDateString());
  const [stores, setStores] = useState<Store[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Profiles Tab State
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [profSearch, setProfSearch] = useState("");
  const [profSearchInput, setProfSearchInput] = useState("");
  const [profPage, setProfPage] = useState(1);
  const [profPerPage] = useState(50);
  const [profSortBy, setProfSortBy] = useState("total_spent");
  const [profSortDir, setProfSortDir] = useState<"asc" | "desc">("desc");
  const [profTotal, setProfTotal] = useState(0);

  // Summaries Tab State
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [sumSearch, setSumSearch] = useState("");
  const [sumSearchInput, setSumSearchInput] = useState("");
  const [sumPage, setSumPage] = useState(1);
  const [sumPerPage] = useState(50);
  const [sumSortBy, setSumSortBy] = useState("org_cd");
  const [sumSortDir, setSumSortDir] = useState<"asc" | "desc">("asc");
  const [sumTotal, setSumTotal] = useState(0);

  // Item Sales Tab State
  const activeItemSalesReq = useRef(0);
  const [itemSales, setItemSales] = useState<any[]>([]);
  const [itemSalesSearch, setItemSalesSearch] = useState("");
  const [itemSalesSearchInput, setItemSalesSearchInput] = useState("");
  const [itemSalesPage, setItemSalesPage] = useState(1);
  const [itemSalesPerPage] = useState(50);
  const [itemSalesSortBy, setItemSalesSortBy] = useState("org_cd");
  const [itemSalesSortDir, setItemSalesSortDir] = useState<"asc" | "desc">("asc");
  const [itemSalesTotal, setItemSalesTotal] = useState(0);
  const [deptStats, setDeptStats] = useState<any[]>([]);
  const [brandStats, setBrandStats] = useState<any[]>([]);

  // ETL Manual Trigger
  const [fromDate, setFromDate] = useState(new Date(new Date().setDate(new Date().getDate() - 2)).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [etlRunning, setEtlRunning] = useState(false);
  const [etlLogs, setEtlLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Badge details popover state
  const [selectedBadge, setSelectedBadge] = useState<{
    name: string;
    criteria: string;
    date: string;
    x: number;
    y: number;
  } | null>(null);

  // Fetch static data on mount
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await fetch("/api/crm/reports/stores");
        if (res.ok) {
          const data = await res.json();
          setStores(data || []);
        }
      } catch (e) {
        console.error("Failed to load stores", e);
      }
    };
    fetchStores();

    // The ETL polling is now handled by a dedicated useEffect below.
  }, []);

  // Poll ETL status every 3 seconds while it is running
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (etlRunning) {
      interval = setInterval(async () => {
        try {
          const res = await fetch('/api/dev/loyalty/etl-status');
          if (res.ok) {
            const status = await res.json();
            setEtlLogs(status.logs || []);
            
            if (!status.running) {
              setEtlRunning(false);
              toast.success("ETL process finished. Refreshing data!");
              fetchStats(filterStore, filterFromDate, filterToDate);
              if (activeTab === 'profiles') fetchProfiles(filterStore, filterFromDate, filterToDate);
              else if (activeTab === 'summaries') fetchSummaries(filterStore, filterFromDate, filterToDate);
              else fetchItemSales(filterStore, filterFromDate, filterToDate);
            }
          }
        } catch (e) {
          // fail silently
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [etlRunning, activeTab, filterStore, filterFromDate, filterToDate]);


  // Close badge popover on scroll so it doesn't detach
  useEffect(() => {
    const handleScroll = () => {
      if (selectedBadge) setSelectedBadge(null);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [selectedBadge]);

  // Fetch overall statistics when global filters change
  useEffect(() => {
    fetchStats(filterStore, filterFromDate, filterToDate);
  }, [filterStore, filterFromDate, filterToDate]);

  // Fetch profiles when dependency state changes
  useEffect(() => {
    if (activeTab === 'profiles') {
      fetchProfiles(filterStore, filterFromDate, filterToDate);
    }
  }, [activeTab, profPage, profSearch, profSortBy, profSortDir, filterStore, filterFromDate, filterToDate]);

  // Fetch summaries when dependency state changes
  useEffect(() => {
    if (activeTab === 'summaries') {
      fetchSummaries(filterStore, filterFromDate, filterToDate);
    }
  }, [activeTab, sumPage, sumSearch, sumSortBy, sumSortDir, filterStore, filterFromDate, filterToDate]);

  // Fetch item sales when dependency state changes
  useEffect(() => {
    if (activeTab === 'item-sales') {
      fetchItemSales(filterStore, filterFromDate, filterToDate);
    }
  }, [activeTab, itemSalesPage, itemSalesSearch, filterStore, filterFromDate, filterToDate]);

  const fetchStats = async (store = filterStore, from = filterFromDate, to = filterToDate) => {
    try {
      const q = new URLSearchParams();
      if (store && store !== "All Stores") q.append("store", store);
      if (from) q.append("fromDate", from);
      if (to) q.append("toDate", to);

      const res = await fetch(`/api/dev/loyalty/stats?${q}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Error fetching loyalty statistics", e);
    }
  };

  const activeProfReq = useRef(0);
  const fetchProfiles = async (store = filterStore, from = filterFromDate, to = filterToDate) => {
    activeProfReq.current += 1;
    const currentReq = activeProfReq.current;
    
    setLoading(true);
    setProfiles([]);
    try {
      const q = new URLSearchParams({
        page: profPage.toString(),
        perPage: profPerPage.toString(),
        search: profSearch,
        sortBy: profSortBy,
        sortDir: profSortDir
      });
      if (store && store !== "All Stores") q.append("store", store);
      if (from) q.append("fromDate", from);
      if (to) q.append("toDate", to);

      const res = await fetch(`/api/dev/loyalty/profiles?${q}`);
      if (currentReq !== activeProfReq.current) return;
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
        setProfTotal(data.total || 0);
      }
    } catch (err: any) {
      toast.error("Failed to load member profiles");
    } finally {
      setLoading(false);
    }
  };

  const activeSumReq = useRef(0);
  const fetchSummaries = async (store = filterStore, from = filterFromDate, to = filterToDate) => {
    activeSumReq.current += 1;
    const currentReq = activeSumReq.current;
    
    setLoading(true);
    setSummaries([]);
    try {
      const q = new URLSearchParams({
        page: sumPage.toString(),
        perPage: sumPerPage.toString(),
        search: sumSearch,
        sortBy: sumSortBy,
        sortDir: sumSortDir
      });
      if (store && store !== "All Stores") q.append("store", store);
      if (from) q.append("fromDate", from);
      if (to) q.append("toDate", to);

      const res = await fetch(`/api/dev/loyalty/summary?${q}`);
      if (currentReq !== activeSumReq.current) return;
      if (res.ok) {
        const data = await res.json();
        setSummaries(data.summaries || []);
        setSumTotal(data.total || 0);
      }
    } catch (err: any) {
      toast.error("Failed to load daily summaries");
    } finally {
      setLoading(false);
    }
  };

  const fetchItemSales = async (store = filterStore, from = filterFromDate, to = filterToDate) => {
    activeItemSalesReq.current += 1;
    const currentReq = activeItemSalesReq.current;
    
    setLoading(true);
    // Clear existing data while loading to avoid showing stale data (like 'org 002') if fetch fails or takes time
    setItemSales([]);
    setItemSalesTotal(0);
    setDeptStats([]);
    setBrandStats([]);
    
    try {
      const q = new URLSearchParams({
        page: itemSalesPage.toString(),
        perPage: itemSalesPerPage.toString(),
        search: itemSalesSearch,
        sortBy: itemSalesSortBy,
        sortDir: itemSalesSortDir
      });
      if (store && store !== "All Stores") q.append("store", store);
      if (from) q.append("fromDate", from);
      if (to) q.append("toDate", to);

      const res = await fetch(`/api/dev/loyalty/item-sales?${q}`);
      if (currentReq !== activeItemSalesReq.current) return;
      
      if (res.ok) {
        const data = await res.json();
        setItemSales(data.sales || []);
        setItemSalesTotal(data.total || 0);
        setDeptStats(data.deptStats || []);
        setBrandStats(data.brandStats || []);
      }
    } catch (e) {
      console.error("Error fetching item sales", e);
      toast.error("Failed to load item sales details");
    } finally {
      setLoading(false);
    }
  };

  // checkEtlStatus was removed as it's now embedded in the polling useEffect.

  const handleTriggerEtl = async () => {
    if (etlRunning) return;
    
    setEtlRunning(true);
    setShowLogs(true);
    setEtlLogs(["[Client] Sending ETL start trigger..."]);

    try {
      const res = await fetch('/api/dev/loyalty/trigger-etl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate })
      });

      if (res.ok) {
        toast.info("ETL sync started in the background");
        // No need to manually check here, setEtlRunning(true) triggers the polling useEffect
      } else {
        const err = await res.json();
        throw new Error(err.error || "Failed to start ETL");
      }
    } catch (err: any) {
      toast.error(err.message);
      setEtlRunning(false);
    }
  };

  const handleProfSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfPage(1);
    setProfSearch(profSearchInput);
  };

  const handleSumSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSumPage(1);
    setSumSearch(sumSearchInput);
  };

  const handleItemSalesSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setItemSalesPage(1);
    setItemSalesSearch(itemSalesSearchInput);
  };

  const toggleProfSort = (column: string) => {
    if (profSortBy === column) {
      setProfSortDir(profSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setProfSortBy(column);
      setProfSortDir('desc');
    }
    setProfPage(1);
  };

  const toggleSumSort = (col: string) => {
    if (sumSortBy === col) {
      setSumSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSumSortBy(col);
      setSumSortDir('desc');
    }
    setSumPage(1);
  };

  const toggleItemSalesSort = (col: string) => {
    if (itemSalesSortBy === col) {
      setItemSalesSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setItemSalesSortBy(col);
      setItemSalesSortDir('desc');
    }
    setItemSalesPage(1);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  };

  const renderSortArrow = (column: string, activeColumn: string, direction: 'asc' | 'desc') => {
    if (activeColumn !== column) return null;
    return direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 inline ml-1 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-1 text-primary" />;
  };

  // Profiles pagination metrics
  const profTotalPages = Math.ceil(profTotal / profPerPage) || 1;
  const profStartRecord = (profPage - 1) * profPerPage + 1;
  const profEndRecord = Math.min(profPage * profPerPage, profTotal);

  // Summaries pagination metrics
  const sumTotalPages = Math.ceil(sumTotal / sumPerPage) || 1;
  const sumStartRecord = (sumPage - 1) * sumPerPage + 1;
  const sumEndRecord = Math.min(sumPage * sumPerPage, sumTotal);

  // Item sales pagination metrics
  const itemSalesTotalPages = Math.ceil(itemSalesTotal / itemSalesPerPage) || 1;
  const itemSalesStartRecord = (itemSalesPage - 1) * itemSalesPerPage + 1;
  const itemSalesEndRecord = Math.min(itemSalesPage * itemSalesPerPage, itemSalesTotal);

  return (
    <div className="p-6 space-y-6 animate-fade-up relative">
      <PageHeader
        title="CRM Loyalty & Achievements Engine"
        subtitle="Developer Analytics Dashboard & Achievements evaluation"
        actions={
          <div className="flex gap-2">
            <button
              disabled={isExporting}
              onClick={async () => {
                setIsExporting(true);
                try {
                  const q = new URLSearchParams();
                  if (filterStore && filterStore !== "All Stores") q.append("store", filterStore);
                  if (filterFromDate) q.append("fromDate", filterFromDate);
                  if (filterToDate) q.append("toDate", filterToDate);
                  
                  if (activeTab === 'profiles') {
                    if (profSearch) q.append("search", profSearch);
                  } else if (activeTab === 'summaries') {
                    if (sumSearch) q.append("search", sumSearch);
                  } else if (activeTab === 'item-sales') {
                    if (itemSalesSearch) q.append("search", itemSalesSearch);
                  }
                  
                  const response = await fetch(`/api/dev/loyalty/export/${activeTab}/excel?${q.toString()}`);
                  if (!response.ok) throw new Error("Failed to export");
                  
                  const disposition = response.headers.get('content-disposition');
                  let filename = `Export_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`;
                  if (disposition && disposition.indexOf('attachment') !== -1) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                      filename = matches[1].replace(/['"]/g, '');
                    }
                  }
                  
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                } catch (e) {
                  console.error("Export error:", e);
                  toast.error("Failed to export data");
                } finally {
                  setIsExporting(false);
                }
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-surface border border-border rounded-xl text-xs font-bold hover:bg-surface-raised transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 text-success animate-spin" /> Exporting...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4 text-success" /> Export Excel
                </>
              )}
            </button>
            <button
              onClick={() => { fetchStats(filterStore, filterFromDate, filterToDate); if (activeTab === 'profiles') fetchProfiles(filterStore, filterFromDate, filterToDate); else if (activeTab === 'summaries') fetchSummaries(filterStore, filterFromDate, filterToDate); else fetchItemSales(filterStore, filterFromDate, filterToDate); }}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-surface border border-border rounded-xl text-xs font-bold hover:bg-surface-raised transition-all"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh Tables
            </button>
          </div>
        }
      />

      {/* Analytics Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Loyalty Spenders"
          value={stats.totalProfiles}
          icon={<Users className="w-4 h-4 text-primary" />}
          variant="primary"
        />
        <StatCard
          label="Total Sales Accumulated"
          value={formatCurrency(stats.totalSpend)}
          icon={<TrendingUp className="w-4 h-4 text-success" />}
          variant="success"
        />
        <StatCard
          label="Total Member Transactions"
          value={stats.totalTransactions}
          icon={<Activity className="w-4 h-4 text-warning" />}
          variant="warning"
        />
        <StatCard
          label="Achievements Unlocked"
          value={stats.totalAchievements}
          icon={<Trophy className="w-4 h-4 text-danger" />}
          variant="danger"
        />
      </div>



      {/* Dev ETL Trigger Widget */}
      <SectionCard className="border border-border/80">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
          <div>
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-yellow-500" />
              Dev ETL Sync Control (SERVER)
            </h3>
            <p className="text-xs text-foreground-muted">
              Pulls populating data <code className="font-bold text-primary bg-primary/10 px-1 py-0.5 rounded">SERVER</code>.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 text-xs">
              <Calendar className="w-4 h-4 text-foreground-muted" />
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="bg-transparent border-none outline-none focus:ring-0 p-0 w-[105px] text-foreground font-medium"
              />
              <span className="text-foreground-muted">→</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="bg-transparent border-none outline-none focus:ring-0 p-0 w-[105px] text-foreground font-medium"
              />
            </div>

            <button
              onClick={handleTriggerEtl}
              disabled={etlRunning}
              className={cn(
                "px-4 py-2 bg-success text-success-foreground rounded-xl text-xs font-bold shadow-glow flex items-center gap-2 transition-all",
                etlRunning ? "opacity-60 cursor-not-allowed" : "hover:translate-y-[-1px]"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", etlRunning && "animate-spin")} />
              {etlRunning ? "Running ETL..." : "Trigger Dev ETL"}
            </button>
            
            {etlLogs.length > 0 && (
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="px-3 py-2 border border-border bg-surface hover:bg-surface-raised rounded-xl text-xs font-medium text-foreground transition-all"
              >
                {showLogs ? "Hide Logs" : `Show Logs (${etlLogs.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Real-time Log Console */}
        {showLogs && etlLogs.length > 0 && (
          <div className="p-4 bg-black/80 border border-border rounded-xl font-mono text-[10px] text-emerald-400 space-y-1 max-h-56 overflow-y-auto mt-3 select-text shadow-inner">
            <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2">
              <span className="font-bold text-foreground">ETL LOG CONSOLE</span>
              <span className="text-[9px] text-foreground-muted italic">Updates automatically</span>
            </div>
            {etlLogs.map((log, index) => (
              <div key={index} className="leading-relaxed whitespace-pre-wrap">{log}</div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Tabs list with inline filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border gap-4 pb-2 md:pb-0">
        <div className="flex border-b border-transparent">
          <button
            onClick={() => setActiveTab('profiles')}
            className={cn(
              "px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-px flex items-center gap-1.5",
              activeTab === 'profiles'
                ? "border-primary text-primary"
                : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            <Trophy className="w-4 h-4" /> Member Profiles & Badges ({stats.totalProfiles})
          </button>
          <button
            onClick={() => setActiveTab('summaries')}
            className={cn(
              "px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-px flex items-center gap-1.5",
              activeTab === 'summaries'
                ? "border-primary text-primary"
                : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            <Database className="w-4 h-4" /> Daily Summaries ({sumTotal})
          </button>
          <button
            onClick={() => setActiveTab('item-sales')}
            className={cn(
              "px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-px flex items-center gap-1.5",
              activeTab === 'item-sales'
                ? "border-primary text-primary"
                : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            <Sparkles className="w-4 h-4" /> Member Item Sales ({itemSalesTotal})
          </button>
        </div>

        {/* Inline Filters */}
        <div className="flex flex-wrap items-center gap-2 pb-2 md:pb-0">
          {/* Store Dropdown Filter */}
          <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-2.5 py-1.5 text-[11px]">
            <span className="text-foreground-muted font-medium">Store:</span>
            <select
              value={filterStore}
              onChange={e => { setFilterStore(e.target.value); setProfPage(1); setSumPage(1); setItemSalesPage(1); }}
              className="bg-transparent border-none outline-none focus:ring-0 p-0 text-foreground font-semibold cursor-pointer max-w-[120px]"
            >
              <option value="All Stores" className="bg-surface text-foreground">All Stores</option>
              {stores.map(st => (
                <option key={st.org_cd} value={st.org_cd} className="bg-surface text-foreground">
                  {st.org_cd} - {st.org_name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5 text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-foreground-muted" />
            <input
              type="date"
              value={filterFromDate}
              onChange={e => { setFilterFromDate(e.target.value); setProfPage(1); setSumPage(1); setItemSalesPage(1); }}
              className="bg-transparent border-none outline-none focus:ring-0 p-0 w-[95px] text-foreground font-semibold"
            />
            <span className="text-foreground-muted">→</span>
            <input
              type="date"
              value={filterToDate}
              onChange={e => { setFilterToDate(e.target.value); setProfPage(1); setSumPage(1); setItemSalesPage(1); }}
              className="bg-transparent border-none outline-none focus:ring-0 p-0 w-[95px] text-foreground font-semibold"
            />
            {(filterFromDate || filterToDate) && (
              <button
                type="button"
                onClick={() => { setFilterFromDate(""); setFilterToDate(""); setProfPage(1); setSumPage(1); setItemSalesPage(1); }}
                className="text-[10px] text-danger hover:underline font-bold ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'profiles' ? (
        <SectionCard>
          {/* Search bar */}
          <form onSubmit={handleProfSearchSubmit} className="flex items-center gap-2 mb-4 max-w-md">
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 flex-1">
              <Search className="w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search card, name, city, or phone..."
                value={profSearchInput}
                onChange={e => setProfSearchInput(e.target.value)}
                className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-glow"
            >
              Search
            </button>
          </form>

          <div className="relative overflow-x-auto border border-border rounded-2xl bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-raised/50 border-b border-border">
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center w-12">#</th>
                  <th onClick={() => toggleProfSort('member_id')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-foreground select-none">
                    Card / Member {renderSortArrow('member_id', profSortBy, profSortDir)}
                  </th>
                  <th onClick={() => toggleProfSort('name')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-foreground select-none">
                    Customer Details {renderSortArrow('name', profSortBy, profSortDir)}
                  </th>
                  <th onClick={() => toggleProfSort('total_spent')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-right cursor-pointer hover:text-foreground select-none">
                    Spent {renderSortArrow('total_spent', profSortBy, profSortDir)}
                  </th>
                  <th onClick={() => toggleProfSort('total_transactions')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center cursor-pointer hover:text-foreground select-none">
                    Txns {renderSortArrow('total_transactions', profSortBy, profSortDir)}
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Favorite Store</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Achievements Badges</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-4 py-7 bg-white/5" />
                    </tr>
                  ))
                ) : profiles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-foreground-muted italic text-xs">
                      No member profiles found. Trigger the Dev ETL above to populate.
                    </td>
                  </tr>
                ) : profiles.map((p, idx) => (
                  <tr key={p.member_id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3 text-xs text-foreground-muted text-center font-mono">{profStartRecord + idx}</td>
                    <td className="px-4 py-3 text-xs font-semibold">
                      <div className="font-mono text-primary">{p.member_id}</div>
                      <div className="text-[10px] text-foreground-muted font-normal mt-0.5">{p.city}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold text-foreground/90">{p.name || 'Anonymous member'}</div>
                      <div className="text-[10px] text-foreground-muted mt-0.5">{p.mobile_no || 'No Phone'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-success text-right font-bold">
                      {formatCurrency(p.total_spent)}
                    </td>
                    <td className="px-4 py-3 text-xs text-center font-mono font-bold text-foreground/80">
                      {p.total_transactions}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.favorite_store ? (
                        <div className="font-bold text-foreground-subtle">
                          <span className="text-primary font-mono mr-1">[{p.favorite_store}]</span>
                          {stores.find(s => s.org_cd === p.favorite_store)?.org_name || 'Store'}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {p.achievements && p.achievements.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {p.achievements.map((ach) => {
                            const badge = ACHIEVEMENT_BADGES[ach.name] || { icon: "🏆", color: "bg-surface border-border text-foreground", desc: "" };
                            return (
                              <div
                                key={ach.name}
                                className={cn(
                                  "relative inline-flex items-center justify-center w-7 h-7 rounded-lg border text-xs cursor-pointer select-none transition-all hover:scale-110 shadow-sm",
                                  badge.color
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setSelectedBadge({
                                    name: ach.name,
                                    criteria: ach.criteria_met,
                                    date: new Date(ach.unlocked_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
                                    x: rect.left - 12,
                                    y: rect.top + rect.height / 2
                                  });
                                }}
                              >
                                {badge.icon}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[10px] text-foreground-muted italic">No Badges</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Profiles pagination controls */}
          {!loading && profTotal > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 px-1 text-xs">
              <span className="text-foreground-muted">
                Showing <strong className="text-foreground font-semibold">{profStartRecord}</strong> to <strong className="text-foreground font-semibold">{profEndRecord}</strong> of <strong className="text-foreground font-semibold">{profTotal.toLocaleString('id-ID')}</strong> profiles
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setProfPage(1)}
                  disabled={profPage === 1}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setProfPage(prev => Math.max(prev - 1, 1))}
                  disabled={profPage === 1}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 bg-surface border border-border rounded-lg text-foreground font-bold">
                  Page {profPage} of {profTotalPages}
                </span>

                <button
                  onClick={() => setProfPage(prev => Math.min(prev + 1, profTotalPages))}
                  disabled={profPage === profTotalPages}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setProfPage(profTotalPages)}
                  disabled={profPage === profTotalPages}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      ) : activeTab === 'summaries' ? (
        <SectionCard>
          {/* Search bar */}
          <form onSubmit={handleSumSearchSubmit} className="flex items-center gap-2 mb-4 max-w-md">
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 flex-1">
              <Search className="w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search member card ID..."
                value={sumSearchInput}
                onChange={e => setSumSearchInput(e.target.value)}
                className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-glow"
            >
              Search
            </button>
          </form>

          <div className="relative overflow-x-auto border border-border rounded-2xl bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-raised/50 border-b border-border">
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center w-12">#</th>
                  <th onClick={() => toggleSumSort('summary_date')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-foreground select-none">
                    Date {renderSortArrow('summary_date', sumSortBy, sumSortDir)}
                  </th>
                  <th onClick={() => toggleSumSort('member_id')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-foreground select-none">
                    Member Card {renderSortArrow('member_id', sumSortBy, sumSortDir)}
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-left">
                    Customer Name
                  </th>
                  <th onClick={() => toggleSumSort('org_cd')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-foreground select-none">
                    Store {renderSortArrow('org_cd', sumSortBy, sumSortDir)}
                  </th>
                  <th onClick={() => toggleSumSort('total_sales')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-right cursor-pointer hover:text-foreground select-none">
                    Sales Value {renderSortArrow('total_sales', sumSortBy, sumSortDir)}
                  </th>
                  <th onClick={() => toggleSumSort('total_qty')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center cursor-pointer hover:text-foreground select-none">
                    Qty {renderSortArrow('total_qty', sumSortBy, sumSortDir)}
                  </th>
                  <th onClick={() => toggleSumSort('total_txn')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center cursor-pointer hover:text-foreground select-none">
                    Txns {renderSortArrow('total_txn', sumSortBy, sumSortDir)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-4 py-7 bg-white/5" />
                    </tr>
                  ))
                ) : summaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-foreground-muted italic text-xs">
                      No daily summaries found. Trigger the Dev ETL above to populate.
                    </td>
                  </tr>
                ) : summaries.map((sum, idx) => (
                  <tr key={`${sum.member_id}_${sum.summary_date}`} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3 text-xs text-foreground-muted text-center font-mono">{sumStartRecord + idx}</td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {new Date(sum.summary_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold font-mono text-primary">{sum.member_id}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold text-foreground">{sum.name || 'Anonymous member'}</div>
                      <div className="text-[10px] text-foreground-muted mt-0.5">{sum.mobile_no || 'No Phone'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold text-foreground-subtle">
                        <span className="text-primary font-mono mr-1">[{sum.org_cd}]</span>
                        {stores.find(s => s.org_cd === sum.org_cd)?.org_name || 'Store'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-success text-right font-bold">
                      {formatCurrency(sum.total_sales)}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-center text-foreground/80">{sum.total_qty}</td>
                    <td className="px-4 py-3 text-xs font-mono text-center text-foreground/80">{sum.total_txn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summaries pagination controls */}
          {!loading && sumTotal > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 px-1 text-xs">
              <span className="text-foreground-muted">
                Showing <strong className="text-foreground font-semibold">{sumStartRecord}</strong> to <strong className="text-foreground font-semibold">{sumEndRecord}</strong> of <strong className="text-foreground font-semibold">{sumTotal.toLocaleString('id-ID')}</strong> summaries
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSumPage(1)}
                  disabled={sumPage === 1}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSumPage(prev => Math.max(prev - 1, 1))}
                  disabled={sumPage === 1}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 bg-surface border border-border rounded-lg text-foreground font-bold">
                  Page {sumPage} of {sumTotalPages}
                </span>

                <button
                  onClick={() => setSumPage(prev => Math.min(prev + 1, sumTotalPages))}
                  disabled={sumPage === sumTotalPages}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSumPage(sumTotalPages)}
                  disabled={sumPage === sumTotalPages}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      ) : (
        <SectionCard>
          {/* Top Stats Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            {/* Dept Stats */}
            <div className="border border-border rounded-2xl p-4 bg-surface-raised/40">
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-primary mb-3">Top Departments by Member Qty</h3>
              <div className="space-y-2.5">
                {deptStats.length === 0 ? (
                  <div className="text-[10px] text-foreground-muted italic py-4">No data available</div>
                ) : (
                  deptStats.map((d, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex justify-between text-[11px] mb-1 font-semibold">
                        <span className="text-foreground">{d.department}</span>
                        <span className="text-foreground-muted">{d.total_qty.toLocaleString()} Qty ({d.tx_count} lines)</span>
                      </div>
                      <div className="w-full bg-border/40 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-primary h-full rounded-full" 
                          style={{ width: `${Math.min(100, (d.total_qty / (deptStats[0]?.total_qty || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Brand Stats */}
            <div className="border border-border rounded-2xl p-4 bg-surface-raised/40">
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-success mb-3">Top Brands by Member Qty</h3>
              <div className="space-y-2.5">
                {brandStats.length === 0 ? (
                  <div className="text-[10px] text-foreground-muted italic py-4">No data available</div>
                ) : (
                  brandStats.map((b, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex justify-between text-[11px] mb-1 font-semibold">
                        <span className="text-foreground">{b.brand}</span>
                        <span className="text-foreground-muted">{b.total_qty.toLocaleString()} Qty ({b.tx_count} lines)</span>
                      </div>
                      <div className="w-full bg-border/40 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-success h-full rounded-full" 
                          style={{ width: `${Math.min(100, (b.total_qty / (brandStats[0]?.total_qty || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Search bar */}
          <form onSubmit={handleItemSalesSearchSubmit} className="flex items-center gap-2 mb-4 max-w-md">
            <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 flex-1">
              <Search className="w-4 h-4 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search cust name, item name/code, brand..."
                value={itemSalesSearchInput}
                onChange={e => setItemSalesSearchInput(e.target.value)}
                className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-glow"
            >
              Search
            </button>
          </form>

          <div className="relative overflow-x-auto border border-border rounded-2xl bg-black/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-raised/50 border-b border-border">
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center w-12">#</th>
                  <th onClick={() => toggleItemSalesSort('org_cd')} className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-foreground select-none">
                    Store / Date {renderSortArrow('org_cd', itemSalesSortBy, itemSalesSortDir)}
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Member / Cust Name</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Item Name / Code</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Classification</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-right">Qty</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-widest">Promo Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-4 py-7 bg-white/5" />
                    </tr>
                  ))
                ) : itemSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-foreground-muted italic text-xs">
                      No member item sales found. Make sure the cron job or manual trigger is populated.
                    </td>
                  </tr>
                ) : itemSales.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors group text-xs">
                    <td className="px-4 py-3 text-center text-foreground-muted font-mono">{itemSalesStartRecord + idx}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground">
                        <span className="text-primary font-mono mr-1">[{item.org_cd}]</span>
                        {stores.find(s => s.org_cd === item.org_cd)?.org_name || 'Store'}
                      </div>
                      <div className="text-[10px] text-foreground-muted mt-0.5">{new Date(item.bill_dt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold font-mono text-primary">{item.card_no}</div>
                      <div className="text-[10px] text-foreground-muted mt-0.5">{item.member_name || 'Anonymous member'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground">{item.item_name}</div>
                      <div className="text-[10px] text-foreground-muted mt-0.5 font-mono">{item.itm_cd}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-foreground/90 font-medium">Dept: <strong className="text-foreground">{item.department || '-'}</strong></div>
                      <div className="text-[10px] text-foreground-muted mt-0.5">Brand: {item.brand || '-'} | Div: {item.division || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                      {item.qty} <span className="text-[10px] text-foreground-muted font-normal">{item.uom}</span>
                    </td>
                    <td className="px-4 py-3">
                      {item.promo_item_flag === 'Y' ? (
                        <div className="text-[10px]">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-success/10 border border-success/30 text-success font-bold mb-0.5">PROMO</span>
                          <div className="text-foreground-subtle truncate max-w-[150px]">{item.promo_detail || 'Promo Item'}</div>
                          {item.disc_amt > 0 && <div className="text-[9px] text-success-hover font-semibold">Disc: {formatCurrency(item.disc_amt)}</div>}
                        </div>
                      ) : (
                        <span className="text-[10px] text-foreground-muted italic">Regular</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Item Sales pagination controls */}
          {!loading && itemSalesTotal > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 px-1 text-xs">
              <span className="text-foreground-muted">
                Showing <strong className="text-foreground font-semibold">{itemSalesStartRecord}</strong> to <strong className="text-foreground font-semibold">{itemSalesEndRecord}</strong> of <strong className="text-foreground font-semibold">{itemSalesTotal.toLocaleString('id-ID')}</strong> records
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setItemSalesPage(1)}
                  disabled={itemSalesPage === 1}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setItemSalesPage(prev => Math.max(prev - 1, 1))}
                  disabled={itemSalesPage === 1}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 bg-surface border border-border rounded-lg text-foreground font-bold">
                  Page {itemSalesPage} of {itemSalesTotalPages}
                </span>

                <button
                  onClick={() => setItemSalesPage(prev => Math.min(prev + 1, itemSalesTotalPages))}
                  disabled={itemSalesPage === itemSalesTotalPages}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setItemSalesPage(itemSalesTotalPages)}
                  disabled={itemSalesPage === itemSalesTotalPages}
                  className="p-1.5 border border-border bg-surface hover:bg-surface-raised rounded-lg disabled:opacity-40 disabled:hover:bg-surface transition-all"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Dynamic Popover for Badge Details */}
      {selectedBadge && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSelectedBadge(null)} />
          {/* Position wrapper to isolate transform from Tailwind animations */}
          <div
            style={{
              position: 'fixed',
              left: `${selectedBadge.x}px`,
              top: `${selectedBadge.y}px`,
              transform: 'translate(-100%, -50%)',
              zIndex: 9999
            }}
          >
            {/* Popover Card Content */}
            <div className="relative max-w-xs bg-surface-raised border border-border rounded-xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
              {/* Popover Arrow pointing right towards the badge */}
              <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-[5px] w-2 h-2 bg-surface-raised border-t border-r border-border rotate-45" />
              
              <div className="flex items-center gap-1.5 border-b border-border/50 pb-2 mb-2">
                <span className="text-base">{ACHIEVEMENT_BADGES[selectedBadge.name]?.icon}</span>
                <span className="font-extrabold text-sm text-foreground">{selectedBadge.name}</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="text-foreground-muted text-[10px] leading-relaxed italic">
                  {ACHIEVEMENT_BADGES[selectedBadge.name]?.desc}
                </div>
                <div className="text-[10px] text-foreground-subtle bg-primary/5 border border-primary/20 rounded px-2 py-1 leading-normal whitespace-pre-line">
                  <strong>Unlocked criteria:</strong><br />
                  {selectedBadge.criteria}
                </div>
                <div className="text-[9px] text-foreground-muted text-right">
                  Unlocked on: {selectedBadge.date}
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
