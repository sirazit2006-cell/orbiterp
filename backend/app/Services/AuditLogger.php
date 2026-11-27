<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;

class AuditLogger
{
    public static function log(
        string $action,
        ?string $table = null,
        ?int $recordId = null,
        ?array $old = null,
        ?array $new = null,
        ?string $note = null,
        ?int $userId = null,
    ): AuditLog {
        return AuditLog::create([
            'user_id' => $userId ?? Auth::id(),
            'action' => $action,
            'table_name' => $table,
            'record_id' => $recordId,
            'old_value' => $old,
            'new_value' => $new,
            'note' => $note,
            'ip_address' => request()?->ip(),
            'at' => now(),
        ]);
    }
}
