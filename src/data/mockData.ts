// ── Central Deploy Ultimate — Mock Data & Types ──────────

export type DeviceStatus = "online" | "offline" | "deploying" | "error" | "idle";
export type DeployStatus = "pending" | "running" | "success" | "failed" | "scheduled" | "cancelled";
export type AgentJobStatus = "queued" | "connecting" | "installing" | "success" | "failed" | "skipped";

export interface Device {
  id: string;
  hostname: string;
  ip: string;
  os_version: string;
  cpu: string;
  ram: string;
  disk: string;
  agent_version: string;
  status: DeviceStatus;
  last_seen: string;
  group_ids: string[];
}

export interface DeviceGroup {
  id: string;
  name: string;
  device_count: number;
  color: string;
}

export interface Package {
  id: string;
  name: string;
  version: string;
  checksum: string;
  file_path: string;
  size: string;
  type: "exe" | "msi" | "dll" | "zip" | "config" | "json" | "xml";
  uploaded_at: string;
  uploaded_by: string;
}

export interface Deployment {
  id: string;
  package_id: string;
  package_name: string;
  package_version: string;
  target_path: string;
  schedule_time: string | null;
  created_by: string;
  created_at: string;
  status: DeployStatus;
  total_targets: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
}

export interface DeploymentTarget {
  deployment_id: string;
  device_id: string;
  hostname: string;
  ip: string;
  status: DeployStatus;
  log: string;
  updated_at: string;
  progress: number;
}

export interface AgentInstallJob {
  id: string;
  created_at: string;
  created_by: string;
  ip_range: string;
  total: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
}

export interface AgentInstallTarget {
  job_id: string;
  device_ip: string;
  hostname: string;
  status: AgentJobStatus;
  log: string;
  updated_at: string;
}

// ── Mock Devices ─────────────────────────────────────────
export const mockDevices: Device[] = [
  { id: "d1",  hostname: "WORKSTATION-01", ip: "192.168.1.11", os_version: "Windows 11 22H2", cpu: "Intel i7-12700", ram: "32 GB", disk: "512 GB SSD", agent_version: "2.4.1", status: "online",    last_seen: "2 sec ago",  group_ids: ["g1","g3"] },
  { id: "d2",  hostname: "WORKSTATION-02", ip: "192.168.1.12", os_version: "Windows 11 22H2", cpu: "Intel i5-12400", ram: "16 GB", disk: "256 GB SSD", agent_version: "2.4.1", status: "online",    last_seen: "5 sec ago",  group_ids: ["g1"] },
  { id: "d3",  hostname: "WORKSTATION-03", ip: "192.168.1.13", os_version: "Windows 10 21H2", cpu: "Intel i5-10400", ram: "16 GB", disk: "256 GB SSD", agent_version: "2.3.9", status: "deploying", last_seen: "1 sec ago",  group_ids: ["g1","g2"] },
  { id: "d4",  hostname: "SERVER-APP-01",  ip: "192.168.1.20", os_version: "Windows Server 2022", cpu: "Xeon E-2356G", ram: "64 GB", disk: "2 TB SSD",  agent_version: "2.4.1", status: "online",    last_seen: "3 sec ago",  group_ids: ["g2"] },
  { id: "d5",  hostname: "SERVER-APP-02",  ip: "192.168.1.21", os_version: "Windows Server 2022", cpu: "Xeon E-2356G", ram: "64 GB", disk: "2 TB SSD",  agent_version: "2.4.1", status: "online",    last_seen: "8 sec ago",  group_ids: ["g2"] },
  { id: "d6",  hostname: "LAPTOP-DEV-01",  ip: "192.168.1.30", os_version: "Windows 11 23H2", cpu: "Intel i7-1365U", ram: "32 GB", disk: "1 TB SSD",  agent_version: "2.4.0", status: "online",    last_seen: "12 sec ago", group_ids: ["g3"] },
  { id: "d7",  hostname: "LAPTOP-DEV-02",  ip: "192.168.1.31", os_version: "Windows 11 23H2", cpu: "AMD Ryzen 7 7730U", ram: "16 GB", disk: "512 GB SSD", agent_version: "2.4.1", status: "idle",  last_seen: "1 min ago",  group_ids: ["g3"] },
  { id: "d8",  hostname: "KIOSK-LOBBY-01", ip: "192.168.1.50", os_version: "Windows 10 LTSC", cpu: "Intel Celeron J4125", ram: "4 GB", disk: "64 GB eMMC", agent_version: "2.3.8", status: "error",  last_seen: "5 min ago",  group_ids: ["g4"] },
  { id: "d9",  hostname: "KIOSK-LOBBY-02", ip: "192.168.1.51", os_version: "Windows 10 LTSC", cpu: "Intel Celeron J4125", ram: "4 GB", disk: "64 GB eMMC", agent_version: "2.4.1", status: "online",    last_seen: "30 sec ago", group_ids: ["g4"] },
  { id: "d10", hostname: "WORKSTATION-04", ip: "192.168.1.14", os_version: "Windows 11 22H2", cpu: "Intel i5-12400", ram: "8 GB",  disk: "256 GB SSD", agent_version: "2.4.1", status: "offline",   last_seen: "2 hrs ago",  group_ids: ["g1"] },
  { id: "d11", hostname: "WORKSTATION-05", ip: "192.168.1.15", os_version: "Windows 10 22H2", cpu: "Intel i3-10100", ram: "8 GB",  disk: "128 GB SSD", agent_version: "2.4.1", status: "online",    last_seen: "4 sec ago",  group_ids: ["g1"] },
  { id: "d12", hostname: "SERVER-DB-01",   ip: "192.168.1.25", os_version: "Windows Server 2019", cpu: "Xeon Gold 5120", ram: "128 GB", disk: "10 TB RAID", agent_version: "2.4.1", status: "online", last_seen: "2 sec ago", group_ids: ["g2"] },
];

