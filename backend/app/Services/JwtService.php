<?php

namespace App\Services;

use App\Models\RefreshToken;
use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Str;

/**
 * Short-lived JWT access tokens plus opaque, rotating refresh tokens.
 *
 * A refresh token that sits unused for refresh_idle_minutes stops working, which is
 * what logs a counter out automatically after inactivity.
 */
class JwtService
{
    private function secret(): string
    {
        $secret = (string) config('jwt.secret');
        if (str_starts_with($secret, 'base64:')) {
            $secret = base64_decode(substr($secret, 7));
        }

        return $secret;
    }

    public function issueAccessToken(User $user): string
    {
        $now = now()->getTimestamp();

        return JWT::encode([
            'iss' => config('app.url'),
            'sub' => (string) $user->id,
            'iat' => $now,
            'exp' => $now + config('jwt.ttl_minutes') * 60,
            'roles' => $user->roleCodes(),
        ], $this->secret(), 'HS256');
    }

    /** Returns the user id, or null when the token is invalid or expired. */
    public function decodeAccessToken(string $token): ?int
    {
        try {
            JWT::$timestamp = now()->getTimestamp();
            $payload = JWT::decode($token, new Key($this->secret(), 'HS256'));
        } catch (\Throwable) {
            return null;
        }

        return isset($payload->sub) ? (int) $payload->sub : null;
    }

    public function issueRefreshToken(User $user, ?string $ip): string
    {
        $plain = Str::random(64);
        RefreshToken::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $plain),
            'last_used_at' => now(),
            'expires_at' => now()->addHours(config('jwt.refresh_max_hours')),
            'ip_address' => $ip,
        ]);

        return $plain;
    }

    public function findUsableRefreshToken(string $plain): ?RefreshToken
    {
        $token = RefreshToken::where('token_hash', hash('sha256', $plain))->first();
        if (! $token || $token->revoked_at || $token->expires_at->isPast()) {
            return null;
        }
        if ($token->last_used_at->lt(now()->subMinutes(config('jwt.refresh_idle_minutes')))) {
            return null;
        }

        return $token;
    }

    /** @return array{access_token:string, refresh_token:string, expires_in:int, user:array} */
    public function tokenPair(User $user, ?string $ip): array
    {
        return [
            'access_token' => $this->issueAccessToken($user),
            'refresh_token' => $this->issueRefreshToken($user, $ip),
            'expires_in' => config('jwt.ttl_minutes') * 60,
            'user' => $user->toApi(),
        ];
    }
}
