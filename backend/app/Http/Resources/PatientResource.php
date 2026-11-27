<?php

namespace App\Http\Resources;

use App\Models\Patient;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Patient */
class PatientResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $canEdit = $request->user()?->hasAnyRole('reception', 'admin') ?? false;

        return [
            'id' => $this->id,
            'uhid' => $this->uhid,
            'full_name' => $this->full_name,
            'gender' => $this->gender,
            'dob' => $this->dob?->toDateString(),
            'dob_is_estimated' => $this->dob_is_estimated,
            'age_years' => $this->ageYears(),
            'mobile' => $this->mobile,
            'address_line' => $this->address_line,
            'city' => $this->city,
            'state' => $this->state,
            'pin_code' => $this->pin_code,
            'email' => $this->email,
            'blood_group' => $this->blood_group,
            'emergency_contact_name' => $this->emergency_contact_name,
            'emergency_contact_mobile' => $this->emergency_contact_mobile,
            'id_proof_type' => $this->id_proof_type,
            'id_proof_number_masked' => $this->maskedIdProof(),
            // The full ID number goes only to the roles that may edit it.
            'id_proof_number' => $this->when($canEdit, $this->id_proof_number),
            'abha_number' => $this->abha_number,
            'has_photo' => (bool) $this->photo_path,
            'consent_at' => $this->consent_at?->toIso8601String(),
            'registered_at' => $this->registered_at?->toIso8601String(),
            'registered_by' => $this->whenLoaded('registeredBy', fn () => [
                'id' => $this->registeredBy->id,
                'name' => $this->registeredBy->name,
            ]),
            'is_active' => $this->is_active,
            // Visits and bills arrive with Modules 2 to 4.
            'last_visit' => null,
        ];
    }
}
