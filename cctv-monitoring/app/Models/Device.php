<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Casts\Attribute;

class Device extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'device_type',
        'vendor',
        'model',
        'firmware_version',
        'serial_number',
        'ip_address',
        'port',
        'username',
        'password',
        'is_https',
        'location_id',
        'status',
        'last_seen',
        'last_poll',
        'device_info',
        'connection_settings',
        'is_active',
        'poll_interval'
    ];

    protected $casts = [
        'device_info' => 'array',
        'connection_settings' => 'array',
        'is_https' => 'boolean',
        'is_active' => 'boolean',
        'last_seen' => 'datetime',
        'last_poll' => 'datetime',
        'port' => 'integer',
        'poll_interval' => 'integer'
    ];

    protected $hidden = [
        'password'
    ];

    // Relationships
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function channels(): HasMany
    {
        return $this->hasMany(DeviceChannel::class);
    }

    public function storage(): HasMany
    {
        return $this->hasMany(DeviceStorage::class);
    }

    public function monitoringLogs(): HasMany
    {
        return $this->hasMany(MonitoringLog::class);
    }

    // Accessors
    public function baseUrl(): Attribute
    {
        return Attribute::make(
            get: fn () => ($this->is_https ? 'https' : 'http') . "://{$this->ip_address}:{$this->port}"
        );
    }

    public function isOnline(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->status === 'online'
        );
    }

    public function lastSeenHuman(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->last_seen?->diffForHumans()
        );
    }

    // Scopes
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeOnline($query)
    {
        return $query->where('status', 'online');
    }

    public function scopeOffline($query)
    {
        return $query->where('status', 'offline');
    }

    public function scopeByVendor($query, string $vendor)
    {
        return $query->where('vendor', $vendor);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('device_type', $type);
    }

    public function scopeByLocation($query, int $locationId)
    {
        return $query->where('location_id', $locationId);
    }

    public function scopeNeedsPoll($query)
    {
        return $query->where('is_active', true)
            ->where(function ($q) {
                $q->whereNull('last_poll')
                    ->orWhereRaw('last_poll < DATE_SUB(NOW(), INTERVAL poll_interval SECOND)');
            });
    }

    // Helper methods
    public function getApiUrl(string $endpoint = ''): string
    {
        return $this->base_url . '/ISAPI/' . ltrim($endpoint, '/');
    }

    public function updateLastSeen(): void
    {
        $this->update(['last_seen' => now()]);
    }

    public function updateStatus(string $status): void
    {
        if ($this->status !== $status) {
            $oldStatus = $this->status;
            $this->update(['status' => $status, 'last_poll' => now()]);
            
            // Log status change
            $this->monitoringLogs()->create([
                'log_type' => 'device_status',
                'event_type' => 'status_change',
                'object_type' => 'device',
                'old_value' => $oldStatus,
                'new_value' => $status,
                'message' => "Device status changed from {$oldStatus} to {$status}",
                'severity' => $status === 'offline' ? 'high' : 'info'
            ]);
        }
    }
}