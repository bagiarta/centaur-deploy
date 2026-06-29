<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Seed Roles if empty
        $rolesCount = DB::table('roles')->count();
        if ($rolesCount === 0) {
            DB::table('roles')->insert([
                [
                    'name' => 'admin',
                    'display_name' => 'Administrator',
                    'description' => 'Full system access',
                    'permissions' => json_encode([
                        'devices:read', 'devices:write', 'devices:delete',
                        'monitoring:read', 'notifications:manage', 'settings:manage'
                    ]),
                    'created_at' => now(),
                    'updated_at' => now()
                ],
                [
                    'name' => 'operator',
                    'display_name' => 'Operator',
                    'description' => 'Device monitoring and basic operations',
                    'permissions' => json_encode([
                        'devices:read', 'monitoring:read', 'notifications:read'
                    ]),
                    'created_at' => now(),
                    'updated_at' => now()
                ],
                [
                    'name' => 'viewer',
                    'display_name' => 'Viewer',
                    'description' => 'Read-only access to monitoring',
                    'permissions' => json_encode([
                        'devices:read', 'monitoring:read'
                    ]),
                    'created_at' => now(),
                    'updated_at' => now()
                ]
            ]);
        }

        // Seed Locations if empty
        $locationsCount = DB::table('locations')->count();
        if ($locationsCount === 0) {
            DB::table('locations')->insert([
                [
                    'name' => 'Head Office',
                    'address' => 'Jl. Merdeka No. 1, Jakarta',
                    'latitude' => -6.200000,
                    'longitude' => 106.816666,
                    'description' => 'Main Office Building',
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now()
                ],
                [
                    'name' => 'Branch A',
                    'address' => 'Jl. Sudirman No. 50, Jakarta',
                    'latitude' => -6.189756,
                    'longitude' => 106.824650,
                    'description' => 'Branch Office A',
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now()
                ],
                [
                    'name' => 'Warehouse',
                    'address' => 'Jl. Industri No. 12, Bekasi',
                    'latitude' => -6.234567,
                    'longitude' => 106.987654,
                    'description' => 'Main Warehouse',
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now()
                ]
            ]);
        }

        // Seed System Settings if empty
        $settingsCount = DB::table('system_settings')->count();
        if ($settingsCount === 0) {
            DB::table('system_settings')->insert([
                [
                    'key' => 'default_poll_interval',
                    'value' => '300',
                    'type' => 'integer',
                    'category' => 'monitoring',
                    'description' => 'Default polling interval in seconds',
                    'created_at' => now(),
                    'updated_at' => now()
                ],
                [
                    'key' => 'max_concurrent_polls',
                    'value' => '10',
                    'type' => 'integer',
                    'category' => 'monitoring',
                    'description' => 'Maximum concurrent device polls',
                    'created_at' => now(),
                    'updated_at' => now()
                ],
                [
                    'key' => 'storage_warning_threshold',
                    'value' => '80',
                    'type' => 'integer',
                    'category' => 'alerts',
                    'description' => 'Storage usage warning threshold percentage',
                    'created_at' => now(),
                    'updated_at' => now()
                ],
                [
                    'key' => 'storage_critical_threshold',
                    'value' => '95',
                    'type' => 'integer',
                    'category' => 'alerts',
                    'description' => 'Storage usage critical threshold percentage',
                    'created_at' => now(),
                    'updated_at' => now()
                ]
            ]);
        }
    }

    public function down(): void
    {
        // Rollback: Only clear data, keep tables
        DB::table('roles')->truncate();
        DB::table('locations')->truncate();
        DB::table('system_settings')->truncate();
    }
};