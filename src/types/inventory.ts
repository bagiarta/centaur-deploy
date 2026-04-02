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
