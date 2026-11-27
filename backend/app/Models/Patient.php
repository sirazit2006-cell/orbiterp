<?php

namespace App\Models;

use Database\Factories\PatientFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class Patient extends Model
{
    /** @use HasFactory<PatientFactory> */
    use HasFactory;

    public const GENDERS = ['male', 'female', 'other'];
    public const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    public const ID_PROOF_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Voter ID', 'Driving licence', 'Other'];

    /** Changes to these are flagged in the audit trail and need a reason. */
    public const IDENTITY_FIELDS = ['full_name', 'dob', 'gender'];

    protected $fillable = [
        'uhid', 'full_name', 'gender', 'dob', 'dob_is_estimated', 'mobile',
        'address_line', 'city', 'state', 'pin_code',
        'email', 'blood_group', 'emergency_contact_name', 'emergency_contact_mobile',
        'id_proof_type', 'id_proof_number', 'abha_number', 'photo_path',
        'consent_at', 'consent_recorded_by', 'registered_at', 'registered_by', 'is_active',
        'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'dob' => 'date:Y-m-d',
            'dob_is_estimated' => 'boolean',
            'consent_at' => 'datetime',
            'registered_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    public function ageYears(): int
    {
        return (int) Carbon::parse($this->dob)->diffInYears(now());
    }

    /** "XXXX 4821": only the last four characters are ever shown. */
    public function maskedIdProof(): ?string
    {
        if (! $this->id_proof_number) {
            return null;
        }
        $n = preg_replace('/\s+/', '', $this->id_proof_number);

        return 'XXXX '.substr($n, -4);
    }

    public static function normaliseName(string $name): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/', ' ', $name)));
    }

    /**
     * Accepts "+91 98765 43210", "098765 43210", "9876543210" and returns 10 digits.
     */
    public static function normaliseMobile(?string $mobile): ?string
    {
        if ($mobile === null || $mobile === '') {
            return $mobile;
        }
        $digits = preg_replace('/\D/', '', $mobile);
        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            $digits = substr($digits, 2);
        } elseif (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }

        return $digits;
    }
}
