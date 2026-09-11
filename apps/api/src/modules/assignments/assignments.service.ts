import { Injectable, Logger } from '@nestjs/common';
import { AssetEventType, AssetStatus, AssignmentStatus, Prisma } from '@prisma/client';
import { Assignment, ListAssignmentsQuery, Paginated, WriteOffAssignment } from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssetStateMachine } from '../../common/state-machine';
import { BusinessRuleError, RecordNotFoundError } from '../../common/errors';
import { ErrorCode } from '@asset/shared';
import { paginate, parseDateOnly, todayUtc, toSkipTake } from '../../common/utils';
import { ASSIGNMENT_INCLUDE, toAssignment } from './assignments.mapper';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: AssetStateMachine,
  ) {}

  async list(query: ListAssignmentsQuery): Promise<Paginated<Assignment>> {
    const where: Prisma.AssignmentWhereInput = {};

    if (query.assetId) where.assetId = query.assetId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.issuedFrom || query.issuedTo) {
      where.issuedOn = {
        ...(query.issuedFrom ? { gte: parseDateOnly(query.issuedFrom) } : {}),
        ...(query.issuedTo ? { lte: parseDateOnly(query.issuedTo) } : {}),
      };
    }
    if (query.overdueOnly) {
      where.status = AssignmentStatus.OPEN;
      where.expectedReturnOn = { lt: todayUtc() };
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        include: ASSIGNMENT_INCLUDE,
        orderBy: [{ issuedOn: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return paginate(rows.map(toAssignment), total, query.page, query.pageSize);
  }

  async findOne(id: string): Promise<Assignment> {
    const row = await this.prisma.assignment.findUnique({
      where: { id },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!row) throw new RecordNotFoundError('Assignment', id);
    return toAssignment(row);
  }

  /**
   * Closes an assignment without a physical return (CLAUDE.md §5.3) — the exit
   * clearance escape hatch when an employee leaves without handing something
   * back. `returnedOn` and `conditionIn` stay null: nothing came back.
   */
  async writeOff(id: string, input: WriteOffAssignment, actorId: string): Promise<Assignment> {
    const today = todayUtc();

    const row = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id },
        include: { asset: { select: { id: true, status: true, assetTag: true } }, employee: true },
      });
      if (!assignment) throw new RecordNotFoundError('Assignment', id);
      if (assignment.status !== AssignmentStatus.OPEN) {
        throw new BusinessRuleError(
          ErrorCode.ASSIGNMENT_NOT_OPEN,
          'Only an open assignment can be written off',
          { status: assignment.status },
        );
      }

      await tx.assignment.update({
        where: { id },
        data: {
          status: AssignmentStatus.WRITTEN_OFF,
          closedOn: today,
          returnRemarks: input.remarks ?? `Written off: ${input.reason}`,
        },
      });

      await this.stateMachine.recordEvent(tx, {
        assetId: assignment.assetId,
        eventType: AssetEventType.WRITTEN_OFF,
        performedBy: actorId,
        employeeId: assignment.employeeId,
        referenceType: 'ASSIGNMENT',
        referenceId: assignment.id,
        notes:
          `Assignment to ${assignment.employee.firstName} ${assignment.employee.lastName} ` +
          `written off without a return. Reason: ${input.reason}`,
      });

      // The hardware is gone, so the asset follows the assignment into LOST.
      // Marking it lost is optional: an asset that is simply unaccounted for
      // at a desk may still be recoverable.
      if (input.markAssetLost && assignment.asset.status === AssetStatus.ASSIGNED) {
        await this.stateMachine.transition(tx, {
          assetId: assignment.assetId,
          from: assignment.asset.status,
          to: AssetStatus.LOST,
          eventType: AssetEventType.MARKED_LOST,
          performedBy: actorId,
          employeeId: assignment.employeeId,
          referenceType: 'ASSIGNMENT',
          referenceId: assignment.id,
          notes: `Not returned at exit clearance. ${input.reason}`,
        });
      }

      return tx.assignment.findUniqueOrThrow({ where: { id }, include: ASSIGNMENT_INCLUDE });
    });

    this.logger.warn({ assignmentId: id, actorId }, 'Assignment written off');
    return toAssignment(row);
  }
}
