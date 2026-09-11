import { AssetStatus } from './enums/asset';

/**
 * The allow-list from CLAUDE.md §6. Anything absent here is rejected with 422.
 *
 * This table lives in @asset/shared rather than in the API alone because the
 * frontend needs it too: action buttons on the asset detail page are enabled or
 * disabled from the same source of truth (CLAUDE.md §9.4). The API's
 * AssetStateMachine service is the only thing allowed to *apply* a transition;
 * the frontend may only read this table to decide what to render.
 */
export const ASSET_TRANSITIONS: Readonly<Record<AssetStatus, readonly AssetStatus[]>> =
  Object.freeze({
    [AssetStatus.IN_STOCK]: Object.freeze([
      AssetStatus.ASSIGNED,
      AssetStatus.IN_REPAIR,
      AssetStatus.RETIRED,
      AssetStatus.LOST,
    ]),
    [AssetStatus.ASSIGNED]: Object.freeze([
      AssetStatus.RETURNED_PENDING_CHECK,
      AssetStatus.IN_REPAIR,
      AssetStatus.LOST,
    ]),
    [AssetStatus.RETURNED_PENDING_CHECK]: Object.freeze([
      AssetStatus.IN_STOCK,
      AssetStatus.IN_REPAIR,
      AssetStatus.RETIRED,
    ]),
    [AssetStatus.IN_REPAIR]: Object.freeze([
      AssetStatus.IN_STOCK,
      AssetStatus.ASSIGNED,
      AssetStatus.RETIRED,
    ]),
    [AssetStatus.LOST]: Object.freeze([AssetStatus.IN_STOCK]),
    [AssetStatus.RETIRED]: Object.freeze([]),
  });

/** The only status an asset may be created in. */
export const INITIAL_ASSET_STATUS: AssetStatus = AssetStatus.IN_STOCK;

/**
 * `from === null` means creation, which may only produce IN_STOCK.
 * A no-op transition (from === to) is not allowed: it would write a
 * meaningless event into an append-only log.
 */
export function canTransition(from: AssetStatus | null, to: AssetStatus): boolean {
  if (from === null) return to === INITIAL_ASSET_STATUS;
  return ASSET_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: AssetStatus | null): readonly AssetStatus[] {
  if (from === null) return [INITIAL_ASSET_STATUS];
  return ASSET_TRANSITIONS[from];
}

export function isTerminal(status: AssetStatus): boolean {
  return ASSET_TRANSITIONS[status].length === 0;
}
