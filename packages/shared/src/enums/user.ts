/** Roles of the IT staff who log in. Employees are not users (CLAUDE.md §1). */
export const UserRole = {
  /** Everything, plus masters, purchases, users and corrections. */
  ADMIN: 'ADMIN',
  /** Issue, return, inspect, transfer, manage stock and repairs. */
  STORE_KEEPER: 'STORE_KEEPER',
  /** Read-only access to everything. */
  VIEWER: 'VIEWER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole);

/** Ascending privilege. A guard requiring STORE_KEEPER also admits ADMIN. */
export const ROLE_RANK: Record<UserRole, number> = {
  VIEWER: 0,
  STORE_KEEPER: 1,
  ADMIN: 2,
};

export function roleAtLeast(actual: UserRole, required: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
