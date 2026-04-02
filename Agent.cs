using System;
using System.Net;
using System.Text;
using System.Threading;
using System.IO;
using System.Collections.Generic;
using Microsoft.Win32;

namespace CentaurAgent
{
    class Program
    {
        private static readonly string ServerUrl = "http://192.168.85.30:3001";
        private static readonly string LogFile = "agent_log.txt";

        static void Main(string[] args)
        {
            Log("========================================");
            Log("    CENTAUR DEPLOY AGENT v1.1.0         ");
            Log("========================================");
            
            string hostname = Environment.MachineName;
            string os = Environment.OSVersion.ToString();
            string ip = GetLocalIPAddress();

            Log("Hostname: " + hostname);
            Log("IP: " + ip);
            Log("Server: " + ServerUrl);

            try
            {
                // Cleanup previous self-update files if any
                try {
                    string oldFile = System.Reflection.Assembly.GetExecutingAssembly().Location + ".old";
                    if (File.Exists(oldFile)) File.Delete(oldFile);
                } catch {}

                // 1. Register/Heartbeat
                RegisterDevice(hostname, ip, os);

                // 2. Poll for Pending Deployments
                PollDeployments(hostname);

                // 3. Sync Software Inventory
                SyncSoftwareInventory(hostname);
            }
            catch (Exception ex)
            {
                Log("CRITICAL ERROR: " + ex.Message);
            }
            
            Log("Agent cycle completed.");
        }

        static void RegisterDevice(string hostname, string ip, string os)
        {
            try {
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    string json = string.Format("{{\"hostname\":\"{0}\",\"ip\":\"{1}\",\"os\":\"{2}\",\"status\":\"online\"}}", 
                        hostname, ip, os);
                    
                    Log("Sending heartbeat...");
                    client.UploadString(ServerUrl + "/api/devices/register", "POST", json);
                    Log("Heartbeat SUCCESS");
                }
            } catch (Exception ex) {
                Log("Registration failed: " + ex.Message);
            }
        }

        static void PollDeployments(string hostname)
        {
            try {
                using (WebClient client = new WebClient())
                {
                    Log("Checking for pending tasks...");
                    string jsonResponse = client.DownloadString(ServerUrl + "/api/agent/pending?hostname=" + hostname);
                    
                    // Simple JSON parsing (since we don't have NewtonSoft.Json in a raw CSC compile easily)
                    // We expect an array: [ { "deployment_id": "...", "device_id": "...", "pkg_name": "...", "file_path": "...", "target_path": "..." } ]
                    if (jsonResponse.Contains("deployment_id")) {
                        Log("Pending task(s) found!");
                        ProcessTasks(jsonResponse, hostname);
                    } else {
                        Log("No pending tasks.");
                    }
                }
            } catch (Exception ex) {
                Log("Polling failed: " + ex.Message);
            }
        }

        static void ProcessTasks(string json, string hostname)
        {
            // Very primitive JSON extractor for a list of objects
            // Since we know only basic strings are returned:
            string[] items = json.Split(new string[] { "},{" }, StringSplitOptions.None);
            foreach (string item in items)
            {
                string depId = ExtractValue(item, "deployment_id");
                string devId = ExtractValue(item, "device_id");
                string pkgName = ExtractValue(item, "pkg_name");
                string fileName = ExtractValue(item, "file_path"); // This is actually the filename in our schema
                string targetPath = ExtractValue(item, "target_path");

                if (!string.IsNullOrEmpty(depId)) {
                    ExecuteDeployment(depId, devId, pkgName, fileName, targetPath);
                }
            }
        }

