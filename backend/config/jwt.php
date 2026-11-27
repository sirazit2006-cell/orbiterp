<?php

return [
    // Signing key for access tokens. Falls back to APP_KEY.
    'secret' => env('JWT_SECRET', env('APP_KEY')),
    'ttl_minutes' => (int) env('JWT_TTL_MINUTES', 15),
    // A refresh token dies after this many idle minutes (automatic logout after inactivity)...
    'refresh_idle_minutes' => (int) env('JWT_REFRESH_IDLE_MINUTES', 30),
    // ...and never lives longer than this, even when in use.
    'refresh_max_hours' => (int) env('JWT_REFRESH_MAX_HOURS', 12),
];
