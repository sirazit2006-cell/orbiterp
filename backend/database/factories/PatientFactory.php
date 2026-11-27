<?php

namespace Database\Factories;

use App\Models\Patient;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Patient> */
class PatientFactory extends Factory
{
    private static int $seq = 0;

    public function definition(): array
    {
        self::$seq++;

        return [
            'uhid' => sprintf('HOSP-%d-%06d', now()->year, 900000 + self::$seq),
            'full_name' => fake()->firstName().' '.fake()->lastName(),
            'gender' => fake()->randomElement(Patient::GENDERS),
            'dob' => fake()->dateTimeBetween('-80 years', '-1 year')->format('Y-m-d'),
            'mobile' => '9'.fake()->numerify('#########'),
            'address_line' => fake()->streetAddress(),
            'city' => 'Pune',
            'state' => 'Maharashtra',
            'pin_code' => '411038',
            'registered_at' => now(),
            'registered_by' => User::factory(),
            'consent_at' => now(),
        ];
    }
}
