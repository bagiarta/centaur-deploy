import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Search, Filter, Download, Calendar, RefreshCw,
  ChevronLeft, ChevronRight, FileSpreadsheet, FileText,
  TrendingUp, Activity, Users, UserPlus, Database,
  ArrowUpDown, MoreHorizontal
} from "lucide-react";
import { PageHeader, SectionCard, StatCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReportConfig {
  title: string;
  icon: any;
  endpoint: string;
  columns: { key: string; label: string; type: 'string' | 'number' | 'currency' | 'date' }[];
  description?: string;
}

const REPORT_CONFIGS: Record<string, ReportConfig> = {
  'txn-analysis': {
    title: "Wise Customer Transaction Analysis",
    icon: Activity,
    endpoint: "txn-analysis",
    columns: [
      { key: 'org_cd', label: 'Store Code', type: 'string' },
      { key: 'store_name', label: 'Store Name', type: 'string' },
      { key: 'bill_no', label: 'Bill No', type: 'string' },
      { key: 'txn_date', label: 'Date', type: 'date' },
      { key: 'txn_time', label: 'Time', type: 'string' },
      { key: 'card_no', label: 'Card No', type: 'string' },
      { key: 'cust_name', label: 'Customer', type: 'string' },
      { key: 'phone_no', label: 'Phone', type: 'string' },
      { key: 'prev_points', label: 'Prev Pts', type: 'number' },
      { key: 'point_earned', label: 'Earned', type: 'number' },
      { key: 'total_points', label: 'Total Pts', type: 'number' },
      { key: 'point_status', label: 'Status', type: 'string' },
      { key: 'bill_value', label: 'Value', type: 'currency' },
      { key: 'bill_category', label: 'Category', type: 'string' },
    ]
  },
  'frequent-shopper': {
    title: "Customer Frequently Shopper",
    icon: Users,
    endpoint: "frequent-shopper",
    columns: [
      { key: 'org_cd', label: 'Org Code', type: 'string' },
      { key: 'store_name', label: 'Store Name', type: 'string' },
      { key: 'card_no', label: 'Card No', type: 'string' },
      { key: 'cust_name', label: 'Customer', type: 'string' },
      { key: 'phone_no', label: 'Phone No', type: 'string' },
      { key: 'frequently', label: 'Frequency', type: 'number' },
      { key: 'cust_category', label: 'Category', type: 'string' },
    ]
  },
  'member-enrollment': {
    title: "Member Enrollment Analysis",
    icon: UserPlus,
    endpoint: "member-enrollment",
    columns: [
      { key: 'STORE_NAME', label: 'Store Name', type: 'string' },
      { key: 'MEMBER_ID', label: 'Member ID', type: 'string' },
      { key: 'CUST_NAME', label: 'Customer Name', type: 'string' },
      { key: 'PHONE_NUMBER', label: 'Phone', type: 'string' },
      { key: 'JOIN_DATE', label: 'Join Date', type: 'date' },
      { key: 'REGISTRATION_TYPE', label: 'Channel', type: 'string' },
      { key: 'STARTING_POINTS', label: 'Starting Points', type: 'number' },
      { key: 'IS_ACTIVE', label: 'Active', type: 'string' },
    ]
  },
  'top-spender': {
    title: "Top Spender Analysis",
    icon: TrendingUp,
    endpoint: "top-spender",
    columns: [
      { key: 'card_no', label: 'Card No', type: 'string' },
      { key: 'cust_name', label: 'Customer', type: 'string' },
      { key: 'phone_no', label: 'Phone', type: 'string' },
      { key: 'total_net_sales', label: 'Net Sales', type: 'currency' },
      { key: 'total_txn', label: 'Total Txn', type: 'number' },
    ]
  },
  'fraud-analysis': {
    title: "CRM Fraud Analysis",
    icon: Activity,
    endpoint: "fraud-analysis",
    columns: [
      { key: 'latest_date', label: 'Latest Date', type: 'date' },
      { key: 'prev_date', label: 'Previous Date', type: 'date' },
      { key: 'org_cd', label: 'Store Code', type: 'string' },
      { key: 'store_name', label: 'Store Name', type: 'string' },
      { key: 'card_no', label: 'Card No', type: 'string' },
      { key: 'cust_name', label: 'Customer', type: 'string' },
      { key: 'latest_count', label: 'Latest Trx Count', type: 'number' },
      { key: 'prev_count', label: 'Previous Trx Count', type: 'number' },
      { key: 'fraud_warning', label: 'Suspicious Activity', type: 'string' },
    ],
    description: "Kriteria Fraud: (1) Transaksi >= 3x/hari selama 2 hari berturut-turut, (2) Dilakukan di Counter & Sesi yang sama per harinya, (3) Dilayani oleh Salesman yang sama di kedua hari tersebut."
  },
  'wakeup-call': {
    title: "Wakeup Call Customer",
    icon: Users,
    endpoint: "wakeup-call",
    columns: [
      { key: 'last_store', label: 'Store', type: 'string' },
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'card_no', label: 'Card No', type: 'string' },
      { key: 'phone_no', label: 'Phone No', type: 'string' },
      { key: 'transaction_type', label: 'Transaction Type', type: 'string' },
      { key: 'last_txn_date', label: 'Last Txn Date', type: 'date' },
      { key: 'last_txn_days', label: 'Last Txn Days', type: 'number' },
      { key: 'current_point', label: 'Current Point', type: 'number' },
      { key: 'last_store_name', label: 'Last Txn Store', type: 'string' },
      { key: 'tier', label: 'Tier', type: 'string' },
    ]
  },
  'deleted-member': {
    title: "Deleted Member",
    icon: Database,
    endpoint: "deleted-member",
    columns: [
      { key: 'member_name', label: 'Name', type: 'string' },
      { key: 'latest_redeem_point', label: 'Points', type: 'number' },
      { key: 'latest_tier', label: 'Tier', type: 'string' },
      { key: 'note', label: 'Note', type: 'string' }
    ],
    description: "Live data fetched from CRM Backend"
  }
};

