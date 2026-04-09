import React, { useState, useEffect } from "react";
import { Ticket, Search, CheckCircle, Clock, AlertCircle, MessageSquare, ChevronRight, Download, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";

type TicketTarget = {
  id: number;
  ticket_id: string;
  hostname: string;
  status: string;
  remark: string;
  updated_at: string;
  isFromGroup?: boolean;
};

type TroubleTicket = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  outlet_name: string;
  hostname: string;
  created_by: string;
  created_at: string;
  resolved_by: string;
  resolved_at: string;
  resolution_note: string;
  closed_by: string;
  closed_at: string;
  updated_at: string;
  assigned_to: string;
  targets?: TicketTarget[];
  linked_group_ids?: string[];
};

type TicketLog = {
  id: number;
  ticket_id: string;
  action: string;
  performed_by: string;
  created_at: string;
};

export default function TicketsPage() {
  const { user, hasPermission } = useAuth();
  const canManageTickets = user?.is_admin || hasPermission("manage_all_tickets");
  const [tickets, setTickets] = useState<TroubleTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const [selectedTicket, setSelectedTicket] = useState<TroubleTicket | null>(null);
  const [ticketLogs, setTicketLogs] = useState<TicketLog[]>([]);
  const [resolutionInput, setResolutionInput] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [filterAssignee, setFilterAssignee] = useState("All");
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [targetSearchQuery, setTargetSearchQuery] = useState("");
  
  const [isManageTargetsOpen, setIsManageTargetsOpen] = useState(false);
  const [manageTargetsData, setManageTargetsData] = useState({
    hostname: "",
    selected_group_ids: [] as string[]
  });

  const formatServerDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const [datePart, timePart] = dateStr.split('T');
      if (datePart && timePart) {
        const [year, month, day] = datePart.split('-');
        const [hourStr, minStr, secStrWithMs] = timePart.replace('Z', '').split(':');
        const secStr = secStrWithMs.split('.')[0];

        let hr = parseInt(hourStr, 10);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        hr = hr % 12;
        hr = hr ? hr : 12;

        return `${parseInt(month)}/${parseInt(day)}/${year}, ${hr}:${minStr}:${secStr} ${ampm}`;
      }
    } catch (e) { }
    return dateStr;
  };

  const formatServerDateOnly = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const [datePart] = dateStr.split('T');
      if (datePart) {
        const [year, month, day] = datePart.split('-');
        return `${parseInt(month)}/${parseInt(day)}/${year}`;
      }
    } catch (e) { }
    return dateStr;
  };

  useEffect(() => {
    if (user) {
      fetchTickets();
      fetchUsers();
      fetchDevicesAndGroups();
    }
  }, [user, canManageTickets]);

  const fetchDevicesAndGroups = async () => {
    try {
      const [dRes, gRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/groups')
      ]);
      if (dRes.ok) setDevices(await dRes.json());
      if (gRes.ok) setGroups(await gRes.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (selectedTicket) {
      fetchLogs(selectedTicket.id);
    }
  }, [selectedTicket]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        username: user?.username || "",
        can_manage: canManageTickets ? "true" : "false"
      });
      const res = await fetch(`/api/tickets?${qs}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const pieData = React.useMemo(() => {
    const counts = { Open: 0, 'In Progress': 0, 'Resolved': 0, 'Closed': 0 };
    tickets.forEach(t => {
      // @ts-ignore
      if (counts[t.status] !== undefined) counts[t.status]++;
    });
    return [
      { name: 'Open', value: counts.Open, color: '#ef4444' }, // danger
      { name: 'In Progress', value: counts['In Progress'], color: '#f59e0b' }, // warning
      { name: 'Resolved', value: counts.Resolved, color: '#eb0cd8ff' }, // success
      { name: 'Closed', value: counts.Closed, color: '#02f737ff' }, // muted
    ].filter(d => d.value > 0);
  }, [tickets]);

  const fetchLogs = async (id: string) => {
    try {
      const res = await fetch(`/api/tickets/${id}/logs`);
      if (res.ok) {
        const data = await res.json();
        setTicketLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedTicket) return;
    if (status === "Resolved" && !resolutionInput.trim()) {
      alert("Please provide a resolution note.");
      return;
    }

    setActionLoading(true);
    try {
      let payload: any = { status };
      if (status === "Resolved") {
        payload.resolved_by = user?.username;
        payload.resolution_note = resolutionInput;
      }
      if (status === "Closed") {
        payload.closed_by = user?.username;
      }
      if (status === "In Progress") {
        payload.resolved_by = user?.username; // track who picked it up
      }

      await fetch(`/api/tickets/${selectedTicket.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setResolutionInput("");
      await fetchTickets();
      setSelectedTicket((prev) => prev ? { ...prev, status, resolution_note: payload.resolution_note || prev.resolution_note } : prev);
      await fetchLogs(selectedTicket.id);
    } catch (err) {
      alert("Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignTicket = async (assignee: string) => {
    if (!selectedTicket) return;
    setActionLoading(true);
    try {
      await fetch(`/api/tickets/${selectedTicket.id}/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          assigned_to: assignee || null, 
          performed_by: user?.username 
        }),
      });
      await fetchTickets();
      setSelectedTicket(prev => prev ? { ...prev, assigned_to: assignee } : prev);
      await fetchLogs(selectedTicket.id);
    } catch (err) {
      alert("Assignment failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTargetsBulk = async () => {
    if (!selectedTicket) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}/targets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...manageTargetsData,
          performed_by: user?.username
        }),
      });
      if (!res.ok) throw new Error("Failed to update targets");
      
      await fetchTickets();
      // Refetch current ticket details to update the view
      const updatedQs = new URLSearchParams({
        username: user?.username || "",
        can_manage: canManageTickets ? "true" : "false"
      });
      const updatedTicketsRes = await fetch(`/api/tickets?${updatedQs}`);
      if (updatedTicketsRes.ok) {
        const updatedTickets = await updatedTicketsRes.json();
        const found = updatedTickets.find((t: any) => t.id === selectedTicket.id);
        if (found) setSelectedTicket(found);
      }
      
      await fetchLogs(selectedTicket.id);
      setIsManageTargetsOpen(false);
    } catch (err) {
      alert("Bulk target update failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTarget = async (targetId: number | undefined, status: string, remark: string, hostname: string) => {
    if (!selectedTicket) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}/targets/${targetId || 0}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remark, performed_by: user?.username, hostname }),
      });
      if (!res.ok) throw new Error("Failed to update target");
      
      await fetchTickets();
      // Update selected ticket in place to avoid flicker
      setSelectedTicket(prev => {
        if (!prev || !prev.targets) return prev;
        const newTargets = prev.targets.map(t => {
          // If we have a DB ID, match by it. Otherwise, match strictly by hostname.
          const isMatch = (targetId && targetId > 0) ? (t.id === targetId) : (t.hostname === hostname);
          return isMatch ? { ...t, status, remark } : t;
        });
        return { ...prev, targets: newTargets };
      });
      await fetchLogs(selectedTicket.id);
    } catch (err) {
      alert("Target update failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const selected_ticket_can_edit = selectedTicket && (user?.username === selectedTicket.created_by || canManageTickets) && selectedTicket.status !== 'Closed' && selectedTicket.status !== 'Resolved';

  const filteredTickets = tickets.filter(t => {
    if (filterStatus !== "All" && t.status !== filterStatus) return false;
    if (filterAssignee === "Me" && t.assigned_to !== user?.username) return false;
    if (filterAssignee === "Unassigned" && t.assigned_to) return false;
    if (filterAssignee !== "All" && filterAssignee !== "Me" && filterAssignee !== "Unassigned" && t.assigned_to !== filterAssignee) return false;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return t.title.toLowerCase().includes(term) || t.id.toLowerCase().includes(term) || t.outlet_name?.toLowerCase().includes(term);
    }
    return true;
  });

  console.log("Ticket Status:", { 
    ticketCount: tickets.length, 
    filteredCount: filteredTickets.length,
    user: user?.username, 
    loading, 
    canManageTickets,
    filterStatus,
    filterAssignee
  });

  const getPriorityColor = (p: string) => {
    if (p === "High" || p === "Critical") return "text-danger bg-danger/10 border border-danger/20";
    if (p === "Medium") return "text-warning bg-warning/10 border border-warning/20";
    return "text-success bg-success/10 border border-success/20";
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case "Open": return <AlertCircle className="w-4 h-4 text-primary" />;
      case "In Progress": return <Clock className="w-4 h-4 text-warning" />;
      case "Resolved": return <CheckCircle className="w-4 h-4 text-success" />;
      case "Closed": return <CheckCircle className="w-4 h-4 text-foreground-muted" />;
      default: return <Ticket className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex h-full overflow-hidden p-6 gap-6 max-w-[1600px] mx-auto">
      {/* ── Left Sidebar (List) ── */}
      <div className="flex flex-col w-1/3 min-w-[350px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border bg-surface/50">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            Helpdesk Tickets
          </h2>
          <p className="text-xs text-foreground-muted mb-4 uppercase tracking-widest">{canManageTickets ? 'All User Reports' : 'My Reports'}</p>

          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search tickets..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:border-primary focus:outline-none transition-all"
              />
            </div>

            <div className="flex bg-background p-1 rounded-lg border border-border">
              {['All', 'Open', 'In Progress', 'Resolved', 'Closed'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-colors",
                    filterStatus === s ? "bg-surface-raised shadow-sm text-foreground" : "text-foreground-muted hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            
            <div className="flex bg-background p-1 rounded-lg border border-border mt-2">
              <select 
                value={filterAssignee} 
                onChange={e => setFilterAssignee(e.target.value)}
                className="w-full bg-transparent text-[11px] font-semibold py-1 focus:outline-none px-2"
              >
                <option value="All">All Assignees</option>
                <option value="Me">Assigned to Me</option>
                <option value="Unassigned">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.username}>{u.full_name || u.username}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center p-8 text-foreground-muted text-sm">
              No tickets found.
            </div>
          ) : (
            filteredTickets.map(ticket => {
              // SLA Warning logic: if high priority, open/in-progress for > 2 hours -> show indicator
              let isSLAWarning = false;
              if ((ticket.priority === 'High' || ticket.priority === 'Critical') && ['Open', 'In Progress'].includes(ticket.status)) {
                const created = new Date(ticket.created_at);
                const now = new Date();
                const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
                if (diffHours > 2) isSLAWarning = true;
              }

              return (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={cn(
                    "w-full text-left p-4 rounded-lg border transition-all text-sm group relative",
                    selectedTicket?.id === ticket.id
                      ? "border-primary bg-primary/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                      : "border-border bg-background hover:border-foreground-muted/50"
                  )}
                >
                  {isSLAWarning && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-danger animate-ping" title="SLA Overdue Warning" />}

                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono text-xs text-foreground-muted">{ticket.id}</span>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-semibold", getPriorityColor(ticket.priority))}>
                      {ticket.priority}
                    </span>
                  </div>

                  <h3 className="font-semibold text-foreground mb-1 line-clamp-1 group-hover:text-primary transition-colors">{ticket.title}</h3>
                  <p className="text-xs text-foreground-muted line-clamp-1 mb-3">{ticket.outlet_name || "No Outlet"} • {ticket.category}</p>

                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {getStatusIcon(ticket.status)}
                        <span className={
                          ticket.status === 'Resolved' ? 'text-success' :
                            ticket.status === 'In Progress' ? 'text-warning' :
                              ticket.status === 'Closed' ? 'text-foreground-muted' : 'text-primary'
                        }>{ticket.status}</span>
                      </div>
                      {ticket.assigned_to && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                           @{ticket.assigned_to}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-foreground-muted">
                      {formatServerDateOnly(ticket.created_at)}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right Detailed View ── */}
      <div className="flex-1 flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {selectedTicket ? (
          <>
            <div className="p-6 border-b border-border bg-surface/30">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-1">{selectedTicket.title}</h2>
                  <p className="text-sm font-mono text-foreground-subtle flex items-center gap-2">
                    {selectedTicket.id}
                    <span className="px-2 py-0.5 rounded bg-surface border border-border text-xs">{selectedTicket.category}</span>
                  </p>
                </div>

                <div className="flex gap-2 items-center">
                  <div className={cn("px-3 py-1 flex items-center gap-1.5 rounded-full border text-sm font-semibold",
                    selectedTicket.status === 'Resolved' ? 'bg-success/10 border-success/30 text-success' :
                      selectedTicket.status === 'Closed' ? 'bg-surface border-border text-foreground-muted' :
                        selectedTicket.status === 'In Progress' ? 'bg-warning/10 border-warning/30 text-warning' :
                          'bg-primary/10 border-primary/30 text-primary'
                  )}>
                    {getStatusIcon(selectedTicket.status)}
                    {selectedTicket.status}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-background p-3 rounded-md border border-border">
                  <p className="text-[10px] uppercase font-bold text-foreground-muted mb-1">Reported By</p>
                  <p className="text-sm font-medium text-foreground">{selectedTicket.created_by}</p>
                </div>
                <div className="bg-background p-3 rounded-md border border-border">
                  <p className="text-[10px] uppercase font-bold text-foreground-muted mb-1">Outlet / Branch</p>
                  <p className="text-sm font-medium text-foreground">{selectedTicket.outlet_name || '-'}</p>
                </div>
                <div className="bg-background p-3 rounded-md border border-border">
                  <p className="text-[10px] uppercase font-bold text-foreground-muted mb-1">Target Hostname</p>
                  <p className="text-sm font-medium text-foreground">{selectedTicket.hostname || '-'}</p>
                </div>
                <div className="bg-background p-3 rounded-md border border-border">
                  <p className="text-[10px] uppercase font-bold text-foreground-muted mb-1">Created At</p>
                  <p className="text-sm font-medium text-foreground">{formatServerDate(selectedTicket.created_at)}</p>
                </div>
                {canManageTickets && (
                  <div className="bg-surface p-3 rounded-md border border-border col-span-2 md:col-span-1 shadow-sm">
                    <p className="text-[10px] uppercase font-bold text-primary mb-1.5 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                      Assign To
                    </p>
                    <select 
                      className="w-full bg-surface-raised text-foreground text-sm font-semibold focus:outline-none cursor-pointer border border-border/40 rounded px-2 py-1.5 hover:border-primary/40 transition-all appearance-none"
                      value={selectedTicket.assigned_to || ""}
                      onChange={(e) => handleAssignTicket(e.target.value)}
                      disabled={actionLoading}
                    >
                      <option value="" className="bg-surface-overlay text-foreground">Unassigned</option>
                      {users.map(u => (
                        <option key={u.id} value={u.username} className="bg-surface-overlay text-foreground">
                          {u.full_name || u.username}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!canManageTickets && selectedTicket.assigned_to && (
                  <div className="bg-background p-3 rounded-md border border-border">
                    <p className="text-[10px] uppercase font-bold text-foreground-muted mb-1">Assigned To</p>
                    <p className="text-sm font-medium text-foreground">@{selectedTicket.assigned_to}</p>
                  </div>
                )}
              </div>
            </div>
            {selected_ticket_can_edit && (
              <div className="px-6 py-2 bg-surface/5 border-b border-border flex justify-end">
                <button 
                  onClick={() => {
                    setManageTargetsData({
                      hostname: selectedTicket.hostname || "",
                      selected_group_ids: selectedTicket.linked_group_ids || []
                    });
                    setIsManageTargetsOpen(true);
                  }}
                  className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
                >
                   <Filter className="w-3 h-3" /> Manage Targets (Host/Groups)
                </button>
              </div>
            )}

            {selectedTicket.targets && selectedTicket.targets.length > 0 && (
              <div className="px-6 py-4 bg-surface/10 border-b border-border">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Task Completion</h3>
                  <span className="text-sm font-bold text-primary">
                    {Math.round((selectedTicket.targets.filter(t => t.status === 'Solved').length / selectedTicket.targets.length) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-surface-raised h-2 rounded-full overflow-hidden border border-border">
                  <div 
                    className="bg-primary h-full transition-all duration-500 ease-out" 
                    style={{ width: `${(selectedTicket.targets.filter(t => t.status === 'Solved').length / selectedTicket.targets.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              {selectedTicket.targets && selectedTicket.targets.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Target Hostnames ({selectedTicket.targets.length})</h3>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
                      <input
                        type="text"
                        placeholder="Search hostnames..."
                        className="w-full bg-surface border border-border rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-all"
                        value={targetSearchQuery}
                        onChange={(e) => setTargetSearchQuery(e.target.value)}
                      />
                      {targetSearchQuery && (
                        <button 
                          onClick={() => setTargetSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {selectedTicket.targets
                      .filter(t => t.hostname.toLowerCase().includes(targetSearchQuery.toLowerCase()))
                      .map(target => (
                      <div key={target.id} className="bg-background border border-border rounded-lg p-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-foreground">{target.hostname}</span>
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                              target.status === 'Solved' ? "bg-success/10 text-success border border-success/20" : "bg-warning/10 text-warning border border-warning/20"
                            )}>
                              {target.status}
                            </span>
                            {target.isFromGroup && (
                              <span className="text-[9px] bg-primary/5 text-primary-hover px-1.5 py-0.5 rounded border border-primary/10 italic">
                                from dynamic group
                              </span>
                            )}
                          </div>
                          {canManageTickets && selectedTicket.status !== 'Closed' && selectedTicket.status !== 'Resolved' && (
                            <button
                              onClick={() => handleUpdateTarget(target.id, target.status === 'Solved' ? 'Pending' : 'Solved', target.remark, target.hostname)}
                              disabled={actionLoading}
                              className={cn(
                                "px-3 py-1 text-xs font-bold rounded transition-colors",
                                target.status === 'Solved' 
                                  ? "bg-warning/10 text-warning hover:bg-warning/20 border border-warning/30" 
                                  : "bg-success text-white hover:bg-success/90"
                              )}
                            >
                              {target.status === 'Solved' ? 'Set Pending' : 'Mark Solved'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                           <input 
                              type="text" 
                              placeholder="Add a remark for this host..."
                              defaultValue={target.remark || ""}
                              onBlur={(e) => {
                                if (e.target.value !== (target.remark || "")) {
                                  handleUpdateTarget(target.id, target.status, e.target.value, target.hostname);
                                }
                              }}
                              disabled={actionLoading || !canManageTickets || selectedTicket.status === 'Closed' || selectedTicket.status === 'Resolved'}
                              className="flex-1 bg-surface border border-border px-2 py-1 text-xs rounded focus:border-primary focus:outline-none disabled:opacity-60"
                           />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted border-b border-border pb-2">Issue Description</h3>
                <div className="bg-background p-4 rounded-lg border border-border leading-relaxed text-sm text-foreground whitespace-pre-wrap">
                  {selectedTicket.description}
                </div>
              </div>

              {selectedTicket.resolution_note && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-success border-b border-border pb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Resolution Note
                  </h3>
                  <div className="bg-success/5 p-4 rounded-lg border border-success/20 leading-relaxed text-sm text-foreground whitespace-pre-wrap">
                    {selectedTicket.resolution_note}
                  </div>
                  <div className="text-xs text-foreground-muted text-right">
                    Resolved by {selectedTicket.resolved_by} on {selectedTicket.resolved_at ? formatServerDate(selectedTicket.resolved_at) : ''}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted border-b border-border pb-2">Audit Trail</h3>
                <div className="space-y-4 pt-2">
                  {ticketLogs.map((log, i) => (
                    <div key={log.id} className="flex gap-4 relative">
                      {i !== ticketLogs.length - 1 && <div className="absolute left-4 top-8 bottom-[-16px] w-[2px] bg-border" />}
                      <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 z-10 text-foreground-muted">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 pt-1.5">
                        <p className="text-sm text-foreground">
                          <span className="font-semibold text-primary">{log.performed_by}</span> {log.action}
                        </p>
                        <p className="text-xs text-foreground-subtle mt-0.5">{formatServerDate(log.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* ── Actions Panel ── */}
            {selectedTicket.status !== 'Closed' && (
              <div className="p-4 border-t border-border bg-surface flex flex-col gap-3 shrink-0">

                {/* Admin Actions */}
                {canManageTickets && selectedTicket.status !== 'Resolved' && (
                  <div className="flex gap-3">
                    {selectedTicket.status === 'Open' && (
                      <button disabled={actionLoading} onClick={() => handleUpdateStatus('In Progress')} className="px-4 py-2 bg-warning/10 text-warning hover:bg-warning/20 disabled:opacity-50 border border-warning/20 font-medium text-sm rounded-md transition-all flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Start Progress
                      </button>
                    )}

                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter resolution notes to resolve ticket..."
                          value={resolutionInput}
                          onChange={e => setResolutionInput(e.target.value)}
                          className="flex-1 bg-background border border-border px-3 py-2 text-sm rounded-md focus:border-success focus:ring-1 focus:ring-success"
                        />
                        <button 
                          disabled={
                            actionLoading || 
                            !resolutionInput.trim() || 
                            (selectedTicket.targets && selectedTicket.targets.length > 0 && selectedTicket.targets.some(t => t.status !== 'Solved'))
                          } 
                          onClick={() => handleUpdateStatus('Resolved')} 
                          className="px-5 py-2 bg-success text-white hover:bg-success/90 disabled:opacity-50 font-medium text-sm rounded-md transition-all flex items-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" /> Resolve Ticket
                        </button>
                      </div>
                      {selectedTicket.targets && selectedTicket.targets.length > 0 && selectedTicket.targets.some(t => t.status !== 'Solved') && (
                        <p className="text-[10px] text-danger font-bold uppercase tracking-tight">
                          * All targets must be marked as Solved before you can resolve the ticket.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* User Confirmation Action (Only Creator) */}
                {user?.username === selectedTicket.created_by && selectedTicket.status === 'Resolved' && (
                  <div className="flex items-center justify-between bg-primary/10 border border-primary/30 p-4 rounded-lg">
                    <div>
                      <p className="font-semibold text-primary text-sm">Issue marked as resolved</p>
                      <p className="text-xs text-foreground-muted mt-1">Please confirm if the problem has been fully fixed on your end.</p>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={actionLoading} onClick={() => handleUpdateStatus('Open')} className="px-4 py-2 text-sm font-medium text-danger border border-danger/30 hover:bg-danger/10 rounded-md transition-all">
                        No, Reopen
                      </button>
                      <button disabled={actionLoading} onClick={() => handleUpdateStatus('Closed')} className="px-6 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-all shadow-md">
                        Yes, Confirm Closed
                      </button>
                    </div>
                  </div>
                )}

                {/* Fallbacks */}
                {canManageTickets && user?.username !== selectedTicket.created_by && selectedTicket.status === 'Resolved' && (
                  <p className="text-sm text-foreground-muted italic text-center py-2">
                    Waiting for the creator ({selectedTicket.created_by}) to confirm and close the ticket.
                  </p>
                )}

                {user?.username === selectedTicket.created_by && selectedTicket.status !== 'Resolved' && (
                  <p className="text-sm text-foreground-muted italic text-center py-2">
                    Waiting for IT Support to resolve your issue.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-foreground-muted p-6">
            {pieData.length > 0 ? (
              <div className="w-full max-w-sm flex flex-col items-center">
                <h3 className="text-xl font-semibold text-foreground mb-6">Tickets Status Overview</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--foreground)' }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <>
                <Ticket className="w-16 h-16 mb-4 opacity-50 stroke-1" />
                <p className="text-lg font-medium">Select a ticket</p>
                <p className="text-sm opacity-70">Choose a ticket from the left sidebar to view its details.</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Manage Targets Modal ── */}
      {isManageTargetsOpen && selectedTicket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/50">
              <h2 className="text-lg font-bold text-foreground">Manage Ticket Targets</h2>
              <button onClick={() => setIsManageTargetsOpen(false)} className="text-foreground-muted hover:text-foreground">&times;</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-foreground-muted mb-2">Manual Hostnames (Optional)</label>
                <input 
                  type="text" 
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={manageTargetsData.hostname}
                  onChange={(e) => setManageTargetsData(prev => ({ ...prev, hostname: e.target.value }))}
                  placeholder="e.g. PC-A, PC-B"
                />
                <p className="text-[10px] text-foreground-muted mt-1 italic">Comma separated for unregistered devices</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground-muted mb-2">Linked Groups</label>
                  <select 
                    multiple
                    className="w-full h-32 bg-background border border-border rounded-lg p-2 text-xs focus:outline-none"
                    value={manageTargetsData.selected_group_ids}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions, option => option.value);
                      setManageTargetsData(prev => ({ ...prev, selected_group_ids: values }));
                    }}
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.device_count})</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground-muted mb-2">Notice</span>
                  <div className="text-[10px] text-foreground-muted space-y-2">
                    <p>• Adding/Removing hosts will reset the target progress bar.</p>
                    <p>• Linked groups are <strong>dynamic</strong>; changes to group members will reflect in this ticket.</p>
                    <p>• Current target status/remarks for existing hosts will be preserved if the hostname remains in the list.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border bg-surface/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsManageTargetsOpen(false)}
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-surface rounded-md"
              >
                Cancel
              </button>
              <button 
                disabled={actionLoading}
                onClick={handleUpdateTargetsBulk}
                className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-md hover:bg-primary-hover disabled:opacity-50"
              >
                {actionLoading ? "Updating..." : "Update Targets"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