// ── Mock Groups ──────────────────────────────────────────
export const mockGroups: DeviceGroup[] = [
  { id: "g1", name: "Workstations",  device_count: 5,  color: "primary" },
  { id: "g2", name: "Servers",       device_count: 3,  color: "info" },
  { id: "g3", name: "Dev Laptops",   device_count: 2,  color: "success" },
  { id: "g4", name: "Kiosk Devices", device_count: 2,  color: "warning" },
];

// ── Mock Packages ────────────────────────────────────────
export const mockPackages: Package[] = [
  { id: "p1", name: "CRM Suite",         version: "4.2.1", checksum: "sha256:a1b2c3d4e5f6...", file_path: "/repo/crm-suite-4.2.1.msi",      size: "245 MB", type: "msi",    uploaded_at: "2025-03-08 09:14", uploaded_by: "admin" },
  { id: "p2", name: "Security Patch KB5034441", version: "1.0.0", checksum: "sha256:f7e8d9c0a1b2...", file_path: "/repo/kb5034441.msi",      size: "87 MB",  type: "msi",    uploaded_at: "2025-03-07 14:22", uploaded_by: "admin" },
  { id: "p3", name: "Office Config Pack", version: "2.1.0", checksum: "sha256:b3c4d5e6f7a8...", file_path: "/repo/office-config-2.1.0.zip",  size: "12 MB",  type: "zip",    uploaded_at: "2025-03-06 11:05", uploaded_by: "jsmith" },
  { id: "p4", name: "VPN Client",         version: "3.9.2", checksum: "sha256:c5d6e7f8a9b0...", file_path: "/repo/vpnclient-3.9.2.exe",      size: "58 MB",  type: "exe",    uploaded_at: "2025-03-05 16:48", uploaded_by: "admin" },
  { id: "p5", name: "App Settings JSON",  version: "1.4.0", checksum: "sha256:d7e8f9a0b1c2...", file_path: "/repo/appsettings-1.4.0.json",   size: "4 KB",   type: "json",   uploaded_at: "2025-03-04 10:30", uploaded_by: "jsmith" },
  { id: "p6", name: "Monitoring Agent",   version: "2.0.1", checksum: "sha256:e9f0a1b2c3d4...", file_path: "/repo/mon-agent-2.0.1.exe",      size: "18 MB",  type: "exe",    uploaded_at: "2025-03-03 08:15", uploaded_by: "admin" },
  { id: "p7", name: "Firewall Rules XML", version: "1.1.3", checksum: "sha256:f1a2b3c4d5e6...", file_path: "/repo/fw-rules-1.1.3.xml",       size: "128 KB", type: "xml",    uploaded_at: "2025-03-01 13:00", uploaded_by: "lbrown" },
];

