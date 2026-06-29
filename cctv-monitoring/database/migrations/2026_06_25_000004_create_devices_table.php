<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('device_type'); // NVR, DVR, XVR, Hybrid_DVR
            $table->string('vendor'); // hikvision, dahua, etc
            $table->string('model')->nullable();
            $table->string('firmware_version')->nullable();
            $table->string('serial_number')->nullable();
            $table->ipAddress('ip_address');
            $table->integer('port')->default(80);
            $table->string('username');
            $table->string('password'); // encrypted
            $table->boolean('is_https')->default(false);
            $table->foreignId('location_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['online', 'offline', 'error'])->default('offline');
            $table->timestamp('last_seen')->nullable();
            $table->timestamp('last_poll')->nullable();
            $table->json('device_info')->nullable(); // store device capabilities, etc
            $table->json('connection_settings')->nullable(); // custom settings per vendor
            $table->boolean('is_active')->default(true);
            $table->integer('poll_interval')->default(300); // seconds
            $table->timestamps();
            
            $table->index(['ip_address', 'port']);
            $table->index(['status', 'is_active']);
            $table->index(['location_id', 'is_active']);
            $table->index(['vendor', 'device_type']);
            $table->index('last_poll');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('devices');
    }
};