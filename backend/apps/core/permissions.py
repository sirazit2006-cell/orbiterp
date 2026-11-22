from rest_framework.permissions import SAFE_METHODS, BasePermission


def role_permission(read=(), write=()):
    """Build a DRF permission class from the roles allowed to read and to write.

    Writers can always read. Superusers and admins pass everything.
    """

    read_roles = set(read) | set(write) | {"admin"}
    write_roles = set(write) | {"admin"}

    class RolePermission(BasePermission):
        def has_permission(self, request, view):
            user = request.user
            if not user or not user.is_authenticated:
                return False
            allowed = read_roles if request.method in SAFE_METHODS else write_roles
            return user.has_role(*allowed)

    RolePermission.__name__ = f"RolePermission(read={sorted(read_roles)}, write={sorted(write_roles)})"
    return RolePermission


IsAdmin = role_permission()
