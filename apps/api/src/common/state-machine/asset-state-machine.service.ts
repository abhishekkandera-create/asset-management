import { Injectable, Logger } from '@nestjs/common';
import {
  AssetEventType as PrismaAssetEventType,
  AssetStatus as PrismaAssetStatus,
  ConditionGrade as PrismaConditionGrade,
  EventReferenceType as PrismaEventReferenceType,
} from '@prisma/client';
import {
  ASSET_TRANSITIONS,
  AssetStatus,
  INITIAL_ASSET_STATUS,
  allowedTransitions,
  canTransition,
  isTerminal,
} from '@asset/shared';
import { InvalidTransitionError, StaleVersionError } from '../errors';
import type { PrismaTransaction } from '../prisma/prisma.service';

export interface TransitionInput {
  assetId: string;
  /** The status the caller believes the asset is in. Checked, not trusted. */
  from: AssetStatus;
  to: AssetStatus;
  eventType: PrismaAssetEventType;
  performedBy: string;
  /** Optional side effects applied in the same statement as the status change. */
  conditionGrade?: PrismaConditionGrade;
  locationId?: string;
  /** Event context. */
  employeeId?: string | null;
  eventLocationId?: string | null;
  referenceType?: PrismaEventReferenceType | null;
  referenceId?: string | null;
  notes?: string | null;
  occurredAt?: Date;
}

export interface TransitionResult {
  assetId: string;
  from: AssetStatus;
  to: AssetStatus;
  version: number;
  eventId: string;
}

/**
 * The only component permitted to write `asset.status` (CLAUDE.md §2.5).
 *
 * Every transition is checked against the frozen allow-list in @asset/shared,
 * applied with a status-guarded UPDATE so a concurrent change cannot be
 * clobbered, and paired with an `asset_event` row written in the same
 * transaction (CLAUDE.md §2.3).
 */
@Injectable()
export class AssetStateMachine {
  private readonly logger = new Logger(AssetStateMachine.name);

  /** The only status an asset may be created in. */
  readonly initialStatus = INITIAL_ASSET_STATUS;

  canTransition(from: AssetStatus | null, to: AssetStatus): boolean {
    return canTransition(from, to);
  }

  allowedFrom(from: AssetStatus | null): readonly AssetStatus[] {
    return allowedTransitions(from);
  }

  isTerminal(status: AssetStatus): boolean {
    return isTerminal(status);
  }

  /** Throws the 422-mapped domain error when the move is not on the allow-list. */
  assertCanTransition(from: AssetStatus | null, to: AssetStatus): void {
    if (this.canTransition(from, to)) return;
    throw new InvalidTransitionError(from ?? 'NEW', to, this.allowedFrom(from));
  }

  /**
   * Applies a transition and records it. Must be called inside a
   * `prisma.$transaction`, with `tx` the transactional client — otherwise the
   * status change and its event could be committed separately.
   */
  async transition(tx: PrismaTransaction, input: TransitionInput): Promise<TransitionResult> {
    this.assertCanTransition(input.from, input.to);

    // Guarding on the expected status means a racing transition loses here
    // rather than silently overwriting the winner's work.
    const updated = await tx.asset.updateMany({
      where: { id: input.assetId, status: input.from as PrismaAssetStatus },
      data: {
        status: input.to as PrismaAssetStatus,
        ...(input.conditionGrade ? { conditionGrade: input.conditionGrade } : {}),
        ...(input.locationId ? { locationId: input.locationId } : {}),
        version: { increment: 1 },
        updatedBy: input.performedBy,
      },
    });

    if (updated.count === 0) {
      throw new StaleVersionError('Asset', input.assetId);
    }

    const asset = await tx.asset.findUniqueOrThrow({
      where: { id: input.assetId },
      select: { version: true, locationId: true },
    });

    const event = await tx.assetEvent.create({
      data: {
        assetId: input.assetId,
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date(),
        performedBy: input.performedBy,
        fromStatus: input.from as PrismaAssetStatus,
        toStatus: input.to as PrismaAssetStatus,
        employeeId: input.employeeId ?? null,
        locationId: input.eventLocationId ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });

    this.logger.debug(
      { assetId: input.assetId, from: input.from, to: input.to, eventType: input.eventType },
      'Asset status transitioned',
    );

    return {
      assetId: input.assetId,
      from: input.from,
      to: input.to,
      version: asset.version,
      eventId: event.id,
    };
  }

  /**
   * Records something that happened to an asset without changing its status —
   * a note, or a serial-number correction (CLAUDE.md §7.5).
   */
  async recordEvent(
    tx: PrismaTransaction,
    input: {
      assetId: string;
      eventType: PrismaAssetEventType;
      performedBy: string;
      employeeId?: string | null;
      locationId?: string | null;
      referenceType?: PrismaEventReferenceType | null;
      referenceId?: string | null;
      notes: string;
      occurredAt?: Date;
    },
  ): Promise<string> {
    const event = await tx.assetEvent.create({
      data: {
        assetId: input.assetId,
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date(),
        performedBy: input.performedBy,
        fromStatus: null,
        toStatus: null,
        employeeId: input.employeeId ?? null,
        locationId: input.locationId ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes,
      },
      select: { id: true },
    });
    return event.id;
  }

  /** Exposed for the API docs and the frontend's action-button logic. */
  get transitions(): Readonly<Record<AssetStatus, readonly AssetStatus[]>> {
    return ASSET_TRANSITIONS;
  }
}
