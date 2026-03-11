import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Monitor, Package, Rocket, Download,
  Terminal, History, Settings, ChevronLeft, ChevronRight,
  Server, Shield, Bell, User, Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/",          icon: LayoutDashboard, label: "Overview",         group: "main" },
  { to: "/devices",   icon: Monitor,         label: "Devices",          group: "main" },
  { to: "/packages",  icon: Package,         label: "Package Repo",     group: "main" },
  { to: "/deploy",    icon: Rocket,          label: "Deployments",      group: "main" },
  { to: "/agent-installer", icon: Download,  label: "Agent Installer",  group: "tools" },
  { to: "/remote",    icon: Terminal,        label: "Remote Commands",  group: "tools" },
  { to: "/logs",      icon: History,         label: "Logs & History",   group: "tools" },
  { to: "/settings",  icon: Settings,        label: "Settings",         group: "system" },
];

const groups: { key: string; label: string }[] = [
  { key: "main",   label: "Management" },
  { key: "tools",  label: "Tools" },
  { key: "system", label: "System" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out shrink-0",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-3 px-4 py-4 border-b border-sidebar-border",
          collapsed && "justify-center px-2"
        )}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-primary shrink-0 shadow-glow">
            <Server className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground leading-tight truncate">CentralDeploy</p>
              <p className="text-[10px] text-primary leading-tight">ULTIMATE</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {groups.map(group => {
            const items = navItems.filter(i => i.group === group.key);
            return (
              <div key={group.key}>
                {!collapsed && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map(item => {
                    const active = item.to === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.to);
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150",
                            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active && "nav-item-active text-primary",
                            collapsed && "justify-center px-2"
                          )}
                        >
                          <item.icon className="w-4 h-4 shrink-0" />
                          {!collapsed && <span>{item.label}</span>}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all",
              collapsed && "justify-center"
            )}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-surface/50 shrink-0 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
              <span className="text-xs text-foreground-muted font-mono">v2.4.1</span>
            </div>
            <span className="text-foreground-subtle text-xs">|</span>
            <span className="text-xs text-foreground-muted">12 devices online</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-md hover:bg-surface-raised text-foreground-muted hover:text-foreground transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-danger rounded-full" />
            </button>
            <button className="p-2 rounded-md hover:bg-surface-raised text-foreground-muted hover:text-foreground transition-colors">
              <Activity className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary">
                <User className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">admin</p>
                <p className="text-[10px] text-foreground-muted leading-none">Administrator</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
