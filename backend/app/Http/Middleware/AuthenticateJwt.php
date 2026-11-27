<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\JwtService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateJwt
{
    public function __construct(private JwtService $jwt) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        $userId = $token ? $this->jwt->decodeAccessToken($token) : null;
        $user = $userId ? User::with('roles')->find($userId) : null;

        if (! $user || ! $user->is_active) {
            return response()->json(['message' => 'Your session has ended. Please sign in again.'], 401);
        }

        Auth::setUser($user);

        return $next($request);
    }
}
