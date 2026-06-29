<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_storage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->integer('disk_number');
            $table->string('disk_name')->nullable();
            $table->enum('status', ['normal', 'error', 'full', 'unformatted', 'not_exist'])->default('normal');
            $table->bigInteger('total_space')->nullable(); // bytes
            $table->bigInteger('used_space')->nullable(); // bytes
            $table->bigInteger('free_space')->nullable(); // bytes
            $table->decimal('usage_percentage', 5, 2)->nullable();
            $table->string('disk_type')->nullable(); // SATA, SSD, etc
            $table->json('disk_info')->nullable();
            $table->timestamp('last_checked')->nullable();
            $table->timestamps();
            
            $table->unique(['device_id', 'disk_number']);
            $table->index(['device_id', 'status']);
            $table->index('status');
            $table->index('usage_percentage');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_storage');
    }
};