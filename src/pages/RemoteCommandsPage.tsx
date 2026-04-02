import { useState, useEffect } from "react";
import { Terminal, Play, RefreshCw, Power, FileCode, Package2, Activity, Save, Clock, Trash2, ChevronDown, CheckCircle, XCircle, Search } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { sql } from '@codemirror/lang-sql';

const PRESETS = [
  { label: "Restart PC",        icon: <Power className="w-3.5 h-3.5" />,   cmd: "shutdown /r /t 30 /c \"Scheduled restart by CentralDeploy\"",  color: "text-warning" },
  { label: "Force Update Agent",icon: <RefreshCw className="w-3.5 h-3.5" />, cmd: "sc stop CentralDeployAgent && msiexec /i agent.msi /quiet", color: "text-primary" },
  { label: "Flush DNS",         icon: <Terminal className="w-3.5 h-3.5" />,  cmd: "ipconfig /flushdns",                                         color: "text-info" },
  { label: "Clear Temp",        icon: <FileCode className="w-3.5 h-3.5" />,  cmd: "del /f /s /q %TEMP%\\*",                                     color: "text-success" },
  { label: "List Installed Apps",icon: <Package2 className="w-3.5 h-3.5" />, cmd: "wmic product get name,version",                              color: "text-foreground-muted" },
];

const fakeOutput = [
  "[09:12:01] WORKSTATION-01 → OK",
  "[09:12:01] WORKSTATION-02 → OK",
  "[09:12:02] SERVER-APP-01  → OK",
  "[09:12:03] LAPTOP-DEV-01  → OK",
  "[09:12:04] WORKSTATION-03 → OK",
  "[09:12:05] KIOSK-LOBBY-02 → OK",
  "[09:12:06] SERVER-APP-02  → OK",
  "[09:12:06] ✓ Command completed on 7/7 selected devices",
];

