import React, { useState, useEffect } from "react";
import {
  CheckCircle, Search, Filter, Loader2, Calendar, Edit, ClipboardCheck, Store, Clock, History, AlertTriangle
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Reuse Schedule interface or define what's needed
interface Schedule {
  id: number;
  store_code: string;
  store_name: string;
  pic_id: string;
  pic_name: string;
  scheduled_date: string;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const formatLocalDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  const cleanStr = dateStr.endsWith("Z") ? dateStr.slice(0, -1) : dateStr;
  return new Date(cleanStr).toLocaleDateString("id-ID");
};

export default function StorePMApprovalPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [historySchedules, setHistorySchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingActionsCount, setPendingActionsCount] = useState(0);

  // Modal State
  const [isSignOffOpen, setIsSignOffOpen] = useState(false);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const url = new URL("/api/trial/support-manager/schedules", window.location.origin);
      // Admin check
      const isAdmin = user?.role_name?.toLowerCase().includes("admin") || user?.is_admin;

      // Backend mock should ideally filter by store_code if available, but we can also filter client-side
      if (!isAdmin && user?.store_code) {
         url.searchParams.set("store_code", user.store_code);
      }
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch schedules");
      let data: Schedule[] = await res.json();

      // Fallback client-side filtering if backend ignores store_code param
      if (!isAdmin && user?.store_code) {
        data = data.filter(s => s.store_code === user.store_code);
      }
      
      const pending = data.filter(s => s.status.toLowerCase() === "pending approval");
      const history = data.filter(s => s.status.toLowerCase() === "completed");

      setSchedules(pending);
      setHistorySchedules(history);
      
      // Fetch action items for the dashboard metric
      try {
        const aiUrl = new URL("/api/trial/support-manager/action-items", window.location.origin);
        aiUrl.searchParams.set("status", "Pending");
        if (!isAdmin && user?.store_code) {
           aiUrl.searchParams.set("store_code", user.store_code);
        }
        const aiRes = await fetch(aiUrl.toString());
        if (aiRes.ok) {
           const aiData = await aiRes.json();
           setPendingActionsCount(aiData.length);
        }
      } catch (e) {
        console.error("Failed to fetch pending actions count", e);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [user?.store_code]);

  const [deviceChecks, setDeviceChecks] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(false);

  const handleOpenSignOff = async (sched: Schedule) => {
    setActiveSchedule(sched);
    setIsSignOffOpen(true);
    setLoadingChecks(true);
    setDeviceChecks([]);
    setActionItems([]);
    
    try {
      const res = await fetch(`/api/trial/support-manager/schedules/${sched.id}/result`);
      if (res.ok) {
        const data = await res.json();
        setDeviceChecks(data.device_checks || []);
        setActionItems(data.action_items || []);
      }
    } catch (e) {
      console.error("Failed to fetch device checks", e);
    } finally {
      setLoadingChecks(false);
    }
  };

  const handleSignOff = async () => {
    if (!activeSchedule) return;
    try {
      setSubmitting(true);
      
      const res = await fetch(`/api/trial/support-manager/schedules/${activeSchedule.id}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" }
      });
      
      if (!res.ok) throw new Error("Failed to approve schedule on server");

      toast.success(`Schedule for ${activeSchedule.store_name} has been Approved and Signed Off!`);
      
      // Local state update
      setSchedules(prev => prev.filter(s => s.id !== activeSchedule.id));
      setIsSignOffOpen(false);
      setActiveSchedule(null);
    } catch (e: any) {
      toast.error("Failed to sign off");
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = user?.role_name?.toLowerCase().includes("admin") || user?.is_admin;
  if (!user?.store_code && !isAdmin) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Store className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-foreground">No Store Assigned</h2>
          <p className="text-foreground-muted mt-2">You need to be assigned to a store to approve PM tasks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Store PM Approvals"
        subtitle={user?.store_code ? `Pending approvals for Store: ${user.store_code}` : "Pending approvals across all stores"}
      />

      {/* Mini Dashboard */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          <SectionCard className="p-4 sm:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground-muted">Total Pending Approvals</p>
              <h4 className="text-2xl font-bold text-foreground">{schedules.length}</h4>
            </div>
          </SectionCard>
          <SectionCard className="p-4 sm:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground-muted">Pending Action Items</p>
              <h4 className="text-2xl font-bold text-foreground">{pendingActionsCount}</h4>
            </div>
          </SectionCard>
          <SectionCard className="p-4 sm:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <History className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground-muted">Total Completed PMs</p>
              <h4 className="text-2xl font-bold text-foreground">{historySchedules.length}</h4>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard>
        <div className="border-b border-border mb-4">
          <div className="flex gap-6 px-6">
            <button
              onClick={() => setActiveTab('pending')}
              className={`pb-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'pending'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-foreground-muted hover:text-foreground'
              }`}
            >
              Pending Approval ({schedules.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-foreground-muted hover:text-foreground'
              }`}
            >
              History ({historySchedules.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-foreground-muted font-medium">Loading approvals data...</p>
          </div>
        ) : activeTab === 'pending' && schedules.length === 0 ? (
          <div className="text-center py-20 px-4 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-success" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Semua Jadwal Telah Disetujui!</h3>
            <p className="text-sm text-foreground-muted mt-2 max-w-md mx-auto">
              Tidak ada jadwal Preventive Maintenance yang menunggu persetujuan Anda saat ini. Anda sudah up-to-date.
            </p>
          </div>
        ) : activeTab === 'history' && historySchedules.length === 0 ? (
          <div className="text-center py-20 px-4">
            <History className="w-16 h-16 text-foreground-muted/50 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground">Belum ada riwayat PM</h3>
            <p className="text-sm text-foreground-muted mt-1">Jadwal yang sudah Anda setujui akan muncul di sini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-raised/50">
                  <th className="px-4 py-3 text-xs font-bold text-foreground-muted uppercase tracking-wider whitespace-nowrap">Store Code</th>
                  <th className="px-4 py-3 text-xs font-bold text-foreground-muted uppercase tracking-wider whitespace-nowrap">Store Name</th>
                  <th className="px-4 py-3 text-xs font-bold text-foreground-muted uppercase tracking-wider whitespace-nowrap">Scheduled Date</th>
                  <th className="px-4 py-3 text-xs font-bold text-foreground-muted uppercase tracking-wider whitespace-nowrap">IT PIC</th>
                  <th className="px-4 py-3 text-xs font-bold text-foreground-muted uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-foreground-muted uppercase tracking-wider text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(activeTab === 'pending' ? schedules : historySchedules).map(s => (
                  <tr key={s.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">{s.store_code}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{s.store_name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-foreground-muted">
                      {formatLocalDate(s.scheduled_date)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] text-primary font-bold">
                          {s.pic_name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs text-foreground-subtle font-medium">{s.pic_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <StatusBadge status={s.status.toLowerCase()} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {activeTab === 'pending' ? (
                        <button
                          onClick={() => handleOpenSignOff(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-all shadow-sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Review & Approve
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenSignOff(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface text-foreground-muted border border-border rounded-lg text-xs font-bold hover:bg-white/5 hover:text-foreground transition-all shadow-sm"
                        >
                          <Search className="w-3.5 h-3.5" />
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Approval Modal */}
      {isSignOffOpen && activeSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-raised border border-border w-full max-w-md rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                {activeSchedule.status.toLowerCase() === 'completed' ? 'PM Checklist Details' : 'Sign Off Preventive Maintenance'}
              </h3>
            </div>

            <div className="space-y-4 py-2">
              <p className="text-sm text-foreground-muted">
                {activeSchedule.status.toLowerCase() === 'completed' ? (
                  <>You are viewing the completed PM Checklist for <strong className="text-foreground">{activeSchedule.store_name}</strong> executed on <strong className="text-foreground">{formatLocalDate(activeSchedule.scheduled_date)}</strong> by <strong className="text-foreground">{activeSchedule.pic_name}</strong>.</>
                ) : (
                  <>You are about to approve the PM Checklist for <strong className="text-foreground">{activeSchedule.store_name}</strong> executed on <strong className="text-foreground">{formatLocalDate(activeSchedule.scheduled_date)}</strong> by <strong className="text-foreground">{activeSchedule.pic_name}</strong>.</>
                )}
              </p>
              
              <div className="max-h-[35vh] overflow-y-auto rounded-lg border border-border bg-background shadow-inner flex flex-col">
                {loadingChecks ? (
                  <div className="p-6 flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
                    <span className="text-xs text-foreground-subtle">Loading checklist items...</span>
                  </div>
                ) : deviceChecks.length === 0 ? (
                  <div className="p-6 text-center text-sm text-foreground-muted">
                    No detailed checklist items found for this schedule.
                  </div>
                ) : (
                  <>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface-raised sticky top-0 border-b border-border shadow-sm z-10">
                        <tr>
                          <th className="px-4 py-2 font-semibold text-foreground-muted">Device / Item</th>
                          <th className="px-4 py-2 font-semibold text-foreground-muted text-right">Condition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {deviceChecks.filter(dc => dc.status !== 'Header').map((dc, i) => {
                          const ai = actionItems.find(a => a.device_name === dc.device_name && a.device_category === dc.device_category);
                          return (
                            <React.Fragment key={i}>
                              <tr className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-medium text-foreground">{dc.device_name}</div>
                                  <div className="text-[10px] uppercase tracking-wider text-foreground-subtle mt-0.5">{dc.device_category}</div>
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <StatusBadge status={dc.status.toLowerCase()} />
                                </td>
                              </tr>
                              {ai && (
                                <tr className="bg-destructive/5 border-t-0">
                                  <td colSpan={2} className="px-4 py-2 text-xs">
                                    <div className="flex flex-col gap-1 text-foreground-muted">
                                      <div className="flex justify-between items-start">
                                        <div><strong className="text-foreground">Issue:</strong> {ai.issue_description || 'N/A'}</div>
                                        <div className="flex-shrink-0 ml-4"><StatusBadge status={ai.status.toLowerCase()} /></div>
                                      </div>
                                      <div><strong className="text-foreground">Action ({ai.action_type}):</strong> {ai.resolution_notes || 'No resolution notes provided.'}</div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
              
              {activeSchedule.status.toLowerCase() !== 'completed' && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-xs text-foreground-subtle mb-1">Declaration</p>
                  <p className="text-sm text-primary font-medium">
                    By clicking approve, I confirm that the IT Preventive Maintenance for this location has been completed and any necessary repairs or replacements have been acknowledged.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
              <button
                onClick={() => setIsSignOffOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-foreground-muted hover:text-foreground transition-colors"
                disabled={submitting}
              >
                {activeSchedule.status.toLowerCase() === 'completed' ? 'Close' : 'Cancel'}
              </button>
              {activeSchedule.status.toLowerCase() !== 'completed' && (
                <button
                  onClick={handleSignOff}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-success text-success-foreground rounded-lg text-sm font-bold hover:bg-success/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {submitting ? "Approving..." : "Approve & Sign Off"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
