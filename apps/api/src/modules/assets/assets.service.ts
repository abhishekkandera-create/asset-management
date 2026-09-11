import { Injectable, Logger } from '@nestjs/common';
import {
  AssetEventType,
  AssetStatus,
  AssignmentStatus,
  EmployeeStatus,
  Prisma,
} from '@prisma/client';
import {
  AddAssetNote,
  Asset,
  CorrectSerialNumber,
  CreateAsset,
  ErrorCode,
  InspectAsset,
  InspectionOutcome,
  IssueAsset,
  ListAssetsQuery,
  MarkLost,
  NON_ISSUABLE_STATUSES,
  Paginated,
  RecoverAsset,
  RelocateAsset,
  RetireAsset,
  ReturnAsset,
  TransferAsset,
  UpdateAsset,
} from '@asset/shared';
import { PrismaService, PrismaTransaction } from '../../common/prisma/prisma.service';
import { AssetStateMachine } from '../../common/state-machine';
import {
  AssetNotAssignedError,
  AssetNotAvailableError,
  BusinessRuleError,
  EmployeeExitedError,
  RecordNotFoundError,
  StaleVersionError,
  isOpenAssignmentConflict,
} from '../../common/errors';
import { AssetAlreadyAssignedError } from '../../common/errors/domain-error';
import { addMonths, formatDateOnly, paginate, parseDateOnly, todayUtc } from '../../common/utils';
import { ASSET_INCLUDE, AssetsRepository, toAsset } from './assets.repository';

