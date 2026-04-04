import React, { useState, useEffect } from "react";
import { Ticket, Search, CheckCircle, Clock, AlertCircle, MessageSquare, ChevronRight, Download, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

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
    } catch(e) {}
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
    } catch(e) {}
    return dateStr;
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchLogs(selectedTicket.id);
    }
  }, [selectedTicket]);

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

  const filteredTickets = tickets.filter(t => {
    if (filterStatus !== "All" && t.status !== filterStatus) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return t.title.toLowerCase().includes(term) || t.id.toLowerCase().includes(term) || t.outlet_name?.toLowerCase().includes(term);
    }
    return true;
  });

  const getPriorityColor = (p: string) => {
    if (p === "High" || p === "Critical") return "text-danger bg-danger/10 border border-danger/20";
    if (p === "Medium") return "text-warning bg-warning/10 border border-warning/20";
    return "text-success bg-success/10 border border-success/20";
  };

  const getStatusIcon = (s: string) => {
    switch(s) {
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
              {['All', 'Open', 'In Progress', 'Resolved'].map(s => (
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
                {isSLAWarning && <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-danger animate-ping" title="SLA Overdue Warning"/>}
                
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-xs text-foreground-muted">{ticket.id}</span>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-semibold", getPriorityColor(ticket.priority))}>
                    {ticket.priority}
                  </span>
                </div>
                
                <h3 className="font-semibold text-foreground mb-1 line-clamp-1 group-hover:text-primary transition-colors">{ticket.title}</h3>
                <p className="text-xs text-foreground-muted line-clamp-1 mb-3">{ticket.outlet_name || "No Outlet"} • {ticket.category}</p>
                
                <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {getStatusIcon(ticket.status)}
                    <span className={
                      ticket.status === 'Resolved' ? 'text-success' : 
                      ticket.status === 'In Progress' ? 'text-warning' : 
                      ticket.status === 'Closed' ? 'text-foreground-muted' : 'text-primary'
                    }>{ticket.status}</span>
                  </div>
                  <span className="text-[10px] text-foreground-muted">
                    {formatServerDateOnly(ticket.created_at)}
                  </span>
                </div>
              </button>
            )})
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
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted border-b border-border pb-2">Issue Description</h3>
                <div className="bg-background p-4 rounded-lg border border-border leading-relaxed text-sm text-foreground whitespace-pre-wrap">
                  {selectedTicket.description}
                </div>
              </div>

              {selectedTicket.resolution_note && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-success border-b border-border pb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4"/> Resolution Note
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
                     
                     <div className="flex-1 flex gap-2">
                        <input 
                           type="text" 
                           placeholder="Enter resolution notes to resolve ticket..." 
                           value={resolutionInput}
                           onChange={e => setResolutionInput(e.target.value)}
                           className="flex-1 bg-background border border-border px-3 py-2 text-sm rounded-md focus:border-success focus:ring-1 focus:ring-success"
                        />
                        <button disabled={actionLoading || !resolutionInput.trim()} onClick={() => handleUpdateStatus('Resolved')} className="px-5 py-2 bg-success text-white hover:bg-success/90 disabled:opacity-50 font-medium text-sm rounded-md transition-all flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> Resolve Ticket
                        </button>
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
            <Ticket className="w-16 h-16 mb-4 opacity-50 stroke-1" />
            <p className="text-lg font-medium">Select a ticket</p>
            <p className="text-sm opacity-70">Choose a ticket from the left sidebar to view its details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