export default function RemoteCommandsPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selected, setSelected] = useState<string[]>([]);
  const [cmd, setCmd] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [activeExecId, setActiveExecId] = useState<string | null>(null);

  const [adminUser, setAdminUser] = useState("Administrator");
  const [adminPass, setAdminPass] = useState("");

  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [devRes, tplRes] = await Promise.all([
          fetch('/api/devices'),
          fetch('/api/remote-commands/scripts')
        ]);
        setDevices(await devRes.json());
        setTemplates(await tplRes.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const saveTemplate = async () => {
    let name = "";
    let method = 'POST';
    let url = '/api/remote-commands/scripts';

    if (activeTemplateId) {
      const existing = templates.find(t => t.id === activeTemplateId);
      if (confirm(`Update existing template "${existing?.name}"?`)) {
        method = 'POST'; // Backend supports update if ID is sent
        name = existing?.name || "";
      } else {
        const newName = prompt("Enter new template name:");
        if (!newName) return;
        name = newName;
      }
    } else {
      const newName = prompt("Enter template name:");
      if (!newName) return;
      name = newName;
    }

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeTemplateId, name, script: cmd })
      });
      const res = await fetch('/api/remote-commands/scripts');
      setTemplates(await res.json());
      alert("Template saved!");
    } catch (err) {
      alert("Failed to save template.");
    }
  };

  const deleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this template?")) return;
    try {
      await fetch(`/api/remote-commands/scripts/${id}`, { method: 'DELETE' });
      if (activeTemplateId === id) setActiveTemplateId(null);
      const res = await fetch('/api/remote-commands/scripts');
      setTemplates(await res.json());
    } catch (err) {
      alert("Failed to delete template.");
    }
  };

  const handleSchedule = async () => {
    if (!scheduleName || !scheduleTime) return alert("Please enter name and time");
    try {
      await fetch('/api/remote-commands/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scheduleName,
          script: cmd,
          target_device_ids: selected,
          next_run_at: scheduleTime,
        })
      });
      alert("Schedule created!");
      setShowSchedule(false);
    } catch (err) {
      alert("Failed to create schedule.");
    }
  };

  const filteredDevices = devices.filter(d => 
    d.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.ip.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  
  const allFilteredSelected = filteredDevices.length > 0 && filteredDevices.every(d => selected.includes(d.id));

  const toggleAll = () => {
    if (filteredDevices.length === 0) return;
    const filteredIds = filteredDevices.map(d => d.id);
    if (allFilteredSelected) {
      setSelected(s => s.filter(id => !filteredIds.includes(id)));
    } else {
      setSelected(s => Array.from(new Set([...s, ...filteredIds])));
    }
  };

  useEffect(() => {
    let interval: any;
    if (activeExecId && running) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/agent/commands/results?exec_id=${activeExecId}`);
          const data = await res.json();
          
          const newLines = data.logs.map((l: any) => {
            // Time formatting (GMT+8)
            const date = l.updated_at ? new Date(l.updated_at) : new Date();
            const timeStr = date.toLocaleTimeString('en-GB', { 
              timeZone: 'Asia/Singapore',
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            });
            
            let statusDisplay = l.status.toUpperCase();
            if (l.status === 'success') statusDisplay = 'OK';
            if (l.status === 'pending') statusDisplay = 'PENDING';
            if (l.status === 'failed') statusDisplay = 'FAILED';

            const logContent = l.log ? `: ${l.log.substring(0, 100)}` : "";
            return `[${timeStr}] ${l.hostname.padEnd(15)} → ${statusDisplay}${l.status === 'pending' ? '' : logContent}`;
          });

          if (data.is_complete && data.logs.length > 0) {
            setRunning(false);
            setActiveExecId(null);
            
            // Add completion summary like in the deployed app
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-GB', { 
              timeZone: 'Asia/Singapore',
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            });
            const successCount = data.logs.filter((l: any) => l.status === 'success').length;
            newLines.push(`[${timeStr}] ✓ Command completed on ${successCount}/${data.logs.length} selected devices`);
          }
          
          setOutput(newLines);
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeExecId, running]);

  const run = async () => {
    if (!cmd.trim() || selected.length === 0) return;
    setOutput(["Queueing commands on server..."]);
    setRunning(true);
    
    try {
      const res = await fetch('/api/remote-commands/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd === "sc stop CentralDeployAgent && msiexec /i agent.msi /quiet" ? "INTERNAL_PUSH_AGENT" : cmd,
          device_ids: selected,
          admin_user: adminUser,
          admin_pass: adminPass
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setActiveExecId(data.exec_id);
        setOutput(prev => [...prev, "✓ Commands queued. Waiting for agents to poll..."]);
      } else {
        setRunning(false);
        setOutput(["Error: " + data.error]);
      }
    } catch (err) {
      console.error(err);
      setOutput(["Error: Failed to connect to server"]);
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[50vh]"><Activity className="w-8 h-8 text-primary animate-pulse" /></div>;
  }

  return (
    <div className="p-6 space-y-4 animate-fade-up">
      <PageHeader
        title="Remote Command Center"
        subtitle="Execute commands, scripts, and installers on selected devices"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Device selector */}
        <SectionCard
          title="Select Devices"
          subtitle={`${selected.length} selected`}
          className="lg:col-span-1"
          actions={
            <button onClick={toggleAll} className="text-xs text-primary hover:underline" disabled={filteredDevices.length === 0}>
              {allFilteredSelected ? "Deselect filtered" : "Select filtered"}
            </button>
          }
        >
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
              <input
                type="text"
                placeholder="Search hostname or IP..."
                className="w-full bg-surface-overlay border border-border rounded-md pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="divide-y divide-border max-h-64 overflow-y-auto">
            {filteredDevices.map(d => (
              <label key={d.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface/40 transition-colors">
                <input
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  onChange={() => toggle(d.id)}
                  className="accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-medium text-foreground truncate">{d.hostname}</p>
                  <p className="text-xs text-foreground-muted">{d.ip}</p>
                </div>
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  d.status === "online" ? "bg-success" :
                  d.status === "offline" ? "bg-foreground-subtle" :
                  d.status === "error" ? "bg-danger" : "bg-primary"
                )} />
              </label>
            ))}
          </div>
        </SectionCard>

        {/* Command builder + output */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Command Builder">
            <div className="p-5 space-y-4">
              {/* Presets */}
              <div>
                <p className="text-xs text-foreground-muted mb-2 uppercase tracking-wider font-semibold">Presets</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => setCmd(p.cmd)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-surface-raised transition-all",
                        p.color
                      )}
                    >
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Command input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-foreground-muted uppercase tracking-wider font-semibold">PowerShell Script</p>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button 
                        onClick={() => setShowTemplates(!showTemplates)}
                        className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-primary bg-primary/5 border border-primary/20 rounded hover:bg-primary/10 transition-all font-mono"
                      >
                        <FileCode className="w-3 h-3" /> Templates <ChevronDown className="w-3 h-3" />
                      </button>
                      
                      {showTemplates && (
                        <div className="absolute top-8 right-0 z-20 w-64 bg-surface-overlay border border-border rounded-xl shadow-2xl p-2 animate-in fade-in slide-in-from-top-2">
                          <p className="text-[10px] font-bold text-foreground-muted uppercase p-2 border-b border-border mb-1">PS Templates</p>
                          <div className="max-h-48 overflow-y-auto">
                            {templates.map(t => (
                              <div key={t.id} className="group relative">
                                <button 
                                  onClick={() => { setCmd(t.script); setActiveTemplateId(t.id); setShowTemplates(false); }}
                                  className={cn(
                                    "w-full text-left p-2 hover:bg-primary/10 rounded-lg transition-colors group flex flex-col",
                                    activeTemplateId === t.id && "bg-primary/10"
                                  )}
                                >
                                  <p className="text-xs font-bold truncate group-hover:text-primary">{t.name}</p>
                                  <p className="text-[10px] text-foreground-muted truncate line-clamp-1">{t.description}</p>
                                </button>
                                <button 
                                  onClick={(e) => deleteTemplate(t.id, e)}
                                  className="absolute right-2 top-2 p-1 text-foreground-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            {templates.length === 0 && <p className="text-[10px] text-foreground-subtle p-4 text-center">No templates found</p>}
                          </div>
                        </div>
                      )}
                    </div>

                    <button 
                      onClick={saveTemplate}
                      className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-success bg-success/5 border border-success/20 rounded hover:bg-success/10 transition-all font-mono"
                    >
                      <Save className="w-3 h-3" /> {activeTemplateId ? "Update" : "Save"}
                    </button>

                    <button 
                      onClick={() => setShowSchedule(!showSchedule)}
                      className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-warning bg-warning/5 border border-warning/20 rounded hover:bg-warning/10 transition-all font-mono"
                    >
                      <Clock className="w-3 h-3" /> Schedule
                    </button>
                  </div>
                </div>

                <div className="w-full border border-border rounded-lg overflow-hidden bg-background">
                  <CodeMirror
                    value={cmd}
                    height="200px"
                    theme={vscodeDark}
                    extensions={[sql()]} // Using SQL for basic color keywords, or generic if needed
                    onChange={(value) => setCmd(value)}
                    className="text-sm font-mono h-[200px]"
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      tabSize: 2,
                    }}
                  />
                </div>
              </div>

              {/* Schedule Modal Overlay */}
              {showSchedule && (
                <div className="p-4 bg-surface-raised border border-border rounded-lg space-y-3 animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold flex items-center gap-2"><Clock className="w-3 h-3 text-warning" /> New Schedule</h4>
                    <button onClick={() => setShowSchedule(false)} className="text-foreground-muted hover:text-foreground">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      className="bg-background border border-border p-2 rounded text-xs" 
                      placeholder="Schedule Name"
                      value={scheduleName}
                      onChange={e => setScheduleName(e.target.value)}
                    />
                    <input 
                      type="datetime-local" 
                      className="bg-background border border-border p-2 rounded text-xs"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={handleSchedule}
                    className="w-full py-1.5 bg-warning text-warning-foreground text-[10px] font-bold rounded hover:bg-warning/90 transition-all"
                  >
                    Confirm Schedule
                  </button>
                </div>
              )}

              {/* WMI Credentials */}
              <div className="flex gap-2 p-3 bg-surface border border-border rounded-lg items-center">
                 <p className="text-xs text-foreground-muted font-semibold w-24">WMI Credentials:</p>
                 <input type="text" placeholder="Admin Username" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} className="bg-background border border-border px-2 py-1 rounded text-xs flex-1" title="Required for SMB/WMI remote execution" />
                 <input type="password" placeholder="Admin Password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} className="bg-background border border-border px-2 py-1 rounded text-xs flex-1" />
              </div>

              {/* Run button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={run}
                  disabled={!cmd.trim() || selected.length === 0 || running}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-semibold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {running ? "Executing…" : `Run on ${selected.length} device${selected.length !== 1 ? "s" : ""}`}
                </button>
                {selected.length === 0 && <p className="text-xs text-foreground-muted">Select at least 1 device</p>}
              </div>
            </div>
          </SectionCard>

          {/* Output terminal */}
          <SectionCard title="Output" subtitle="Real-time execution results">
            <div className="bg-background font-mono text-xs p-4 min-h-40 max-h-64 overflow-y-auto rounded-b-lg">
              {output.length === 0 ? (
                <p className="text-foreground-subtle">Ready. Output will appear here after execution.</p>
              ) : (
                output.map((line, i) => (
                  <p
                    key={i}
                    className={cn(
                      "leading-relaxed",
                      line.includes("✓") ? "text-success" :
                      line.includes("ERROR") || line.includes("✗") ? "text-danger" :
                      "text-foreground-muted"
                    )}
                  >
                    {line}
                  </p>
                ))
              )}
              {running && <span className="text-primary animate-pulse-dot">▋</span>}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
