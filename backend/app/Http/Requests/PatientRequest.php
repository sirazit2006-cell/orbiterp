<?php

namespace App\Http\Requests;

use App\Models\Patient;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PatientRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // role checks are done by the route middleware
    }

    protected function prepareForValidation(): void
    {
        $trim = fn ($v) => is_string($v) ? trim(preg_replace('/\s+/', ' ', $v)) : $v;
        $clean = [];
        foreach ($this->all() as $k => $v) {
            $clean[$k] = $trim($v);
            if ($clean[$k] === '') {
                $clean[$k] = null;
            }
        }
        foreach (['mobile', 'emergency_contact_mobile'] as $f) {
            if (isset($clean[$f])) {
                $clean[$f] = Patient::normaliseMobile($clean[$f]);
            }
        }
        if (isset($clean['abha_number'])) {
            $clean['abha_number'] = preg_replace('/[\s-]/', '', $clean['abha_number']);
        }
        if (isset($clean['pin_code'])) {
            $clean['pin_code'] = preg_replace('/\s/', '', $clean['pin_code']);
        }
        if (isset($clean['id_proof_number'])) {
            $clean['id_proof_number'] = strtoupper($clean['id_proof_number']);
        }
        $this->replace($clean);
    }

    public function rules(): array
    {
        $patient = $this->route('patient');
        $creating = $patient === null;

        return [
            'full_name' => ['required', 'string', 'min:2', 'max:150', "regex:/^[\\pL][\\pL\\pM .'-]*$/u"],
            'gender' => ['required', Rule::in(Patient::GENDERS)],
            'dob' => ['nullable', 'required_without:age_years', 'date', 'before_or_equal:today', 'after:1900-01-01'],
            'age_years' => ['nullable', 'required_without:dob', 'integer', 'min:0', 'max:130'],
            'mobile' => ['required', 'regex:/^[6-9]\d{9}$/'],
            'address_line' => ['required', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:80'],
            'state' => ['required', 'string', 'max:80'],
            'pin_code' => ['required', 'regex:/^[1-9]\d{5}$/'],

            'email' => ['nullable', 'email', 'max:150'],
            'blood_group' => ['nullable', Rule::in(Patient::BLOOD_GROUPS)],
            'emergency_contact_name' => ['nullable', 'string', 'max:150'],
            'emergency_contact_mobile' => ['nullable', 'regex:/^[6-9]\d{9}$/'],
            'id_proof_type' => ['nullable', 'required_with:id_proof_number', Rule::in(Patient::ID_PROOF_TYPES)],
            'id_proof_number' => ['nullable', 'required_with:id_proof_type', 'string', 'max:40'],
            'abha_number' => ['nullable', 'regex:/^\d{14}$/', Rule::unique('patients', 'abha_number')->ignore($patient?->id)],

            'consent' => $creating ? ['accepted'] : ['nullable', 'boolean'],
            'confirm_new_patient' => ['nullable', 'boolean'],
            'change_reason' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'full_name.regex' => 'Use letters, spaces, dots, hyphens or apostrophes only.',
            'dob.required_without' => 'Enter a date of birth or an age.',
            'age_years.required_without' => 'Enter a date of birth or an age.',
            'dob.before_or_equal' => 'Date of birth cannot be in the future.',
            'mobile.regex' => 'Enter a 10-digit Indian mobile number.',
            'emergency_contact_mobile.regex' => 'Enter a 10-digit Indian mobile number.',
            'pin_code.regex' => 'Enter a 6-digit PIN code.',
            'abha_number.regex' => 'ABHA number has 14 digits.',
            'abha_number.unique' => 'This ABHA number is already on another patient.',
            'consent.accepted' => 'Record the patient\'s consent before saving.',
        ];
    }

    public function after(): array
    {
        return [function (Validator $v) {
            if ($this->input('id_proof_type') === 'Aadhaar' && $this->input('id_proof_number')
                && ! preg_match('/^\d{12}$/', str_replace(' ', '', $this->input('id_proof_number')))) {
                $v->errors()->add('id_proof_number', 'Aadhaar number has 12 digits.');
            }

            $patient = $this->route('patient');
            if ($patient instanceof Patient && ! $v->errors()->hasAny(['full_name', 'gender', 'dob', 'age_years'])) {
                $data = $this->patientAttributes();
                $identityChanged = $data['full_name'] !== $patient->full_name
                    || $data['gender'] !== $patient->gender
                    || $data['dob'] !== $patient->dob->toDateString();
                if ($identityChanged && ! $this->input('change_reason')) {
                    $v->errors()->add('change_reason', 'Give a reason for changing name, date of birth or gender.');
                }
            }
        }];
    }

    /** Validated input mapped to Patient columns (age is turned into an estimated date of birth). */
    public function patientAttributes(): array
    {
        $data = $this->only([
            'full_name', 'gender', 'mobile', 'address_line', 'city', 'state', 'pin_code',
            'email', 'blood_group', 'emergency_contact_name', 'emergency_contact_mobile',
            'id_proof_type', 'id_proof_number', 'abha_number',
        ]);
        if ($this->input('dob')) {
            $data['dob'] = Carbon::parse($this->input('dob'))->toDateString();
            $data['dob_is_estimated'] = false;
        } else {
            $patient = $this->route('patient');
            $age = (int) $this->input('age_years');
            // Keep an existing estimated DOB if the age has not changed, so edits don't drift it.
            if ($patient instanceof Patient && $patient->dob_is_estimated && $patient->ageYears() === $age) {
                $data['dob'] = $patient->dob->toDateString();
            } else {
                $data['dob'] = now()->subYears($age)->toDateString();
            }
            $data['dob_is_estimated'] = true;
        }

        return $data;
    }
}
