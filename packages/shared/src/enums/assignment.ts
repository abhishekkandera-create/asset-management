export const AssignmentStatus = {
  /** Currently held. At most one per asset — enforced by a partial unique index. */
  OPEN: 'OPEN',
  /** Physically returned. */
  CLOSED: 'CLOSED',
  /** Closed without a physical return: holder exited, or asset lost. */
  WRITTEN_OFF: 'WRITTEN_OFF',
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];
export const ASSIGNMENT_STATUSES = Object.values(AssignmentStatus);
