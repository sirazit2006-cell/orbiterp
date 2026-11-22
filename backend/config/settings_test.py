"""Settings for the automated test suite: SQLite, fast password hashing."""

import os

os.environ.setdefault("DJANGO_DEBUG", "1")
os.environ.setdefault("DB_ENGINE", "sqlite")

from .settings import *  # noqa: E402,F401,F403

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
DATABASES["default"]["NAME"] = ":memory:"  # noqa: F405
