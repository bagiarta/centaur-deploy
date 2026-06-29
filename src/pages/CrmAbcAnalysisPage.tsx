import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  Search, Filter, Calendar, RefreshCw,
  ChevronLeft, ChevronRight,
  TrendingUp, Activity, Package, DollarSign,
  ArrowUpDown, Download, Database
} from "lucide-react";
import { PageHeader, SectionCard, StatCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLORS = ['#10b981', '#3b82f6', '#f59e0b']; // A, B, C colors

export default function CrmAbcAnalysisPage() {
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ categories: { A: 0, B: 0, C: 0 }, total_sales: 0, total_items: 0 });
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filters
  const [fromDate, setFromDate] = useState(searchParams.get('fromDate') || new Date(new Date().setDate(1)).toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(searchParams.get('toDate') || new Date().toISOString().split('T')[0]);
  const [selectedStore, setSelectedStore] = useState(searchParams.get('store') || 'All Store');
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'SALES_VALUE');
  const [sortDir, setSortDir] = useState(searchParams.get('sortDir') || 'desc');
  const limit = 100;

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fromDate, toDate, selectedStore, page, sortBy, sortDir, searchTerm]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/abc-analysis/orgs');
      if (res.ok) {
        const list = await res.json();
        console.log('Fetched stores:', list);
        setStores(list);
      } else {
        const error = await res.text();
        console.error("Failed to fetch stores. Status:", res.status, "Error:", error);
      }
    } catch (err) {
      console.error("Failed to fetch stores", err);
    }
  };

  const fetchData = async (overridePage?: number) => {
    setLoading(true);
    try {
      const activePage = overridePage !== undefined ? overridePage : page;
      const params = new URLSearchParams({
        start_date: fromDate,
        end_date: toDate,
        org_name: selectedStore,
        search: searchTerm,
        page: activePage.toString(),
        limit: limit.toString(),
        sortBy,
        sortDir
      });

      const res = await fetch(`/api/abc-analysis/report?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch ABC Analysis data");

      const result = await res.json();
      setData(result.rows || []);
      if (result.summary) setSummary(result.summary);
      setTotalPages(result.totalPages || 1);
      setTotalRecords(result.totalRecords || 0);
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

  const formatValue = (value: any, type: string) => {
    if (value === null || value === undefined) return "-";
    if (type === 'currency') {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
    }
    if (type === 'number') {
      return new Intl.NumberFormat('id-ID').format(value);
    }
    if (type === 'percent') {
      return new Intl.NumberFormat('id-ID', { style: 'percent', minimumFractionDigits: 2 }).format(value / 100);
    }
    if (type === 'date') {
      try {
        return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch { return value; }
    }
    return value;
  };

  const chartData = [
    { name: 'Category A (Fast Moving)', value: summary.categories?.A || 0 },
    { name: 'Category B (Normal Moving)', value: summary.categories?.B || 0 },
    { name: 'Category C (Slow Moving)', value: summary.categories?.C || 0 }
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title="ABC Analysis Dashboard"
        subtitle="Item Performance & Inventory Classification"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => toast.info('Export functionality coming soon')}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs font-medium hover:bg-surface-raised transition-all"
            >
              <Download className="w-4 h-4 text-primary" /> Export Data
            </button>
          </div>
        }
      />

      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary flex items-start gap-2">
        <Activity className="w-4 h-4 mt-0.5" />
        <div>
          <span className="font-semibold">Info Perhitungan: </span>
          Kategori A = Kontribusi Sales kumulatif 0-80%. Kategori B = 80-95%. Kategori C = 95-100%. Data dihitung berdasarkan total penjualan (Sales Value) untuk periode yang dipilih.
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          value={formatValue(summary.total_sales, 'currency')}
          icon={<DollarSign className="w-4 h-4" />}
          variant="primary"
        />
        <StatCard
          label="Active Items"
          value={formatValue(summary.total_items, 'number')}
          icon={<Package className="w-4 h-4" />}
        />
        <StatCard
          label="Category A Items"
          value={formatValue(summary.categories?.A || 0, 'number')}
          sub={`${summary.total_items > 0 ? Math.round(((summary.categories?.A || 0) / summary.total_items) * 100) : 0}% of total items`}
          icon={<TrendingUp className="w-4 h-4" />}
          variant="success"
        />
        <StatCard
          label="Avg Sales / Item"
          value={formatValue(summary.total_items > 0 ? summary.total_sales / summary.total_items : 0, 'currency')}
          icon={<Activity className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <SectionCard title="Item Distribution by ABC Category" subtitle="Based on count of items">
          <div className="h-[250px] w-full flex items-center justify-center p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${(percent * 100).toFixed(1)}%`}
                  labelLine={false}
                >
                  {chartData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '12px' }} verticalAlign="bottom" height={24} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Top items table? Or just filters for now */}
        <SectionCard title="Filters & Search" subtitle="Customize report parameters" className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider ml-1">Date Range</label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2">
                <Calendar className="w-4 h-4 text-foreground-muted" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1"
                />
                <span className="text-foreground-muted">→</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
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

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider ml-1">Search Items</label>
              <form onSubmit={handleSearch} className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-foreground-muted" />
                <input
                  type="text"
                  placeholder="Search by item code or name..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-transparent border-none text-xs outline-none focus:ring-0 p-0 flex-1"
                />
                <button type="submit" className="hidden" />
              </form>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2"><Database className="w-4 h-4" /> Item Performance Details</h3>
          <button
            onClick={() => {
              if (page !== 1) setPage(1);
              else fetchData(1);
            }}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold shadow-glow flex items-center gap-2 hover:translate-y-[-1px] transition-all"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Refresh Data
          </button>
        </div>

        {/* Data Table */}
        <div className="relative overflow-x-auto border border-border rounded-2xl bg-black/20">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-surface-raised/50 border-b border-border">
                <th className="px-4 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest text-center w-12">#</th>
                {[
                  { key: 'ORG_CD', label: 'Org' },
                  { key: 'ITM_CD', label: 'Item Code' },
                  { key: 'ITEM_NAME', label: 'Item Name' },
                  { key: 'SALES_VALUE', label: 'Sales Value' },
                  { key: 'QTY_SOLD', label: 'Qty' },
                  { key: 'GP_PERCENT', label: 'Margin %' },
                  { key: 'ABC_CATEGORY', label: 'Category' },
                  { key: 'RANK_SALES', label: 'R. Sales' },
                  { key: 'RANK_MARGIN', label: 'R. Margin' },
                  { key: 'RANK_QTY', label: 'R. Qty' },
                  { key: 'RANK_FREQUENCY', label: 'R. Freq' },
                  { key: 'HEALTH_SCORE', label: 'Health Score' },
                  { key: 'HEALTH_CATEGORY', label: 'Health Cat' },
                ].map(col => (
                  <th
                    key={col.key}
                    className="px-4 py-4 text-[10px] font-bold text-foreground-muted uppercase tracking-widest cursor-pointer hover:text-primary transition-colors whitespace-nowrap"
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
                    <td colSpan={14} className="px-4 py-8 bg-white/5" />
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-20 text-center text-foreground-muted italic">
                    No items found for the selected criteria
                  </td>
                </tr>
              ) : data.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/5 transition-colors group">
                  <td className="px-4 py-3 text-xs text-foreground-muted text-center font-mono">{(page - 1) * limit + idx + 1}</td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground-muted">{row.ORG_CD}</td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground">{row.ITM_CD}</td>
                  <td className="px-4 py-3 text-xs font-medium text-foreground max-w-[250px] truncate" title={row.ITEM_NAME}>{row.ITEM_NAME}</td>
                  <td className="px-4 py-3 text-xs font-mono text-success font-bold">{formatValue(row.SALES_VALUE, 'currency')}</td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground-muted">{formatValue(row.QTY_SOLD, 'number')}</td>
                  <td className="px-4 py-3 text-xs font-mono text-primary">{formatValue(row.GP_PERCENT, 'percent')}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold border",
                      row.ABC_CATEGORY === 'A' ? "bg-success/10 text-success border-success/30" :
                      row.ABC_CATEGORY === 'B' ? "bg-primary/10 text-primary border-primary/30" :
                      "bg-warning/10 text-warning border-warning/30"
                    )}>
                      {row.ABC_CATEGORY}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground-muted">#{row.RANK_SALES}</td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground-muted">#{row.RANK_MARGIN}</td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground-muted">#{row.RANK_QTY}</td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground-muted">#{row.RANK_FREQUENCY}</td>
                  <td className="px-4 py-3 text-xs font-mono text-foreground-muted">{row.HEALTH_SCORE}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center justify-center px-2 h-6 rounded-md text-[10px] font-bold border whitespace-nowrap",
                      row.HEALTH_CATEGORY === 'STRATEGIC' ? "bg-success/10 text-success border-success/30" :
                      row.HEALTH_CATEGORY === 'GROWTH' ? "bg-primary/10 text-primary border-primary/30" :
                      row.HEALTH_CATEGORY === 'MAINTAIN' ? "bg-warning/10 text-warning border-warning/30" :
                      "bg-danger/10 text-danger border-danger/30"
                    )}>
                      {row.HEALTH_CATEGORY}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <div className="text-xs text-foreground-muted">
            Showing Page <span className="text-foreground font-bold">{page}</span> of <span className="text-foreground font-bold">{totalPages}</span>
            {" "}(Total: {formatValue(totalRecords, 'number')} items)
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
