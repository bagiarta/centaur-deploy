import React, { useState, useEffect } from "react";
import { X, Send, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type ReportTroubleModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ReportTroubleModal({ isOpen, onClose }: ReportTroubleModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    category: "Software",
    priority: "Medium",
    outlet_name: "",
    hostname: "",
    description: "",
  });

  // Pre-fill outlet if it's stored in user meta or let them type it.
  // For now, it's just a text input.

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const dbId = "TKT-" + Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dbId,
          ...formData,
          created_by: user?.username || "Guest",
        }),
      });

      if (!res.ok) throw new Error("Failed to submit ticket");
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        setFormData({
          title: "", category: "Software", priority: "Medium", outlet_name: "", hostname: "", description: ""
        });
      }, 2000);
    } catch (err) {
      alert("Failed to send report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center text-danger">
               <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground leading-tight">Report an Issue</h2>
              <p className="text-xs text-foreground-muted">Create a helpdesk ticket</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-foreground-muted hover:text-foreground rounded-md hover:bg-surface-raised transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-4">
             <div className="w-16 h-16 bg-success/20 text-success rounded-full flex items-center justify-center mb-2">
                <Send className="w-8 h-8" />
             </div>
             <h3 className="text-xl font-bold text-foreground">Report Sent!</h3>
             <p className="text-foreground-subtle text-sm max-w-xs">Your trouble ticket has been successfully submitted to the IT team. You can view its status in the Helpdesk menu.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1.5">Issue Subject</label>
              <input required type="text" name="title" value={formData.title} onChange={handleChange} placeholder="e.g., Cannot connect to database" className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1.5">Category</label>
                <select name="category" value={formData.category} onChange={handleChange} className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                  <option>Software</option>
                  <option>Hardware</option>
                  <option>Network</option>
                  <option>Access/Login</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1.5">Priority</label>
                <select name="priority" value={formData.priority} onChange={handleChange} className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                  <option>Critical</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1.5">Outlet / Branch</label>
                <input required type="text" name="outlet_name" value={formData.outlet_name} onChange={handleChange} placeholder="e.g., HQ Jakarta" className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1.5">Device Hostname</label>
                <input type="text" name="hostname" value={formData.hostname} onChange={handleChange} placeholder="Optional (e.g., PC-CASHIER-1)" className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1.5">Details</label>
              <textarea required name="description" value={formData.description} onChange={handleChange} rows={4} placeholder="Please describe the issue in detail..." className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"></textarea>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-raised rounded-md transition-colors">
                Cancel
              </button>
              <button disabled={loading} type="submit" className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2">
                {loading ? "Submitting..." : <><Send className="w-4 h-4" /> Submit Report</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
