<?php

namespace Database\Factories;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<User> */
class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'username' => 'u'.Str::lower(Str::random(10)),
            'name' => fake()->name(),
            'password' => 'password',
            'desk' => 'Desk 1',
            'is_active' => true,
        ];
    }

    public function withRole(string ...$codes): static
    {
        return $this->afterCreating(function (User $user) use ($codes) {
            foreach ($codes as $code) {
                $role = Role::firstOrCreate(['code' => $code], ['name' => Role::ALL[$code] ?? $code]);
                $user->roles()->attach($role->id);
            }
        });
    }
}
