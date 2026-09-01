import React, { useState, useEffect, useMemo } from "react";
import { 
  Users, UserPlus, UserMinus, Activity,
  RefreshCw, TrendingUp, Store, ShoppingCart, DollarSign, Trophy
} from "lucide-react";
import { 
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area, Cell
} from "recharts";

const BAR_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1'];

export default function CrmDashboardPage() {
  const [data, setData] = useState<any[]>([]);
  const [txnData, setTxnData] = useState<any[]>([]);
  const [competitionData, setCompetitionData] = useState<any[]>([]);
  const [stores, setStores] = useState<{cd: string, name: string}[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("All Stores");
  const [competitionPeriod, setCompetitionPeriod] = useState<string>("1M");
  const [txnMonth, setTxnMonth] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [loading, setLoading] = useState(true);
  const [loadingComp, setLoadingComp] = useState(false);
  const [error, setError] = useState("");

  const fetchTransactions = async () => {
    try {
      let url = "/api/crm/dashboard/transactions";
      const params = new URLSearchParams();
      
      if (txnMonth) {
        params.append("startDate", `${txnMonth}-01`);
        
        const [year, month] = txnMonth.split('-');
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        params.append("endDate", `${txnMonth}-${lastDay}`);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const txnRes = await fetch(url);
      const txnJson = await txnRes.json();
      
      if (txnJson.success) {
        const rawTxn = txnJson.data.map((d: any) => ({
          ...d,
          trans_date: new Date(d.trans_date).toLocaleDateString('en-GB')
        }));
        
        // Extract unique stores and sort by store_cd
        const storeMap = new Map<string, string>();
        rawTxn.forEach((d: any) => {
          if (d.store_cd && d.store_name) {
            storeMap.set(d.store_cd, d.store_name);
          }
        });
        
        const uniqueStores = Array.from(storeMap.entries())
          .map(([cd, name]) => ({ cd, name }))
          .sort((a, b) => a.cd.localeCompare(b.cd));
          
        setStores(uniqueStores);
        setTxnData(rawTxn);
      } else {
        setError(prev => prev ? `${prev} | ${txnJson.error}` : txnJson.error);
      }
    } catch (e: any) {
      setError(prev => prev ? `${prev} | ${e.message}` : e.message);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      
      const enrollRes = await fetch("/api/crm/dashboard");
      const enrollJson = await enrollRes.json();
      
      if (enrollJson.success) {
        const formattedData = enrollJson.data.map((d: any) => ({
          ...d,
          join_date: new Date(d.join_date).toLocaleDateString('en-GB')
        }));
        setData(formattedData);
      } else {
        setError(enrollJson.error || "Failed to fetch enrollment data");
      }

      await fetchTransactions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompetition = async () => {
    try {
      setLoadingComp(true);
      const res = await fetch(`/api/crm/dashboard/competition?period=${competitionPeriod}`);
      const json = await res.json();
      if (json.success) {
        setCompetitionData(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingComp(false);
    }
  };

  const sortedCompetitionData = useMemo(() => {
    return [...competitionData]
      .sort((a, b) => a.store_cd.localeCompare(b.store_cd));
  }, [competitionData]);

  useEffect(() => {
    fetchCompetition();
  }, [competitionPeriod]);

  useEffect(() => {
    fetchTransactions();
  }, [txnMonth]);

  useEffect(() => {
    fetchData();
  }, []);

  const latestData = data.length > 0 ? data[data.length - 1] : null;

  const filteredTxnData = useMemo(() => {
    if (!txnData.length && !txnMonth) return [];
    
    let baseData = txnData;
    if (selectedStore !== "All Stores") {
      baseData = txnData.filter(d => d.store_name === selectedStore);
    }
    
    const dateMap = new Map();
    
    // Pre-fill all days of the month if txnMonth is selected
    if (txnMonth) {
      const [year, month] = txnMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      for (let i = 1; i <= lastDay; i++) {
        const dateStr = `${i.toString().padStart(2, '0')}/${month}/${year}`;
        dateMap.set(dateStr, {
          trans_date: dateStr,
          total_transactions: 0,
          unique_customers: 0,
          total_bill_value: 0,
          total_points_earned: 0,
          total_points_redeem: 0
        });
      }
    }
    
    baseData.forEach(curr => {
      if (!dateMap.has(curr.trans_date)) {
        dateMap.set(curr.trans_date, {
          trans_date: curr.trans_date,
          total_transactions: 0,
          unique_customers: 0,
          total_bill_value: 0,
          total_points_earned: 0,
          total_points_redeem: 0
        });
      }
      const item = dateMap.get(curr.trans_date);
      item.total_transactions += curr.total_transactions || 0;
      item.unique_customers += curr.unique_customers || 0;
      item.total_bill_value += curr.total_bill_value || 0;
      item.total_points_earned += curr.total_points_earned || 0;
      item.total_points_redeem += curr.total_points_redeem || 0;
    });
    
    const result = Array.from(dateMap.values());
    result.sort((a, b) => {
      const [d1, m1, y1] = a.trans_date.split('/');
      const [d2, m2, y2] = b.trans_date.split('/');
      return new Date(`${y1}-${m1}-${d1}`).getTime() - new Date(`${y2}-${m2}-${d2}`).getTime();
    });
    
    return result;
  }, [txnData, selectedStore, txnMonth]);

  const CustomTooltipFormatter = (value: number, name: string) => {
    if (name === "Total Bill Value") {
      return [new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value), name];
    }
    return [value.toLocaleString(), name];
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">CRM Dashboard</h1>
          <p className="text-sm text-foreground-muted">Overview of member enrollment and transactions.</p>
        </div>
        <button 
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-sm">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground-muted">Total Cumulative</h3>
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-blue-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {latestData ? latestData.cumulative_members.toLocaleString() : "-"}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground-muted">Active Members</h3>
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {latestData ? latestData.active_members.toLocaleString() : "-"}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground-muted">Inactive Members</h3>
            <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center">
              <UserMinus className="w-4 h-4 text-rose-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {latestData ? latestData.inactive_members.toLocaleString() : "-"}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground-muted">Latest New (Daily)</h3>
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {latestData ? latestData.new_members.toLocaleString() : "-"}
          </div>
          <div className="text-xs text-foreground-muted mt-1">
            As of {latestData ? latestData.join_date : "-"}
          </div>
        </div>
      </div>

      {/* Enrollment Chart */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Member Enrollment Daily Trend</h2>
        </div>
        
        <div className="h-[400px] w-full">
          {loading && data.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-foreground-muted">
              Loading chart data...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="join_date" 
                  tick={{ fontSize: 12, fill: 'hsl(var(--foreground-muted))' }}
                  tickMargin={10}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  yAxisId="left" 
                  tick={{ fontSize: 12, fill: 'hsl(var(--foreground-muted))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  tick={{ fontSize: 12, fill: 'hsl(var(--foreground-muted))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    color: 'hsl(var(--foreground))'
                  }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                
                <Bar yAxisId="left" dataKey="new_members" name="New Members (Daily)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="active_members" name="Active Members" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                <Bar yAxisId="left" dataKey="inactive_members" name="Inactive Members" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative_members" name="Cumulative Total" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Transactions Section */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Store Daily Transactions</h2>
          </div>
          
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <input 
                type="month" 
                value={txnMonth} 
                onChange={e => setTxnMonth(e.target.value)} 
                className="border border-border bg-background text-foreground rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary" 
              />
            </div>
            <select 
              value={selectedStore} 
              onChange={e => setSelectedStore(e.target.value)}
              className="border border-border bg-background text-foreground rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="All Stores">All Stores (Aggregated)</option>
              {stores.map(s => (
                <option key={s.cd} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Volume */}
          <div className="h-[350px] w-full border border-border/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-4 text-foreground-muted flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Transaction Volume
            </h3>
            {loading && txnData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-foreground-muted">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredTxnData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="trans_date" tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <Tooltip 
                    formatter={CustomTooltipFormatter}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Bar dataKey="total_transactions" name="Total Transactions" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="unique_customers" name="Unique Customers" stroke="#ec4899" strokeWidth={3} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart 2: Value */}
          <div className="h-[350px] w-full border border-border/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-4 text-foreground-muted flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Bill Value & Points
            </h3>
            {loading && txnData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-foreground-muted">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredTxnData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="trans_date" tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <YAxis tickFormatter={(val) => `Rp${(val / 1000000).toFixed(0)}M`} tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                  <Tooltip 
                    formatter={CustomTooltipFormatter}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="total_bill_value" name="Total Bill Value" stroke="#14b8a6" fillOpacity={1} fill="url(#colorBill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          </div>
        </div>
      {/* Store Competition Section */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold">Store Competition & Ranking</h2>
          </div>
          
          <div className="flex items-center gap-2 bg-muted p-1 rounded-md">
            <button
              onClick={() => setCompetitionPeriod('1M')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${competitionPeriod === '1M' ? 'bg-background shadow-sm font-medium' : 'text-foreground-muted hover:text-foreground'}`}
            >
              Last 1 Month
            </button>
            <button
              onClick={() => setCompetitionPeriod('1Y')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${competitionPeriod === '1Y' ? 'bg-background shadow-sm font-medium' : 'text-foreground-muted hover:text-foreground'}`}
            >
              Last 1 Year
            </button>
          </div>
        </div>

        <div className="h-[400px] w-full mt-4">
          {loadingComp ? (
            <div className="w-full h-full flex items-center justify-center text-foreground-muted">Loading competition data...</div>
          ) : competitionData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-foreground-muted">No data available for this period.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sortedCompetitionData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="store_cd" 
                  tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }} 
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }} 
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: 'hsl(var(--foreground-muted))' }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="total_transactions" name="Volume (Txn)" radius={[4, 4, 0, 0]}>
                  {sortedCompetitionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="unique_members" name="Unique Members" stroke="#ec4899" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