// ── Mock Deployments ─────────────────────────────────────
export const mockDeployments: Deployment[] = [
  { id: "dep1", package_id: "p2", package_name: "Security Patch KB5034441", package_version: "1.0.0", target_path: "C:\\Windows\\System32", schedule_time: null,             created_by: "admin",  created_at: "2025-03-09 10:00", status: "running",   total_targets: 10, success_count: 6,  failed_count: 0, pending_count: 4 },
  { id: "dep2", package_id: "p1", package_name: "CRM Suite",                package_version: "4.2.1", target_path: "C:\\Program Files\\CRM", schedule_time: null,             created_by: "admin",  created_at: "2025-03-08 09:30", status: "success",   total_targets: 12, success_count: 12, failed_count: 0, pending_count: 0 },
  { id: "dep3", package_id: "p4", package_name: "VPN Client",               package_version: "3.9.2", target_path: "C:\\Program Files\\VPN", schedule_time: "2025-03-10 03:00", created_by: "jsmith", created_at: "2025-03-09 08:00", status: "scheduled", total_targets: 8,  success_count: 0,  failed_count: 0, pending_count: 8 },
  { id: "dep4", package_id: "p3", package_name: "Office Config Pack",       package_version: "2.1.0", target_path: "C:\\ProgramData\\Office", schedule_time: null,            created_by: "jsmith", created_at: "2025-03-07 15:00", status: "failed",    total_targets: 5,  success_count: 3,  failed_count: 2, pending_count: 0 },
  { id: "dep5", package_id: "p6", package_name: "Monitoring Agent",         package_version: "2.0.1", target_path: "C:\\Program Files\\Monitor", schedule_time: null,         created_by: "admin",  created_at: "2025-03-06 12:00", status: "success",   total_targets: 3,  success_count: 3,  failed_count: 0, pending_count: 0 },
];

// ── Mock Deployment Targets ──────────────────────────────
export const mockDeploymentTargets: DeploymentTarget[] = [
  { deployment_id: "dep1", device_id: "d1",  hostname: "WORKSTATION-01", ip: "192.168.1.11", status: "success",  log: "Download OK. Verify OK. Install OK. Service restarted.", updated_at: "09:04", progress: 100 },
  { deployment_id: "dep1", device_id: "d2",  hostname: "WORKSTATION-02", ip: "192.168.1.12", status: "success",  log: "Download OK. Verify OK. Install OK.", updated_at: "09:05", progress: 100 },
  { deployment_id: "dep1", device_id: "d3",  hostname: "WORKSTATION-03", ip: "192.168.1.13", status: "running",  log: "Downloading... 74%", updated_at: "09:08", progress: 74 },
  { deployment_id: "dep1", device_id: "d4",  hostname: "SERVER-APP-01",  ip: "192.168.1.20", status: "success",  log: "Download OK. Verify OK. Install OK.", updated_at: "09:06", progress: 100 },
  { deployment_id: "dep1", device_id: "d5",  hostname: "SERVER-APP-02",  ip: "192.168.1.21", status: "success",  log: "Download OK. Verify OK. Install OK.", updated_at: "09:07", progress: 100 },
  { deployment_id: "dep1", device_id: "d6",  hostname: "LAPTOP-DEV-01",  ip: "192.168.1.30", status: "running",  log: "Waiting to download...", updated_at: "09:08", progress: 12 },
  { deployment_id: "dep1", device_id: "d7",  hostname: "LAPTOP-DEV-02",  ip: "192.168.1.31", status: "pending",  log: "Queued", updated_at: "09:00", progress: 0 },
  { deployment_id: "dep1", device_id: "d9",  hostname: "KIOSK-LOBBY-02", ip: "192.168.1.51", status: "success",  log: "Download OK. Install OK.", updated_at: "09:03", progress: 100 },
  { deployment_id: "dep1", device_id: "d11", hostname: "WORKSTATION-05", ip: "192.168.1.15", status: "pending",  log: "Queued", updated_at: "09:00", progress: 0 },
  { deployment_id: "dep1", device_id: "d12", hostname: "SERVER-DB-01",   ip: "192.168.1.25", status: "pending",  log: "Queued", updated_at: "09:00", progress: 0 },
];

