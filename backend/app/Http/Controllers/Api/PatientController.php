<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PatientRequest;
use App\Http\Resources\PatientResource;
use App\Models\AuditLog;
use App\Models\Patient;
use App\Services\AuditLogger;
use App\Services\DuplicateFinder;
use App\Services\UhidGenerator;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Picqer\Barcode\BarcodeGeneratorPNG;
use Symfony\Component\HttpFoundation\Response;

class PatientController extends Controller
{
    /** Columns whose old and new values go into the audit log in full. */
    private const AUDITED = [
        'full_name', 'gender', 'dob', 'dob_is_estimated', 'mobile', 'address_line', 'city', 'state', 'pin_code',
        'email', 'blood_group', 'emergency_contact_name', 'emergency_contact_mobile',
        'id_proof_type', 'id_proof_number', 'abha_number', 'photo_path', 'is_active',
    ];

    /**
     * Single search box: mobile number, name or UHID.
     * by=any guesses from the text: digits search mobile and UHID numbers, anything else searches names.
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'min:3', 'max:100'],
            'by' => ['nullable', 'in:any,mobile,name,uhid'],
        ]);
        $q = trim($data['q']);
        $by = $data['by'] ?? 'any';
        $digits = preg_replace('/\D/', '', $q);
        $looksNumeric = preg_match('/^[\d\s+\-]+$/', $q) === 1;
        $looksUhid = stripos($q, config('hospital.uhid_prefix').'-') === 0;

        $query = Patient::query()->where('is_active', true);

        $searchMobile = function ($w) use ($digits) {
            $m = Patient::normaliseMobile($digits);
            strlen((string) $m) >= 3 ? $w->where('mobile', 'like', $m.'%') : $w->whereRaw('1 = 0');
        };
        $searchUhid = function ($w) use ($q, $digits, $looksNumeric) {
            if ($looksNumeric && ltrim($digits, '0') === '') {
                $w->whereRaw('1 = 0');
            } elseif ($looksNumeric) {
                // "123" or "2026-000123" finds HOSP-2026-000123
                $w->where('uhid', 'like', '%'.ltrim($digits, '0'));
            } else {
                $w->where('uhid', 'like', strtoupper($q).'%');
            }
        };
        $searchName = function ($w) use ($q) {
            foreach (preg_split('/\s+/', mb_strtolower($q)) as $part) {
                $w->whereRaw('LOWER(full_name) LIKE ?', ['%'.addcslashes($part, '%_').'%']);
            }
        };

        match ($by) {
            'mobile' => $query->where($searchMobile),
            'uhid' => $query->where($searchUhid),
            'name' => $query->where($searchName),
            default => $looksUhid
                ? $query->where($searchUhid)
                : ($looksNumeric
                    ? $query->where(fn ($w) => $w->where($searchMobile)->orWhere($searchUhid))
                    : $query->where($searchName)),
        };

        $patients = $query->orderBy('full_name')->limit(50)->get();

        return response()->json([
            'data' => PatientResource::collection($patients),
            'shared_mobile' => $patients->count() > 1 && $patients->pluck('mobile')->unique()->count() === 1
                ? $patients->first()->mobile : null,
        ]);
    }

    /** Patients this user registered or opened today, newest first. */
    public function recent(Request $request): JsonResponse
    {
        $rows = AuditLog::query()
            ->selectRaw('record_id, MAX(at) as last_at, MAX(id) as last_id')
            ->where('user_id', $request->user()->id)
            ->where('table_name', 'patients')
            ->whereIn('action', ['create', 'view', 'update'])
            ->where('at', '>=', now()->startOfDay())
            ->groupBy('record_id')
            ->orderByDesc('last_id')
            ->limit(10)
            ->get();

        $patients = Patient::whereIn('id', $rows->pluck('record_id'))->get()->keyBy('id');

        return response()->json([
            'data' => $rows->filter(fn ($r) => $patients->has($r->record_id))->map(fn ($r) => [
                'patient' => new PatientResource($patients[$r->record_id]),
                'last_activity_at' => \Illuminate\Support\Carbon::parse($r->last_at)->toIso8601String(),
                'registered_today' => $patients[$r->record_id]->registered_at->isToday(),
            ])->values(),
        ]);
    }

