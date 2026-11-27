<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory;

    protected $fillable = ['username', 'name', 'email', 'desk', 'password', 'is_active'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }

    /** @return list<string> */
    public function roleCodes(): array
    {
        return $this->roles->pluck('code')->values()->all();
    }

    public function hasAnyRole(string ...$codes): bool
    {
        return count(array_intersect($this->roleCodes(), $codes)) > 0;
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'name' => $this->name,
            'desk' => $this->desk,
            'roles' => $this->roleCodes(),
        ];
    }
}
