// Direct test of notification function
import { initDb } from './config/db.js';

// Simulate the notification check
async function testNotificationDirect() {
  console.log('🧪 Testing notification function directly\n');
  
  try {
    // Initialize database first
    console.log('Step 1: Initializing database...');
    await initDb();
    console.log('✅ Database initialized');
    console.log('');
    
    // Import the function
    console.log('Step 2: Importing function...');
    const { checkAndSendNotifications } = await import('./utils/cctvPollingService.js');
    console.log('✅ Function imported successfully');
    console.log('Function type:', typeof checkAndSendNotifications);
    console.log('');
    
    // Call the function
    console.log('Step 3: Calling checkAndSendNotifications()...');
    console.log('---'.repeat(30));
    await checkAndSendNotifications();
    console.log('---'.repeat(30));
    console.log('');
    
    console.log('✅ Test completed successfully!');
    console.log('📬 Check your Discord channel for notifications');
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Test failed!');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testNotificationDirect();
