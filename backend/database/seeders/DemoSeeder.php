<?php

namespace Database\Seeders;

use App\Models\Patient;
use App\Models\Role;
use App\Models\User;
use App\Services\UhidGenerator;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Sample staff (password "password") and patients for local demos. Never run in production.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(DatabaseSeeder::class);

        $staff = [
            ['meena', 'Meena Kulkarni', 'Desk 1', [Role::RECEPTION]],
            ['farah', 'Farah Shaikh', 'Desk 2', [Role::RECEPTION]],
            ['nurse', 'Asha Pillai', 'Nurse station', [Role::NURSE]],
            ['dr.kapoor', 'Dr. Ananya Kapoor', 'General Medicine', [Role::DOCTOR]],
            ['cashier', 'Vikram Rao', 'Billing counter', [Role::BILLING]],
        ];
        foreach ($staff as [$username, $name, $desk, $roles]) {
            $u = User::firstOrCreate(['username' => $username], ['name' => $name, 'desk' => $desk, 'password' => 'password']);
            $u->roles()->syncWithoutDetaching(Role::whereIn('code', $roles)->pluck('id'));
        }

        if (Patient::exists()) {
            return;
        }
        $meena = User::where('username', 'meena')->first();
        $uhids = app(UhidGenerator::class);
        $patients = [
            ['Rahul Deshmukh', 'male', '1985-03-14', '9876543210', 'Flat 402, Shivneri Apartments, Kothrud', 'Pune', 'Maharashtra', '411038', ['blood_group' => 'B+', 'email' => 'rahul.d@example.com', 'emergency_contact_name' => 'Sunita Deshmukh', 'emergency_contact_mobile' => '9876543210', 'id_proof_type' => 'Aadhaar', 'id_proof_number' => '234567894821']],
            ['Sunita Deshmukh', 'female', '1988-07-02', '9876543210', 'Flat 402, Shivneri Apartments, Kothrud', 'Pune', 'Maharashtra', '411038', []],
            ['Aarav Deshmukh', 'male', '2017-01-20', '9876543210', 'Flat 402, Shivneri Apartments, Kothrud', 'Pune', 'Maharashtra', '411038', []],
            ['Farhan Qureshi', 'male', '1997-05-11', '9822012345', '12 MG Road, Camp', 'Pune', 'Maharashtra', '411001', []],
            ['Lakshmi Narayanan', 'female', '1959-09-30', '9845098450', '7 Temple Street, Aundh', 'Pune', 'Maharashtra', '411007', ['blood_group' => 'O+']],
            ['Priya Menon', 'female', '1992-12-04', '9900112233', 'B-14 Sai Residency, Baner', 'Pune', 'Maharashtra', '411045', []],
            ['Harpreet Singh', 'male', '1974-02-18', '9811122233', '22 Model Colony', 'Pune', 'Maharashtra', '411016', []],
            ['Kavita Joshi', 'female', '1981-08-25', '9763344556', '5 Prabhat Road, Erandwane', 'Pune', 'Maharashtra', '411004', []],
        ];
        foreach ($patients as [$name, $gender, $dob, $mobile, $addr, $city, $state, $pin, $extra]) {
            DB::transaction(fn () => Patient::create([
                'uhid' => $uhids->next(),
                'full_name' => $name, 'gender' => $gender, 'dob' => $dob, 'mobile' => $mobile,
                'address_line' => $addr, 'city' => $city, 'state' => $state, 'pin_code' => $pin,
                'registered_at' => now()->subDays(rand(1, 90)), 'registered_by' => $meena->id,
                'consent_at' => now(), 'consent_recorded_by' => $meena->id,
                'created_by' => $meena->id, 'updated_by' => $meena->id,
            ] + $extra));
        }
    }
}