    public function stats(Request $request): JsonResponse
    {
        $today = now()->startOfDay();

        return response()->json([
            'registered_today' => Patient::where('registered_at', '>=', $today)->count(),
            'registered_by_me_today' => Patient::where('registered_at', '>=', $today)->where('registered_by', $request->user()->id)->count(),
            'total_patients' => Patient::where('is_active', true)->count(),
        ]);
    }

    /** Live duplicate check while the new-patient form is being filled. */
    public function duplicates(Request $request, DuplicateFinder $finder): JsonResponse
    {
        $data = $request->validate([
            'full_name' => ['nullable', 'string', 'max:150'],
            'mobile' => ['nullable', 'string', 'max:20'],
            'dob' => ['nullable', 'date'],
            'age_years' => ['nullable', 'integer', 'min:0', 'max:130'],
            'except_id' => ['nullable', 'integer'],
        ]);
        [$dob, $estimated] = $this->dobFromInput($data);

        return response()->json([
            'data' => $this->formatMatches($finder->find($data['full_name'] ?? null, $data['mobile'] ?? null, $dob, $estimated, $data['except_id'] ?? null)),
        ]);
    }

    public function store(PatientRequest $request, DuplicateFinder $finder, UhidGenerator $uhids): JsonResponse
    {
        $attrs = $request->patientAttributes();

        // Duplicate check on mobile + name + date of birth. Reception decides "same" or "new".
        if (! $request->boolean('confirm_new_patient')) {
            $matches = $finder->find($attrs['full_name'], $attrs['mobile'], $attrs['dob'], $attrs['dob_is_estimated']);
            if ($matches->contains('strong', true)) {
                return response()->json([
                    'message' => 'A patient with the same name, date of birth and mobile is already registered.',
                    'code' => 'possible_duplicate',
                    'matches' => $this->formatMatches($matches),
                ], 409);
            }
        }

        $user = $request->user();
        $patient = DB::transaction(function () use ($attrs, $user, $uhids) {
            $now = now();

            return Patient::create($attrs + [
                'uhid' => $uhids->next((int) $now->format('Y')),
                'registered_at' => $now,
                'registered_by' => $user->id,
                'consent_at' => $now,
                'consent_recorded_by' => $user->id,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);
        });

        AuditLogger::log('create', 'patients', $patient->id, null, $this->auditValues($patient),
            $request->boolean('confirm_new_patient') ? 'Saved as new patient after duplicate warning' : null);

        return response()->json(['data' => new PatientResource($patient->load('registeredBy'))], 201);
    }

    public function show(Patient $patient): JsonResponse
    {
        AuditLogger::log('view', 'patients', $patient->id);

        $family = Patient::where('mobile', $patient->mobile)
            ->where('id', '!=', $patient->id)
            ->where('is_active', true)
            ->orderBy('registered_at')
            ->get();

        return response()->json([
            'data' => new PatientResource($patient->load('registeredBy')),
            'family' => PatientResource::collection($family),
        ]);
    }

    public function update(PatientRequest $request, Patient $patient): JsonResponse
    {
        $before = $this->auditValues($patient);
        $patient->fill($request->patientAttributes());
        $patient->updated_by = $request->user()->id;

        $dirty = array_keys(array_intersect_key($patient->getDirty(), array_flip(self::AUDITED)));
        if (! $dirty) {
            return response()->json(['data' => new PatientResource($patient->load('registeredBy')), 'changed' => []]);
        }
        $patient->save();
        $after = $this->auditValues($patient);

        $identity = array_values(array_intersect($dirty, Patient::IDENTITY_FIELDS));
        AuditLogger::log(
            'update', 'patients', $patient->id,
            array_intersect_key($before, array_flip($dirty)),
            array_intersect_key($after, array_flip($dirty)),
            trim(($identity ? 'Changed '.implode(', ', array_map(fn ($f) => ['full_name' => 'name', 'dob' => 'date of birth', 'gender' => 'gender'][$f], $identity)) : '').
                ($request->input('change_reason') ? ': '.$request->input('change_reason') : '')) ?: null,
        );

        return response()->json(['data' => new PatientResource($patient->load('registeredBy')), 'changed' => $dirty]);
    }

    public function uploadPhoto(Request $request, Patient $patient): JsonResponse
    {
        $request->validate(['photo' => ['required', 'image', 'mimes:jpeg,png,webp', 'max:4096']]);

        $old = $patient->photo_path;
        $path = $request->file('photo')->store('patient-photos', 'local');
        $patient->update(['photo_path' => $path, 'updated_by' => $request->user()->id]);
        if ($old) {
            Storage::disk('local')->delete($old);
        }
        AuditLogger::log('update', 'patients', $patient->id, ['photo' => $old ? 'replaced' : null], ['photo' => 'uploaded']);

        return response()->json(['data' => new PatientResource($patient->load('registeredBy'))]);
    }

    public function photo(Patient $patient): Response
    {
        abort_unless($patient->photo_path && Storage::disk('local')->exists($patient->photo_path), 404);

        return Storage::disk('local')->response($patient->photo_path, null, ['Cache-Control' => 'private, max-age=300']);
    }

    public function audit(Patient $patient): JsonResponse
    {
        $logs = AuditLog::with('user:id,name')
            ->where('table_name', 'patients')
            ->where('record_id', $patient->id)
            ->orderByDesc('at')->orderByDesc('id')
            ->limit(200)
            ->get();

        return response()->json(['data' => $logs->map(fn (AuditLog $l) => [
            'id' => $l->id,
            'action' => $l->action,
            'at' => $l->at->toIso8601String(),
            'user' => $l->user?->name,
            'old_value' => $l->old_value,
            'new_value' => $l->new_value,
            'note' => $l->note,
        ])]);
    }

    public function cardPdf(Request $request, Patient $patient): Response
    {
        $layout = in_array($request->query('layout'), ['card', 'sticker', 'both'], true) ? $request->query('layout') : 'both';
        $barcode = base64_encode((new BarcodeGeneratorPNG)->getBarcode($patient->uhid, BarcodeGeneratorPNG::TYPE_CODE_128, 2, 60));

        AuditLogger::log('print', 'patients', $patient->id, note: "Registration {$layout} (PDF)");

        return Pdf::loadView('pdf.registration-card', [
            'patient' => $patient,
            'hospital' => config('hospital'),
            'barcode' => $barcode,
            'layout' => $layout,
        ])->setPaper('a4')->download("registration-{$patient->uhid}.pdf");
    }

    public function printed(Request $request, Patient $patient): JsonResponse
    {
        $data = $request->validate(['layout' => ['required', 'in:card,sticker,both'], 'copies' => ['nullable', 'integer', 'min:1', 'max:20']]);
        AuditLogger::log('print', 'patients', $patient->id, note: "Registration {$data['layout']} × ".($data['copies'] ?? 1));

        return response()->json(['ok' => true]);
    }

    /** @return array{0: ?string, 1: bool} */
    private function dobFromInput(array $data): array
    {
        if (! empty($data['dob'])) {
            return [$data['dob'], false];
        }
        if (isset($data['age_years'])) {
            return [now()->subYears((int) $data['age_years'])->toDateString(), true];
        }

        return [null, false];
    }

    private function formatMatches($matches): array
    {
        return $matches->map(fn ($m) => [
            'patient' => new PatientResource($m['patient']),
            'reasons' => $m['reasons'],
            'strong' => $m['strong'],
        ])->values()->all();
    }

    private function auditValues(Patient $patient): array
    {
        $values = [];
        foreach (self::AUDITED as $f) {
            $v = $patient->getAttribute($f);
            $values[$f] = $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : $v;
        }
        // Keep ID numbers out of the log in full.
        if ($values['id_proof_number']) {
            $values['id_proof_number'] = $patient->maskedIdProof();
        }

        return $values;
    }
}
