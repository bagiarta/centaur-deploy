<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value');
            $table->string('type')->default('string'); // string, integer, boolean, json
            $table->string('category')->default('general');
            $table->text('description')->nullable();
            $table->timestamps();
            
            $table->index('category');
        });

        // Insert default settings
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

    public function down(): void
    {
        Schema::dropIfExists('system_settings');
    }
};