/** The acting app user, threaded into every event and audit column. */
export interface Actor {
  id: string;
  role: string;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AssetsRepository,
    private readonly stateMachine: AssetStateMachine,
  ) {}

  // --- reads ----------------------------------------------------------------

  async list(query: ListAssetsQuery): Promise<Paginated<Asset>> {
    const { rows, total } = await this.repository.list(query);
    return paginate(rows.map(toAsset), total, query.page, query.pageSize);
  }

  async findOne(id: string): Promise<Asset> {
    const row = await this.repository.findById(id);
    if (!row) throw new RecordNotFoundError('Asset', id);
    return toAsset(row);
  }

  /** The transitions the UI may offer for this asset right now (§9.4). */
  async availableActions(id: string): Promise<{ status: AssetStatus; allowedTo: string[] }> {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!asset) throw new RecordNotFoundError('Asset', id);
    return { status: asset.status, allowedTo: [...this.stateMachine.allowedFrom(asset.status)] };
  }

  // --- creation and edits ---------------------------------------------------

  async create(input: CreateAsset, actor: Actor): Promise<Asset> {
    const model = await this.prisma.assetModel.findUnique({
      where: { id: input.modelId },
      include: { category: true },
    });
    if (!model) throw new RecordNotFoundError('Asset model', input.modelId);
    if (!model.isActive) {
      throw new BusinessRuleError(
        ErrorCode.REFERENCED_RECORD_INACTIVE,
        'This model is inactive and cannot take new assets',
        { modelId: input.modelId },
      );
    }
    if (model.category.trackingMode === 'BULK') {
      throw new BusinessRuleError(
        ErrorCode.VALIDATION_FAILED,
        `${model.category.name} is a bulk-tracked category. Record it as stock, not as an individual asset.`,
        { categoryId: model.categoryId },
      );
    }
    if (model.category.requiresSerial && !input.serialNumber) {
      throw new BusinessRuleError(
        ErrorCode.SERIAL_REQUIRED,
        `A serial number is required for ${model.category.name}`,
        { categoryId: model.categoryId },
      );
    }

    await this.assertLocationIsUsable(input.locationId);

    // Warranty is computed once here and stored, never derived on read
    // (CLAUDE.md §7.6). With no explicit date, fall back to the model default
    // measured from today, which is the best information a manual entry has.
    const warrantyExpiresOn = input.warrantyExpiresOn
      ? parseDateOnly(input.warrantyExpiresOn)
      : model.defaultWarrantyMonths
        ? addMonths(todayUtc(), model.defaultWarrantyMonths)
        : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          assetTag: input.assetTag,
          serialNumber: input.serialNumber ?? null,
          modelId: input.modelId,
          status: this.stateMachine.initialStatus,
          conditionGrade: input.conditionGrade,
          locationId: input.locationId,
          warrantyExpiresOn,
          notes: input.notes ?? null,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      });

      // Creation is the one status "transition" with no prior state, so the
      // event is written directly rather than through transition().
      await tx.assetEvent.create({
        data: {
          assetId: asset.id,
          eventType: AssetEventType.STOCK_IN,
          performedBy: actor.id,
          fromStatus: null,
          toStatus: AssetStatus.IN_STOCK,
          locationId: input.locationId,
          notes: input.notes ?? 'Asset created and added to stock',
        },
      });

      return tx.asset.findUniqueOrThrow({ where: { id: asset.id }, include: ASSET_INCLUDE });
    });

    this.logger.log({ assetId: created.id, assetTag: created.assetTag }, 'Asset created');
    return toAsset(created);
  }

  /**
   * `assetTag` and `serialNumber` are absent from UpdateAsset by design:
   * the tag is immutable and the serial has its own audited endpoint
   * (CLAUDE.md §7.5).
   */
  async update(id: string, input: UpdateAsset, actor: Actor): Promise<Asset> {
    const existing = await this.prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new RecordNotFoundError('Asset', id);

    if (input.version !== undefined && input.version !== existing.version) {
      throw new StaleVersionError('Asset', id);
    }
    if (input.locationId && input.locationId !== existing.locationId) {
      await this.assertLocationIsUsable(input.locationId);
    }

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.conditionGrade ? { conditionGrade: input.conditionGrade } : {}),
        ...(input.locationId ? { locationId: input.locationId } : {}),
        ...(input.warrantyExpiresOn !== undefined
          ? {
              warrantyExpiresOn: input.warrantyExpiresOn
                ? parseDateOnly(input.warrantyExpiresOn)
                : null,
            }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: ASSET_INCLUDE,
    });

    return toAsset(updated);
  }

  /** ADMIN only. Records the old and new value in the audit trail (§7.5). */
  async correctSerialNumber(id: string, input: CorrectSerialNumber, actor: Actor): Promise<Asset> {
    const existing = await this.prisma.asset.findUnique({ where: { id } });
    if (!existing) throw new RecordNotFoundError('Asset', id);
    if (existing.serialNumber === input.serialNumber) {
      throw new BusinessRuleError(
        ErrorCode.VALIDATION_FAILED,
        'The serial number is already set to that value',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.update({
        where: { id },
        data: {
          serialNumber: input.serialNumber,
          version: { increment: 1 },
          updatedBy: actor.id,
        },
      });

      await this.stateMachine.recordEvent(tx, {
        assetId: id,
        eventType: AssetEventType.NOTE_ADDED,
        performedBy: actor.id,
        notes:
          `Serial number corrected from ${existing.serialNumber ?? '(none)'} to ` +
          `${input.serialNumber}. Reason: ${input.reason}`,
      });

      return tx.asset.findUniqueOrThrow({ where: { id: asset.id }, include: ASSET_INCLUDE });
    });

    this.logger.log({ assetId: id, actorId: actor.id }, 'Serial number corrected');
    return toAsset(updated);
  }

  async addNote(id: string, input: AddAssetNote, actor: Actor): Promise<Asset> {
    const asset = await this.repository.findById(id);
    if (!asset) throw new RecordNotFoundError('Asset', id);

    await this.prisma.$transaction(async (tx) => {
      await this.stateMachine.recordEvent(tx, {
        assetId: id,
        eventType: AssetEventType.NOTE_ADDED,
        performedBy: actor.id,
        notes: input.notes,
      });
    });

    return toAsset(asset);
  }

  // --- lifecycle ------------------------------------------------------------

  /** CLAUDE.md §8: POST /assets/:id/issue */
  async issue(id: string, input: IssueAsset, actor: Actor): Promise<Asset> {
    const issuedOn = input.issuedOn ? parseDateOnly(input.issuedOn) : todayUtc();
    const expectedReturnOn = input.expectedReturnOn ? parseDateOnly(input.expectedReturnOn) : null;

    if (expectedReturnOn && expectedReturnOn < issuedOn) {
      throw new BusinessRuleError(
        ErrorCode.VALIDATION_FAILED,
        'The expected return date cannot be before the issue date',
      );
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const asset = await this.lockAsset(tx, id);
        const employee = await this.requireIssuableEmployee(tx, input.employeeId);

        // §7.1 — repair, retired and lost assets are never issuable. The state
        // machine would reject these anyway; the specific error is kinder.
        if (NON_ISSUABLE_STATUSES.includes(asset.status)) {
          throw new AssetNotAvailableError(asset.assetTag, asset.status);
        }
        if (asset.status === AssetStatus.RETURNED_PENDING_CHECK) {
          throw new BusinessRuleError(
            ErrorCode.ASSET_NOT_AVAILABLE,
            `Asset ${asset.assetTag} is awaiting inspection. Inspect it before issuing it again.`,
            { assetTag: asset.assetTag, status: asset.status },
          );
        }
        if (asset.status === AssetStatus.ASSIGNED) {
          throw new AssetAlreadyAssignedError(id);
        }

        const assignment = await tx.assignment.create({
          data: {
            assetId: id,
            employeeId: employee.id,
            issuedOn,
            issuedBy: actor.id,
            expectedReturnOn,
            conditionOut: input.conditionOut,
            issueRemarks: input.remarks ?? null,
            status: AssignmentStatus.OPEN,
          },
        });

        await this.stateMachine.transition(tx, {
          assetId: id,
          from: asset.status,
          to: AssetStatus.ASSIGNED,
          eventType: AssetEventType.ISSUED,
          performedBy: actor.id,
          conditionGrade: input.conditionOut,
          employeeId: employee.id,
          // The employee's own location, so the history shows where it went
          // even though the asset keeps its owning location.
          eventLocationId: employee.locationId,
          referenceType: 'ASSIGNMENT',
          referenceId: assignment.id,
          notes:
            input.remarks ??
            `Issued to ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
        });

        return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
      });

      this.logger.log({ assetId: id, employeeId: input.employeeId }, 'Asset issued');
      return toAsset(row);
    } catch (error) {
      // The partial unique index is the real guard against two concurrent
      // issues; translate its violation into the documented 409 (§2.4).
      if (isOpenAssignmentConflict(error)) throw new AssetAlreadyAssignedError(id);
      throw error;
    }
  }

  /** CLAUDE.md §8: POST /assets/:id/return. Always lands in RETURNED_PENDING_CHECK (§7.4). */
  async returnAsset(id: string, input: ReturnAsset, actor: Actor): Promise<Asset> {
    const returnedOn = input.returnedOn ? parseDateOnly(input.returnedOn) : todayUtc();

    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await this.lockAsset(tx, id);
      const assignment = await this.requireOpenAssignment(tx, id, asset.assetTag);

      if (returnedOn < assignment.issuedOn) {
        throw new BusinessRuleError(
          ErrorCode.VALIDATION_FAILED,
          'The return date cannot be before the issue date',
          { issuedOn: formatDateOnly(assignment.issuedOn) },
        );
      }

      await tx.assignment.update({
        where: { id: assignment.id },
        data: {
          status: AssignmentStatus.CLOSED,
          returnedOn,
          closedOn: returnedOn,
          receivedBy: actor.id,
          conditionIn: input.conditionIn,
          returnRemarks: input.remarks ?? null,
        },
      });

      await this.stateMachine.transition(tx, {
        assetId: id,
        from: asset.status,
        to: AssetStatus.RETURNED_PENDING_CHECK,
        eventType: AssetEventType.RETURNED,
        performedBy: actor.id,
        conditionGrade: input.conditionIn,
        employeeId: assignment.employeeId,
        referenceType: 'ASSIGNMENT',
        referenceId: assignment.id,
        notes:
          input.remarks ??
          `Returned by ${assignment.employee.firstName} ${assignment.employee.lastName}, ` +
            `condition recorded as ${input.conditionIn}`,
      });

      return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
    });

    this.logger.log({ assetId: id }, 'Asset returned, awaiting inspection');
    return toAsset(row);
  }

  /** CLAUDE.md §8: POST /assets/:id/inspect */
  async inspect(id: string, input: InspectAsset, actor: Actor): Promise<Asset> {
    const target = INSPECTION_TARGET[input.outcome];

    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await this.lockAsset(tx, id);

      if (asset.status !== AssetStatus.RETURNED_PENDING_CHECK) {
        throw new BusinessRuleError(
          ErrorCode.INVALID_TRANSITION,
          `Only an asset awaiting inspection can be inspected. ${asset.assetTag} is ${asset.status}.`,
          { assetTag: asset.assetTag, status: asset.status },
        );
      }

      await this.stateMachine.transition(tx, {
        assetId: id,
        from: asset.status,
        to: target,
        eventType: AssetEventType.INSPECTED,
        performedBy: actor.id,
        conditionGrade: input.conditionGrade,
        notes: input.notes ?? INSPECTION_NOTE[input.outcome],
      });

      return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
    });

    this.logger.log({ assetId: id, outcome: input.outcome }, 'Asset inspected');
    return toAsset(row);
  }

  /**
   * CLAUDE.md §8 and §7.9: POST /assets/:id/transfer.
   *
   * Close A's assignment, inspect, open B's — all in one transaction, writing
   * three events. It is not a shortcut around the inspection gate: the
   * condition it came back in is recorded before it goes out again.
   */
  async transfer(id: string, input: TransferAsset, actor: Actor): Promise<Asset> {
    const today = todayUtc();
    const expectedReturnOn = input.expectedReturnOn ? parseDateOnly(input.expectedReturnOn) : null;

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const asset = await this.lockAsset(tx, id);
        const assignment = await this.requireOpenAssignment(tx, id, asset.assetTag);
        const recipient = await this.requireIssuableEmployee(tx, input.toEmployeeId);

        if (assignment.employeeId === recipient.id) {
          throw new BusinessRuleError(
            ErrorCode.TRANSFER_TO_SAME_EMPLOYEE,
            'This asset is already issued to that employee',
            { employeeId: recipient.id },
          );
        }

        // 1. Return from the current holder.
        await tx.assignment.update({
          where: { id: assignment.id },
          data: {
            status: AssignmentStatus.CLOSED,
            returnedOn: today,
            closedOn: today,
            receivedBy: actor.id,
            conditionIn: input.conditionIn,
            returnRemarks: input.remarks ?? 'Returned for direct transfer to another employee',
          },
        });

        await this.stateMachine.transition(tx, {
          assetId: id,
          from: asset.status,
          to: AssetStatus.RETURNED_PENDING_CHECK,
          eventType: AssetEventType.RETURNED,
          performedBy: actor.id,
          conditionGrade: input.conditionIn,
          employeeId: assignment.employeeId,
          referenceType: 'ASSIGNMENT',
          referenceId: assignment.id,
          notes: `Returned by ${assignment.employee.firstName} ${assignment.employee.lastName} for transfer`,
        });

        // 2. Inspect.
        await this.stateMachine.transition(tx, {
          assetId: id,
          from: AssetStatus.RETURNED_PENDING_CHECK,
          to: AssetStatus.IN_STOCK,
          eventType: AssetEventType.INSPECTED,
          performedBy: actor.id,
          conditionGrade: input.conditionIn,
          notes: `Inspected during transfer; condition ${input.conditionIn}`,
        });

        // 3. Issue to the recipient.
        const newAssignment = await tx.assignment.create({
          data: {
            assetId: id,
            employeeId: recipient.id,
            issuedOn: today,
            issuedBy: actor.id,
            expectedReturnOn,
            conditionOut: input.conditionOut,
            issueRemarks: input.remarks ?? 'Received by direct transfer',
            status: AssignmentStatus.OPEN,
          },
        });

        await this.stateMachine.transition(tx, {
          assetId: id,
          from: AssetStatus.IN_STOCK,
          to: AssetStatus.ASSIGNED,
          eventType: AssetEventType.TRANSFERRED,
          performedBy: actor.id,
          conditionGrade: input.conditionOut,
          employeeId: recipient.id,
          eventLocationId: recipient.locationId,
          referenceType: 'ASSIGNMENT',
          referenceId: newAssignment.id,
          notes:
            `Transferred from ${assignment.employee.firstName} ${assignment.employee.lastName} ` +
            `to ${recipient.firstName} ${recipient.lastName} (${recipient.employeeCode})`,
        });

        return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
      });

      this.logger.log({ assetId: id, toEmployeeId: input.toEmployeeId }, 'Asset transferred');
      return toAsset(row);
    } catch (error) {
      if (isOpenAssignmentConflict(error)) throw new AssetAlreadyAssignedError(id);
      throw error;
    }
  }

  /** CLAUDE.md §8: POST /assets/:id/mark-lost */
  async markLost(id: string, input: MarkLost, actor: Actor): Promise<Asset> {
    const today = todayUtc();

    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await this.lockAsset(tx, id);

      const assignment = await tx.assignment.findFirst({
        where: { assetId: id, status: AssignmentStatus.OPEN },
        include: { employee: true },
      });

      // A lost asset that was issued closes its assignment as WRITTEN_OFF —
      // there was no physical return, so returnedOn stays null (§5.3).
      if (assignment) {
        await tx.assignment.update({
          where: { id: assignment.id },
          data: {
            status: AssignmentStatus.WRITTEN_OFF,
            closedOn: today,
            returnRemarks: `Written off: asset reported lost. ${input.notes}`,
          },
        });

        await this.stateMachine.recordEvent(tx, {
          assetId: id,
          eventType: AssetEventType.WRITTEN_OFF,
          performedBy: actor.id,
          employeeId: assignment.employeeId,
          referenceType: 'ASSIGNMENT',
          referenceId: assignment.id,
          notes: `Assignment written off because the asset was reported lost. ${input.notes}`,
        });
      }

      await this.stateMachine.transition(tx, {
        assetId: id,
        from: asset.status,
        to: AssetStatus.LOST,
        eventType: AssetEventType.MARKED_LOST,
        performedBy: actor.id,
        employeeId: assignment?.employeeId ?? null,
        notes: input.notes,
      });

      return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
    });

    this.logger.warn({ assetId: id, actorId: actor.id }, 'Asset marked lost');
    return toAsset(row);
  }

  /** LOST -> IN_STOCK. The only way out of LOST (CLAUDE.md §6). */
  async recover(id: string, input: RecoverAsset, actor: Actor): Promise<Asset> {
    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await this.lockAsset(tx, id);
      if (input.locationId) await this.assertLocationIsUsable(input.locationId, tx);

      await this.stateMachine.transition(tx, {
        assetId: id,
        from: asset.status,
        to: AssetStatus.IN_STOCK,
        eventType: AssetEventType.STOCK_IN,
        performedBy: actor.id,
        conditionGrade: input.conditionGrade,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        eventLocationId: input.locationId ?? asset.locationId,
        notes: `Recovered and returned to stock. ${input.notes}`,
      });

      return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
    });

    return toAsset(row);
  }

  async retire(id: string, input: RetireAsset, actor: Actor): Promise<Asset> {
    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await this.lockAsset(tx, id);

      await this.stateMachine.transition(tx, {
        assetId: id,
        from: asset.status,
        to: AssetStatus.RETIRED,
        eventType: AssetEventType.RETIRED,
        performedBy: actor.id,
        notes: input.notes,
      });

      return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
    });

    this.logger.log({ assetId: id }, 'Asset retired');
    return toAsset(row);
  }

  /**
   * Moves an asset's owning location. Not in §8's endpoint list, but the
   * TRANSFERRED event type and the by-location reports both need it.
   */
  async relocate(id: string, input: RelocateAsset, actor: Actor): Promise<Asset> {
    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await this.lockAsset(tx, id);
      if (asset.locationId === input.locationId) {
        throw new BusinessRuleError(
          ErrorCode.VALIDATION_FAILED,
          'The asset is already at that location',
        );
      }
      const [from, to] = await Promise.all([
        tx.location.findUnique({ where: { id: asset.locationId }, select: { name: true } }),
        this.assertLocationIsUsable(input.locationId, tx),
      ]);

      await tx.asset.update({
        where: { id },
        data: { locationId: input.locationId, version: { increment: 1 }, updatedBy: actor.id },
      });

      await this.stateMachine.recordEvent(tx, {
        assetId: id,
        eventType: AssetEventType.TRANSFERRED,
        performedBy: actor.id,
        locationId: input.locationId,
        notes: input.notes ?? `Moved from ${from?.name ?? 'an unknown location'} to ${to.name}`,
      });

      return tx.asset.findUniqueOrThrow({ where: { id }, include: ASSET_INCLUDE });
    });

    return toAsset(row);
  }

  // --- shared guards --------------------------------------------------------

  /**
   * Reads the asset with a row lock so two lifecycle actions on the same asset
   * serialise instead of interleaving. The partial unique index still has the
   * final word on double issues; this stops the rest.
   */
  private async lockAsset(
    tx: PrismaTransaction,
    id: string,
  ): Promise<{ id: string; assetTag: string; status: AssetStatus; locationId: string }> {
    const rows = await tx.$queryRaw<
      Array<{ id: string; asset_tag: string; status: AssetStatus; location_id: string }>
      // No ::uuid cast — Prisma maps `String @id` to a `text` column, and
      // `text = uuid` has no operator in Postgres.
    >(
      Prisma.sql`SELECT "id", "asset_tag", "status", "location_id" FROM "asset" WHERE "id" = ${id} FOR UPDATE`,
    );

    const row = rows[0];
    if (!row) throw new RecordNotFoundError('Asset', id);
    return { id: row.id, assetTag: row.asset_tag, status: row.status, locationId: row.location_id };
  }

  /** §7.2 — an exited employee can never receive an asset. */
  private async requireIssuableEmployee(tx: PrismaTransaction, employeeId: string) {
    const employee = await tx.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new RecordNotFoundError('Employee', employeeId);
    if (employee.status === EmployeeStatus.EXITED) throw new EmployeeExitedError(employeeId);
    return employee;
  }

  private async requireOpenAssignment(tx: PrismaTransaction, assetId: string, assetTag: string) {
    const assignment = await tx.assignment.findFirst({
      where: { assetId, status: AssignmentStatus.OPEN },
      include: { employee: true },
    });
    if (!assignment) throw new AssetNotAssignedError(assetTag);
    return assignment;
  }

  private async assertLocationIsUsable(
    locationId: string,
    tx?: PrismaTransaction,
  ): Promise<{ id: string; name: string }> {
    const client = tx ?? this.prisma;
    const location = await client.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, isActive: true },
    });
    if (!location) throw new RecordNotFoundError('Location', locationId);
    if (!location.isActive) {
      throw new BusinessRuleError(
        ErrorCode.REFERENCED_RECORD_INACTIVE,
        `${location.name} is inactive and cannot hold assets`,
        { locationId },
      );
    }
    return { id: location.id, name: location.name };
  }
}

const INSPECTION_TARGET: Record<InspectionOutcome, AssetStatus> = {
  TO_STOCK: AssetStatus.IN_STOCK,
  TO_REPAIR: AssetStatus.IN_REPAIR,
  RETIRE: AssetStatus.RETIRED,
};

const INSPECTION_NOTE: Record<InspectionOutcome, string> = {
  TO_STOCK: 'Passed inspection, wiped and returned to stock',
  TO_REPAIR: 'Failed inspection; sent for repair',
  RETIRE: 'Beyond economical repair; retired',
};
