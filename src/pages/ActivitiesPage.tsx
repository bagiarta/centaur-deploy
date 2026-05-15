import React, { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, Tooltip
} from "recharts";
import {
  ClipboardList, Search, Plus, Download, Filter,
  Calendar, Clock, AlertCircle, CheckCircle,
  Trash2, Edit3, User as UserIcon, MoreVertical, X,
  LayoutGrid, List, MessageSquare, Target, Activity,
  TrendingUp, Award, BarChart3, PieChart as PieChartIcon,
  Flame, BookOpen
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  PageHeader, SectionCard, StatCard, StatusBadge
} from "@/components/ui-enterprise";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { toast } from "sonner";

// ── Timezone helpers ──────────────────────────────────────────────────────────
// Convert any UTC ISO string from API → local "YYYY-MM-DDTHH:mm" for datetime-local input
const toLocalInput = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Convert "YYYY-MM-DDTHH:mm" from datetime-local input → UTC ISO string for backend
const localInputToUTC = (localStr?: string | null): string => {
  if (!localStr) return '';
  const d = new Date(localStr); // datetime-without-Z is treated as LOCAL by V8
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
};

interface UserTask {
  id: number;
  user_id: string;
  username: string;
  title: string;
  description: string;
  start_date?: string;
  target_date: string;
  actual_completion_date: string;
  duration: string;
  status: string;
  reason: string;
  solving_notes: string;
  created_at: string;
  updated_at: string;
  category: string;
}

