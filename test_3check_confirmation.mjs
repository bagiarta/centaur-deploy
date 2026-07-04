/**
 * Test Script: 3-Check Confirmation Logic
 * 
 * This script tests the new notification logic that requires 3 consecutive
 * status checks with the same result before sending a notification.
 * 
 * Timeline:
 * - Check 1: Device goes offline → No notification (waiting for confirmation)
 * - Check 2: Device still offline → No notification (waiting for confirmation)
 * - Check 3: Device still offline → SEND NOTIFICATION (confirmed!)
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

// Simulate 3 consecutive quick checks
async function simulateQuickChecks() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('TEST: 3-Check Confirmation Logic');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  console.log('This test will trigger 3 manual polls to simulate the quick check cycle:');
  console.log('');
  console.log('Timeline:');
  console.log('  1. First check  → Status detected, no notification (need confirmation)');
  console.log('  2. Second check → Status same, no notification (need confirmation)');
  console.log('  3. Third check  → Status same, NOTIFICATION SENT (confirmed!)');
  console.log('');
  
  // Check 1
  console.log('─────────────────────────────────────────────────────────────');
  console.log('CHECK 1: Triggering first manual poll...');
  console.log('─────────────────────────────────────────────────────────────');
  const response1 = await fetch(`${API_BASE}/api/cctv/poll/trigger`, {
    method: 'POST'
  });
  const result1 = await response1.json();
  console.log('Result:', result1);
  console.log('⏳ Waiting 5 seconds before check 2...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('');
  
  // Check 2
  console.log('─────────────────────────────────────────────────────────────');
  console.log('CHECK 2: Triggering second manual poll...');
  console.log('─────────────────────────────────────────────────────────────');
  const response2 = await fetch(`${API_BASE}/api/cctv/poll/trigger`, {
    method: 'POST'
  });
  const result2 = await response2.json();
  console.log('Result:', result2);
  console.log('⏳ Waiting 5 seconds before check 3...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('');
  
  // Check 3
  console.log('─────────────────────────────────────────────────────────────');
  console.log('CHECK 3: Triggering third manual poll...');
  console.log('─────────────────────────────────────────────────────────────');
  const response3 = await fetch(`${API_BASE}/api/cctv/poll/trigger`, {
    method: 'POST'
  });
  const result3 = await response3.json();
  console.log('Result:', result3);
  console.log('');
  
  console.log('─────────────────────────────────────────────────────────────');
  console.log('Now manually trigger notification check to see if it sends...');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
  console.log('The notification system should now:');
  console.log('  ✅ Send notification if status was consistent for 3 checks');
  console.log('  ⏳ Wait if status was inconsistent (e.g., online → offline → online)');
  console.log('');
  console.log('Check your Discord channel for the notification!');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Test completed!');
  console.log('═══════════════════════════════════════════════════════════════');
}

// Run the test
simulateQuickChecks().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
