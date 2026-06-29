<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monitoring_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->string('log_type'); // device_status, channel_status, storage_status, system_event
            $table->string('event_type'); // status_change, error, warning, info
            $table->string('object_type'); // device, channel, storage, system
            $table->string('object_id')->nullable(); // channel_id, disk_id, etc
            $table->string('old_value')->nullable();
            $table->string('new_value')->nullable();
            $table->text('message');
            $table->json('metadata')->nullable(); // additional context data
            $table->enum('severity', ['critical', 'high', 'medium', 'low', 'info'])->default('info');
            $table->boolean('is_resolved')->default(false);
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            
            $table->index(['device_id', 'created_at']);
            $table->index(['log_type', 'event_type']);
            $table->index(['severity', 'is_resolved']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monitoring_logs');
    }
};