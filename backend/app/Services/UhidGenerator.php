<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Issues permanent hospital IDs like HOSP-2026-000123.
 * Must be called inside a DB transaction: the sequence row is locked until commit,
 * so two counters saving at the same moment never get the same number.
 */
class UhidGenerator
{
    public function next(?int $year = null): string
    {
        $year ??= (int) now()->format('Y');

        DB::table('uhid_sequences')->insertOrIgnore([
            'year' => $year, 'last_number' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $row = DB::table('uhid_sequences')->where('year', $year)->lockForUpdate()->first();
        $number = $row->last_number + 1;
        DB::table('uhid_sequences')->where('year', $year)->update(['last_number' => $number, 'updated_at' => now()]);

        return sprintf('%s-%d-%06d', config('hospital.uhid_prefix'), $year, $number);
    }
}
