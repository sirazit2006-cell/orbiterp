<?php

return [
    'name' => env('HOSPITAL_NAME', '[Hospital name]'),
    'address' => env('HOSPITAL_ADDRESS', '[Hospital address]'),
    'phone' => env('HOSPITAL_PHONE', '[Hospital phone]'),
    'opd_hours' => env('HOSPITAL_OPD_HOURS', '[OPD timings]'),

    // UHID looks like HOSP-2026-000123: prefix, registration year, 6-digit running number per year.
    'uhid_prefix' => env('UHID_PREFIX', 'HOSP'),
];
