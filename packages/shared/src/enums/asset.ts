/**
 * Lifecycle status of an individually tracked asset.
 * Only AssetStateMachine may cause a value here to change (CLAUDE.md §2.5).
 */
export const AssetStatus = {
  IN_STOCK: 'IN_STOCK',
  ASSIGNED: 'ASSIGNED',
  RETURNED_PENDING_CHECK: 'RETURNED_PENDING_CHECK',
  IN_REPAIR: 'IN_REPAIR',
  RETIRED: 'RETIRED',
  LOST: 'LOST',
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];
export const ASSET_STATUSES = Object.values(AssetStatus);

/** Statuses from which an asset can never be issued (CLAUDE.md §7.1). */
export const NON_ISSUABLE_STATUSES: readonly AssetStatus[] = [
  AssetStatus.IN_REPAIR,
  AssetStatus.RETIRED,
  AssetStatus.LOST,
];

/** Terminal statuses — no transition leaves them. */
export const TERMINAL_STATUSES: readonly AssetStatus[] = [AssetStatus.RETIRED];

export const ConditionGrade = {
  NEW: 'NEW',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  POOR: 'POOR',
  DAMAGED: 'DAMAGED',
} as const;
export type ConditionGrade = (typeof ConditionGrade)[keyof typeof ConditionGrade];
export const CONDITION_GRADES = Object.values(ConditionGrade);

/** How a category's stock is counted. */
export const TrackingMode = {
  /** One `asset` row per physical unit, with a tag and a serial. */
  SERIALIZED: 'SERIALIZED',
  /** No per-unit rows; a quantity per (model, location) in `stock_balance`. */
  BULK: 'BULK',
} as const;
export type TrackingMode = (typeof TrackingMode)[keyof typeof TrackingMode];
export const TRACKING_MODES = Object.values(TrackingMode);

/** Outcome chosen by the inspector after a return (CLAUDE.md §8). */
export const InspectionOutcome = {
  TO_STOCK: 'TO_STOCK',
  TO_REPAIR: 'TO_REPAIR',
  RETIRE: 'RETIRE',
} as const;
export type InspectionOutcome = (typeof InspectionOutcome)[keyof typeof InspectionOutcome];
export const INSPECTION_OUTCOMES = Object.values(InspectionOutcome);
