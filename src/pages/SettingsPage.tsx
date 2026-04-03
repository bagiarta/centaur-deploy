import React, { useState, useEffect } from "react";
import { Server, Shield, Download, Package, Bell, Send, CheckCircle, AlertCircle, RefreshCw, Palette, Layout, Sidebar as SidebarIcon, Chrome, RotateCcw, Bot, Save, Trash2, PencilLine, Eye } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const DOWNLOADS = [
  {
    name: "CentralDeployServer",
    version: "2.4.1",
    description: "Full web dashboard server with REST API, package repository, deployment engine, monitoring, and scheduler.",
    icon: <Server className="w-6 h-6" />,
    color: "text-primary",
    bg: "bg-primary-dim",
    border: "border-primary/20",
    size: "~145 MB",
    file: "CentralDeployServer-Setup-2.4.1.exe",
    reqs: ["Windows Server 2016+ or Windows 10+", "4 GB RAM min (8 GB recommended)", ".NET 8.0 Runtime", "Port 8080 (configurable)"],
  },
  {
    name: "CentralDeployAgent",
    version: "2.5.0",
    description: "Lightweight PowerShell Agent (v2.5). Reports CPU, RAM, Disk usage and supports Self-Healing auto-updates.",
    icon: <Shield className="w-6 h-6" />,
    color: "text-success",
    bg: "bg-success-dim",
    border: "border-success/20",
    size: "~15 KB",
    file: "Manual-Agent-Installer-v25.ps1",
    reqs: ["Windows 7 SP1+ / Server 2008 R2+", "64 MB RAM", "PowerShell 5.1+", "TCP outbound to server port"],
  },
  {
    name: "AutoAgentInstaller",
    version: "2.5.0",
    description: "Scans IP ranges and silently pushes Agent v2.5.0 to hundreds of PCs with real-time feedback.",
    icon: <Download className="w-6 h-6" />,
    color: "text-info",
    bg: "bg-info-dim",
    border: "border-info/20",
    size: "~22 MB",
    file: "Manual-Agent-Installer-v25.ps1",
    reqs: ["Windows 10+ / Server 2016+", "Admin network access (SMB/WMI)", ".NET 8.0 Runtime", "Firewall: ports 135, 445 open on targets"],
  },
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

type AssistantKeyword = {
  id: string;
  keyword: string;
  description: string;
  action_type: "query" | "procedure" | "workflow";
  target_host: string;
  script_text: string;
  parameter_keys: string[];
  requires_admin: boolean;
  requires_confirmation: boolean;
  is_enabled: boolean;
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

const DEFAULT_KEYWORD_FORM: AssistantKeyword = {
  id: "",
  keyword: "",
  description: "",
  action_type: "query",
  target_host: "",
  script_text: "",
  parameter_keys: [],
  requires_admin: false,
  requires_confirmation: false,
  is_enabled: true,
};

const KEYWORD_TARGET_HOST_PLACEHOLDER = "isi host tetap, atau kosongkan lalu pakai host=HOST01 saat runtime";
const KEYWORD_RESERVED_PARAMS = ["host", "hostname", "target_host", "confirm"];

const sanitizeKeywordTargetHost = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.toLowerCase() === KEYWORD_TARGET_HOST_PLACEHOLDER.toLowerCase()) return "";
  return normalized;
};

const normalizeKeywordParameters = (value: string | string[]) => {
  const list = Array.isArray(value)
    ? value
    : value.split(",").map((item) => item.trim());

  return Array.from(
    new Set(
      list
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && !KEYWORD_RESERVED_PARAMS.includes(item.toLowerCase()))
    )
  );
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

const applyThemePreview = (theme: ThemeSettings) => {
  const root = document.documentElement;
  const fgHsl = hexToHslStr(theme.contentText || DEFAULT_THEME.contentText);
  const bgHsl = hexToHslStr(theme.mainBg || DEFAULT_THEME.mainBg);
  const cdHsl = hexToHslStr(theme.cardBg || DEFAULT_THEME.cardBg);
  const prHsl = hexToHslStr(theme.primaryBrand || DEFAULT_THEME.primaryBrand);

  root.style.setProperty('--background', bgHsl);

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
  root.style.setProperty('--logo-size', `${theme.logoSize || DEFAULT_THEME.logoSize}px`);

  localStorage.setItem('pepinet-theme', JSON.stringify(theme));
  document.title = theme.appName;
  window.dispatchEvent(new CustomEvent('pepinet-theme-updated', { detail: theme }));
};