export default function ActivitiesPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [userFilter, setUserFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<UserTask | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [manualDateInput, setManualDateInput] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    start_date: "",
    target_date: "",
    status: "Pending",
    duration: "",
    reason: "",
    solving_notes: "",
    actual_completion_date: "",
    category: "General"
  });

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        headers: {
          "x-user-id": user.id,
          "x-user-admin": user.is_admin ? "true" : "false"
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (err) {
      toast.error("Failed to fetch tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (task: UserTask | null = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        title: task.title,
        description: task.description || "",
        start_date: toLocalInput(task.start_date || task.created_at),
        target_date: toLocalInput(task.target_date),
        status: task.status,
        duration: task.duration || "",
        reason: task.reason || "",
        solving_notes: task.solving_notes || "",
        actual_completion_date: toLocalInput(task.actual_completion_date),
        category: task.category || "General"
      });
    } else {
      setEditingTask(null);
      setFormData({
        title: "",
        description: "",
        start_date: toLocalInput(new Date().toISOString()),
        target_date: "",
        status: "Pending",
        duration: "",
        reason: "",
        solving_notes: "",
        actual_completion_date: "",
        category: "General"
      });
    }
    setIsModalOpen(true);
  };

  const calculateDuration = (startDate: string, endDate: string = new Date().toISOString()) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();

    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHrs > 0) {
      return `${diffHrs} Jam ${diffMins} Menit`;
    }
    return `${diffMins} Menit`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Removed validation to allow past dates for training/late input

    const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
    const method = editingTask ? "PUT" : "POST";

    // Auto-complete Training category and calculate duration
    const finalFormData = { ...formData };
    if (finalFormData.category === "Training") {
      finalFormData.status = "Completed";
      if (!finalFormData.actual_completion_date) {
        finalFormData.actual_completion_date = new Date().toISOString();
      }
      finalFormData.duration = calculateDuration(finalFormData.start_date, finalFormData.actual_completion_date);
    }

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-name": user.username
        },
        body: JSON.stringify({
          ...finalFormData,
          // Always send dates as UTC ISO so the backend stores timezone-correctly
          start_date: localInputToUTC(finalFormData.start_date),
          target_date: localInputToUTC(finalFormData.target_date),
          actual_completion_date: localInputToUTC(finalFormData.actual_completion_date),
        })
      });

      if (res.ok) {
        toast.success(editingTask ? "Task updated" : "Task created");
        setIsModalOpen(false);
        fetchTasks();
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || "Operation failed");
      }
    } catch (err) {
      toast.error("Server connection error");
    }
  };

  const handleDelete = async (id: number) => {
    if (!user || !confirm("Are you sure you want to delete this task?")) return;

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        headers: {
          "x-user-id": user.id,
          "x-user-admin": user.is_admin ? "true" : "false"
        }
      });

      if (res.ok) {
        toast.success("Task deleted");
        fetchTasks();
      } else {
        toast.error("Failed to delete task");
      }
    } catch (err) {
      toast.error("Server connection error");
    }
  };

  const handleExport = async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        userFilter: userFilter,
        startDate: startDate,
        endDate: endDate
      });

      const res = await fetch(`/api/tasks/export?${params.toString()}`, {
        headers: {
          "x-user-id": user.id,
          "x-user-admin": user.is_admin ? "true" : "false"
        }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `activities_report_${format(new Date(), "yyyyMMdd")}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      toast.error("Export failed");
    }
  };

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || t.status === statusFilter;
    const matchesUser = userFilter === "All" || t.username === userFilter;

    // Use local midnight boundaries so date filter matches what the user typed
    const taskDate = new Date(t.created_at).getTime();
    const matchesStart = !startDate || taskDate >= new Date(startDate + "T00:00:00").getTime();
    const matchesEnd = !endDate || taskDate <= new Date(endDate + "T23:59:59").getTime();

    const matchesCategory = categoryFilter === "All" || t.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesUser && matchesStart && matchesEnd && matchesCategory;
  });

  const uniqueUsers = Array.from(new Set(tasks.map(t => t.username)));

  // Advanced Statistics & Competency Logic — all calculated from filteredTasks
  // so they always reflect the active search/filter/date range.
  const completedTasks = filteredTasks.filter(t => t.status === "Completed");
  const onTimeTasks = completedTasks.filter(t => {
    if (!t.target_date || !t.actual_completion_date) return true;
    return new Date(t.actual_completion_date) <= new Date(t.target_date);
  });

  const earlyTasks = completedTasks.filter(t => {
    if (!t.target_date || !t.actual_completion_date) return false;
    // Consider early if finished at least 1 hour before target
    return (new Date(t.target_date).getTime() - new Date(t.actual_completion_date).getTime()) > 3600000;
  });

  const onTimeRate = completedTasks.length > 0 ? Math.round((onTimeTasks.length / completedTasks.length) * 100) : 0;
  const earlyRate = completedTasks.length > 0 ? Math.round((earlyTasks.length / completedTasks.length) * 100) : 0;

  // Calculate average completion time in hours (from start_date, fallback created_at)
  const avgCompletionTime = completedTasks.reduce((acc, t) => {
    const start = new Date(t.start_date || t.created_at).getTime();
    const end = new Date(t.actual_completion_date).getTime();
    return acc + (end - start);
  }, 0) / (completedTasks.length || 1);

  const avgHours = Math.round(avgCompletionTime / (1000 * 60 * 60));

  const stats = {
    total: filteredTasks.length,
    completed: completedTasks.length,
    pending: filteredTasks.filter(t => t.status === "Pending" || t.status === "In Progress").length,
    overdue: filteredTasks.filter(t => t.status !== "Completed" && t.target_date && new Date(t.target_date) < new Date()).length,
    onTimeRate,
    earlyRate,
    avgHours,
    competencyScore: Math.round(
      (onTimeRate * 0.4) +
      (earlyRate * 0.2) +
      ((filteredTasks.length > 0 ? (completedTasks.length / filteredTasks.length) * 100 : 0) * 0.2) +
      ((filteredTasks.filter(t => t.category === 'Automation' || t.category === 'Improvement' || t.category === 'Training').length / (filteredTasks.length || 1)) * 20)
    )
  };

  const automationCount = filteredTasks.filter(t => t.category === 'Automation').length;
  const bugCount = filteredTasks.filter(t => t.category === 'Bug Fixing').length;
  const automationRatio = filteredTasks.length > 0 ? Math.round((automationCount / filteredTasks.length) * 100) : 0;

  const topAchievement = earlyTasks.length > 0
    ? `Completed ${earlyTasks.length} tasks ahead of schedule.`
    : bugCount > 0
      ? `Resolved ${bugCount} system bugs successfully.`
      : stats.completed > 0
        ? `Successfully finalized ${stats.completed} operational tasks.`
        : "Starting productivity cycle. Focused on high-impact results.";

  const nextActionFocus = stats.pending > stats.completed
    ? "Prioritize backlog items to maintain SLA compliance."
    : automationRatio < 20
      ? "Allocate more time to Automation for long-term efficiency."
      : "Maintain high performance. Explore new R&D opportunities.";

  // Category counts — from filteredTasks
  const categories = ["Bug Fixing", "Automation", "SLA Support", "Improvement", "Training", "General"];
  const categoryData = categories.map(cat => ({
    name: cat,
    value: filteredTasks.filter(t => t.category === cat).length,
    color: cat === "Bug Fixing" ? "#f43f5e" :
      cat === "Automation" ? "#8b5cf6" :
        cat === "SLA Support" ? "#3b82f6" :
          cat === "Improvement" ? "#10b981" :
            cat === "Training" ? "#e905b7ff" : "#94a3b8"
  })).filter(d => d.value > 0);

  // Trend Data (Last 7 days) — from filteredTasks
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return format(d, "yyyy-MM-dd");
  }).reverse();

  const trendData = last7Days.map(date => ({
    date: format(new Date(date), "dd MMM"),
    completed: filteredTasks.filter(t => t.status === "Completed" && t.actual_completion_date && format(new Date(t.actual_completion_date), "yyyy-MM-dd") === date).length,
    total: filteredTasks.filter(t => format(new Date(t.created_at), "yyyy-MM-dd") === date).length
  }));

  const burnoutLevel = stats.pending > 10 ? "High" : stats.pending > 5 ? "Moderate" : "Low";
  const productivityGrade = stats.competencyScore > 90 ? "S" : stats.competencyScore > 80 ? "A" : stats.competencyScore > 70 ? "B" : "C";

  const chartData = [
    { name: "Early Done", value: earlyTasks.length, color: "#10b981" },
    { name: "On-Time Done", value: onTimeTasks.length - earlyTasks.length, color: "#34d399" },
    { name: "Late Done", value: completedTasks.length - onTimeTasks.length, color: "#f43f5e" },
    { name: "In Progress", value: filteredTasks.filter(t => t.status === "In Progress").length, color: "#3b82f6" },
    { name: "Pending", value: filteredTasks.filter(t => t.status === "Pending").length, color: "#f59e0b" },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="User Task Management"
        subtitle="Manage your tasks and activities"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => handleOpenModal()}
              className="relative group overflow-hidden px-6 py-2.5 bg-gradient-to-br from-primary to-primary/80 text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/40 transition-all active:scale-95 flex items-center gap-2"
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute -inset-x-20 inset-y-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg] translate-x-[-150%] group-hover:translate-x-[200%] transition-transform duration-1000" />
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
              <span>Add New Activity</span>
            </button>
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Task" value={stats.total} icon={<ClipboardList />} variant="primary" />
        <StatCard label="Completed Task" value={stats.completed} icon={<CheckCircle />} variant="success" />
        <StatCard label="Pending Task" value={stats.pending} icon={<Activity />} variant="warning" />
        <StatCard label="Overdue Task" value={stats.overdue} icon={<AlertCircle />} variant="danger" />
      </div>

      {/* Presentation Statistics Section */}
      {/* HEADER: ELITE KPI & PRODUCTIVITY GRADE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <SectionCard className="border-l-4 border-l-primary shadow-sm bg-surface-raised/20">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-foreground-muted">Productivity Grade</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-primary">{productivityGrade}</span>
                <span className="text-xs font-bold text-foreground-muted uppercase">Rank Tier</span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${stats.competencyScore}%` }} />
              </div>
            </div>
          </SectionCard>

          <SectionCard className="border-l-4 border-l-warning shadow-sm bg-surface-raised/20">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-foreground-muted">Burnout Risk</span>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-2xl font-bold",
                  burnoutLevel === "High" ? "text-danger" :
                    burnoutLevel === "Moderate" ? "text-warning" : "text-success"
                )}>{burnoutLevel}</span>
                <Flame className={cn("w-5 h-5",
                  burnoutLevel === "High" ? "text-danger animate-pulse" : "text-foreground-muted"
                )} />
              </div>
              <p className="text-[10px] text-foreground-muted mt-1 leading-tight">
                {burnoutLevel === "Low" ? "Optimal workload. Keep it up!" : "Consider prioritizing tasks to avoid stress."}
              </p>
            </div>
          </SectionCard>

          <SectionCard className="border-l-4 border-l-success shadow-sm bg-surface-raised/20">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold text-foreground-muted">Achievement Highlights</span>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex justify-between items-center bg-success/10 p-1.5 rounded-lg border border-success/20">
                  <span className="text-[10px] font-bold text-success uppercase">Early Wins</span>
                  <span className="text-xs font-bold text-success">{earlyTasks.length}</span>
                </div>
                <div className="flex justify-between items-center bg-primary/10 p-1.5 rounded-lg border border-primary/20">
                  <span className="text-[10px] font-bold text-primary uppercase">Automation</span>
                  <span className="text-xs font-bold text-primary">{filteredTasks.filter(t => t.category === 'Automation').length}</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Impact Focus" className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold">Strategic Focus</span>
                <span className="text-[10px] text-foreground-muted">SLA & Bug Resolution</span>
              </div>
            </div>
            <button
              onClick={() => handleExport()}
              className="w-full py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              Report
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Task Category Distribution" subtitle="Workload distribution by impact type" className="h-full flex flex-col">
          <div className="flex flex-col sm:flex-row gap-6 flex-1 items-center justify-center p-2">
            <div className="w-full sm:w-1/2 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--surface-overlay))', borderRadius: '12px', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2 space-y-3">
              {categoryData.map((entry, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs font-bold text-foreground uppercase tracking-tight">{entry.name}</span>
                  </div>
                  <span className="text-sm font-black text-foreground bg-surface-raised px-2 py-0.5 rounded-md border border-border/50">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Skills & Learning Track" subtitle="Innovation and R&D effort" className="h-full flex flex-col">
          <div className="flex flex-col flex-1 justify-between p-2">
            <div className="flex items-center gap-4 p-4 bg-surface-raised/30 rounded-2xl border border-border/50">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <BookOpen className="w-7 h-7" />
              </div>
              <div>
                <span className="text-xs font-bold text-foreground-muted uppercase">Learning Hours</span>
                <span className="text-2xl font-black text-primary block">
                  {Math.round(filteredTasks.filter(t => t.category === 'Improvement' || t.category === 'Training').reduce((acc, t) => {
                    if (t.category === 'Training') {
                      if (t.start_date && t.actual_completion_date) {
                        return acc + (new Date(t.actual_completion_date).getTime() - new Date(t.start_date).getTime()) / (1000 * 60 * 60);
                      }
                      return acc;
                    }
                    return acc + 2; // Default 2 hours for Improvement
                  }, 0))}h
                </span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between items-center text-xs uppercase font-bold text-foreground">
                <span>R&D Progress</span>
                <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-md">Level 4</span>
              </div>
              <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-info" style={{ width: '65%' }} />
              </div>
              <p className="text-xs text-foreground-muted italic leading-relaxed mt-2">"Knowledge is the ultimate leverage. Keep investing in your technical growth."</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Reflection & Impact" subtitle="Business value and next actions" className="h-full flex flex-col">
          <div className="flex flex-col gap-4 flex-1 p-2">
            <div className="p-4 bg-success/5 rounded-xl border border-success/20 flex flex-col flex-1 justify-center shadow-sm">
              <span className="text-xs font-black text-success uppercase tracking-wider mb-1 flex items-center gap-2">
                <Award className="w-4 h-4" /> Weekly Impact
              </span>
              <p className="text-sm font-medium text-foreground mt-1 leading-snug">{topAchievement}</p>
            </div>
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 flex flex-col flex-1 justify-center shadow-sm">
              <span className="text-xs font-black text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                <Target className="w-4 h-4" /> Strategic Next Step
              </span>
              <p className="text-sm font-medium text-foreground mt-1 leading-snug">{nextActionFocus}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Task Registry"
        subtitle="Manage daily execution and SLA compliance"
        actions={
          <div className="flex flex-col gap-4">
            {/* Top row: Categories and View Toggle */}
            <div className="flex flex-col sm:flex-row justify-between gap-3">
              <div className="flex bg-surface-raised rounded-lg p-1 border border-border overflow-x-auto no-scrollbar w-full sm:w-auto">
                {["All", "Bug Fixing", "Automation", "SLA Support", "Improvement"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold rounded-md transition-all whitespace-nowrap",
                      categoryFilter === cat ? "bg-primary text-white shadow-sm" : "text-foreground-muted hover:text-foreground"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="hidden sm:flex bg-surface-raised rounded-lg p-1 border border-border self-end">
                <button
                  onClick={() => setViewMode("table")}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === "table" ? "bg-primary text-white shadow-sm" : "text-foreground-muted hover:text-foreground")}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === "grid" ? "bg-primary text-white shadow-sm" : "text-foreground-muted hover:text-foreground")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bottom row: Search and Filters */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="relative w-full sm:w-auto sm:flex-1 md:flex-none">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
                <input
                  type="text"
                  placeholder="Search task..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-surface border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs focus:border-primary focus:outline-none w-full sm:w-48 lg:w-56"
                />
              </div>

              <div className="flex flex-1 sm:flex-none items-center justify-between gap-2 bg-surface-raised/50 p-1 rounded-lg border border-border overflow-x-auto w-full sm:w-auto">
                <div className="flex items-center gap-1.5 px-2">
                  <Calendar className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-[11px] outline-none text-foreground w-20 sm:w-24 shrink-0"
                  />
                  <span className="text-foreground-muted text-[10px] shrink-0">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-[11px] outline-none text-foreground w-20 sm:w-24 shrink-0"
                  />
                </div>
                {(startDate || endDate) && (
                  <button onClick={() => { setStartDate(""); setEndDate(""); }} className="p-1 hover:bg-surface rounded text-foreground-muted hover:text-danger shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary flex-1 sm:flex-none min-w-[100px]"
              >
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>

              {user?.is_admin && (
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary flex-1 sm:flex-none min-w-[100px]"
                >
                  <option value="All">All Users</option>
                  {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              )}
            </div>
          </div>
        }
      >
        <div className="min-h-[400px]">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="h-80 flex flex-col items-center justify-center text-foreground-muted gap-4">
              <div className="w-20 h-20 rounded-full bg-surface-raised flex items-center justify-center border border-border shadow-inner">
                <ClipboardList className="w-10 h-10 opacity-20" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">No activities found</p>
                <p className="text-xs text-foreground-muted max-w-[200px] mx-auto mt-1">Start tracking your professional tasks by creating your first activity.</p>
              </div>
              <button
                onClick={() => handleOpenModal()}
                className="mt-2 px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all flex items-center gap-2 group"
              >
                <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" />
                Create First Task
              </button>
            </div>
          ) : (
            <>
              {/* TABLE VIEW (Hidden on Mobile) */}
              <div className={cn("overflow-x-auto", viewMode === "grid" ? "hidden" : "hidden sm:block")}>
                <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-raised/30 border-b border-border">
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Task Name</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Task Detail</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Started</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider text-center">Age</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Target</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Reason</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider text-center">Duration</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-foreground-muted uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-surface/40 transition-colors group">
                      <td className="px-5 py-4">
                        <StatusBadge status={task.status.toLowerCase().replace(" ", "")} size="xs" />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{task.title}</span>
                          <div className="flex gap-1">
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                              task.category === 'Bug Fixing' ? "bg-danger/10 text-danger" :
                                task.category === 'Automation' ? "bg-primary/10 text-primary" :
                                  task.category === 'SLA Support' ? "bg-info/10 text-info" :
                                    task.category === 'Improvement' ? "bg-success/10 text-success" : "bg-surface-raised text-foreground-muted"
                            )}>
                              {task.category || 'General'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 max-w-xs">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-foreground-muted line-clamp-1" title={task.description}>{task.description || "-"}</span>
                          {task.solving_notes && (
                            <div className="mt-1 flex gap-1 items-center text-[10px] text-success font-medium">
                              <CheckCircle className="w-3 h-3" />
                              <span className="line-clamp-1">{task.solving_notes}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-foreground">
                          <Plus className="w-3 h-3 text-primary/50" />
                          <span>{format(new Date(task.start_date || task.created_at), "dd/MM/yy HH:mm")}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {(task.status !== 'Completed' && task.category !== 'Training') ? (
                          <span className="text-xs font-mono text-primary font-bold">{calculateDuration(task.start_date || task.created_at)}</span>
                        ) : (
                          <span className="text-xs text-foreground-muted">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Target className="w-3 h-3 text-warning/50" />
                            <span className={cn(
                              task.target_date && new Date(task.target_date) < new Date() && task.status !== 'Completed' ? "text-danger font-bold" : "text-foreground"
                            )}>
                              {task.target_date ? format(new Date(task.target_date), "dd/MM/yy HH:mm") : "-"}
                            </span>
                          </div>
                          {task.actual_completion_date && (
                            <div className={cn(
                              "flex items-center gap-1.5 text-[10px] font-bold",
                              (task.target_date && new Date(task.target_date).getTime() - new Date(task.actual_completion_date).getTime() > 3600000)
                                ? "text-success"
                                : "text-primary"
                            )}>
                              <Award className="w-3 h-3" />
                              <span>Done: {format(new Date(task.actual_completion_date), "dd/MM/yy HH:mm")}</span>
                              {(task.target_date && new Date(task.target_date).getTime() - new Date(task.actual_completion_date).getTime() > 3600000) && (
                                <span className="bg-success/20 text-success px-1.5 py-0.5 rounded text-[9px] uppercase tracking-tighter">Early</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[120px] max-w-[200px]">
                        <span className="text-xs text-foreground-muted italic line-clamp-2 leading-relaxed">
                          {task.reason || "-"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {task.status === 'Completed' ? (
                          <span className="text-xs font-mono text-success font-bold">{task.duration || "-"}</span>
                        ) : (
                          <span className="text-xs text-foreground-muted">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {user?.id === task.user_id && (
                            <button
                              onClick={() => handleOpenModal(task)}
                              className="p-1.5 hover:bg-primary/10 text-foreground-muted hover:text-primary rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {(user?.id === task.user_id || user?.is_admin) && (
                            <button
                              onClick={() => handleDelete(task.id)}
                              className="p-1.5 hover:bg-danger/10 text-foreground-muted hover:text-danger rounded-lg transition-colors"
                              title="Delete"
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

              {/* GRID VIEW (Shown on Mobile always, or on Desktop if grid mode is selected) */}
              <div className={cn(viewMode === "table" ? "block sm:hidden" : "block")}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-5">
                  {filteredTasks.map((task) => (
                <div key={task.id} className="bg-surface/30 border border-border rounded-xl p-5 hover:border-primary/30 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <StatusBadge status={task.status.toLowerCase().replace(" ", "")} />
                    <div className="flex gap-1">
                      {user?.id === task.user_id && (
                        <button onClick={() => handleOpenModal(task)} className="p-1 text-foreground-muted hover:text-primary">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {(user?.id === task.user_id || user?.is_admin) && (
                        <button onClick={() => handleDelete(task.id)} className="p-1 text-foreground-muted hover:text-danger">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="text-sm font-bold text-foreground mb-2">{task.title}</h3>
                  <p className="text-xs text-foreground-muted mb-4 line-clamp-2">{task.description || "No description provided."}</p>

                  <div className="space-y-2 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-foreground-muted">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Started
                      </div>
                      <span>{format(new Date(task.start_date || task.created_at), "dd MMM yyyy")}</span>
                    </div>

                    {(task.reason || task.solving_notes) && (
                      <div className="p-3 bg-surface-raised/50 rounded-xl border border-border/50 space-y-2">
                        {task.reason && (
                          <div className="space-y-0.5">
                            <span className="text-[9px] font-bold text-warning uppercase">Reason</span>
                            <p className="text-[10px] text-foreground-muted italic line-clamp-2 leading-relaxed">{task.reason}</p>
                          </div>
                        )}
                        {task.solving_notes && (
                          <div className="space-y-0.5 border-t border-border/30 pt-1.5">
                            <span className="text-[9px] font-bold text-success uppercase">Solution Note</span>
                            <p className="text-[10px] text-foreground-muted italic line-clamp-2 leading-relaxed">{task.solving_notes}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-foreground-muted">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Target
                      </div>
                      <span className={cn(
                        task.target_date && new Date(task.target_date) < new Date() && task.status !== 'Completed' ? "text-danger" : ""
                      )}>
                        {task.target_date ? format(new Date(task.target_date), "dd MMM yyyy") : "-"}
                      </span>
                    </div>
                    {task.actual_completion_date && (
                      <div className="flex items-center justify-between text-[10px] uppercase font-bold text-success">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Completed
                        </div>
                        <span>{format(new Date(task.actual_completion_date), "dd MMM yyyy")}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-foreground-muted">
                      <div className="flex items-center gap-1">
                        <UserIcon className="w-3 h-3" /> Owner
                      </div>
                      <span className="text-foreground">{task.username}</span>
                    </div>
                    {task.status !== 'Completed' ? (
                      <div className="flex items-center justify-between text-[10px] uppercase font-bold text-primary">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Current Age
                        </div>
                        <span className="text-primary">{calculateDuration(task.start_date || task.created_at)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[10px] uppercase font-bold text-success">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Total Duration
                        </div>
                        <span className="text-success">{task.duration}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Modal / Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-surface/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  {editingTask ? "Edit Task" : "Add Task"}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground-muted" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Task Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Contoh: server maintenance"
                    className="w-full bg-surface border border-border rounded-xl py-2.5 px-4 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Work Impact Category</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {["Bug Fixing", "Automation", "SLA Support", "Improvement", "Training", "General"].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          const newStatus = cat === "Training" ? "Completed" : formData.status;
                          setFormData({ ...formData, category: cat, status: newStatus });
                        }}
                        className={cn(
                          "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all",
                          formData.category === cat
                            ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                            : "bg-surface-raised border-border text-foreground-muted hover:border-primary/50"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Task description..."
                    rows={3}
                    className="w-full bg-surface border border-border rounded-xl py-2.5 px-4 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
                  />
                </div>

                <div className="md:col-span-2 flex items-center justify-end mb-[-10px] z-10">
                  <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors bg-primary/10 py-1.5 px-3 rounded-lg">
                    <input
                      type="checkbox"
                      checked={manualDateInput}
                      onChange={e => setManualDateInput(e.target.checked)}
                      className="w-3 h-3 rounded text-primary focus:ring-primary focus:ring-1 outline-none"
                    />
                    Type Date Manually
                  </label>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Start Date / Time</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                    <input
                      type={manualDateInput ? "text" : "datetime-local"}
                      placeholder={manualDateInput ? "YYYY-MM-DD HH:mm" : ""}
                      value={formData.start_date ? formData.start_date.replace('T', manualDateInput ? ' ' : 'T') : ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(' ', 'T');
                        setFormData({ ...formData, start_date: val });
                      }}
                      className="w-full bg-surface border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Target / Deadline</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                    <input
                      type={manualDateInput ? "text" : "datetime-local"}
                      placeholder={manualDateInput ? "YYYY-MM-DD HH:mm" : ""}
                      value={formData.target_date ? formData.target_date.replace('T', manualDateInput ? ' ' : 'T') : ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(' ', 'T');
                        setFormData({ ...formData, target_date: val });
                      }}
                      className="w-full bg-surface border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    />
                  </div>
                </div>

                {formData.category === "Training" && (
                  <div>
                    <label className="text-xs font-bold text-success uppercase tracking-wider mb-1.5 block">End Date / Time (Actual)</label>
                    <div className="relative">
                      <CheckCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
                      <input
                        type={manualDateInput ? "text" : "datetime-local"}
                        placeholder={manualDateInput ? "YYYY-MM-DD HH:mm" : ""}
                        value={formData.actual_completion_date ? formData.actual_completion_date.substring(0, 16).replace('T', manualDateInput ? ' ' : 'T') : ""}
                        onChange={(e) => {
                          // Store as local datetime-local string; localInputToUTC() will convert on submit
                          const val = e.target.value.replace(' ', 'T');
                          setFormData({ ...formData, actual_completion_date: val });
                        }}
                        className="w-full bg-surface border border-success/30 rounded-xl py-2.5 pl-10 pr-4 text-sm text-foreground focus:border-success focus:ring-1 focus:ring-success outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                {editingTask && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => {
                          const newStatus = e.target.value;
                          let newDuration = formData.duration;
                          if (newStatus === "Completed" && editingTask) {
                            // Use start_date (local input format) → convert to UTC for duration calc
                            const startUtc = localInputToUTC(formData.start_date) || editingTask.start_date || editingTask.created_at;
                            newDuration = calculateDuration(startUtc);
                          }
                          // Set actual_completion_date as local input format (toLocalInput of now)
                          const nowLocalInput = toLocalInput(new Date().toISOString());
                          const actualComp = newStatus === "Completed" ? (formData.actual_completion_date || nowLocalInput) : "";
                          setFormData({ ...formData, status: newStatus, duration: newDuration, actual_completion_date: actualComp });
                        }}
                        className="w-full bg-surface border border-border rounded-xl py-2.5 px-4 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Duration</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                        <input
                          type="text"
                          value={formData.duration}
                          onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                          placeholder="Automatically calculated when completed"
                          className="w-full bg-surface-raised border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-foreground-muted focus:outline-none cursor-not-allowed"
                          readOnly
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Reason</label>
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-foreground-muted" />
                        <textarea
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                          placeholder="Reason for the work / delay..."
                          rows={1}
                          className="w-full bg-surface border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
                        />
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-1.5 block">Solution Notes</label>
                      <div className="relative">
                        <CheckCircle className="absolute left-3 top-3 w-4 h-4 text-foreground-muted" />
                        <textarea
                          value={formData.solving_notes}
                          onChange={(e) => setFormData({ ...formData, solving_notes: e.target.value })}
                          disabled={formData.status !== "Completed"}
                          className={cn(
                            "w-full bg-surface border border-border rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none transition-all resize-none",
                            formData.status === "Completed" ? "text-foreground focus:border-primary focus:ring-1 focus:ring-primary" : "text-foreground-muted bg-surface-raised cursor-not-allowed"
                          )}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 rounded-xl border border-border text-sm font-bold text-foreground-muted hover:bg-surface transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  {editingTask ? "Update Task" : "Save Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