export default function CrmReportsPage() {
  const { type } = useParams<{ type: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const config = REPORT_CONFIGS[type || ''] || REPORT_CONFIGS['txn-analysis'];

  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [fromDate, setFromDate] = useState(searchParams.get('fromDate') || new Date(new Date().setDate(1)).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(searchParams.get('toDate') || new Date().toISOString().split('T')[0]);
  const [selectedStore, setSelectedStore] = useState(searchParams.get('store') || 'All Store');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || '');
  const [sortDir, setSortDir] = useState(searchParams.get('sortDir') || 'desc');
  const [topLimit, setTopLimit] = useState(parseInt(searchParams.get('top') || '100'));
  const [monthOffset, setMonthOffset] = useState(parseInt(searchParams.get('monthOffset') || '1'));

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    setPage(1); // Reset page on type change
    setSortBy(type === 'wakeup-call' ? 'last_txn_date' : '');
    setSortDir('desc');
    setSearchTerm('');
    setTopLimit(100);
    setMonthOffset(1);
  }, [type]);

  useEffect(() => {
    if (type === 'wakeup-call') {
      const date = new Date();
      date.setMonth(date.getMonth() - monthOffset);
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const fmt = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      
      setFromDate(fmt(firstDay));
      setToDate(fmt(lastDay));
    }
  }, [type, monthOffset]);

  useEffect(() => {
    fetchData();
  }, [type, fromDate, toDate, selectedStore, page, sortBy, sortDir, searchTerm, topLimit]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/crm/reports/stores');
      if (res.ok) {
        const list = await res.json();
        setStores(list);
      }
    } catch (err) {
      console.error("Failed to fetch stores");
    }
  };

  const fetchData = async (overridePage?: number) => {
    setLoading(true);
    try {
      const activePage = overridePage !== undefined ? overridePage : page;
      const params = new URLSearchParams({
        fromDate,
        toDate,
        store: selectedStore,
        search: searchTerm,
        page: activePage.toString(),
        sortBy,
        sortDir
      });
      if (type === 'top-spender') {
        params.append('top', topLimit.toString());
      }

      const res = await fetch(`/api/crm/reports/${config.endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch data");

      const result = await res.json();
      setData(result.rows || []);
      setSummary(result.summary || {});
      setTotalPages(result.totalPages || 1);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const handleExport = (format: 'excel' | 'pdf') => {
    const params = new URLSearchParams({
      fromDate,
      toDate,
      store: selectedStore,
      search: searchTerm,
      sortBy,
      sortDir
    });
    if (type === 'top-spender') {
      params.append('top', topLimit.toString());
    }

    // Use a direct download link
    const url = `/api/crm/reports/${config.endpoint}/export/${format}?${params.toString()}`;
    window.location.href = url;

    toast.info(`Preparing ${format.toUpperCase()} export...`);
  };

  const formatValue = (value: any, type: string) => {
    if (value === null || value === undefined) return "-";
    if (type === 'currency') {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
    }
    if (type === 'number') {
      return new Intl.NumberFormat('id-ID').format(value);
    }
    if (type === 'date') {
      try {
        return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch { return value; }
    }
    return value;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title={config.title}
        subtitle="CRM Operation & Performance Analytics"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('excel')}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-medium hover:bg-surface-raised transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-success" /> Export Excel
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-medium hover:bg-surface-raised transition-all"
            >
              <FileText className="w-4 h-4 text-danger" /> Export PDF
            </button>
          </div>
        }
      />
      
      {config.description && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary flex items-start gap-2">
          <Activity className="w-4 h-4 mt-0.5" />
          <div>
            <span className="font-semibold">Info Perhitungan: </span>
            {config.description}
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label={type === 'top-spender' ? "TOP RECORD" : "Total Records"}
          value={summary.total || 0}
          icon={<Database className="w-4 h-4" />}
          variant="primary"
        />
        {type === 'txn-analysis' && (
          <>
            <StatCard
              label="Total Bill Value"
              value={formatValue(summary.total_bill_value, 'currency')}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <StatCard
              label="Points Earned"
              value={formatValue(summary.total_points_earned, 'number')}
              icon={<UserPlus className="w-4 h-4" />}
              variant="success"
            />
            <StatCard
              label="Avg Transaction"
              value={formatValue(summary.total_bill_value / (summary.total || 1), 'currency')}
              icon={<Activity className="w-4 h-4" />}
            />
          </>
        )}
      </div>

      <SectionCard>
        {/* Filters Row */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="flex-1 flex flex-wrap gap-4">
            {type === 'wakeup-call' ? (
              <div className="flex flex-col gap-1.5 w-40">
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider ml-1">Month Offset</label>
                <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2">
                  <select
                    value={monthOffset}
                    onChange={e => setMonthOffset(parseInt(e.target.value) || 1)}
                    className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1 cursor-pointer appearance-none text-center font-bold"
                  >
                    {Array.from({ length: 12 }).map((_, i) => {
                      const m = i + 1;
                      return <option key={m} value={m}>{m} Month</option>;
                    })}
                  </select>
                </div>
              </div>
            ) : type !== 'deleted-member' && (
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider ml-1">Date Range</label>
                <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2">
                  <Calendar className="w-4 h-4 text-foreground-muted" />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 w-[110px]"
                  />
                  <span className="text-foreground-muted">→</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 w-[110px]"
                  />
                </div>
              </div>
            )}

            {type === 'top-spender' && (
              <div className="flex flex-col gap-1.5 w-32">
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider ml-1">Top Spender Limit</label>
                <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2">
                  <select
                    value={topLimit}
                    onChange={e => setTopLimit(parseInt(e.target.value) || 100)}
                    className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1 cursor-pointer appearance-none text-center font-bold font-mono"
                  >
                    <option value="5">Top 5</option>
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                    <option value="100">Top 100</option>
                    <option value="250">Top 250</option>
                    <option value="500">Top 500</option>
                  </select>
                </div>
              </div>
            )}

            {config.endpoint !== 'member-enrollment' && config.endpoint !== 'deleted-member' && (
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider ml-1">Store Filter</label>
                <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2">
                  <Filter className="w-4 h-4 text-foreground-muted" />
                  <select
                    value={selectedStore}
                    onChange={e => setSelectedStore(e.target.value)}
                    className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1 cursor-pointer appearance-none"
                  >
                    <option value="All Store" className="bg-surface text-foreground">All Store</option>
                  {stores.map(s => (
                      <option key={s.org_cd} value={s.org_name} className="bg-surface text-foreground">
                        ({s.org_cd}) - {s.org_name}
                      </option>
                    ))}
                </select>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5 flex-1 min-w-[250px]">
              <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider ml-1">Search Database</label>
              <form onSubmit={handleSearch} className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-foreground-muted" />
                <input
                  type="text"
                  placeholder="Search by name, ID, or card number..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1"
                />
                <button type="submit" className="hidden" />
              </form>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                if (page !== 1) setPage(1);
                else fetchData(1);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-glow flex items-center gap-2 hover:translate-y-[-1px] transition-all"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Apply Filters
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="relative overflow-x-auto border border-border rounded-2xl bg-black/20">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-raised/50 border-b border-border">
                <th className="px-4 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center w-12">#</th>
                {config.columns.map(col => (
                  <th
                    key={col.key}
                    className="px-4 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-primary transition-colors"
                    onClick={() => {
                      if (sortBy === col.key) {
                        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy(col.key);
                        setSortDir('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {col.label}
                      <ArrowUpDown className={cn("w-3 h-3 opacity-30", sortBy === col.key && "opacity-100 text-primary")} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={config.columns.length + 1} className="px-4 py-8 bg-white/5" />
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={config.columns.length + 1} className="px-4 py-20 text-center text-foreground-muted italic">
                    No data found for the selected criteria
                  </td>
                </tr>
              ) : data.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/5 transition-colors group">
                  <td className="px-4 py-3 text-xs text-foreground-muted text-center font-mono">{(page - 1) * 100 + idx + 1}</td>
                  {config.columns.map(col => (
                    <td key={col.key} className={cn(
                      "px-4 py-3 text-xs font-medium truncate max-w-[200px]",
                      col.type === 'currency' ? "text-success font-mono" :
                        col.type === 'number' ? "font-mono" : "text-foreground/90"
                    )}>
                      {formatValue(row[col.key], col.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <div className="text-xs text-foreground-muted">
            Showing Page <span className="text-foreground font-bold">{page}</span> of <span className="text-foreground font-bold">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="p-2 bg-surface border border-border rounded-lg disabled:opacity-30 hover:bg-surface-raised transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className="p-2 bg-surface border border-border rounded-lg disabled:opacity-30 hover:bg-surface-raised transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
