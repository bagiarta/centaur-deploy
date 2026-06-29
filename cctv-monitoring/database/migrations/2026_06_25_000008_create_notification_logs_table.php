<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_channels', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type'); // telegram, whatsapp, email, webhook
            $table->json('settings'); // channel-specific settings
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            
            $table->index(['type', 'is_active']);
        });

        Schema::create('notification_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->json('conditions'); // rules for when to trigger
            $table->json('channels'); // which channels to use
            $table->string('template')->nullable(); // message template
            $table->integer('cooldown_minutes')->default(15); // prevent spam
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('notification_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('monitoring_log_id')->constrained()->cascadeOnDelete();
            $table->foreignId('notification_rule_id')->constrained()->cascadeOnDelete();
            $table->string('channel_type');
            $table->string('recipient');
            $table->text('message');
            $table->enum('status', ['pending', 'sent', 'failed', 'delivered'])->default('pending');
            $table->text('error_message')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->json('response_data')->nullable();
            $table->timestamps();
            
            $table->index(['monitoring_log_id', 'status']);
            $table->index(['channel_type', 'status']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_logs');
        Schema::dropIfExists('notification_rules');
        Schema::dropIfExists('notification_channels');
    }
};