        static void ExecuteDeployment(string depId, string devId, string pkgName, string fileName, string targetDir)
        {
            Log("Starting deployment: " + pkgName);
            ReportStatus(depId, devId, "running", 10, "Initializing download...");

            try {
                if (!Directory.Exists(targetDir)) {
                    Directory.CreateDirectory(targetDir);
                }

                string downloadUrl = ServerUrl + "/api/packages/download/" + fileName;
                string localFile = Path.Combine(targetDir, fileName);
                string currentExe = System.Reflection.Assembly.GetExecutingAssembly().Location;

                // Check if we are updating ourselves
                bool isSelfUpdate = localFile.Equals(currentExe, StringComparison.OrdinalIgnoreCase);

                if (isSelfUpdate)
                {
                    Log("Self-update detected. Using deferred batch launcher...");
                    ReportStatus(depId, devId, "running", 30, "Downloading new version to temp...");

                    // 1. Download to a temp filename so there's no lock conflict
                    string tempFile = localFile + ".new";
                    using (WebClient client = new WebClient())
                    {
                        client.DownloadFile(downloadUrl, tempFile);
                    }
                    Log("New agent downloaded to: " + tempFile);

                    // 2. Write a batch script that:
                    //    - Waits 3 seconds (so this process has time to fully exit)
                    //    - Copies the new file over the old one
                    //    - Deletes itself
                    string batchPath = localFile + "_update.cmd";
                    string batchContent = string.Format(
                        "@echo off\r\n" +
                        "ping 127.0.0.1 -n 4 > nul\r\n" +
                        "move /y \"{0}\" \"{1}\"\r\n" +
                        "del \"%~f0\"\r\n",
                        tempFile, localFile
                    );
                    File.WriteAllText(batchPath, batchContent);

                    // 3. Launch the batch detached (hidden window, completely separate process)
                    System.Diagnostics.ProcessStartInfo psi = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c \"" + batchPath + "\"",
                        CreateNoWindow = true,
                        WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                        UseShellExecute = false
                    };
                    System.Diagnostics.Process.Start(psi);

                    Log("Update batch launched. Reporting success and exiting...");
                    ReportStatus(depId, devId, "success", 100, "Self-update queued. Agent will restart on next cycle.");
                    
                    // 4. Exit so Windows releases the file lock — the batch will replace the file
                    Environment.Exit(0);
                }
                else
                {
                    // Normal (non-self) deployment
                    Log("Downloading from: " + downloadUrl);
                    using (WebClient client = new WebClient())
                    {
                        ReportStatus(depId, devId, "running", 30, "Downloading file...");
                        client.DownloadFile(downloadUrl, localFile);
                    }

                    Log("Download complete. File saved to: " + localFile);
                    ReportStatus(depId, devId, "success", 100, "Successfully updated file: " + fileName);
                }
            } catch (Exception ex) {
                Log("Deployment FAILED: " + ex.Message);
                ReportStatus(depId, devId, "failed", 0, "Error: " + ex.Message);
            }
        }

        static void ReportStatus(string depId, string devId, string status, int progress, string logMsg)
        {
            try {
                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    string json = string.Format("{{\"deployment_id\":\"{0}\",\"device_id\":\"{1}\",\"status\":\"{2}\",\"progress\":{3},\"log\":\"{4}\"}}", 
                        depId, devId, status, progress, logMsg.Replace("\"", "'"));
                    
                    client.UploadString(ServerUrl + "/api/agent/deploy-status", "POST", json);
                }
            } catch (Exception ex) {
                Log("Failed to report status: " + ex.Message);
            }
        }

        static string ExtractValue(string json, string key)
        {
            string search = "\"" + key + "\":\"";
            int start = json.IndexOf(search);
            if (start == -1) return "";
            start += search.Length;
            int end = json.IndexOf("\"", start);
            if (end == -1) return "";
            return json.Substring(start, end - start);
        }

        static string GetLocalIPAddress()
        {
            try {
                IPAddress[] addresses = Dns.GetHostAddresses(Dns.GetHostName());
                
                // 1. Try to find an RFC 1918 Private IPv4 (Highest Priority)
                foreach (IPAddress address in addresses)
                {
                    if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        string ip = address.ToString();
                        if (IsRfc1918IP(ip)) return ip;
                    }
                }

                // 2. Try to find a Link-Local / APIPA address (Second Priority)
                foreach (IPAddress address in addresses)
                {
                    if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        string ip = address.ToString();
                        if (ip.StartsWith("169.254.")) return ip;
                    }
                }

                // 3. Fallback to any IPv4 if no private address found
                foreach (IPAddress address in addresses)
                {
                    if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        return address.ToString();
                    }
                }
            } catch {}
            return "127.0.0.1";
        }

        static bool IsRfc1918IP(string ip)
        {
            try {
                string[] parts = ip.Split('.');
                if (parts.Length != 4) return false;
                int first = int.Parse(parts[0]);
                int second = int.Parse(parts[1]);
                
                // RFC 1918 Ranges
                if (first == 10) return true;
                if (first == 172 && (second >= 16 && second <= 31)) return true;
                if (first == 192 && second == 168) return true;
                
                return false;
            } catch { return false; }
        }

        static void Log(string msg)
        {
            string line = string.Format("[{0}] {1}", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), msg);
            Console.WriteLine(line);
            try {
                File.AppendAllText(LogFile, line + Environment.NewLine);
            } catch {}
        }
        static string EscapeJson(string str)
        {
            if (string.IsNullOrEmpty(str)) return "";
            return str.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "").Replace("\r", "");
        }

        static void SyncSoftwareInventory(string hostname)
        {
            try
            {
                string syncFile = "last_inventory.txt";
                if (File.Exists(syncFile))
                {
                    DateTime lastSync = File.GetLastWriteTime(syncFile);
                    if (DateTime.Now.Subtract(lastSync).TotalHours < 24)
                    {
                        Log("Skipping Software Inventory Sync (last sync was less than 24 hours ago).");
                        return;
                    }
                }

                Log("Starting Software Inventory Sync...");
                HashSet<string> uniqueApps = new HashSet<string>();
                StringBuilder sb = new StringBuilder();
                sb.Append("{\"device_id\":\"").Append(hostname).Append("\",\"software\":[");
                int count = 0;

                string[] paths = {
                    @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                    @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
                };

                foreach (string path in paths)
                {
                    using (RegistryKey baseKey = Registry.LocalMachine.OpenSubKey(path))
                    {
                        if (baseKey != null)
                        {
                            foreach (string subName in baseKey.GetSubKeyNames())
                            {
                                using (RegistryKey subKey = baseKey.OpenSubKey(subName))
                                {
                                    if (subKey != null)
                                    {
                                        string name = subKey.GetValue("DisplayName") as string;
                                        if (!string.IsNullOrEmpty(name))
                                        {
                                            if (uniqueApps.Add(name))
                                            {
                                                string version = subKey.GetValue("DisplayVersion") as string;
                                                string publisher = subKey.GetValue("Publisher") as string;
                                                string installDate = subKey.GetValue("InstallDate") as string;
                                                
                                                if (count > 0) sb.Append(",");
                                                sb.Append("{\"name\":\"").Append(EscapeJson(name))
                                                  .Append("\",\"version\":\"").Append(EscapeJson(version))
                                                  .Append("\",\"publisher\":\"").Append(EscapeJson(publisher))
                                                  .Append("\",\"install_date\":\"").Append(EscapeJson(installDate))
                                                  .Append("\"}");
                                                count++;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                sb.Append("]}");

                using (WebClient client = new WebClient())
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    Log("Uploading software inventory (" + count + " items)...");
                    client.UploadString(ServerUrl + "/api/agent/software-inventory", "POST", sb.ToString());
                    Log("Software Inventory Sync SUCCESS.");
                    File.WriteAllText(syncFile, DateTime.Now.ToString());
                }
            }
            catch (Exception ex)
            {
                Log("Software Inventory Sync Failed: " + ex.Message);
            }
        }
    }
}
