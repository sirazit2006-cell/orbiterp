<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\SettingsController;
use Illuminate\Support\Facades\Route;

// Role codes: reception, nurse, doctor, billing, admin
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('auth/refresh', [AuthController::class, 'refresh'])->middleware('throttle:30,1');
Route::post('auth/logout', [AuthController::class, 'logout']);

Route::middleware('jwt')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::get('settings/hospital', [SettingsController::class, 'hospital']);

    // Everyone in the v1 flow can find and view a patient...
    Route::get('patients', [PatientController::class, 'index']);
    Route::get('patients/recent', [PatientController::class, 'recent']);
    Route::get('patients/stats', [PatientController::class, 'stats']);
    Route::get('patients/{patient}', [PatientController::class, 'show'])->whereNumber('patient');
    Route::get('patients/{patient}/photo', [PatientController::class, 'photo'])->whereNumber('patient');

    // ...but only reception and admin register, edit, print cards or read the change history.
    Route::middleware('role:reception,admin')->group(function () {
        Route::post('patients/duplicates', [PatientController::class, 'duplicates']);
        Route::post('patients', [PatientController::class, 'store']);
        Route::put('patients/{patient}', [PatientController::class, 'update'])->whereNumber('patient');
        Route::post('patients/{patient}/photo', [PatientController::class, 'uploadPhoto'])->whereNumber('patient');
        Route::get('patients/{patient}/audit', [PatientController::class, 'audit'])->whereNumber('patient');
        Route::get('patients/{patient}/card.pdf', [PatientController::class, 'cardPdf'])->whereNumber('patient');
        Route::post('patients/{patient}/printed', [PatientController::class, 'printed'])->whereNumber('patient');
    });
});