export default function SettingsPage() {
  const { user } = useAuth();
  const userKey = user?.id || user?.username;
  const [notifSettings, setNotifSettings] = useState({
    webhook_url: "",
    whatsapp_token: "",
    whatsapp_target: "",
    whatsapp_group: "",
    alert_offline: true,
    alert_deployment_success: false,
    alert_deployment_failed: true,
    offline_timeout_mins: 5
  });
  const [agentConfig, setAgentConfig] = useState({
    LATEST_AGENT_VERSION: "1.0.0",
    AGENT_UPDATE_URL: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [themeHydrated, setThemeHydrated] = useState(false);
  const [themeSyncStatus, setThemeSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [assistantKeywords, setAssistantKeywords] = useState<AssistantKeyword[]>([]);
  const [keywordForm, setKeywordForm] = useState<AssistantKeyword>(DEFAULT_KEYWORD_FORM);
  const [keywordParamsInput, setKeywordParamsInput] = useState("");
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [keywordSaving, setKeywordSaving] = useState(false);
  const [keywordDeletingId, setKeywordDeletingId] = useState<string | null>(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [keywordTestInput, setKeywordTestInput] = useState("");
  const [keywordTesting, setKeywordTesting] = useState(false);
  const [keywordTestResult, setKeywordTestResult] = useState("");

  // --- THEME CUSTOMIZATION ---
  const [theme, setTheme] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem('pepinet-theme');
    if (!saved) return DEFAULT_THEME;
    try {
      return normalizeTheme(JSON.parse(saved));
    } catch {
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    applyThemePreview(theme);
  }, [theme]);

  useEffect(() => {
    if (!themeHydrated) return;

    const timeoutId = window.setTimeout(async () => {
      try {
        setThemeSyncStatus("saving");
        const response = await fetch('/api/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(theme)
        });

        if (!response.ok) {
          throw new Error("Theme sync failed");
        }

        setThemeSyncStatus("saved");
      } catch (error) {
        console.error("Failed to sync theme", error);
        setThemeSyncStatus("error");
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [theme, themeHydrated]);

  const resetTheme = () => {
    setTheme(DEFAULT_THEME);
    toast.info("Theme reset to defaults.");
  };

  const resetKeywordForm = () => {
    setKeywordForm(DEFAULT_KEYWORD_FORM);
    setKeywordParamsInput("");
    setKeywordTestInput("");
    setKeywordTestResult("");
  };

  const fetchAssistantKeywords = async () => {
    if (!userKey || !user.is_admin) return;

    setKeywordsLoading(true);
    try {
      const response = await fetch('/api/assistant-keywords', {
        headers: { 'X-User-Id': userKey }
      });

      if (!response.ok) {
        throw new Error("Failed to load assistant keywords.");
      }

      const data = await response.json();
      setAssistantKeywords(
        Array.isArray(data)
          ? data.map((item) => ({
              ...item,
              target_host: sanitizeKeywordTargetHost(item.target_host || ""),
              parameter_keys: normalizeKeywordParameters(Array.isArray(item.parameter_keys) ? item.parameter_keys : []),
              requires_admin: item.requires_admin === true || item.requires_admin === 1,
              requires_confirmation: item.requires_confirmation === true || item.requires_confirmation === 1,
              is_enabled: item.is_enabled === true || item.is_enabled === 1,
            }))
          : []
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to load assistant keywords.");
    } finally {
      setKeywordsLoading(false);
    }
  };

  const handleEditKeyword = (keyword: AssistantKeyword) => {
    setSelectedKeywordId(keyword.id);
    setKeywordForm({
      ...keyword,
      target_host: sanitizeKeywordTargetHost(keyword.target_host || ""),
      parameter_keys: normalizeKeywordParameters(Array.isArray(keyword.parameter_keys) ? keyword.parameter_keys : []),
    });
    setKeywordParamsInput(normalizeKeywordParameters(keyword.parameter_keys || []).join(", "));
    setKeywordTestResult("");
  };

  const handleSaveKeyword = async () => {
    if (!userKey) {
      toast.error("Session user not found. Please login again.");
      return;
    }

    if (!keywordForm.keyword.trim() || !keywordForm.script_text.trim()) {
      toast.error("Keyword dan script wajib diisi.");
      return;
    }

    const payload = {
      ...keywordForm,
      keyword: keywordForm.keyword.trim(),
      description: keywordForm.description.trim(),
      target_host: sanitizeKeywordTargetHost(keywordForm.target_host),
      script_text: keywordForm.script_text.trim(),
      parameter_keys: normalizeKeywordParameters(keywordParamsInput),
    };

    setKeywordSaving(true);
    try {
      const response = await fetch(
        keywordForm.id ? `/api/assistant-keywords/${keywordForm.id}` : '/api/assistant-keywords',
        {
          method: keywordForm.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userKey
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save assistant keyword.");
      }

      toast.success(keywordForm.id ? "Keyword updated." : "Keyword created.");
      resetKeywordForm();
      await fetchAssistantKeywords();
    } catch (error: any) {
      toast.error(error.message || "Failed to save assistant keyword.");
    } finally {
      setKeywordSaving(false);
    }
  };

  const handleDeleteKeyword = async (keywordId: string) => {
    if (!userKey) {
      toast.error("Session user not found. Please login again.");
      return;
    }

    setKeywordDeletingId(keywordId);
    try {
      const response = await fetch(`/api/assistant-keywords/${keywordId}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userKey }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete assistant keyword.");
      }

      toast.success("Keyword deleted.");
      if (keywordForm.id === keywordId) {
        resetKeywordForm();
      }
      if (selectedKeywordId === keywordId) {
        setSelectedKeywordId(null);
      }
      await fetchAssistantKeywords();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete assistant keyword.");
    } finally {
      setKeywordDeletingId(null);
    }
  };

  const handleTestKeyword = async () => {
    if (!userKey) {
      toast.error("Session user not found. Please login again.");
      return;
    }

    if (!keywordForm.keyword.trim() || !keywordForm.script_text.trim()) {
      toast.error("Isi keyword dan script dulu sebelum test.");
      return;
    }

    const payload = {
      ...keywordForm,
      keyword: keywordForm.keyword.trim(),
      description: keywordForm.description.trim(),
      target_host: sanitizeKeywordTargetHost(keywordForm.target_host),
      script_text: keywordForm.script_text.trim(),
      parameter_keys: normalizeKeywordParameters(keywordParamsInput),
    };

    setKeywordTesting(true);
    setKeywordTestResult("");
    try {
      const response = await fetch('/api/assistant-keywords/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userKey
        },
        body: JSON.stringify({
          keyword: payload,
          test_input: keywordTestInput
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Keyword test failed.");
      }

      setKeywordTestResult(data.text || "Test selesai tanpa output.");
      toast.success("Keyword test completed.");
    } catch (error: any) {
      const message = error.message || "Keyword test failed.";
      setKeywordTestResult(`Error: ${message}`);
      toast.error(message);
    } finally {
      setKeywordTesting(false);
    }
  };

  useEffect(() => {
    async function fetchSettings() {
      try {
        const [notifRes, agentRes, themeRes] = await Promise.all([
          fetch('/api/notification-settings'),
          fetch('/api/agent/config'),
          fetch('/api/theme')
        ]);
        
        if (notifRes.ok) {
          const data = await notifRes.json();
          setNotifSettings({
            webhook_url: data.webhook_url || "",
            whatsapp_token: data.whatsapp_token || "",
            whatsapp_target: data.whatsapp_target || "",
            whatsapp_group: data.whatsapp_group || "",
            alert_offline: data.alert_offline === 1 || data.alert_offline === true,
            alert_deployment_success: data.alert_deployment_success === 1 || data.alert_deployment_success === true,
            alert_deployment_failed: data.alert_deployment_failed === 1 || data.alert_deployment_failed === true,
            offline_timeout_mins: data.offline_timeout_mins || 30
          });
        }

        if (agentRes.ok) {
          setAgentConfig(await agentRes.json());
        }

        if (themeRes.ok) {
          const themeData = normalizeTheme(await themeRes.json());
          setTheme(themeData);
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      } finally {
        setThemeHydrated(true);
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  useEffect(() => {
    if (user?.is_admin) {
      void fetchAssistantKeywords();
    }
  }, [userKey, user?.is_admin]);

  useEffect(() => {
    if (!selectedKeywordId) return;
    const exists = assistantKeywords.some((keyword) => keyword.id === selectedKeywordId);
    if (!exists) {
      setSelectedKeywordId(null);
    }
  }, [assistantKeywords, selectedKeywordId]);

  const selectedKeyword = assistantKeywords.find((keyword) => keyword.id === selectedKeywordId) || null;

  const handleSaveNotif = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifSettings)
      });
      if (res.ok) {
        toast.success("Notification settings saved successfully!");
      } else {
        const errorData = await res.json();
        toast.error(`Failed to save settings: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`Error saving settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgentConfig = async () => {
    setSavingAgent(true);
    try {
      const res = await fetch('/api/agent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentConfig)
      });
      if (res.ok) {
        toast.success("Agent auto-update config saved!");
      } else {
        toast.error("Failed to save agent config.");
      }
    } catch (err) {
      toast.error("Error saving agent config.");
    } finally {
      setSavingAgent(false);
    }
  };

  const handleTestNotif = async () => {
    if (!notifSettings.webhook_url) {
      toast.error("Please enter a Webhook URL first.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/test-notification', { method: 'POST' });
      if (res.ok) {
        toast.success("Test notification sent! Check your Discord/Slack channel.");
      } else {
        toast.error("Failed to send test notification.");
      }
    } catch (err) {
      toast.error("Error sending test notification.");
    } finally {
      setTesting(false);
    }
  };

  const handleTestWhatsapp = async () => {
    if (!notifSettings.whatsapp_token || (!notifSettings.whatsapp_target && !notifSettings.whatsapp_group)) {
      toast.error("Please enter a WhatsApp Token and either a Target number or Group Name.");
      return;
    }
    setTestingWa(true);
    try {
      const res = await fetch('/api/test-whatsapp', { method: 'POST' });
      if (res.ok) {
        toast.success("Test WhatsApp sent! Check your phone.");
      } else {
        toast.error("Failed to send WhatsApp.");
      }
    } catch (err) {
      toast.error("Error sending WhatsApp.");
    } finally {
      setTestingWa(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <PageHeader
        title="Settings & Downloads"
        subtitle="Download installer packages and configure server settings"
      />

      {/* Download Packages */}
      <div>
        <h2 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider">📦 Installer Packages</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DOWNLOADS.map(pkg => (
            <div key={pkg.name} className={`card-enterprise p-5 border ${pkg.border} flex flex-col`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${pkg.bg} ${pkg.color}`}>
                  {pkg.icon}
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">{pkg.name}</p>
                  <p className="text-xs text-foreground-muted font-mono">v{pkg.version} · {pkg.size}</p>
                </div>
              </div>
              <p className="text-xs text-foreground-muted leading-relaxed mb-4 flex-1">{pkg.description}</p>
              <div className="mb-4">
                <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold mb-1.5">Requirements</p>
                <ul className="space-y-0.5">
                  {pkg.reqs.map(r => (
                    <li key={r} className="flex items-start gap-1.5 text-xs text-foreground-muted">
                      <span className="text-foreground-subtle shrink-0 mt-0.5">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <a 
                href={`/${pkg.file}`}
                download
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-all ${pkg.color} ${pkg.bg} border ${pkg.border} hover:brightness-125`}
              >
                <Download className="w-4 h-4" />
                Download {pkg.file.split(".").pop()?.toUpperCase()}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Server Config */}
      <SectionCard title="Server Configuration">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Server IP",                value: "192.168.85.30" },
            { label: "Server Port",              value: "3001" },
            { label: "Agent Poll Interval (sec)", value: "30" },
            { label: "Package Repository Path",   value: "F:\\PepiUpdater\\Repo" },
            { label: "Max Parallel Deployments",  value: "20" },
            { label: "Log Retention (days)",       value: "180" },
          ].map(cfg => (
            <div key={cfg.label}>
              <label className="text-xs text-foreground-muted mb-1 block">{cfg.label}</label>
              <input
                defaultValue={cfg.value}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow">
            Save Configuration
          </button>
        </div>
      </SectionCard>

      {/* Notification Settings */}
      <SectionCard title="Notification & Alerting System">
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Discord/Slack */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Discord / Slack Webhook</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={notifSettings.webhook_url}
                    onChange={(e) => setNotifSettings({...notifSettings, webhook_url: e.target.value.trim()})}
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button 
                    onClick={handleTestNotif}
                    disabled={testing}
                    className="px-4 py-2 text-xs font-bold bg-surface-raised border border-border rounded-md hover:bg-surface-overlay transition-all flex items-center gap-2"
                  >
                    {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Test
                  </button>
                </div>
                <p className="text-[10px] text-foreground-subtle mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Sent to Discord/Slack when alerts are triggered.
                </p>
              </div>
            </div>

            {/* WhatsApp Fonnte */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">WhatsApp API Token (Fonnte)</label>
                  <input
                    type="password"
                    placeholder="Enter Fonnte API Token"
                    value={notifSettings.whatsapp_token}
                    onChange={(e) => setNotifSettings({...notifSettings, whatsapp_token: e.target.value.trim()})}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Target Phone Number</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 08123456789"
                      value={notifSettings.whatsapp_target}
                      onChange={(e) => setNotifSettings({...notifSettings, whatsapp_target: e.target.value.trim()})}
                      className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Target Group Name/ID (Optional)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. My Alert Group"
                      value={notifSettings.whatsapp_group}
                      onChange={(e) => setNotifSettings({...notifSettings, whatsapp_group: e.target.value.trim()})}
                      className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button 
                      onClick={handleTestWhatsapp}
                      disabled={testingWa}
                      className="px-4 py-2 text-xs font-bold bg-surface-raised border border-border rounded-md hover:bg-surface-overlay transition-all flex items-center gap-2"
                    >
                      {testingWa ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Test
                    </button>
                  </div>
                  <p className="text-[10px] text-foreground-subtle mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Fonnte API will send notifications to this number and/or group.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2">
            <div className="flex items-start gap-3 p-3 bg-surface-raised border border-border rounded-xl">
              <div className="p-2 rounded-lg bg-danger/10 text-danger mt-0.5">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-foreground">Device Offline</p>
                  <input 
                    type="checkbox"
                    checked={notifSettings.alert_offline}
                    onChange={(e) => setNotifSettings({...notifSettings, alert_offline: e.target.checked})}
                    className="w-4 h-4 accent-primary"
                  />
                </div>
                <p className="text-[10px] text-foreground-muted leading-tight mb-2">Alert when a device hasn't checked in for a while.</p>
                <div className="flex items-center gap-2">
                   <span className="text-[10px] text-foreground-muted uppercase font-bold">Timeout</span>
                   <select 
                     value={notifSettings.offline_timeout_mins}
                     onChange={(e) => setNotifSettings({...notifSettings, offline_timeout_mins: parseInt(e.target.value)})}
                     className="text-[10px] bg-background border border-border rounded px-1 py-0.5 outline-none font-bold"
                   >
                     <option value="5">5 min</option>
                     <option value="15">15 min</option>
                     <option value="30">30 min</option>
                     <option value="60">1 hour</option>
                     <option value="1440">24 hours</option>
                   </select>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-surface-raised border border-border rounded-xl">
              <div className="p-2 rounded-lg bg-success/10 text-success mt-0.5">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-foreground">Deployment Joy</p>
                  <input 
                    type="checkbox"
                    checked={notifSettings.alert_deployment_success}
                    onChange={(e) => setNotifSettings({...notifSettings, alert_deployment_success: e.target.checked})}
                    className="w-4 h-4 accent-primary"
                  />
                </div>
                <p className="text-[10px] text-foreground-muted leading-tight">Notify when a deployment completes without any errors.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-surface-raised border border-border rounded-xl">
              <div className="p-2 rounded-lg bg-warning/10 text-warning mt-0.5">
                <Package className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-foreground">Deployment Failure</p>
                  <input 
                    type="checkbox"
                    checked={notifSettings.alert_deployment_failed}
                    onChange={(e) => setNotifSettings({...notifSettings, alert_deployment_failed: e.target.checked})}
                    className="w-4 h-4 accent-primary"
                  />
                </div>
                <p className="text-[10px] text-foreground-muted leading-tight">Notify if any target fails during a deployment process.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 border-t border-border pt-4 flex justify-between items-center">
          <p className="text-[10px] text-foreground-muted italic">System checks for offline devices every 5 minutes.</p>
          <button 
            onClick={handleSaveNotif}
            disabled={saving}
            className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all font-bold shadow-glow flex items-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            Save Notification Settings
          </button>
        </div>
      </SectionCard>

      {/* Agent Auto-Update Global Configuration */}
      <SectionCard title="Agent Auto-Update Global Configuration">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Latest Agent Version (Target)</label>
              <input
                type="text"
                placeholder="e.g. 2.5.0"
                value={agentConfig.LATEST_AGENT_VERSION}
                onChange={(e) => setAgentConfig({ ...agentConfig, LATEST_AGENT_VERSION: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-foreground-subtle mt-1.5 italic">
                All agents reporting a lower version will be notified to update.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Agent Update URL (MSI/EXE)</label>
              <input
                type="text"
                placeholder="http://192.168.85.30:3001/public/agent_v25.msi"
                value={agentConfig.AGENT_UPDATE_URL}
                onChange={(e) => setAgentConfig({ ...agentConfig, AGENT_UPDATE_URL: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-foreground-subtle mt-1.5 italic">
                Direct link to download the new agent installer package.
              </p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 border-t border-border pt-4 flex justify-end">
          <button 
            onClick={handleSaveAgentConfig}
            disabled={savingAgent}
            className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all font-bold shadow-glow flex items-center gap-2"
          >
            {savingAgent ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Save Agent Configuration
          </button>
        </div>
      </SectionCard>

      {user?.is_admin && (
        <SectionCard
          title="AI Assistant Keyword Manager"
          subtitle="Create managed keywords that run approved queries, procedures, or workflow lookups"
          actions={
            <div className="flex items-center gap-3">
              {keywordsLoading && (
                <div className="flex items-center gap-1.5 text-xs text-foreground-subtle">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Refreshing keywords...</span>
                </div>
              )}
              <button
                onClick={resetKeywordForm}
                className="flex items-center gap-2 text-xs text-foreground-subtle hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Clear Form
              </button>
            </div>
          }
        >
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Keyword</label>
                    <input
                      type="text"
                      placeholder="contoh: sales-by-date"
                      value={keywordForm.keyword}
                      onChange={(e) => setKeywordForm({ ...keywordForm, keyword: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Action Type</label>
                    <select
                      value={keywordForm.action_type}
                      onChange={(e) => setKeywordForm({ ...keywordForm, action_type: e.target.value as AssistantKeyword["action_type"] })}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-semibold"
                    >
                      <option value="query">Read-only Query</option>
                      <option value="procedure">Procedure / Command</option>
                      <option value="workflow">Workflow Lookup</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Target Host (Optional)</label>
                    <input
                      type="text"
                      placeholder={KEYWORD_TARGET_HOST_PLACEHOLDER}
                      value={keywordForm.target_host}
                      onChange={(e) => setKeywordForm({ ...keywordForm, target_host: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Parameters</label>
                    <input
                      type="text"
                      placeholder="tanggal, store, deviceId"
                      value={keywordParamsInput}
                      onChange={(e) => setKeywordParamsInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Description</label>
                  <input
                    type="text"
                    placeholder="Penjelasan singkat fungsi keyword ini"
                    value={keywordForm.description}
                    onChange={(e) => setKeywordForm({ ...keywordForm, description: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">
                    {keywordForm.action_type === "workflow" ? "Workflow Target" : "Script / Command"}
                  </label>
                  <textarea
                    rows={8}
                    placeholder={
                      keywordForm.action_type === "workflow"
                        ? "contoh: restart agent atau id:workflow-123"
                        : keywordForm.action_type === "procedure"
                          ? "contoh: EXEC usp_SyncStock @tanggal=@tanggal, @store=@store"
                          : "contoh: SELECT * FROM Sales WHERE tanggal = @tanggal"
                    }
                    value={keywordForm.script_text}
                    onChange={(e) => setKeywordForm({ ...keywordForm, script_text: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex items-center gap-3 p-3 bg-surface-raised border border-border rounded-xl">
                    <input
                      type="checkbox"
                      checked={keywordForm.requires_admin}
                      onChange={(e) => setKeywordForm({ ...keywordForm, requires_admin: e.target.checked })}
                      className="w-4 h-4 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-bold text-foreground">Admin Only</p>
                      <p className="text-[10px] text-foreground-muted">Batasi keyword untuk admin.</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-surface-raised border border-border rounded-xl">
                    <input
                      type="checkbox"
                      checked={keywordForm.requires_confirmation}
                      onChange={(e) => setKeywordForm({ ...keywordForm, requires_confirmation: e.target.checked })}
                      className="w-4 h-4 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-bold text-foreground">Needs Confirm</p>
                      <p className="text-[10px] text-foreground-muted">User harus tambah `confirm=yes`.</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-surface-raised border border-border rounded-xl">
                    <input
                      type="checkbox"
                      checked={keywordForm.is_enabled}
                      onChange={(e) => setKeywordForm({ ...keywordForm, is_enabled: e.target.checked })}
                      className="w-4 h-4 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-bold text-foreground">Enabled</p>
                      <p className="text-[10px] text-foreground-muted">Matikan tanpa menghapus keyword.</p>
                    </div>
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSaveKeyword}
                    disabled={keywordSaving}
                    className="px-6 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-all font-bold shadow-glow flex items-center gap-2"
                  >
                    {keywordSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {keywordForm.id ? "Update Keyword" : "Create Keyword"}
                  </button>
                  <button
                    onClick={handleTestKeyword}
                    disabled={keywordTesting}
                    className="px-5 py-2 text-sm bg-surface-raised border border-border text-foreground rounded-md hover:bg-surface-overlay transition-all font-bold flex items-center gap-2"
                  >
                    {keywordTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                    Test Keyword
                  </button>
                  <p className="text-[10px] text-foreground-subtle italic">
                    Gunakan parameter berbasis `@namaParam` di script. `host`/`hostname` otomatis didukung dan tidak perlu ditulis di Parameters.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground-muted mb-1.5 block uppercase tracking-wider">Test Input</label>
                    <input
                      type="text"
                      placeholder="contoh: host=HOST01 tanggal=2026-03-31"
                      value={keywordTestInput}
                      onChange={(e) => setKeywordTestInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                    />
                    <p className="text-[10px] text-foreground-subtle mt-1.5">
                      Isi argumen seperti saat dipanggil dari assistant. Jika parameter wajib belum lengkap, test akan memberi tahu apa yang harus diisi.
                    </p>
                  </div>
                  {keywordTestResult && (
                    <div className="rounded-xl border border-border bg-surface-raised p-3">
                      <p className="text-xs font-bold text-foreground-muted uppercase tracking-wider mb-2">Test Result</p>
                      <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">{keywordTestResult}</pre>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-border bg-surface-raised">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="w-4 h-4 text-primary" />
                    <p className="text-sm font-bold text-foreground">Cara Pakai</p>
                  </div>
                  <div className="space-y-2 text-xs text-foreground-muted leading-relaxed">
                    <p>1. Tulis keyword seperti `sales-by-date` atau `sync-stock`.</p>
                    <p>2. Untuk query/procedure, gunakan parameter di script seperti `@tanggal` dan isi field Parameters hanya untuk parameter SQL yang benar-benar dipakai.</p>
                    <p>3. Jika host banyak, kosongkan Target Host. User tinggal mengetik `host=HOSTNAME` atau `hostname=HOSTNAME` saat runtime.</p>
                    <p>4. User bisa memanggilnya seperti `sales-by-date host=HOST01 tanggal=2026-03-31`.</p>
                    <p>5. Jika butuh konfirmasi, user tambahkan `confirm=yes`.</p>
                    <p>6. Di chat assistant, user bisa mengetik `help` untuk melihat daftar keyword aktif atau `help nama-keyword` untuk detail satu keyword.</p>
                  </div>
                </div>

                {selectedKeyword && (
                  <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-foreground text-sm">{selectedKeyword.keyword}</p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary uppercase">
                            {selectedKeyword.action_type}
                          </span>
                          {!selectedKeyword.is_enabled && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger/10 text-danger uppercase">
                              disabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground-muted mt-1">{selectedKeyword.description || "No description"}</p>
                      </div>
                      <button
                        onClick={() => handleEditKeyword(selectedKeyword)}
                        className="p-2 rounded-md border border-border hover:bg-background transition-colors"
                        title="Edit keyword"
                      >
                        <PencilLine className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-foreground-subtle">
                      <div className="rounded-lg border border-border bg-background p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Host</p>
                        <p>{selectedKeyword.target_host || "dynamic / runtime"}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Parameters</p>
                        <p>{(selectedKeyword.parameter_keys || []).join(", ") || "-"}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-3 md:col-span-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-1">Flags</p>
                        <p>{[selectedKeyword.requires_admin ? "admin" : null, selectedKeyword.requires_confirmation ? "confirm" : null].filter(Boolean).join(", ") || "none"}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted mb-2">Script / Command</p>
                      <pre className="p-3 rounded-lg bg-background text-[11px] text-foreground-muted overflow-x-auto whitespace-pre-wrap break-words font-mono">
                        {selectedKeyword.script_text}
                      </pre>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => handleDeleteKeyword(selectedKeyword.id)}
                        disabled={keywordDeletingId === selectedKeyword.id}
                        className="px-3 py-2 rounded-md border border-danger/20 text-danger hover:bg-danger/10 transition-colors text-xs font-bold flex items-center gap-2"
                      >
                        {keywordDeletingId === selectedKeyword.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Delete Keyword
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 max-h-[18.5rem] overflow-y-auto pr-1">
                  {assistantKeywords.length === 0 && !keywordsLoading && (
                    <div className="p-4 rounded-xl border border-dashed border-border text-sm text-foreground-muted bg-surface-raised">
                      Belum ada keyword assistant yang terdaftar.
                    </div>
                  )}
                  {assistantKeywords.map((keyword) => (
                    <div key={keyword.id} className="p-4 rounded-xl border border-border bg-background">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-foreground text-sm">{keyword.keyword}</p>
                          <p className="text-xs text-foreground-muted mt-1">{keyword.description || "No description"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedKeywordId((current) => current === keyword.id ? null : keyword.id)}
                            className={`
                              p-2 rounded-md border transition-colors
                              ${selectedKeywordId === keyword.id ? "border-primary/40 text-primary bg-primary/10" : "border-border hover:bg-surface-raised"}
                            `}
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditKeyword(keyword)}
                            className="p-2 rounded-md border border-border hover:bg-surface-raised transition-colors"
                            title="Edit keyword"
                          >
                            <PencilLine className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Theme Customizer */}
      <SectionCard 
        title="Theme & UI Customization" 
        subtitle="Manage sidebar, background, and brand identity colors"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              {themeSyncStatus === "saving" && (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-foreground-subtle">Syncing branding...</span>
                </>
              )}
              {themeSyncStatus === "saved" && (
                <>
                  <CheckCircle className="w-3 h-3 text-success" />
                  <span className="text-foreground-subtle">Synced to server</span>
                </>
              )}
              {themeSyncStatus === "error" && (
                <>
                  <AlertCircle className="w-3 h-3 text-danger" />
                  <span className="text-danger">Sync failed</span>
                </>
              )}
            </div>
            <button 
              onClick={resetTheme}
              className="flex items-center gap-2 text-xs text-foreground-subtle hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset Default
            </button>
          </div>
        }
      >
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar BG */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <SidebarIcon className="w-4 h-4 text-primary" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Sidebar Background</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={theme.sidebarBg} 
                  onChange={e => setTheme({...theme, sidebarBg: e.target.value})}
                  className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none overflow-hidden hover:scale-110 transition-transform" 
                />
                <input 
                  type="text" 
                  value={theme.sidebarBg} 
                  onChange={e => setTheme({...theme, sidebarBg: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                />
              </div>
            </div>

            {/* Sidebar Text */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Layout className="w-4 h-4 text-success" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Sidebar Text Color</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={theme.sidebarText} 
                  onChange={e => setTheme({...theme, sidebarText: e.target.value})}
                  className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none overflow-hidden hover:scale-110 transition-transform" 
                />
                <input 
                  type="text" 
                  value={theme.sidebarText} 
                  onChange={e => setTheme({...theme, sidebarText: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                />
              </div>
            </div>

            {/* Sidebar Highlight */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Palette className="w-4 h-4 text-warning" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Sidebar Highlight</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={theme.sidebarAccent} 
                  onChange={e => setTheme({...theme, sidebarAccent: e.target.value})}
                  className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none overflow-hidden hover:scale-110 transition-transform" 
                />
                <input 
                  type="text" 
                  value={theme.sidebarAccent} 
                  onChange={e => setTheme({...theme, sidebarAccent: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                />
              </div>
            </div>

            {/* Main Background */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Layout className="w-4 h-4 text-info" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">App Background</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={theme.mainBg} 
                  onChange={e => setTheme({...theme, mainBg: e.target.value})}
                  className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none overflow-hidden hover:scale-110 transition-transform" 
                />
                <input 
                  type="text" 
                  value={theme.mainBg} 
                  onChange={e => setTheme({...theme, mainBg: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                />
              </div>
            </div>

            {/* Content Text Color */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Send className="w-4 h-4 text-info" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Main Text Color</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={theme.contentText} 
                  onChange={e => setTheme({...theme, contentText: e.target.value})}
                  className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none overflow-hidden hover:scale-110 transition-transform" 
                />
                <input 
                  type="text" 
                  value={theme.contentText} 
                  onChange={e => setTheme({...theme, contentText: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                />
              </div>
            </div>

            {/* Card BG */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-primary" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Card Background</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={theme.cardBg} 
                  onChange={e => setTheme({...theme, cardBg: e.target.value})}
                  className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none overflow-hidden hover:scale-110 transition-transform" 
                />
                <input 
                  type="text" 
                  value={theme.cardBg} 
                  onChange={e => setTheme({...theme, cardBg: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                />
              </div>
            </div>

            {/* Primary Brand */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Chrome className="w-4 h-4 text-primary" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Brand Identity</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={theme.primaryBrand} 
                  onChange={e => setTheme({...theme, primaryBrand: e.target.value})}
                  className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border-none overflow-hidden hover:scale-110 transition-transform" 
                />
                <input 
                  type="text" 
                  value={theme.primaryBrand} 
                  onChange={e => setTheme({...theme, primaryBrand: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono"
                />
              </div>
            </div>

            {/* App Logo */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-success" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Application Logo</label>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-background border border-border border-dashed rounded-md text-foreground-muted cursor-pointer hover:border-primary transition-colors">
                  <Download className="w-4 h-4" />
                  <span>{theme.appLogo ? "Logo Uploaded" : "Upload PNG/JPG"}</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setTheme({...theme, appLogo: reader.result as string});
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                {theme.appLogo && (
                   <button 
                     onClick={() => setTheme({...theme, appLogo: ""})}
                     className="p-2 text-danger hover:bg-danger/10 rounded-md transition-colors"
                     title="Remove Logo"
                   >
                     <RotateCcw className="w-4 h-4" />
                   </button>
                )}
              </div>
            </div>

            {/* Logo Scaling */}
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-primary" />
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Logo Scaling</label>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary">{theme.logoSize}px</span>
               </div>
               <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="16" 
                    max="128" 
                    step="2"
                    value={theme.logoSize}
                    onChange={e => setTheme({...theme, logoSize: parseInt(e.target.value)})}
                    className="flex-1 accent-primary cursor-pointer"
                  />
               </div>
               <div className="p-3 border border-border border-dashed rounded-lg bg-sidebar flex items-center justify-center min-h-[100px] relative overflow-hidden group">
                  <p className="absolute top-2 left-2 text-[10px] text-foreground-subtle uppercase tracking-widest font-bold">Live Preview</p>
                  <div 
                    className="flex items-center justify-center transition-all bg-transparent"
                    style={{ width: theme.logoSize, height: theme.logoSize }}
                  >
                    {theme.appLogo ? (
                      <img src={theme.appLogo} alt="Preview" className="w-full h-full object-contain" />
                    ) : (
                      <Server className="text-sidebar-primary" style={{ width: '60%', height: '60%' }} />
                    )}
                  </div>
               </div>
            </div>

            {/* App Name */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Chrome className="w-4 h-4 text-info" />
                <label className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Application Display Name</label>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  placeholder="e.g. My Dashboard"
                  value={theme.appName} 
                  onChange={e => setTheme({...theme, appName: e.target.value})}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-semibold"
                />
              </div>
              <p className="text-[10px] text-foreground-subtle italic">This name appears in the sidebar and browser title.</p>
            </div>
          </div>

          <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
               <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
               <p className="text-sm font-bold text-foreground">Pro Tip: Dark Presets</p>
               <p className="text-xs text-foreground-muted leading-relaxed">
                  For the best experience with the translucent Glassmorphism UI, we recommend keeping backgrounds below 20% lightness. 
                  Bright colors are best reserved for Highlighting and Accents.
               </p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
