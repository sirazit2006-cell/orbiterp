<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patients', function (Blueprint $table) {
            $table->id();
            $table->string('uhid', 30)->unique();

            // Required
            $table->string('full_name', 150)->index();
            $table->enum('gender', ['male', 'female', 'other']);
            $table->date('dob')->index();
            $table->boolean('dob_is_estimated')->default(false); // entered as age, not a date
            $table->string('mobile', 10)->index(); // 10-digit Indian mobile; shared by family members
            $table->string('address_line', 255);
            $table->string('city', 80)->index();
            $table->string('state', 80);
            $table->string('pin_code', 6);

            // Optional
            $table->string('email', 150)->nullable();
            $table->string('blood_group', 3)->nullable();
            $table->string('emergency_contact_name', 150)->nullable();
            $table->string('emergency_contact_mobile', 10)->nullable();
            $table->string('id_proof_type', 30)->nullable();
            $table->string('id_proof_number', 40)->nullable();
            $table->string('abha_number', 14)->nullable()->unique();
            $table->string('photo_path')->nullable();

            // DPDP Act consent
            $table->timestamp('consent_at')->nullable();
            $table->foreignId('consent_recorded_by')->nullable()->constrained('users');

            // System
            $table->timestamp('registered_at')->index();
            $table->foreignId('registered_by')->constrained('users');
            // Nothing clinical is hard-deleted; records are only marked inactive.
            $table->boolean('is_active')->default(true);

            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->foreignId('updated_by')->nullable()->constrained('users');
            $table->timestamps();
        });

        // One running number per registration year: HOSP-2026-000123
        Schema::create('uhid_sequences', function (Blueprint $table) {
            $table->unsignedSmallInteger('year')->primary();
            $table->unsignedInteger('last_number')->default(0);
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users');
            $table->string('action', 30); // create, update, view, print, login, logout, login_failed
            $table->string('table_name', 60)->nullable();
            $table->unsignedBigInteger('record_id')->nullable();
            $table->json('old_value')->nullable();
            $table->json('new_value')->nullable();
            $table->string('note', 255)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('at')->useCurrent();
            $table->index(['table_name', 'record_id']);
            $table->index('at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('uhid_sequences');
        Schema::dropIfExists('patients');
    }
};
