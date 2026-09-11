export const LocationType = {
  OFFICE: 'OFFICE',
  STORE_ROOM: 'STORE_ROOM',
  WAREHOUSE: 'WAREHOUSE',
} as const;
export type LocationType = (typeof LocationType)[keyof typeof LocationType];
export const LOCATION_TYPES = Object.values(LocationType);

export const EmployeeStatus = {
  ACTIVE: 'ACTIVE',
  /** Soft-archived. Employee rows are never deleted (CLAUDE.md §2.2). */
  EXITED: 'EXITED',
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];
export const EMPLOYEE_STATUSES = Object.values(EmployeeStatus);
