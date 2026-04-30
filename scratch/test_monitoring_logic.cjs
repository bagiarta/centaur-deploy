// Verification script for smart monitoring logic (v2 - Silent Offline)
// Mock data and checks to ensure the conditional alerting vs status update works

const groupsMap = {
  'g1': 'workstations',
  'g2': 'servers',
  'g3': 'pos offline',
  'g4': 'pos online',
  'g5': 'core networking'
};

function checkActions(hostname, group_ids, currentHour) {
  const isLateNight = currentHour >= 23 || currentHour < 7;
  const gids = (group_ids || "").split(',').map((s) => s.trim());
  
  const isPriority = gids.some((gid) => {
    if (gid === 'g2') return true; // Servers
    const gName = groupsMap[gid] || "";
    return gName.includes('server') || gName.includes('network') || gName.includes('router');
  });

  // Action 1: Status Update to Offline (Always happens)
  const statusUpdate = true;

  // Action 2: Alert & Log (Priority or Operating Hours)
  let alertAndLog = false;
  if (isPriority || !isLateNight) {
    alertAndLog = true;
  }

  return { statusUpdate, alertAndLog };
}

const testCases = [
  { name: 'Server at 14:00', groups: 'g2', hour: 14, expStatus: true, expAlert: true },
  { name: 'Server at 01:00 AM', groups: 'g2', hour: 1, expStatus: true, expAlert: true },
  { name: 'POS at 14:00', groups: 'g4', hour: 14, expStatus: true, expAlert: true },
  { name: 'POS at 01:00 AM (Silent)', groups: 'g4', hour: 1, expStatus: true, expAlert: false },
  { name: 'Network at 01:00 AM', groups: 'g5', hour: 1, expStatus: true, expAlert: true },
  { name: 'Workstation at 23:30 (Silent)', groups: 'g1', hour: 23, expStatus: true, expAlert: false }
];

console.log("Running Monitoring Logic Tests (v2 - Silent Offline)...");
testCases.forEach(tc => {
  const res = checkActions(tc.name, tc.groups, tc.hour);
  const statusMatch = res.statusUpdate === tc.expStatus;
  const alertMatch = res.alertAndLog === tc.expAlert;
  
  const pass = (statusMatch && alertMatch) ? "✅ PASS" : "❌ FAIL";
  console.log(`${pass} | ${tc.name.padEnd(30)} | StatusUpdate: ${res.statusUpdate} | Alert: ${res.alertAndLog}`);
});
