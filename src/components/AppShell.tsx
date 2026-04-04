import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Monitor, Package, Rocket, Download,
  Terminal, History, Settings, ChevronLeft, ChevronRight,
  Server, Shield, Bell, User, Activity, Users, Database,
  UserCog, ShieldCheck, LogOut, Bot, BookMarked, Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { SmartAssistantWidget } from "./SmartAssistantWidget";
import { ReportTroubleModal } from "./ReportTroubleModal";
import { Ticket, LifeBuoy } from "lucide-react";
import { toast } from "sonner";

export const navItems = [
  { id: "overview", to: "/", icon: LayoutDashboard, label: "Overview", group: "main" },
  { id: "tickets", to: "/tickets", icon: Ticket, label: "Helpdesk Tickets", group: "main" },
  { id: "reports", to: "/reports", icon: Activity, label: "Reports", group: "main" },
  { id: "devices", to: "/devices", icon: Monitor, label: "Devices", group: "main" },
  { id: "network", to: "/network", icon: Globe, label: "Network Map", group: "main" },
  { id: "packages", to: "/packages", icon: Package, label: "Package Repo", group: "main" },
  { id: "deploy", to: "/deploy", icon: Rocket, label: "Deployments", group: "main" },
  { id: "groups", to: "/groups", icon: Users, label: "Device Groups", group: "main" },
  { id: "workflows", to: "/workflows", icon: BookMarked, label: "Knowledge Base", group: "main" },
  { id: "agent", to: "/agent-installer", icon: Download, label: "Agent Installer", group: "tools" },
  { id: "remote", to: "/remote", icon: Terminal, label: "Remote Commands", group: "tools" },
  { id: "sql", to: "/remote-sql", icon: Database, label: "Remote SQL", group: "tools" },
  { id: "logs", to: "/logs", icon: History, label: "Logs & History", group: "tools" },
  { id: "users", to: "/users", icon: UserCog, label: "User Management", group: "system", adminOnly: true },
  { id: "roles", to: "/roles", icon: ShieldCheck, label: "Roles & Access", group: "system", adminOnly: true },
  { id: "settings", to: "/settings", icon: Settings, label: "Settings", group: "system" },
  { id: "manage_all_tickets", to: "#manage_tickets", icon: Ticket, label: "Manage All Tickets (Resolve)", group: "system", hidden: true },
  { id: "assistant", to: "#", icon: Bot, label: "AI Smart Assistant", group: "system", hidden: true },
];

const groups: { key: string; label: string }[] = [
  { key: "main", label: "Management" },
  { key: "tools", label: "Tools" },
  { key: "system", label: "System" },
];

type ThemeSettings = {
  sidebarBg: string;
  sidebarText: string;
  sidebarAccent: string;
  mainBg: string;
  contentText: string;
  cardBg: string;
  primaryBrand: string;
  appLogo: string;
  logoSize: number;
  appName: string;
};

const DEFAULT_THEME: ThemeSettings = {
  sidebarBg: "#10331f",
  sidebarText: "#d1fae5",
  sidebarAccent: "#f59e0b",
  mainBg: "#0f172a",
  contentText: "#f1f5f9",
  cardBg: "#1e293b",
  primaryBrand: "#3b82f6",
  appLogo: "",
  logoSize: 32,
  appName: "pepinetupdater",
};

const normalizeTheme = (theme?: Partial<ThemeSettings> | null): ThemeSettings => ({
  ...DEFAULT_THEME,
  ...(theme || {}),
  appLogo: theme?.appLogo || "",
  logoSize: Number(theme?.logoSize) || DEFAULT_THEME.logoSize,
  appName: theme?.appName || DEFAULT_THEME.appName,
});

