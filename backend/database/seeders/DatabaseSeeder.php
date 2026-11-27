<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Roles and one admin account. Run DemoSeeder as well for sample staff and patients.
     */
    public function run(): void
    {
        foreach (Role::ALL as $code => $name) {
            Role::updateOrCreate(['code' => $code], ['name' => $name]);
        }

        $admin = User::firstOrCreate(
            ['username' => 'admin'],
            ['name' => 'System Admin', 'password' => env('ADMIN_INITIAL_PASSWORD', 'ChangeMe@123'), 'desk' => 'Admin'],
        );
        $admin->roles()->syncWithoutDetaching(Role::where('code', Role::ADMIN)->pluck('id'));
    }
}
