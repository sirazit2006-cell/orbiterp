<?php

namespace App\Services;

use App\Models\Patient;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Finds existing patients who may be the person being registered.
 *
 * A "strong" match is the spec's rule: same mobile + same name + same date of birth.
 * When either date of birth was entered as an age, the birth year is compared instead.
 * Other patients on the same mobile are returned as family (weak) matches, since one
 * mobile number can belong to several family members.
 */
class DuplicateFinder
{
    /**
     * @return Collection<int, array{patient: Patient, reasons: list<string>, strong: bool}>
     */
    public function find(?string $name, ?string $mobile, ?string $dob, bool $dobEstimated = false, ?int $exceptId = null): Collection
    {
        $mobile = Patient::normaliseMobile($mobile);
        $normName = $name ? Patient::normaliseName($name) : null;
        $dobDate = $dob ? Carbon::parse($dob) : null;

        $query = Patient::query()->where('is_active', true);
        if ($exceptId) {
            $query->where('id', '!=', $exceptId);
        }
        $query->where(function ($q) use ($mobile, $normName, $dobDate) {
            $any = false;
            if ($mobile && strlen($mobile) === 10) {
                $q->orWhere('mobile', $mobile);
                $any = true;
            }
            if ($normName && $dobDate) {
                // Same name and birth year on a different mobile is still worth a look.
                $q->orWhere(fn ($w) => $w->whereRaw('LOWER(full_name) = ?', [$normName])
                    ->whereBetween('dob', [$dobDate->copy()->startOfYear()->toDateString(), $dobDate->copy()->endOfYear()->toDateString()]));
                $any = true;
            }
            if (! $any) {
                $q->whereRaw('1 = 0');
            }
        });

        return $query->orderBy('registered_at')->limit(20)->get()->map(function (Patient $p) use ($mobile, $normName, $dobDate, $dobEstimated) {
            $reasons = [];
            $nameMatch = $normName && Patient::normaliseName($p->full_name) === $normName;
            $dobMatch = false;
            if ($dobDate) {
                $dobMatch = ($dobEstimated || $p->dob_is_estimated)
                    ? $p->dob->year === $dobDate->year
                    : $p->dob->isSameDay($dobDate);
            }
            $mobileMatch = $mobile && $p->mobile === $mobile;

            if ($nameMatch) $reasons[] = 'name';
            if ($dobMatch) $reasons[] = 'dob';
            if ($mobileMatch) $reasons[] = 'mobile';

            return [
                'patient' => $p,
                'reasons' => $reasons,
                'strong' => $nameMatch && $dobMatch && $mobileMatch,
            ];
        })->filter(fn ($m) => in_array('mobile', $m['reasons']) || ($m['reasons'] === ['name', 'dob']))
            ->sortByDesc(fn ($m) => ($m['strong'] ? 10 : 0) + count($m['reasons']))
            ->values();
    }
}