const hexToHslStr = (hex: string) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }

  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const applyThemeVariables = (theme: ThemeSettings) => {
  const root = document.documentElement;
  const fgHsl = hexToHslStr(theme.contentText || DEFAULT_THEME.contentText);
  const bgHsl = hexToHslStr(theme.mainBg || DEFAULT_THEME.mainBg);
  const cdHsl = hexToHslStr(theme.cardBg || DEFAULT_THEME.cardBg);
  const prHsl = hexToHslStr(theme.primaryBrand || DEFAULT_THEME.primaryBrand);

  root.style.setProperty('--background', bgHsl);
  root.style.setProperty('--foreground', fgHsl);
  root.style.setProperty('--card', cdHsl);
  root.style.setProperty('--surface', cdHsl);
  root.style.setProperty('--primary', prHsl);

  const fgParts = fgHsl.split(' ');
  const bgParts = bgHsl.split(' ');
  const fh = fgParts[0];
  const fs = fgParts[1];
  const fl = parseInt(fgParts[2]);
  const bh = bgParts[0];
  const bs = bgParts[1];
  const bl = parseInt(bgParts[2]);
  const isDark = bl < 50;

  let safeFl = fl;
  if (isDark && fl < 50) safeFl = 95;
  if (!isDark && fl > 60) safeFl = 20;

  const m_l = isDark ? 85 : 30;
  const s_l = isDark ? 75 : 45;
  const mut_l = isDark ? Math.min(100, bl + 12) : Math.max(0, bl - 12);
  const acc_l = isDark ? Math.min(100, bl + 15) : Math.max(0, bl - 15);
  const bor_l = isDark ? Math.min(100, bl + 18) : Math.max(0, bl - 18);

  root.style.setProperty('--foreground', `${fh} ${fs} ${safeFl}%`);
  root.style.setProperty('--foreground-muted', `${fh} ${fs} ${m_l}%`);
  root.style.setProperty('--foreground-subtle', `${fh} ${fs} ${s_l}%`);
  root.style.setProperty('--muted', `${bh} ${bs} ${mut_l}%`);
  root.style.setProperty('--accent', `${bh} ${bs} ${acc_l}%`);
  root.style.setProperty('--border', `${bh} ${bs} ${bor_l}%`);
  root.style.setProperty('--card', cdHsl);
  root.style.setProperty('--surface', cdHsl);
  root.style.setProperty('--primary', prHsl);
  root.style.setProperty('--sidebar-background', hexToHslStr(theme.sidebarBg || DEFAULT_THEME.sidebarBg));
  root.style.setProperty('--sidebar-foreground', hexToHslStr(theme.sidebarText || DEFAULT_THEME.sidebarText));
  root.style.setProperty('--sidebar-accent-foreground', hexToHslStr(theme.sidebarAccent || DEFAULT_THEME.sidebarAccent));
  root.style.setProperty('--sidebar-primary', hexToHslStr(theme.sidebarAccent || DEFAULT_THEME.sidebarAccent));
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(32);
  const [appName, setAppName] = useState("pepinetupdater");
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const applyThemeToShell = (rawTheme?: Partial<ThemeSettings> | null) => {
    const theme = normalizeTheme(rawTheme);
    applyThemeVariables(theme);
    localStorage.setItem('pepinet-theme', JSON.stringify(theme));
    setCustomLogo(theme.appLogo || null);
    setLogoSize(theme.logoSize);
    setAppName(theme.appName);
    document.title = theme.appName;
  };

  useEffect(() => {
    let active = true;

    const syncFromLocal = () => {
      const saved = localStorage.getItem('pepinet-theme');
      if (!saved) {
        applyThemeToShell(DEFAULT_THEME);
        return;
      }

      try {
        applyThemeToShell(JSON.parse(saved));
      } catch (error) {
        console.error("Theme cache parse failed", error);
        applyThemeToShell(DEFAULT_THEME);
      }
    };

    const syncFromServer = async () => {
      try {
        const response = await fetch('/api/theme');
        if (!response.ok) return;

        const theme = await response.json();
        if (active) {
          applyThemeToShell(theme);
        }
      } catch (error) {
        console.error("Theme sync failed", error);
      }
    };

    const handleThemeUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<ThemeSettings>;
      if (customEvent.detail) {
        applyThemeToShell(customEvent.detail);
        return;
      }
      syncFromLocal();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'pepinet-theme') return;
      if (!event.newValue) {
        applyThemeToShell(DEFAULT_THEME);
        return;
      }

      try {
        applyThemeToShell(JSON.parse(event.newValue));
      } catch (error) {
        console.error("Theme storage sync failed", error);
      }
    };

    syncFromLocal();
    void syncFromServer();

    const intervalId = window.setInterval(() => {
      void syncFromServer();
    }, 30000);

    window.addEventListener('pepinet-theme-updated', handleThemeUpdated as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('pepinet-theme-updated', handleThemeUpdated as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const canManageTickets = user?.is_admin || hasPermission("manage_all_tickets");

  useEffect(() => {
    let active = true;
    let lastCheckedTime = localStorage.getItem('pepi_last_ticket_poll') || new Date().toISOString();
    localStorage.setItem('pepi_last_ticket_poll', new Date().toISOString());

    const checkTicketUpdates = async () => {
      try {
        if (!user) return;
        const now = new Date().toISOString();
        const qs = new URLSearchParams({
          username: user.username || "",
          can_manage: canManageTickets ? "true" : "false",
          since: lastCheckedTime
        });
        
        const res = await fetch(`/api/tickets/updates?${qs}`);
        if (!res.ok || !active) return;
        
        const updates = await res.json();
        
        if (updates.length > 0) {
           for (const t of updates) {
              if (canManageTickets && t.status === "Open" && t.created_by !== user.username) {
                 toast('New Trouble Ticket!', { description: `New issue reported at ${t.outlet_name || "a device"}` });
              } else if (!canManageTickets && t.status === "Resolved" && t.created_by === user.username) {
                 toast.success('Your Ticket is Resolved!', { description: `Your issue '${t.title}' has been resolved by IT. Check your Helpdesk menu.` });
              }
           }
        }
        
        lastCheckedTime = now;
        localStorage.setItem('pepi_last_ticket_poll', now);
      } catch (err) {
        // fail silently to avoid console spam in polling
      }
    };

    const intervalId = setInterval(checkTicketUpdates, 20000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [user, canManageTickets]);

  const handleLogout = () => {
    if (confirm("Are you sure you want to log out?")) {
      logout();
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out shrink-0 relative z-10",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo Section */}
        <div className={cn(
          "flex justify-center items-center px-4 pt-5 pb-8 border-b border-sidebar-border/50"
        )}>
          <div className="relative flex justify-center group">
            <div
              className={cn(
                "flex items-center justify-center rounded-2xl shrink-0 overflow-hidden transition-all duration-500 group-hover:scale-105",
                !customLogo ? "bg-sidebar-primary shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "bg-transparent drop-shadow-2xl"
              )}
              style={{ width: logoSize + 12, height: logoSize + 8 }}
            >
              {customLogo ? (
                <img src={customLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Server style={{ width: '55%', height: '55%' }} className="text-sidebar-primary-foreground" />
              )}
            </div>

            {!collapsed && (
              <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 z-20 bg-sidebar/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-sidebar-border shadow-lg whitespace-nowrap transition-all duration-500 group-hover:scale-105 group-hover:-translate-y-1">
                <p className="text-[9px] font-extrabold text-sidebar-foreground uppercase tracking-[0.25em] leading-none drop-shadow-sm text-center">
                  {appName}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {groups.map(group => {
            const items = navItems.filter(item => {
              if (item.hidden) return false;
              if (item.group !== group.key) return false;
              if (item.adminOnly && !user?.is_admin) return false;
              if (item.id && !hasPermission(item.id)) return false;
              return true;
            });

            if (items.length === 0) return null;

            return (
              <div key={group.key}>
                {!collapsed && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map(item => {
                    const active = item.to === "/"
                      ? location.pathname === "/"
                      : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 relative group/nav",
                            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active && "nav-item-active text-sidebar-primary bg-sidebar-primary/10",
                            collapsed && "justify-center px-2"
                          )}
                        >
                          <item.icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-sidebar-primary" : "group-hover/nav:text-sidebar-accent-foreground")} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {collapsed && (
                            <div className="absolute left-14 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/nav:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                              {item.label}
                            </div>
                          )}
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
          <button
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-danger hover:bg-danger/10 transition-all",
              collapsed && "justify-center"
            )}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>Logout</span>}
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
            <span className="text-xs text-foreground-muted font-medium">
              Logged in as <span className="text-foreground">{user?.full_name || user?.username}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsReportModalOpen(true)}
              title="Report an Issue"
              className="px-3 py-1.5 rounded-md hover:bg-danger/10 text-danger hover:text-danger-foreground font-medium text-xs flex items-center gap-2 transition-colors border border-danger/20"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>Report Issue</span>
            </button>
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
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[100px]">{user?.username}</p>
                <p className="text-[10px] text-foreground-muted leading-none">{user?.role_name}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <ReportTroubleModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} />

      {/* Smart AI Assistant (Only renders if user has permission) */}
      {hasPermission("assistant") && <SmartAssistantWidget />}
    </div>
  );
}
