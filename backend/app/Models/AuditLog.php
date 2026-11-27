<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Append-only: the app can write audit rows but never change or delete them.
 */
class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'action', 'table_name', 'record_id', 'old_value', 'new_value', 'note', 'ip_address', 'at'];

    protected function casts(): array
    {
        return [
            'old_value' => 'array',
            'new_value' => 'array',
            'at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Audit log entries cannot be edited.'));
        static::deleting(fn () => throw new LogicException('Audit log entries cannot be deleted.'));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
