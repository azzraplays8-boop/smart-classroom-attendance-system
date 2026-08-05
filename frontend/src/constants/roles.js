/**
 * Centralized role constants & helpers for the enterprise RBAC system.
 */

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  administrator: "Administrator",
  teacher: "Teacher",
  moderator: "Moderator",
  encoder: "Encoder",
  viewer: "Viewer",
};

export const ASSIGNABLE_ROLES = [
  "administrator",
  "teacher",
  "moderator",
  "encoder",
  "viewer",
];

export const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role] || role,
}));

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || "Unknown";
}
