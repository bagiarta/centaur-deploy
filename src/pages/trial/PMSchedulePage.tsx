import React, { useState, useEffect, useCallback } from "react";
import { 
  Calendar, Users, MapPin, ClipboardList, CheckSquare, Plus, Search, 
  X, Check, AlertTriangle, Eye, Loader2, Save, Wrench, RefreshCw, AlertOctagon,
  ChevronDown, ChevronLeft, ChevronRight, Edit, Trash2
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Store {
  org_cd: string;
  org_name: string;
}

interface PicUser {
  id: string;
  username: string;
  full_name: string;
  role_name: string;
}

interface CCTVDevice {
  id: string;
  name: string;
  ip_address: string;
  status: string;
}

interface Schedule {
  id: string;
  store_code: string;
  store_name: string;
  scheduled_date: string;
  pic_id: string;
  pic_name: string;
  status: string;
  notes: string;
  created_at: string;
  created_by?: string;
}

interface ChecklistItem {
  device_category: string;
  device_name: string;
  status: "Good" | "Needs Repair" | "Needs Replacement" | "Not Available";
  issues_found: string;
  cctv_device_id?: string;
}

const DEFAULT_DEVICES = [
  { category: "PC/POS", name: "POS Cashier PC" },
  { category: "PC/POS", name: "POS Cashier Monitor" },
  { category: "PC/POS", name: "Back Office PC" },
  { category: "PC/POS", name: "Keyboard & Mouse" },
  { category: "Printer", name: "Receipt Printer" },
  { category: "Printer", name: "Label/Barcode Printer" },
  { category: "Network", name: "Router & Firewall" },
  { category: "Network", name: "Switch Hub & Cabling" },
  { category: "Network", name: "Access Point (Wi-Fi)" },
  { category: "Power", name: "UPS (Battery Back-up)" },
  { category: "Power", name: "Stabilizer" },
  { category: "Scale", name: "Digital scale (Calibration)" },
  { category: "CCTV", name: "NVR/DVR System" },
  { category: "CCTV", name: "CCTV Feed Check" }
];

const formatLocalDate = (dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return "";
  const cleanStr = dateStr.endsWith("Z") ? dateStr.slice(0, -1) : dateStr;
  return new Date(cleanStr).toLocaleDateString("id-ID", options);
};

export default function PMSchedulePage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [activeActionSchedule, setActiveActionSchedule] = useState<Schedule | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<PicUser[]>([]);
  const [cctvDevices, setCctvDevices] = useState<CCTVDevice[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals status
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);

  // Add Schedule Form
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [storeSearch, setStoreSearch] = useState("");
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [selectedPic, setSelectedPic] = useState<PicUser | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  // PM Checklist Form
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [submittingChecklist, setSubmittingChecklist] = useState(false);
  const [cctvSearch, setCctvSearch] = useState("");
  const [showCctvDropdown, setShowCctvDropdown] = useState<number | null>(null); // maps to check index
  const [customDeviceName, setCustomDeviceName] = useState("");
  const [customDeviceCategory, setCustomDeviceCategory] = useState("PC/POS");
  const [showAddCustomForm, setShowAddCustomForm] = useState(false);
  const [addingInstanceForIdx, setAddingInstanceForIdx] = useState<number | null>(null);
  const [customInstanceName, setCustomInstanceName] = useState("");

  // Calendar view configuration
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDayIndex = getFirstDayOfMonth(currentDate);

  const cells: { day: number | null; dateStr: string | null }[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push({ day: null, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, dateStr: dStr });
  }

  const getSchedulesForDate = (dateStr: string | null) => {
    if (!dateStr) return [];
    return schedules.filter(s => {
      if (!s.scheduled_date) return false;
      const cleanDate = s.scheduled_date.split("T")[0];
      return cleanDate === dateStr;
    });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [schedRes, storeRes, userRes, cctvRes] = await Promise.all([
        fetch("/api/trial/support-manager/schedules"),
        fetch("/api/trial/support-manager/stores"),
        fetch("/api/trial/support-manager/pic-users"),
        fetch("/api/trial/support-manager/cctv-devices")
      ]);

      const scheds = await schedRes.json();
      const st = await storeRes.json();
      const us = await userRes.json();
      const cc = await cctvRes.json();

      setSchedules(scheds);
      setStores(st);
      setUsers(us);
      setCctvDevices(cc);
    } catch (err) {
      toast.error("Failed to load initial scheduling data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenScheduleModal = () => {
    setEditingSchedule(null);
    setSelectedStore(null);
    setStoreSearch("");
    setSelectedPic(users[0] || null);
    setScheduledDate(new Date().toISOString().split("T")[0]);
    setScheduleNotes("");
    setIsScheduleOpen(true);
  };

  const handleOpenEditModal = (sched: Schedule) => {
    setEditingSchedule(sched);
    setSelectedStore({ org_cd: sched.store_code, org_name: sched.store_name });
    setStoreSearch(`${sched.store_name} (${sched.store_code})`);
    const picUser = users.find(u => u.id === sched.pic_id) || { id: sched.pic_id, username: sched.pic_name, full_name: sched.pic_name, role_name: "IT" };
    setSelectedPic(picUser);
    setScheduledDate(sched.scheduled_date.split("T")[0]);
    setScheduleNotes(sched.notes || "");
    setIsScheduleOpen(true);
  };

  const handleDeleteSchedule = async (sched: Schedule) => {
    const confirmMsg = sched.status === "Completed"
      ? `WARNING: This schedule is marked as Completed! Deleting this schedule will also PERMANENTLY delete the PM checklist result, all device check records, and any related action items/repair logs. Are you absolutely sure you want to proceed?`
      : `Are you sure you want to delete the schedule for ${sched.store_name}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/trial/support-manager/schedules/${sched.id}`, {
        method: "DELETE",
        headers: { "x-user-id": user?.id || "" }
      });

      if (res.ok) {
        toast.success("Schedule and all related data deleted successfully");
        fetchData();
      } else {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete schedule");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveSchedule = async () => {
    if (!selectedStore || !scheduledDate || !selectedPic) {
      toast.error("Please fill in Store, Date, and PIC");
      return;
    }

    setSavingSchedule(true);
    try {
      const method = editingSchedule ? "PUT" : "POST";
      const url = editingSchedule 
        ? `/api/trial/support-manager/schedules/${editingSchedule.id}`
        : "/api/trial/support-manager/schedules";

      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user?.id || "" 
        },
        body: JSON.stringify({
          store_code: selectedStore.org_cd,
          store_name: selectedStore.org_name,
          scheduled_date: scheduledDate,
          pic_id: selectedPic.id,
          pic_name: selectedPic.full_name || selectedPic.username,
          notes: scheduleNotes,
          status: editingSchedule ? editingSchedule.status : "Scheduled"
        })
      });

      if (res.ok) {
        toast.success(editingSchedule ? "Schedule updated successfully" : "Preventive Maintenance scheduled successfully");
        setIsScheduleOpen(false);
        setEditingSchedule(null);
        fetchData();
      } else {
        const err = await res.json();
        throw new Error(err.error || "Failed to save schedule");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleOpenChecklistModal = (schedule: Schedule) => {
    setActiveSchedule(schedule);
    setGeneralNotes("");
    
    // Initialize checklist items
    const initialChecklist: ChecklistItem[] = DEFAULT_DEVICES.map(d => ({
      device_category: d.category,
      device_name: d.name,
      status: "Good",
      issues_found: "",
      cctv_device_id: ""
    }));
    
    setChecklist(initialChecklist);
    setIsChecklistOpen(true);
  };

  const handleChecklistStatusChange = (idx: number, status: ChecklistItem["status"]) => {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, status } : item));
  };

  const handleChecklistNotesChange = (idx: number, issues_found: string) => {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, issues_found } : item));
  };

  const handleLinkCCTV = (idx: number, cctvId: string) => {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, cctv_device_id: cctvId } : item));
    setShowCctvDropdown(null);
  };

  const handleAddCustomDevice = () => {
    if (!customDeviceName.trim()) {
      toast.error("Please enter a device name");
      return;
    }
    
    const newItem: ChecklistItem = {
      device_category: customDeviceCategory,
      device_name: customDeviceName.trim(),
      status: "Good",
      issues_found: ""
    };
    
    setChecklist(prev => [...prev, newItem]);
    setCustomDeviceName("");
    setShowAddCustomForm(false);
    toast.success(`Custom device "${newItem.device_name}" added to checklist`);
  };

  const handleSaveInstance = (idx: number) => {
    if (!customInstanceName.trim()) {
      toast.error("Please enter an instance name");
      return;
    }
    
    const itemToDuplicate = checklist[idx];
    const baseName = itemToDuplicate.device_name.replace(/\s*\([^)]+\)$/, "");
    const newName = `${baseName} (${customInstanceName.trim()})`;
    
    const newItem: ChecklistItem = {
      device_category: itemToDuplicate.device_category,
      device_name: newName,
      status: "Good",
      issues_found: "",
      cctv_device_id: ""
    };
    
    setChecklist(prev => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, newItem);
      return copy;
    });
    
    setAddingInstanceForIdx(null);
    setCustomInstanceName("");
    toast.success(`Added ${newItem.device_name}`);
  };

  const handleRemoveChecklistItem = (idx: number) => {
    setChecklist(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitChecklist = async () => {
    if (!activeSchedule) return;

    // Check if any broken item has empty notes
    const incompleteBrokenItem = checklist.find(
      item => (item.status === "Needs Repair" || item.status === "Needs Replacement") && !item.issues_found.trim()
    );

    if (incompleteBrokenItem) {
      toast.error(`Please provide details of the issue for: ${incompleteBrokenItem.device_name}`);
      return;
    }

    setSubmittingChecklist(true);
    try {
      // Determine overall status
      const hasBroken = checklist.some(item => item.status === "Needs Repair" || item.status === "Needs Replacement");
      const overall_status = hasBroken ? "Pending Action" : "Success";

      const res = await fetch("/api/trial/support-manager/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: activeSchedule.id,
          store_code: activeSchedule.store_code,
          store_name: activeSchedule.store_name,
          pic_id: activeSchedule.pic_id,
          pic_name: activeSchedule.pic_name,
          overall_status,
          general_notes: generalNotes,
          device_checks: checklist.map(item => ({
            ...item,
            status: DEFAULT_DEVICES.some(d => d.name === item.device_name) ? "Header" : item.status
          }))
        })
      });

      if (res.ok) {
        toast.success("Preventive Maintenance completed and logged!");
        setIsChecklistOpen(false);
        fetchData();
      } else {
        const err = await res.json();
        throw new Error(err.error || "Failed to log results");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingChecklist(false);
    }
  };

  // Filters for stores dropdown
  const filteredStores = stores.filter(s => 
    s.org_name.toLowerCase().includes(storeSearch.toLowerCase()) ||
    s.org_cd.toLowerCase().includes(storeSearch.toLowerCase())
  );

  // Filters for CCTV devices dropdown
  const getFilteredCctv = (search: string) => {
    return cctvDevices.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.ip_address.toLowerCase().includes(search.toLowerCase())
    );
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 overflow-y-auto animate-fade-up">
      <PageHeader 
        title="Preventive Maintenance Schedules" 
        subtitle="Manage maintenance calendars, schedule events, and perform checklist verifications (Trial Mode)"
        actions={
          <button 
            onClick={handleOpenScheduleModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all shadow-glow text-sm"
          >
            <Plus className="w-4 h-4" />
            Schedule PM
          </button>
        }
      />

      {/* View Toggle and Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-surface-raised via-surface-raised/90 to-surface-raised border border-border p-5 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 bg-background/50 p-1.5 rounded-xl border border-border/40">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${
              viewMode === "calendar"
                ? "bg-primary text-primary-foreground shadow-glow font-black"
                : "text-foreground-muted hover:text-foreground hover:bg-surface-overlay"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Calendar View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${
              viewMode === "list"
                ? "bg-primary text-primary-foreground shadow-glow font-black"
                : "text-foreground-muted hover:text-foreground hover:bg-surface-overlay"
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            List View
          </button>
        </div>

        {viewMode === "calendar" && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 border border-border hover:border-primary/45 hover:bg-primary/5 rounded-xl text-foreground-muted hover:text-primary transition-all duration-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="bg-background/40 px-6 py-2 border border-border/30 rounded-xl min-w-[160px] text-center shadow-inner">
              <h3 className="font-extrabold text-sm text-foreground uppercase tracking-widest bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent">
                {monthNames[month]} {year}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 border border-border hover:border-primary/45 hover:bg-primary/5 rounded-xl text-foreground-muted hover:text-primary transition-all duration-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {viewMode === "calendar" ? (
        <SectionCard className="flex-1 flex flex-col min-h-[580px] p-6 shadow-2xl border border-border bg-gradient-to-b from-surface/80 to-surface/40 backdrop-blur-lg rounded-2xl">
          {/* Days of the Week Header */}
          <div className="grid grid-cols-7 gap-3 mb-3 text-center">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, idx) => {
              const isWeekend = idx === 0 || idx === 6;
              return (
                <div 
                  key={day} 
                  className={`text-xs font-black uppercase tracking-wider py-2.5 rounded-xl border border-border/20 ${
                    isWeekend 
                      ? "bg-danger/5 text-danger/80 border-danger/10" 
                      : "bg-surface-raised text-foreground-muted"
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {/* Month grid cells */}
          <div className="grid grid-cols-7 gap-3 flex-1 min-h-[420px]">
            {loading ? (
              <div className="col-span-7 py-24 text-center text-foreground-muted italic">
                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-primary" />
                Loading PM schedules...
              </div>
            ) : (() => {
              const todayObj = new Date();
              const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;

              return cells.map((cell, index) => {
                const daySchedules = getSchedulesForDate(cell.dateStr);
                const isToday = cell.dateStr === todayStr;
                
                return (
                  <div
                    key={index}
                    className={`min-h-[105px] border rounded-2xl p-3 flex flex-col transition-all duration-300 relative ${
                      cell.day 
                        ? isToday 
                          ? "border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-primary/30"
                          : "border-border/60 bg-surface-raised/20 hover:bg-surface-raised/40 hover:border-primary/45 hover:shadow-lg"
                        : "border-border/10 opacity-15 border-dashed pointer-events-none bg-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-extrabold font-mono ${
                        isToday ? "text-primary scale-110 origin-left" : "text-foreground-muted"
                      }`}>
                        {cell.day}
                      </span>
                      {daySchedules.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-primary to-violet-500 text-white text-[8px] font-black leading-none shadow-glow">
                          {daySchedules.length}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[90px] scrollbar-thin pr-1">
                      {daySchedules.map(sched => {
                        const isCompleted = sched.status === "Completed";
                        return (
                          <button
                            key={sched.id}
                            type="button"
                            onClick={() => {
                              setActiveActionSchedule(sched);
                            }}
                            className={`w-full text-left p-2 rounded-xl border text-[9px] leading-tight flex flex-col gap-1 transition-all duration-300 hover:translate-x-0.5 hover:-translate-y-0.5 shadow-sm ${
                              isCompleted 
                                ? "bg-success/5 hover:bg-success/15 border-success/20 border-l-[3px] border-l-success text-success font-semibold"
                                : "bg-primary/5 hover:bg-primary/15 border-primary/20 border-l-[3px] border-l-primary text-primary font-bold"
                            }`}
                          >
                            <span className="font-extrabold truncate">{sched.store_code} - {sched.store_name}</span>
                            <div className="flex items-center justify-between gap-1 w-full mt-0.5">
                              <span className="text-[8px] text-foreground-muted truncate flex items-center gap-0.5 font-medium">
                                <Users className="w-2.5 h-2.5 shrink-0 text-foreground-muted/65" /> {sched.pic_name}
                              </span>
                              <span className={`text-[7px] font-black uppercase tracking-wider px-1 py-0.5 rounded leading-none ${
                                isCompleted ? "bg-success/15" : "bg-primary/15"
                              }`}>
                                {sched.status}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </SectionCard>
      ) : (
        <SectionCard className="flex-1 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider">PM Calendars & Tasks</h3>
            <div className="text-xs text-foreground-muted">Showing {schedules.length} schedules</div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-raised">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Store Code</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Store Name</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Scheduled Date</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Assigned PIC (IT)</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">Status</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-foreground-muted text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted italic">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading schedules...
                    </td>
                  </tr>
                ) : schedules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted italic">
                      No scheduled PMs found. Click 'Schedule PM' to schedule a checklist.
                    </td>
                  </tr>
                ) : schedules.map(s => (
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
                      <div className="flex items-center justify-end gap-2">
                        {s.status === "Scheduled" && (
                          <button 
                            onClick={() => handleOpenChecklistModal(s)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success text-success-foreground rounded-lg text-xs font-bold hover:bg-success/90 transition-all shadow-sm font-semibold"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                            Execute Checklist
                          </button>
                        )}
                        {s.status === "Completed" && (
                          <span className="text-xs text-success font-medium flex items-center justify-end gap-1 select-none">
                            <Check className="w-4 h-4" /> Checkup Logged
                          </span>
                        )}

                        {/* Edit Button: Admin OR Creator */}
                        {(user?.is_admin || s.created_by === user?.id) && (
                          <button
                            onClick={() => handleOpenEditModal(s)}
                            className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                            title="Edit Schedule"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete Button: Admin Only */}
                        {user?.is_admin && (
                          <button
                            onClick={() => handleDeleteSchedule(s)}
                            className="p-1.5 text-foreground-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                            title="Delete Schedule & related data"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* 1. Schedule PM Modal */}
      {isScheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-raised border border-border w-full max-w-lg rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                <Calendar className="w-5 h-5 text-primary" />
                {editingSchedule ? "Edit PM Schedule" : "Schedule Preventive Maintenance"}
              </h3>
              <button onClick={() => { setIsScheduleOpen(false); setEditingSchedule(null); }} className="text-foreground-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 flex-1">
              {/* Store Selection (Typable/Searchable Custom Dropdown) */}
              <div className="space-y-1.5 relative">
                <label className="text-xs font-semibold text-foreground-muted">Search & Select Store (dim_store)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={storeSearch}
                    placeholder="Type store name or code..."
                    onChange={(e) => {
                      setStoreSearch(e.target.value);
                      setShowStoreDropdown(true);
                    }}
                    onFocus={() => setShowStoreDropdown(true)}
                    className="w-full bg-background border border-border rounded-lg p-2.5 pl-9 text-sm outline-none focus:border-primary transition-all text-foreground"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                  {selectedStore && (
                    <button 
                      onClick={() => { setSelectedStore(null); setStoreSearch(""); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-surface-overlay text-foreground-muted"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                
                {/* Store selector dropdown */}
                {showStoreDropdown && (
                  <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-card border border-border rounded-lg shadow-xl divide-y divide-border">
                    {filteredStores.length === 0 ? (
                      <div className="p-3 text-xs text-foreground-muted italic text-center">No stores found</div>
                    ) : (
                      filteredStores.map(store => (
                        <button
                          key={store.org_cd}
                          type="button"
                          onClick={() => {
                            setSelectedStore(store);
                            setStoreSearch(`${store.org_name} (${store.org_cd})`);
                            setShowStoreDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-primary/10 text-xs text-foreground flex items-center justify-between"
                        >
                          <span>{store.org_name}</span>
                          <span className="font-mono text-[10px] text-foreground-muted">{store.org_cd}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* PIC Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground-muted">Assign PIC (IT Division Users)</label>
                <select
                  value={selectedPic?.id || ""}
                  onChange={(e) => {
                    const u = users.find(usr => usr.id === e.target.value);
                    if (u) setSelectedPic(u);
                  }}
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all text-foreground"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.username} ({u.role_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground-muted">Scheduled Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all text-foreground"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground-muted">General Planning Notes</label>
                <textarea
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="E.g. Routine monthly checkup, special CCTV focus..."
                  rows={3}
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all text-foreground resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <button 
                onClick={() => { setIsScheduleOpen(false); setEditingSchedule(null); }}
                className="px-4 py-2 border border-border hover:bg-surface-raised rounded-lg text-sm text-foreground transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5"
              >
                {savingSchedule ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {editingSchedule ? "Updating..." : "Scheduling..."}
                  </>
                ) : (
                  editingSchedule ? "Update Schedule" : "Create Schedule"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Execute PM Checklist Modal */}
      {isChecklistOpen && activeSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 overflow-hidden">
            
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
              <div>
                <h3 className="font-extrabold text-lg text-foreground flex items-center gap-2">
                  <ClipboardList className="w-5.5 h-5.5 text-success" />
                  Preventive Maintenance Checklist Form
                </h3>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Store: <strong className="text-foreground">{activeSchedule.store_name} ({activeSchedule.store_code})</strong> | PIC: <strong className="text-foreground">{activeSchedule.pic_name}</strong>
                </p>
              </div>
              <button onClick={() => setIsChecklistOpen(false)} className="text-foreground-muted hover:text-foreground p-1 rounded-full hover:bg-surface-raised">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Checklist body */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-5">
              <div className="p-4 bg-info-dim text-info border border-info/20 rounded-lg flex items-start gap-2.5 text-xs">
                <AlertOctagon className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <div>
                  <strong>Checklist Execution Instruction:</strong> Verify all hardware and cabling systems listed below. Mark each component status. Items marked as <strong>Needs Repair</strong> or <strong>Needs Replacement</strong> must contain descriptive issue notes, which will be automatically logged to the repair action backlog.
                </div>
              </div>

              {/* Categorized Check Items */}
              <div className="space-y-6">
                {["PC/POS", "Printer", "CCTV", "Network", "Power", "Scale"].map(cat => {
                  const items = checklist.map((item, idx) => ({ item, idx })).filter(x => x.item.device_category === cat);
                  if (items.length === 0) return null;

                  return (
                    <div key={cat} className="space-y-2 border border-border rounded-lg p-4 bg-surface-raised">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-3 pl-1 border-l-2 border-primary">
                        {cat === "PC/POS" ? "PC & Cashier POS System" : cat}
                      </h4>

                      <div className="space-y-4 divide-y divide-border/50">
                        {items.map(({ item, idx }) => {
                          const isParent = DEFAULT_DEVICES.some(d => d.name === item.device_name);
                          
                          return (
                            <div key={idx} className="pt-3 first:pt-0 flex flex-col md:flex-row md:items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {isParent ? (
                                    <p className="text-sm font-bold text-foreground/80 tracking-wide">{item.device_name}</p>
                                  ) : (
                                    <p className="text-sm font-semibold text-foreground pl-4 border-l-2 border-primary/20">{item.device_name}</p>
                                  )}
                                  
                                  {isParent && (
                                    addingInstanceForIdx !== idx ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAddingInstanceForIdx(idx);
                                          setCustomInstanceName("");
                                        }}
                                        title="Add custom instance"
                                        className="p-1 text-primary hover:bg-primary/10 rounded transition-all text-xs flex items-center gap-0.5 font-semibold shrink-0"
                                      >
                                        <Plus className="w-3 h-3" /> Add
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-1 shrink-0 animate-fade-in">
                                        <input
                                          type="text"
                                          placeholder="e.g. POS 1, CCTV 2..."
                                          value={customInstanceName}
                                          onChange={(e) => setCustomInstanceName(e.target.value)}
                                          className="bg-background border border-primary/45 rounded px-2 py-0.5 text-xs text-foreground outline-none w-24 font-medium"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveInstance(idx);
                                            if (e.key === "Escape") { setAddingInstanceForIdx(null); setCustomInstanceName(""); }
                                          }}
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleSaveInstance(idx)}
                                          className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded hover:bg-primary/95 transition-all"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => { setAddingInstanceForIdx(null); setCustomInstanceName(""); }}
                                          className="px-1.5 py-0.5 border border-border rounded text-[10px] hover:bg-surface-raised text-foreground transition-all"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )
                                  )}
                                  
                                  {!isParent && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveChecklistItem(idx)}
                                      title="Remove device check"
                                      className="p-1 text-danger hover:bg-danger/10 rounded transition-all shrink-0"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                {/* CCTV Dropdown - Searchable */}
                                {!isParent && cat === "CCTV" && item.device_name.startsWith("CCTV Feed Check") && (
                                  <div className="mt-2 relative max-w-xs">
                                  <label className="text-[10px] text-foreground-muted font-medium mb-1 block">Link specific CCTV camera:</label>
                                  <button
                                    type="button"
                                    onClick={() => setShowCctvDropdown(showCctvDropdown === idx ? null : idx)}
                                    className="w-full flex items-center justify-between bg-background border border-border rounded px-2.5 py-1.5 text-left text-xs text-foreground outline-none"
                                  >
                                    <span className="truncate">
                                      {item.cctv_device_id 
                                        ? cctvDevices.find(c => c.id === item.cctv_device_id)?.name || "Linked Camera"
                                        : "Select active CCTV device..."
                                      }
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5 text-foreground-muted" />
                                  </button>

                                  {showCctvDropdown === idx && (
                                    <div className="absolute z-[100] left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-card border border-border rounded shadow-xl p-2 flex flex-col gap-1.5">
                                      <input
                                        type="text"
                                        placeholder="Type device name..."
                                        value={cctvSearch}
                                        onChange={(e) => setCctvSearch(e.target.value)}
                                        className="w-full bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground outline-none"
                                      />
                                      <div className="flex flex-col overflow-y-auto divide-y divide-border/30">
                                        {cctvSearch.trim() && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setChecklist(prev => prev.map((item, i) => i === idx ? { 
                                                ...item, 
                                                device_name: `CCTV - ${cctvSearch.trim()}`,
                                                cctv_device_id: 'custom' 
                                              } : item));
                                              setCctvSearch("");
                                              setShowCctvDropdown(null);
                                              toast.success(`Linked custom CCTV camera: ${cctvSearch.trim()}`);
                                            }}
                                            className="w-full text-left px-2 py-1.5 text-[11px] text-primary hover:bg-primary/10 font-bold border-b border-border/30"
                                          >
                                            Use custom: "{cctvSearch.trim()}"
                                          </button>
                                        )}
                                        {getFilteredCctv(cctvSearch).map(dev => (
                                          <button
                                            key={dev.id}
                                            type="button"
                                            onClick={() => {
                                              handleLinkCCTV(idx, dev.id);
                                              setCctvSearch("");
                                            }}
                                            className="w-full text-left px-2 py-1.5 hover:bg-primary/15 text-[11px] text-foreground flex items-center justify-between"
                                          >
                                            <span>{dev.name}</span>
                                            <span className="font-mono text-[9px] text-foreground-muted">{dev.ip_address}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                             {/* Status Buttons Selector */}
                             {!isParent && (
                               <div className="flex flex-col gap-2 shrink-0 animate-fade-in">
                                 <div className="flex items-center gap-1">
                                   {(["Good", "Needs Repair", "Needs Replacement", "Not Available"] as const).map(status => {
                                     const isActive = item.status === status;
                                     let btnStyle = "bg-background border-border text-foreground-muted hover:bg-surface-overlay";
                                     
                                     if (isActive) {
                                       if (status === "Good") btnStyle = "bg-success text-success-foreground border-success shadow-sm";
                                       else if (status === "Needs Repair") btnStyle = "bg-warning text-warning-foreground border-warning shadow-sm";
                                       else if (status === "Needs Replacement") btnStyle = "bg-danger text-danger-foreground border-danger shadow-sm";
                                       else btnStyle = "bg-muted text-foreground-muted border-border";
                                     }

                                     return (
                                       <button
                                         key={status}
                                         type="button"
                                         onClick={() => handleChecklistStatusChange(idx, status)}
                                         className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all ${btnStyle}`}
                                       >
                                         {status === "Good" ? "Good" : status === "Needs Repair" ? "Repair" : status === "Needs Replacement" ? "Swap" : "N/A"}
                                       </button>
                                     );
                                   })}
                                 </div>

                                 {/* Problem input fields (only show if status is broken) */}
                                 {(item.status === "Needs Repair" || item.status === "Needs Replacement") && (
                                   <input
                                     type="text"
                                     placeholder="Describe the issue... (required)"
                                     value={item.issues_found}
                                     onChange={(e) => handleChecklistNotesChange(idx, e.target.value)}
                                     className="w-full bg-background border border-danger/35 rounded px-2.5 py-1 text-xs text-foreground outline-none focus:border-danger transition-all animate-shake"
                                   />
                                 )}
                               </div>
                             )}
                            </div>
                        );
                      })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Custom Device Form */}
              <div className="border border-border border-dashed rounded-lg p-4 bg-surface/50">
                {!showAddCustomForm ? (
                  <button
                    type="button"
                    onClick={() => setShowAddCustomForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-primary/30 rounded-lg text-primary text-xs font-semibold hover:bg-primary/5 transition-all animate-fade-in"
                  >
                    <Plus className="w-4 h-4" />
                    Add Custom/Manual Device to Checklist
                  </button>
                ) : (
                  <div className="space-y-3 animate-fade-in">
                    <h5 className="text-xs font-bold text-foreground">Add Custom Device</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-foreground-muted uppercase font-bold">Category</label>
                        <select
                          value={customDeviceCategory}
                          onChange={(e) => setCustomDeviceCategory(e.target.value)}
                          className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary select-none"
                        >
                          {["PC/POS", "Printer", "CCTV", "Network", "Power", "Scale"].map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-foreground-muted uppercase font-bold">Device Name</label>
                        <input
                          type="text"
                          value={customDeviceName}
                          placeholder="e.g. CCTV Display Monitor, UPS Server 2..."
                          onChange={(e) => setCustomDeviceName(e.target.value)}
                          className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary text-foreground"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddCustomForm(false)}
                        className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-surface-raised text-foreground transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomDevice}
                        className="px-3 py-1.5 text-[11px] bg-primary text-primary-foreground font-bold rounded hover:bg-primary/95 transition-all"
                      >
                        Add to List
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Overall notes */}
              <div className="space-y-1.5 border-t border-border pt-4">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider">PM Summary / General Recommendations</label>
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Provide any feedback for store operations, cleaning, environment, or overall health..."
                  rows={3}
                  className="w-full bg-background border border-border rounded-lg p-2.5 text-sm outline-none focus:border-primary transition-all text-foreground resize-none"
                />
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4 shrink-0">
              <button 
                onClick={() => setIsChecklistOpen(false)}
                className="px-4 py-2 border border-border hover:bg-surface-raised rounded-lg text-sm text-foreground transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmitChecklist}
                disabled={submittingChecklist}
                className="px-4 py-2 bg-success text-success-foreground hover:bg-success/95 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              >
                {submittingChecklist ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting Checklist...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Submit PM Results
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Choice Modal for Calendar View Schedule Actions */}
      {activeActionSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-raised border border-border w-full max-w-md rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                <Wrench className="w-5 h-5 text-primary" />
                Schedule Actions
              </h3>
              <button onClick={() => setActiveActionSchedule(null)} className="text-foreground-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details */}
            <div className="p-4 bg-surface border border-border rounded-xl text-xs space-y-2 text-foreground-muted">
              <div>Store: <strong className="text-foreground">{activeActionSchedule.store_name} ({activeActionSchedule.store_code})</strong></div>
              <div>Date: <strong className="text-foreground">{formatLocalDate(activeActionSchedule.scheduled_date)}</strong></div>
              <div>PIC: <strong className="text-foreground">{activeActionSchedule.pic_name}</strong></div>
              <div>Status: <StatusBadge status={activeActionSchedule.status.toLowerCase()} /></div>
              {activeActionSchedule.notes && (
                <div className="pt-2 border-t border-border/50">
                  Notes: <span className="italic text-foreground">"{activeActionSchedule.notes}"</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 mt-2">
              {activeActionSchedule.status === "Scheduled" && (
                <button
                  onClick={() => {
                    const sched = activeActionSchedule;
                    setActiveActionSchedule(null);
                    handleOpenChecklistModal(sched);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-success text-success-foreground rounded-lg text-sm font-bold hover:bg-success/90 transition-all shadow-sm"
                >
                  <CheckSquare className="w-4 h-4" />
                  Execute Checklist
                </button>
              )}

              {/* Edit Option: Admin or Creator */}
              {(user?.is_admin || activeActionSchedule.created_by === user?.id) && (
                <button
                  onClick={() => {
                    const sched = activeActionSchedule;
                    setActiveActionSchedule(null);
                    handleOpenEditModal(sched);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/95 transition-all shadow-sm"
                >
                  <Edit className="w-4 h-4" />
                  Edit Schedule
                </button>
              )}

              {/* Delete Option: Admin Only */}
              {user?.is_admin && (
                <button
                  onClick={() => {
                    const sched = activeActionSchedule;
                    setActiveActionSchedule(null);
                    handleDeleteSchedule(sched);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-danger text-danger-foreground rounded-lg text-sm font-bold hover:bg-danger/90 transition-all shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Schedule & Related Logs
                </button>
              )}

              <button
                onClick={() => setActiveActionSchedule(null)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-foreground hover:bg-surface-raised rounded-lg text-sm font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
