import { cn } from "@/lib/utils";
import { DeviceStatus, DeployStatus, AgentJobStatus } from "@/data/mockData";

// ── Status Badge ─────────────────────────────────────────
type AnyStatus = DeviceStatus | DeployStatus | AgentJobStatus | string;

const statusConfig: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  online:     { label: "Online",     dot: "bg-success",  bg: "bg-success-dim",  text: "text-success" },
  offline:    { label: "Offline",    dot: "bg-muted-foreground", bg: "bg-muted", text: "text-foreground-muted" },
  deploying:  { label: "Deploying",  dot: "bg-primary",  bg: "bg-primary-dim",  text: "text-primary" },
  error:      { label: "Error",      dot: "bg-danger",   bg: "bg-danger-dim",   text: "text-danger" },
  idle:       { label: "Idle",       dot: "bg-foreground-subtle", bg: "bg-surface-raised", text: "text-foreground-muted" },
  // deploy
  pending:    { label: "Pending",    dot: "bg-foreground-subtle", bg: "bg-surface-raised", text: "text-foreground-muted" },
  running:    { label: "Running",    dot: "bg-primary",  bg: "bg-primary-dim",  text: "text-primary" },
  success:    { label: "Success",    dot: "bg-success",  bg: "bg-success-dim",  text: "text-success" },
  failed:     { label: "Failed",     dot: "bg-danger",   bg: "bg-danger-dim",   text: "text-danger" },
  scheduled:  { label: "Scheduled",  dot: "bg-info",     bg: "bg-info-dim",     text: "text-info" },
  cancelled:  { label: "Cancelled",  dot: "bg-muted-foreground", bg: "bg-muted", text: "text-foreground-muted" },
  // agent
  queued:     { label: "Queued",     dot: "bg-foreground-subtle", bg: "bg-surface-raised", text: "text-foreground-muted" },
  connecting: { label: "Connecting", dot: "bg-warning",  bg: "bg-warning-dim",  text: "text-warning" },
  installing: { label: "Installing", dot: "bg-primary",  bg: "bg-primary-dim",  text: "text-primary" },
  skipped:    { label: "Skipped",    dot: "bg-foreground-subtle", bg: "bg-muted", text: "text-foreground-muted" },
};

export function StatusBadge({ status, size = "sm" }: { status: AnyStatus; size?: "xs" | "sm" }) {
  const cfg = statusConfig[status] ?? { label: status, dot: "bg-muted-foreground", bg: "bg-muted", text: "text-foreground-muted" };
  const isPulsing = ["deploying", "running", "connecting", "installing"].includes(status);
  return (
    <span className={cn(
      "badge-pill",
      cfg.bg, cfg.text,
      size === "xs" ? "text-[10px] py-0.5 px-2" : ""
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot, isPulsing && "animate-pulse-dot")} />
      {cfg.label}
    </span>
  );
}

// ── Stat Card ────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  variant?: "default" | "primary" | "success" | "danger" | "warning";
  className?: string;
}

import React from "react";

export function StatCard({ label, value, sub, icon, variant = "default", className }: StatCardProps) {
  const variantStyles = {
    default: "border-border",
    primary: "border-primary/30",
    success: "border-success/30",
    danger:  "border-danger/30",
    warning: "border-warning/30",
  };
  const iconBg = {
    default: "bg-surface-overlay text-foreground-muted",
    primary: "bg-primary-dim text-primary",
    success: "bg-success-dim text-success",
    danger:  "bg-danger-dim text-danger",
    warning: "bg-warning-dim text-warning",
  };
  return (
    <div className={cn("card-enterprise p-5", variantStyles[variant], className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-foreground-muted font-medium uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-foreground-muted mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={cn("flex items-center justify-center w-10 h-10 rounded-lg shrink-0", iconBg[variant])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini Progress Bar ─────────────────────────────────────
export function ProgressBar({ value, max = 100, colorClass = "bg-gradient-primary", className }: {
  value: number; max?: number; colorClass?: string; className?: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className={cn("progress-bar h-1.5 w-full", className)}>
      <div className={cn("progress-fill h-full", colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Page Header ──────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-foreground-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

// ── Section Card ─────────────────────────────────────────
export function SectionCard({ title, subtitle, children, actions, className }: {
  title?: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("card-enterprise overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {subtitle && <p className="text-xs text-foreground-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Deployment Progress Summary ──────────────────────────
export function DeployProgressSummary({ total, success, failed, pending }: {
  total: number; success: number; failed: number; pending: number;
}) {
  const successPct = total ? (success / total) * 100 : 0;
  const failedPct  = total ? (failed  / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex text-xs text-foreground-muted justify-between">
        <span>{success}/{total} complete</span>
        <span>{failed > 0 ? `${failed} failed` : ""}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
        <div className="h-full bg-success transition-all duration-500" style={{ width: `${successPct}%` }} />
        <div className="h-full bg-danger transition-all duration-500" style={{ width: `${failedPct}%` }} />
      </div>
    </div>
  );
}
