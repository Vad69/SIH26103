export const CREATABLE_ROLES = ["project_manager", "team_member"];

export function isAdmin(user) {
  return user?.role === "admin";
}

export function canWriteProjects(user) {
  return user?.role === "admin" || user?.role === "project_manager";
}

export function canManageUsers(user) {
  return isAdmin(user);
}

export function normalizeCreatableRole(role) {
  const value = String(role || "").trim();
  if (value === "admin") {
    return { ok: false, error: "A second Admin cannot be created." };
  }
  if (!CREATABLE_ROLES.includes(value)) {
    return { ok: false, error: "Role must be Member or Project Manager." };
  }
  return { ok: true, role: value };
}

export function assertCanDeleteUser(actor, target) {
  if (!isAdmin(actor)) return { ok: false, status: 403, error: "Only the Admin can remove users." };
  if (!target) return { ok: false, status: 404, error: "User not found." };
  if (target.role === "admin") return { ok: false, status: 403, error: "The Admin account cannot be removed." };
  if (actor.id === target.id) return { ok: false, status: 400, error: "You cannot remove your own account." };
  return { ok: true };
}
