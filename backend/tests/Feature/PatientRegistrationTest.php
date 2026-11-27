<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Patient;
use App\Models\User;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PatientRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function as(string $role): array
    {
        $user = User::factory()->withRole($role)->create();
        $this->actingUser = $user;

        return ['Authorization' => 'Bearer '.app(JwtService::class)->issueAccessToken($user)];
    }

    private ?User $actingUser = null;

    private function payload(array $over = []): array
    {
        return array_merge([
            'full_name' => 'Rahul Deshmukh',
            'gender' => 'male',
            'dob' => '1985-03-14',
            'mobile' => '+91 98765 43210',
            'address_line' => 'Flat 402, Shivneri Apartments, Kothrud',
            'city' => 'Pune',
            'state' => 'Maharashtra',
            'pin_code' => '411038',
            'consent' => true,
        ], $over);
    }

    public function test_reception_registers_a_patient_and_gets_a_uhid(): void
    {
        $h = $this->as('reception');
        $year = now()->year;

        $res = $this->postJson('/api/patients', $this->payload(), $h)->assertCreated();
        $res->assertJsonPath('data.uhid', "HOSP-{$year}-000001")
            ->assertJsonPath('data.mobile', '9876543210')
            ->assertJsonPath('data.registered_by.id', $this->actingUser->id);
        $this->assertNotNull($res->json('data.consent_at'));

        $second = $this->postJson('/api/patients', $this->payload(['full_name' => 'Sunita Deshmukh', 'gender' => 'female', 'dob' => '1988-07-02']), $h);
        $second->assertCreated()->assertJsonPath('data.uhid', "HOSP-{$year}-000002");

        $this->assertDatabaseHas('audit_logs', ['action' => 'create', 'table_name' => 'patients', 'record_id' => $res->json('data.id')]);
    }

    public function test_required_fields_and_formats_are_validated(): void
    {
        $h = $this->as('reception');
        $this->postJson('/api/patients', ['consent' => false], $h)->assertStatus(422)
            ->assertJsonValidationErrors(['full_name', 'gender', 'dob', 'mobile', 'address_line', 'city', 'state', 'pin_code', 'consent']);

        $this->postJson('/api/patients', $this->payload(['mobile' => '12345', 'pin_code' => '0110', 'abha_number' => '12-34', 'email' => 'x']), $h)
            ->assertStatus(422)->assertJsonValidationErrors(['mobile', 'pin_code', 'abha_number', 'email']);

        $this->postJson('/api/patients', $this->payload(['id_proof_type' => 'Aadhaar', 'id_proof_number' => '1234']), $h)
            ->assertStatus(422)->assertJsonValidationErrors(['id_proof_number']);
    }

    public function test_age_can_be_given_instead_of_date_of_birth(): void
    {
        $h = $this->as('reception');
        $res = $this->postJson('/api/patients', $this->payload(['dob' => null, 'age_years' => 41]), $h)->assertCreated();
        $res->assertJsonPath('data.dob_is_estimated', true)->assertJsonPath('data.age_years', 41);
    }

    public function test_consent_is_required(): void
    {
        $h = $this->as('reception');
        $this->postJson('/api/patients', $this->payload(['consent' => false]), $h)->assertStatus(422)->assertJsonValidationErrors(['consent']);
    }

    public function test_duplicate_on_mobile_name_and_dob_is_blocked_until_confirmed(): void
    {
        $h = $this->as('reception');
        $this->postJson('/api/patients', $this->payload(), $h)->assertCreated();

        $dup = $this->postJson('/api/patients', $this->payload(['full_name' => '  rahul   DESHMUKH ']), $h);
        $dup->assertStatus(409)->assertJsonPath('code', 'possible_duplicate')->assertJsonPath('matches.0.strong', true);

        $this->postJson('/api/patients', $this->payload(['confirm_new_patient' => true]), $h)->assertCreated();
        $this->assertSame(2, Patient::count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'create', 'note' => 'Saved as new patient after duplicate warning']);
    }

    public function test_family_members_can_share_a_mobile_number(): void
    {
        $h = $this->as('reception');
        $this->postJson('/api/patients', $this->payload(), $h)->assertCreated();
        $this->postJson('/api/patients', $this->payload(['full_name' => 'Aarav Deshmukh', 'dob' => '2017-01-20']), $h)->assertCreated();

        $check = $this->postJson('/api/patients/duplicates', ['mobile' => '98765 43210', 'full_name' => 'Sunita Deshmukh', 'dob' => '1988-07-02'], $h)->assertOk();
        $this->assertCount(2, $check->json('data'));
        $this->assertFalse($check->json('data.0.strong'));
        $this->assertSame(['mobile'], $check->json('data.0.reasons'));
    }

    public function test_duplicate_check_flags_name_and_dob_on_another_mobile(): void
    {
        $h = $this->as('reception');
        $this->postJson('/api/patients', $this->payload(), $h)->assertCreated();
        $check = $this->postJson('/api/patients/duplicates', ['mobile' => '9123456789', 'full_name' => 'Rahul Deshmukh', 'dob' => '1985-03-14'], $h)->assertOk();
        $this->assertSame(['name', 'dob'], $check->json('data.0.reasons'));
    }

    public function test_search_by_mobile_name_and_uhid(): void
    {
        $h = $this->as('reception');
        $a = $this->postJson('/api/patients', $this->payload(), $h)->json('data');
        $this->postJson('/api/patients', $this->payload(['full_name' => 'Sunita Deshmukh', 'gender' => 'female', 'dob' => '1988-07-02']), $h);
        $this->postJson('/api/patients', $this->payload(['full_name' => 'Priya Menon', 'gender' => 'female', 'dob' => '1992-12-04', 'mobile' => '9900112233']), $h);

        $byMobile = $this->getJson('/api/patients?q='.urlencode('98765 43210'), $h)->assertOk();
        $this->assertCount(2, $byMobile->json('data'));
        $this->assertSame('9876543210', $byMobile->json('shared_mobile'));

        $this->assertCount(2, $this->getJson('/api/patients?q=deshm', $h)->json('data'));
        $this->assertCount(1, $this->getJson('/api/patients?q=rahul+desh', $h)->json('data'));
        $this->assertSame($a['uhid'], $this->getJson('/api/patients?q='.$a['uhid'], $h)->json('data.0.uhid'));
        $this->assertSame($a['uhid'], $this->getJson('/api/patients?q=000001&by=uhid', $h)->json('data.0.uhid'));
        $this->assertCount(0, $this->getJson('/api/patients?q=menon&by=mobile', $h)->json('data'));

        $this->getJson('/api/patients?q=ab', $h)->assertStatus(422);
    }

    public function test_viewing_a_patient_is_logged_and_shows_family(): void
    {
        $h = $this->as('reception');
        $a = $this->postJson('/api/patients', $this->payload(), $h)->json('data');
        $this->postJson('/api/patients', $this->payload(['full_name' => 'Aarav Deshmukh', 'dob' => '2017-01-20']), $h);

        $nurse = $this->as('nurse');
        $res = $this->getJson("/api/patients/{$a['id']}", $nurse)->assertOk();
        $this->assertCount(1, $res->json('family'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'view', 'record_id' => $a['id'], 'user_id' => $this->actingUser->id]);
        // Nurses see the masked ID only
        $this->assertArrayNotHasKey('id_proof_number', $res->json('data'));
    }

    public function test_only_reception_and_admin_can_register_or_edit(): void
    {
        foreach (['nurse', 'doctor', 'billing'] as $role) {
            $this->postJson('/api/patients', $this->payload(), $this->as($role))->assertForbidden();
        }
        $this->postJson('/api/patients', $this->payload(), $this->as('admin'))->assertCreated();
        $id = Patient::first()->id;
        $this->putJson("/api/patients/{$id}", $this->payload(['city' => 'Mumbai']), $this->as('doctor'))->assertForbidden();
        $this->getJson("/api/patients/{$id}/audit", $this->as('nurse'))->assertForbidden();
    }

    public function test_identity_edits_need_a_reason_and_are_logged_with_old_and_new_values(): void
    {
        $h = $this->as('reception');
        $id = $this->postJson('/api/patients', $this->payload(), $h)->json('data.id');

        $this->putJson("/api/patients/{$id}", $this->payload(['full_name' => 'Rahul S. Deshmukh']), $h)
            ->assertStatus(422)->assertJsonValidationErrors(['change_reason']);

        $this->putJson("/api/patients/{$id}", $this->payload(['full_name' => 'Rahul S. Deshmukh', 'dob' => '1985-03-15', 'change_reason' => 'Spelling as on Aadhaar']), $h)
            ->assertOk()->assertJsonPath('data.full_name', 'Rahul S. Deshmukh');

        $log = AuditLog::where('action', 'update')->latest('id')->first();
        $this->assertSame('Rahul Deshmukh', $log->old_value['full_name']);
        $this->assertSame('Rahul S. Deshmukh', $log->new_value['full_name']);
        $this->assertSame('1985-03-14', $log->old_value['dob']);
        $this->assertSame('1985-03-15', $log->new_value['dob']);
        $this->assertStringContainsString('Spelling as on Aadhaar', $log->note);

        // Non-identity changes need no reason and only changed fields are logged
        $this->putJson("/api/patients/{$id}", $this->payload(['full_name' => 'Rahul S. Deshmukh', 'dob' => '1985-03-15', 'city' => 'Mumbai']), $h)->assertOk();
        $log = AuditLog::where('action', 'update')->latest('id')->first();
        $this->assertSame(['city' => 'Pune'], $log->old_value);

        $trail = $this->getJson("/api/patients/{$id}/audit", $h)->assertOk();
        $this->assertSame('update', $trail->json('data.0.action'));
    }

    public function test_audit_log_cannot_be_edited_or_deleted(): void
    {
        $h = $this->as('reception');
        $this->postJson('/api/patients', $this->payload(), $h);
        $log = AuditLog::first();

        $this->expectException(\LogicException::class);
        $log->update(['action' => 'tampered']);
    }

    public function test_photo_upload_and_download(): void
    {
        Storage::fake('local');
        $h = $this->as('reception');
        $id = $this->postJson('/api/patients', $this->payload(), $h)->json('data.id');

        $this->post("/api/patients/{$id}/photo", ['photo' => UploadedFile::fake()->image('p.jpg', 300, 300)], $h + ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.has_photo', true);
        $this->get("/api/patients/{$id}/photo", $h)->assertOk();
    }

    public function test_registration_card_pdf_and_print_logging(): void
    {
        $h = $this->as('reception');
        $id = $this->postJson('/api/patients', $this->payload(), $h)->json('data.id');

        $pdf = $this->get("/api/patients/{$id}/card.pdf?layout=both", $h)->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('content-type'));
        $this->postJson("/api/patients/{$id}/printed", ['layout' => 'sticker', 'copies' => 2], $h)->assertOk();
        $this->assertSame(2, AuditLog::where('action', 'print')->count());
    }

    public function test_recent_and_stats(): void
    {
        $h = $this->as('reception');
        $this->postJson('/api/patients', $this->payload(), $h);
        $old = Patient::factory()->create(['registered_at' => now()->subDays(10)]);
        $this->getJson("/api/patients/{$old->id}", $h);

        $recent = $this->getJson('/api/patients/recent', $h)->assertOk();
        $this->assertCount(2, $recent->json('data'));
        $this->assertSame($old->id, $recent->json('data.0.patient.id'));
        $this->assertFalse($recent->json('data.0.registered_today'));

        $this->getJson('/api/patients/stats', $h)->assertOk()
            ->assertJsonPath('registered_today', 1)->assertJsonPath('registered_by_me_today', 1)->assertJsonPath('total_patients', 2);
    }
}
