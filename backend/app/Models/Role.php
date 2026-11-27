<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    public const RECEPTION = 'reception';
    public const NURSE = 'nurse';
    public const DOCTOR = 'doctor';
    public const BILLING = 'billing';
    public const ADMIN = 'admin';

    public const ALL = [
        self::RECEPTION => 'Reception',
        self::NURSE => 'Nurse',
        self::DOCTOR => 'Doctor',
        self::BILLING => 'Billing cashier',
        self::ADMIN => 'Admin',
    ];

    protected $fillable = ['code', 'name'];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class);
    }
}
