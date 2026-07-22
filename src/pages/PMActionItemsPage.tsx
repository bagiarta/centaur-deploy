import React, { useState, useEffect, useMemo } from "react";
import {
  Wrench, CheckCircle, Clock, X, Search, Filter, Loader2, AlertOctagon,
  MapPin, User, MessageSquare, AlertCircle, RefreshCw, ChevronDown, ChevronRight
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui-enterprise";
import { toast } from "sonner";

interface ActionItem {
  id: number;
  result_id: string;
  store_code: string;
  store_name: string;
  device_category: string;
  device_name: string;
  cctv_device_id: string | null;
  issue_description: string;
  action_type: "Repair" | "Replacement" | string;
  status: "Pending" | "Resolved" | string;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  execution_date: string;
  pic_name: string;
}

const formatLocalDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  const cleanStr = dateStr.endsWith("Z") ? dateStr.slice(0, -1) : dateStr;
  return new Date(cleanStr).toLocaleDateString("id-ID");
};

export default function PMActionItemsPage() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Modal
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<ActionItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [submittingResolution, setSubmittingResolution] = useState(false);

  const fetchActionItems = async () => {
    try {
      setLoading(true);
      const url = new URL("/api/trial/support-manager/action-items", window.location.origin);
      if (statusFilter !== "All") url.searchParams.append("status", statusFilter);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load action items");
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load action items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActionItems();
  }, [statusFilter]);

  // Auto-expand groups on load (set to false for collapsed by default)
  useEffect(() => {
    if (items.length > 0) {
      setExpandedGroups(prev => {
        const next = { ...prev };
        items.forEach(item => {
          if (next[item.result_id] === undefined) {
            next[item.result_id] = false;
          }
        });
        return next;
      });
    }
  }, [items]);

  const handleOpenResolve = (item: ActionItem) => {
    setActiveItem(item);
    setResolutionNotes("");
    setIsResolveOpen(true);
  };

  const handleSaveResolve = async () => {
    if (!activeItem) return;
    if (!resolutionNotes.trim()) {
      toast.error("Please provide resolution notes before marking as resolved");
      return;
    }

    setSubmittingResolution(true);
    try {
      const res = await fetch(`/api/trial/support-manager/action-items/${activeItem.id}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution_notes: resolutionNotes })
      });

      if (res.ok) {
        toast.success(`Action Item resolved: ${activeItem.device_name}`);
        setIsResolveOpen(false);
        fetchActionItems();
      } else {
        const err = await res.json();
        throw new Error(err.error || "Failed to resolve item");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingResolution(false);
    }
  };

  // Filter items in memory
  const filteredItems = items.filter(item => {
    const matchesSearch =
      item.store_name.toLowerCase().includes(search.toLowerCase()) ||
      item.store_code.toLowerCase().includes(search.toLowerCase()) ||
      item.device_name.toLowerCase().includes(search.toLowerCase()) ||
      item.issue_description.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === "All" || item.device_category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Group items by result_id
  const groupedGroups = useMemo(() => {
    const groups: Record<string, {
      result_id: string;
      store_name: string;
      store_code: string;
      execution_date: string;
      pic_name: string;
      items: ActionItem[];
    }> = {};

    filteredItems.forEach(item => {
      if (!groups[item.result_id]) {
        groups[item.result_id] = {
          result_id: item.result_id,
          store_name: item.store_name,
          store_code: item.store_code,
          execution_date: item.execution_date,
          pic_name: item.pic_name,
          items: []
        };
      }
      groups[item.result_id].items.push(item);
    });

    return Object.values(groups);
  }, [filteredItems]);

  const toggleGroup = (resultId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [resultId]: !prev[resultId]
    }));
  };

  const categories = ["All", "PC/POS", "Printer", "CCTV", "Network", "Power", "Scale"];

  return (
    <div className="p-6 h-full flex flex-col gap-6 overflow-y-auto animate-fade-up">
      <PageHeader
        title="Action Items & Device Repair Logs"
        subtitle="Track device replacements, monitor repairs, and see store changes derived from PM results"
        actions={
          <button
            onClick={fetchActionItems}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-raised border border-border text-foreground rounded-lg font-medium hover:bg-surface-overlay transition-all shadow-sm text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh List
          </button>
        }
      />

      <SectionCard className="flex-1 flex flex-col min-h-[400px]">
        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-border">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder="Search store, device, or issue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-lg py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-muted font-medium flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Status:
              </span>
              <div className="flex bg-surface-overlay border border-border p-0.5 rounded-lg text-xs">
                {(["All", "Pending", "Resolved"] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-md font-semibold transition-all ${statusFilter === status
                        ? "bg-background text-foreground shadow-sm font-bold"
                        : "text-foreground-muted hover:text-foreground"
                      }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground-muted font-medium">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat === "All" ? "All Categories" : cat}</option>
                ))}
              </select>
            </div>

            {/* Collapse/Expand All */}
            <div className="flex items-center gap-1.5 bg-surface-overlay border border-border p-0.5 rounded-lg text-xs">
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  groupedGroups.forEach(g => {
                    next[g.result_id] = true;
                  });
                  setExpandedGroups(next);
                }}
                className="px-2.5 py-1.5 rounded hover:text-foreground text-foreground-muted font-semibold transition-colors"
              >
                Expand All
              </button>
              <span className="text-border">|</span>
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  groupedGroups.forEach(g => {
                    next[g.result_id] = false;
                  });
                  setExpandedGroups(next);
                }}
                className="px-2.5 py-1.5 rounded hover:text-foreground text-foreground-muted font-semibold transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* Table list */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-raised">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted pl-8 w-24">Item ID</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted w-32">Category</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted w-48">Device Name</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Issue & Action Type</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted w-40">Reported Info</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted w-32">Status</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted text-right w-44">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-foreground-muted italic">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading action items...
                  </td>
                </tr>
              ) : groupedGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-foreground-muted italic">
                    No active action items found. PM results are clean!
                  </td>
                </tr>
              ) : groupedGroups.map(group => {
                const isExpanded = !!expandedGroups[group.result_id];
                const pendingCount = group.items.filter(i => i.status === "Pending").length;
                const resolvedCount = group.items.filter(i => i.status === "Resolved").length;

                return (
                  <React.Fragment key={group.result_id}>
                    {/* Group Header Row */}
                    <tr
                      className="bg-surface-raised/80 hover:bg-surface-overlay cursor-pointer select-none border-b border-border transition-colors"
                      onClick={() => toggleGroup(group.result_id)}
                    >
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-foreground-muted" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-foreground-muted" />
                            )}
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-foreground">{group.store_name}</span>
                              <span className="text-[10px] font-mono text-foreground-muted flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-primary" /> {group.store_code}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 text-xs text-foreground-muted">
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5" /> By {group.pic_name}
                            </span>
                            <span className="flex items-center gap-1 font-mono">
                              <Clock className="w-3.5 h-3.5" /> {formatLocalDate(group.execution_date)}
                            </span>
                            <div className="flex gap-1.5">
                              {pendingCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-warning/10 text-warning text-[10px] font-bold border border-warning/20">
                                  {pendingCount} Pending
                                </span>
                              )}
                              {resolvedCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-success/10 text-success text-[10px] font-bold border border-success/20">
                                  {resolvedCount} Resolved
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Detail Rows */}
                    {isExpanded && group.items.map(item => (
                      <tr key={item.id} className="hover:bg-white/5 border-b border-border/40 transition-colors group/row">
                        {/* Indent column showing Item ID */}
                        <td className="px-4 py-3.5 pl-8 text-xs text-foreground-muted">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-border" />
                            <span className="font-mono text-[10px] font-bold">#{item.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                            {item.device_category}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm font-semibold text-foreground">{item.device_name}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col max-w-xs">
                            <span className="text-xs text-foreground-subtle bg-surface-raised p-2 rounded-md border border-border/50 truncate" title={item.issue_description}>
                              {item.issue_description}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wide mt-1.5 ${item.action_type === "Replacement" ? "text-danger" : "text-warning"
                              }`}>
                              Required: {item.action_type}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-foreground-muted">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium text-foreground-muted">Reported on PM</span>
                            <span className="font-mono text-[9px]">{formatLocalDate(item.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <StatusBadge status={item.status.toLowerCase()} />
                          {item.status === "Resolved" && item.resolved_at && (
                            <span className="text-[9px] text-foreground-muted font-mono block mt-1">
                              Fixed: {formatLocalDate(item.resolved_at)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {item.status === "Pending" ? (
                            <button
                              onClick={() => handleOpenResolve(item)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-success text-success-foreground rounded-lg text-xs font-bold hover:bg-success/90 transition-all shadow-sm"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Mark Resolved
                            </button>
                          ) : (
                            <div className="flex flex-col items-end gap-1.5 text-left text-xs bg-success/5 border border-success/15 p-2 rounded-lg">
                              <span className="font-semibold text-[10px] text-success uppercase tracking-wider flex items-center gap-0.5">
                                <CheckCircle className="w-3.5 h-3.5" /> Resolved Notes
                              </span>
                              <p className="text-[11px] text-foreground-subtle italic max-w-[150px] truncate" title={item.resolution_notes || ""}>
                                "{item.resolution_notes || "N/A"}"
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Resolve Action Item Modal */}
      {isResolveOpen && activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-raised border border-border w-full max-w-md rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                <Wrench className="w-5 h-5 text-success" />
                Resolve Device Issue
              </h3>
              <button onClick={() => setIsResolveOpen(false)} className="text-foreground-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Item detail details */}
            <div className="p-3 bg-surface border border-border rounded-lg text-xs space-y-1.5 text-foreground-muted">
              <div>Store: <strong className="text-foreground">{activeItem.store_name} ({activeItem.store_code})</strong></div>
              <div>Device: <strong className="text-foreground">{activeItem.device_category} - {activeItem.device_name}</strong></div>
              <div className="pt-2 border-t border-border/50 text-danger-foreground">
                Problem: <span className="font-medium italic">"{activeItem.issue_description}"</span>
              </div>
            </div>

            {/* Resolution Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Resolution Details / Actions Performed</label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="E.g. Cleaned card reader pins, re-calibrated scale scale, replaced dead POS power supply..."
                rows={4}
                className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all text-foreground resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                onClick={() => setIsResolveOpen(false)}
                className="px-4 py-2 border border-border hover:bg-surface-raised rounded-lg text-sm text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveResolve}
                disabled={submittingResolution}
                className="px-4 py-2 bg-success text-success-foreground hover:bg-success/95 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              >
                {submittingResolution ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Complete Resolution
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
