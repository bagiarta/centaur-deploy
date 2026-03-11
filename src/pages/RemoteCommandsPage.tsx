import { useState } from "react";
import { Terminal, Play, RefreshCw, Power, FileCode, Package2 } from "lucide-react";
import { mockDevices } from "@/data/mockData";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";

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
  const [selected, setSelected] = useState<string[]>([]);
  const [cmd, setCmd] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(selected.length === mockDevices.length ? [] : mockDevices.map(d => d.id));

  const run = () => {
    if (!cmd.trim() || selected.length === 0) return;
    setOutput([]);
    setRunning(true);
    fakeOutput.forEach((line, i) => {
      setTimeout(() => {
        setOutput(prev => [...prev, line]);
        if (i === fakeOutput.length - 1) setRunning(false);
      }, (i + 1) * 350);
    });
  };

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
            <button onClick={toggleAll} className="text-xs text-primary hover:underline">
              {selected.length === mockDevices.length ? "Deselect all" : "Select all"}
            </button>
          }
        >
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {mockDevices.map(d => (
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
              <div>
                <p className="text-xs text-foreground-muted mb-1 uppercase tracking-wider font-semibold">Command / Script</p>
                <textarea
                  value={cmd}
                  onChange={e => setCmd(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-mono placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Enter Windows command or PowerShell script..."
                />
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
