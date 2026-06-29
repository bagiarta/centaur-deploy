<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Add indexes for performance
        $indexes = [
            // Devices indexes
            'devices_ip_port_idx' => 'CREATE INDEX devices_ip_port_idx ON devices(ip_address, port)',
            'devices_status_idx' => 'CREATE INDEX devices_status_idx ON devices(status, is_active)',
            'devices_location_idx' => 'CREATE INDEX devices_location_idx ON devices(location_id, is_active)',
            'devices_vendor_type_idx' => 'CREATE INDEX devices_vendor_type_idx ON devices(vendor, device_type)',
            'devices_last_poll_idx' => 'CREATE INDEX devices_last_poll_idx ON devices(last_poll)',
            
            // Channels indexes
            'channels_device_status_idx' => 'CREATE INDEX channels_device_status_idx ON device_channels(device_id, status)',
            'channels_status_idx' => 'CREATE INDEX channels_status_idx ON device_channels(status, is_enabled)',
            
            // Storage indexes
            'storage_device_idx' => 'CREATE INDEX storage_device_idx ON device_storage(device_id, status)',
            'storage_status_idx' => 'CREATE INDEX storage_status_idx ON device_storage(status)',
            'storage_usage_idx' => 'CREATE INDEX storage_usage_idx ON device_storage(usage_percentage)',
            
            // Logs indexes
            'logs_device_time_idx' => 'CREATE INDEX logs_device_time_idx ON monitoring_logs(device_id, created_at)',
            'logs_type_event_idx' => 'CREATE INDEX logs_type_event_idx ON monitoring_logs(log_type, event_type)',
            'logs_severity_idx' => 'CREATE INDEX logs_severity_idx ON monitoring_logs(severity, is_resolved)',
            
            // Notifications indexes
            'notif_channel_idx' => 'CREATE INDEX notif_channel_idx ON notification_channels(type, is_active)',
        ];

        foreach ($indexes as $indexName => $query) {
            try {
                DB::statement("DROP INDEX IF EXISTS {$indexName}");
                DB::statement($query);
                echo "Created index: {$indexName}\n";
            } catch (\Exception $e) {
                echo "Index {$indexName} creation skipped: " . $e->getMessage() . "\n";
            }
        }
    }

    public function down(): void
    {
        $indexes = [
            'devices_ip_port_idx', 'devices_status_idx', 'devices_location_idx',
            'devices_vendor_type_idx', 'devices_last_poll_idx', 'channels_device_status_idx',
            'channels_status_idx', 'storage_device_idx', 'storage_status_idx',
            'storage_usage_idx', 'logs_device_time_idx', 'logs_type_event_idx',
            'logs_severity_idx', 'notif_channel_idx'
        ];

        foreach ($indexes as $indexName) {
            try {
                DB::statement("DROP INDEX IF EXISTS {$indexName}");
                echo "Dropped index: {$indexName}\n";
            } catch (\Exception $e) {
                echo "Index {$indexName} drop skipped: " . $e->getMessage() . "\n";
            }
        }
    }
};