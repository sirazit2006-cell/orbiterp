<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RefreshToken;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\JwtService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(private JwtService $jwt) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:60'],
            'password' => ['required', 'string', 'max:200'],
        ]);

        $user = User::with('roles')->where('username', $data['username'])->first();
        if (! $user || ! $user->is_active || ! Hash::check($data['password'], $user->password)) {
            AuditLogger::log('login_failed', 'users', $user?->id, note: 'Username: '.mb_substr($data['username'], 0, 60), userId: $user?->id);

            return response()->json(['message' => 'Wrong username or password.'], 422);
        }

        AuditLogger::log('login', 'users', $user->id, userId: $user->id);

        return response()->json($this->jwt->tokenPair($user, $request->ip()));
    }

    /** Rotates the refresh token: the old one stops working as soon as a new pair is issued. */
    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate(['refresh_token' => ['required', 'string']]);

        return DB::transaction(function () use ($data, $request) {
            $token = $this->jwt->findUsableRefreshToken($data['refresh_token']);
            $user = $token?->user()->with('roles')->first();
            if (! $token || ! $user || ! $user->is_active) {
                return response()->json(['message' => 'Your session has ended. Please sign in again.'], 401);
            }
            $token->update(['revoked_at' => now()]);

            return response()->json($this->jwt->tokenPair($user, $request->ip()));
        });
    }

    public function logout(Request $request): JsonResponse
    {
        $plain = (string) $request->input('refresh_token', '');
        if ($plain !== '') {
            $token = RefreshToken::where('token_hash', hash('sha256', $plain))->whereNull('revoked_at')->first();
            if ($token) {
                $token->update(['revoked_at' => now()]);
                AuditLogger::log('logout', 'users', $token->user_id, note: $request->input('reason'), userId: $token->user_id);
            }
        }

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()->toApi()]);
    }
}
