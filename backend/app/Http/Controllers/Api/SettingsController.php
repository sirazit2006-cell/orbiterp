<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use Illuminate\Http\JsonResponse;

class SettingsController extends Controller
{
    public function hospital(): JsonResponse
    {
        return response()->json([
            'hospital' => [
                'name' => config('hospital.name'),
                'address' => config('hospital.address'),
                'phone' => config('hospital.phone'),
                'opd_hours' => config('hospital.opd_hours'),
                'uhid_prefix' => config('hospital.uhid_prefix'),
            ],
            'options' => [
                'blood_groups' => Patient::BLOOD_GROUPS,
                'id_proof_types' => Patient::ID_PROOF_TYPES,
            ],
        ]);
    }
}