// ── Mock Agent Install Jobs ──────────────────────────────
export const mockAgentJobs: AgentInstallJob[] = [
  { id: "aj1", created_at: "2025-03-09 08:30", created_by: "admin",  ip_range: "192.168.1.1–254", total: 24, success_count: 20, failed_count: 2, pending_count: 2 },
  { id: "aj2", created_at: "2025-03-05 14:00", created_by: "jsmith", ip_range: "192.168.2.1–50",  total: 15, success_count: 15, failed_count: 0, pending_count: 0 },
];

export const mockAgentTargets: AgentInstallTarget[] = [
  { job_id: "aj1", device_ip: "192.168.1.11", hostname: "WORKSTATION-01", status: "success",    log: "Connected via WMI. MSI pushed. Service started.", updated_at: "08:34" },
  { job_id: "aj1", device_ip: "192.168.1.12", hostname: "WORKSTATION-02", status: "success",    log: "Connected via WMI. MSI pushed. Service started.", updated_at: "08:35" },
  { job_id: "aj1", device_ip: "192.168.1.13", hostname: "WORKSTATION-03", status: "success",    log: "Connected via WMI. MSI pushed. Service started.", updated_at: "08:35" },
  { job_id: "aj1", device_ip: "192.168.1.14", hostname: "WORKSTATION-04", status: "failed",     log: "ERROR: WMI access denied. Check firewall rules.",  updated_at: "08:36" },
  { job_id: "aj1", device_ip: "192.168.1.20", hostname: "SERVER-APP-01",  status: "success",    log: "Connected via WMI. MSI pushed. Service started.", updated_at: "08:37" },
  { job_id: "aj1", device_ip: "192.168.1.50", hostname: "KIOSK-LOBBY-01", status: "failed",     log: "ERROR: Host unreachable (port 445 closed).",       updated_at: "08:38" },
  { job_id: "aj1", device_ip: "192.168.1.51", hostname: "KIOSK-LOBBY-02", status: "success",    log: "Connected via WMI. MSI pushed. Service started.", updated_at: "08:39" },
  { job_id: "aj1", device_ip: "192.168.1.30", hostname: "LAPTOP-DEV-01",  status: "installing", log: "MSI installing... (step 3 of 5)",                  updated_at: "08:40" },
  { job_id: "aj1", device_ip: "192.168.1.31", hostname: "LAPTOP-DEV-02",  status: "queued",     log: "Waiting...",                                       updated_at: "08:30" },
];

export const mockActivityLog = [
  { time: "09:08", user: "system",  action: "Deployment dep1 — WORKSTATION-03 downloading (74%)" },
  { time: "09:07", user: "system",  action: "Deployment dep1 — SERVER-APP-02 installed successfully" },
  { time: "09:06", user: "system",  action: "Deployment dep1 — SERVER-APP-01 installed successfully" },
  { time: "09:05", user: "system",  action: "Deployment dep1 — WORKSTATION-02 installed successfully" },
  { time: "09:04", user: "system",  action: "Deployment dep1 — WORKSTATION-01 installed successfully" },
  { time: "09:03", user: "system",  action: "Deployment dep1 — KIOSK-LOBBY-02 installed successfully" },
  { time: "09:00", user: "admin",   action: "Started deployment dep1 (Security Patch KB5034441) to 10 devices" },
  { time: "08:42", user: "admin",   action: "Package 'Security Patch KB5034441 v1.0.0' uploaded" },
  { time: "08:40", user: "system",  action: "Agent install job aj1 — LAPTOP-DEV-01 installing" },
  { time: "08:39", user: "system",  action: "Agent install job aj1 — KIOSK-LOBBY-02 success" },
  { time: "08:38", user: "system",  action: "Agent install job aj1 — KIOSK-LOBBY-01 FAILED (port 445 closed)" },
  { time: "08:30", user: "admin",   action: "Started agent install job aj1 for range 192.168.1.1–254" },
];
