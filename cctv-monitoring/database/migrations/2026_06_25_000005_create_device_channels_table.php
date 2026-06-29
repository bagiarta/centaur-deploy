<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_channels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->integer('channel_number');
            $table->string('channel_name')->nullable();
            $table->enum('channel_type', ['analog', 'ip'])->default('ip');
            $table->enum('status', ['online', 'offline', 'video_loss', 'no_signal'])->default('offline');
            $table->boolean('is_recording')->default(false);
            $table->string('resolution')->nullable();
            $table->decimal('fps', 5, 2)->nullable();
            $table->integer('bitrate')->nullable(); // kbps
            $table->json('channel_settings')->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->timestamp('last_seen')->nullable();
            $table->timestamps();
            
            $table->unique(['device_id', 'channel_number']);
            $table->index(['device_id', 'status']);
            $table->index(['status', 'is_enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_channels');
    }
};