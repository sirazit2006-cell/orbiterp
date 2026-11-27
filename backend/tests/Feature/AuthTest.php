<?php

namespace Tests\Feature;

use App\Models\RefreshToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_returns_tokens_and_roles(): void
    {
        User::factory()->withRole('reception')->create(['username' => 'meena', 'password' => 'secret123']);

        $res = $this->postJson('/api/auth/login', ['username' => 'meena', 'password' => 'secret123'])->assertOk();
        $res->assertJsonStructure(['access_token', 'refresh_token', 'expires_in', 'user' => ['roles']]);
        $this->assertSame(['reception'], $res->json('user.roles'));

        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer '.$res->json('access_token')])
            ->assertOk()->assertJsonPath('user.username', 'meena');
        $this->assertDatabaseHas('audit_logs', ['action' => 'login']);
    }

    public function test_wrong_password_is_rejected_and_logged(): void
    {
        User::factory()->create(['username' => 'meena', 'password' => 'secret123']);
        $this->postJson('/api/auth/login', ['username' => 'meena', 'password' => 'nope'])->assertStatus(422);
        $this->assertDatabaseHas('audit_logs', ['action' => 'login_failed']);
    }

    public function test_inactive_user_cannot_log_in(): void
    {
        User::factory()->create(['username' => 'old', 'password' => 'secret123', 'is_active' => false]);
        $this->postJson('/api/auth/login', ['username' => 'old', 'password' => 'secret123'])->assertStatus(422);
    }

    public function test_api_needs_a_valid_token(): void
    {
        $this->getJson('/api/patients/stats')->assertStatus(401);
        $this->getJson('/api/patients/stats', ['Authorization' => 'Bearer garbage'])->assertStatus(401);
    }

    public function test_expired_access_token_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->travelTo(now()->subMinutes(20));
        $token = app(\App\Services\JwtService::class)->issueAccessToken($user);
        $this->travelBack();
        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer '.$token])->assertStatus(401);
    }

    public function test_refresh_rotates_the_token(): void
    {
        User::factory()->create(['username' => 'meena', 'password' => 'secret123']);
        $first = $this->postJson('/api/auth/login', ['username' => 'meena', 'password' => 'secret123'])->json('refresh_token');

        $second = $this->postJson('/api/auth/refresh', ['refresh_token' => $first])->assertOk()->json('refresh_token');
        $this->assertNotSame($first, $second);
        // The old one is single-use.
        $this->postJson('/api/auth/refresh', ['refresh_token' => $first])->assertStatus(401);
    }

    public function test_refresh_token_dies_after_inactivity(): void
    {
        User::factory()->create(['username' => 'meena', 'password' => 'secret123']);
        $token = $this->postJson('/api/auth/login', ['username' => 'meena', 'password' => 'secret123'])->json('refresh_token');

        $this->travel(31)->minutes();
        $this->postJson('/api/auth/refresh', ['refresh_token' => $token])->assertStatus(401);
    }

    public function test_logout_revokes_refresh_token(): void
    {
        User::factory()->create(['username' => 'meena', 'password' => 'secret123']);
        $token = $this->postJson('/api/auth/login', ['username' => 'meena', 'password' => 'secret123'])->json('refresh_token');
        $this->postJson('/api/auth/logout', ['refresh_token' => $token])->assertOk();
        $this->assertNotNull(RefreshToken::first()->revoked_at);
        $this->postJson('/api/auth/refresh', ['refresh_token' => $token])->assertStatus(401);
    }
}
