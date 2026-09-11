import { describe, expect, it } from 'vitest';
import { ASSET_STATUSES, type AssetStatus, INITIAL_ASSET_STATUS } from '@asset/shared';
import { AssetStateMachine } from '../../src/common/state-machine/asset-state-machine.service';
import { InvalidTransitionError } from '../../src/common/errors';

/**
 * The table from CLAUDE.md §6, transcribed by hand rather than imported from
 * the implementation. If someone edits ASSET_TRANSITIONS, this list is what
 * disagrees with them.
 */
const SPEC_TABLE: Array<[AssetStatus | null, AssetStatus, string]> = [
  [null, 'IN_STOCK', 'Asset created / purchase received'],
  ['IN_STOCK', 'ASSIGNED', 'Issue to employee'],
  ['IN_STOCK', 'IN_REPAIR', 'Fault found in storage'],
  ['IN_STOCK', 'RETIRED', 'Disposal of unissued stock'],
  ['IN_STOCK', 'LOST', 'Stock audit discrepancy'],
  ['ASSIGNED', 'RETURNED_PENDING_CHECK', 'Employee returns it'],
  ['ASSIGNED', 'IN_REPAIR', 'Breaks while in use'],
  ['ASSIGNED', 'LOST', 'Reported lost or stolen'],
  ['RETURNED_PENDING_CHECK', 'IN_STOCK', 'Passed inspection, wiped, ready to reissue'],
  ['RETURNED_PENDING_CHECK', 'IN_REPAIR', 'Failed inspection'],
  ['RETURNED_PENDING_CHECK', 'RETIRED', 'Beyond economical repair'],
  ['IN_REPAIR', 'IN_STOCK', 'Repair complete'],
  ['IN_REPAIR', 'ASSIGNED', 'Repair complete, returned to same holder'],
  ['IN_REPAIR', 'RETIRED', 'Declared irreparable'],
  ['LOST', 'IN_STOCK', 'Recovered'],
];

const machine = new AssetStateMachine();

describe('AssetStateMachine (CLAUDE.md §6)', () => {
  describe('every transition in the spec table is allowed', () => {
    it.each(SPEC_TABLE)('%s -> %s (%s)', (from, to) => {
      expect(machine.canTransition(from, to)).toBe(true);
      expect(() => machine.assertCanTransition(from, to)).not.toThrow();
    });
  });

  describe('every transition absent from the spec table is rejected', () => {
    // Exhaustive over all 36 status pairs plus the 6 creation cases, rather
    // than a sample: a new status added to the enum cannot slip through.
    const allPairs: Array<[AssetStatus | null, AssetStatus]> = [];
    for (const to of ASSET_STATUSES) allPairs.push([null, to]);
    for (const from of ASSET_STATUSES) {
      for (const to of ASSET_STATUSES) allPairs.push([from, to]);
    }

    const allowed = new Set(SPEC_TABLE.map(([from, to]) => `${from}->${to}`));
    const forbidden = allPairs.filter(([from, to]) => !allowed.has(`${from}->${to}`));

    it('covers the whole matrix', () => {
      expect(allPairs).toHaveLength(42);
      expect(forbidden).toHaveLength(42 - SPEC_TABLE.length);
    });

    it.each(forbidden)('%s -> %s is rejected', (from, to) => {
      expect(machine.canTransition(from, to)).toBe(false);
      expect(() => machine.assertCanTransition(from, to)).toThrow(InvalidTransitionError);
    });
  });

  describe('the cases the spec calls out by name', () => {
    it('cannot resurrect a retired asset — RETIRED is terminal', () => {
      expect(machine.isTerminal('RETIRED')).toBe(true);
      expect(machine.allowedFrom('RETIRED')).toEqual([]);
      for (const to of ASSET_STATUSES) {
        expect(machine.canTransition('RETIRED', to)).toBe(false);
      }
    });

    it('never lets a return land straight in stock (CLAUDE.md §7.4)', () => {
      // The inspection step is deliberate: it stops damaged hardware being
      // silently reissued.
      expect(machine.canTransition('ASSIGNED', 'IN_STOCK')).toBe(false);
      expect(machine.canTransition('ASSIGNED', 'RETURNED_PENDING_CHECK')).toBe(true);
      expect(machine.canTransition('RETURNED_PENDING_CHECK', 'IN_STOCK')).toBe(true);
    });

    it('never issues straight from repair, lost or retired (CLAUDE.md §7.1)', () => {
      expect(machine.canTransition('IN_REPAIR', 'ASSIGNED')).toBe(true); // back to the same holder
      expect(machine.canTransition('LOST', 'ASSIGNED')).toBe(false);
      expect(machine.canTransition('RETIRED', 'ASSIGNED')).toBe(false);
      expect(machine.canTransition('RETURNED_PENDING_CHECK', 'ASSIGNED')).toBe(false);
    });

    it('lets a recovered asset re-enter stock but not go straight to a holder', () => {
      expect(machine.allowedFrom('LOST')).toEqual(['IN_STOCK']);
    });

    it('creates assets only in IN_STOCK', () => {
      expect(machine.initialStatus).toBe(INITIAL_ASSET_STATUS);
      for (const to of ASSET_STATUSES) {
        expect(machine.canTransition(null, to)).toBe(to === 'IN_STOCK');
      }
    });

    it('treats a no-op transition as invalid, so no empty event is written', () => {
      for (const status of ASSET_STATUSES) {
        expect(machine.canTransition(status, status)).toBe(false);
      }
    });
  });

  describe('the error it throws', () => {
    it('maps to 422 and names what would have been allowed', () => {
      try {
        machine.assertCanTransition('RETIRED', 'ASSIGNED');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        const domainError = error as InvalidTransitionError;
        expect(domainError.status).toBe(422);
        expect(domainError.code).toBe('INVALID_TRANSITION');
        expect(domainError.details).toEqual({ from: 'RETIRED', to: 'ASSIGNED', allowed: [] });
      }
    });

    it('describes a creation attempt as coming from NEW', () => {
      try {
        machine.assertCanTransition(null, 'ASSIGNED');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as InvalidTransitionError).details).toMatchObject({ from: 'NEW' });
      }
    });
  });

  describe('the transition table itself', () => {
    it('is frozen, so nothing can widen it at runtime', () => {
      expect(Object.isFrozen(machine.transitions)).toBe(true);
      expect(Object.isFrozen(machine.transitions.IN_STOCK)).toBe(true);
      expect(() => {
        (machine.transitions.RETIRED as AssetStatus[]).push('ASSIGNED');
      }).toThrow();
    });

    it('has an entry for every status, so allowedFrom never returns undefined', () => {
      for (const status of ASSET_STATUSES) {
        expect(machine.allowedFrom(status)).toBeInstanceOf(Array);
      }
    });
  });
});
