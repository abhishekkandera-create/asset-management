import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AssetEvent, ListAssetEventsQuery, Paginated } from '@asset/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate, toSkipTake } from '../../common/utils';

/**
 * Read side of the append-only audit trail. There is deliberately no update
 * or delete here, and no endpoint that reaches them (CLAUDE.md §2.3) —
 * corrections are new NOTE_ADDED rows written by AssetStateMachine.
 */
const EVENT_INCLUDE = {
  actor: { select: { id: true, fullName: true, email: true } },
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  location: { select: { id: true, name: true, city: true } },
} satisfies Prisma.AssetEventInclude;

type EventRow = Prisma.AssetEventGetPayload<{ include: typeof EVENT_INCLUDE }>;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The asset history feed — the most-used read in the system (§5.4). */
  async historyForAsset(
    assetId: string,
    query: ListAssetEventsQuery,
  ): Promise<Paginated<AssetEvent>> {
    const where: Prisma.AssetEventWhereInput = { assetId };

    if (query.eventType) {
      where.eventType = Array.isArray(query.eventType) ? { in: query.eventType } : query.eventType;
    }
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.from || query.to) {
      where.occurredAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assetEvent.findMany({
        where,
        include: EVENT_INCLUDE,
        // Newest first, with id as the tiebreaker so two events recorded in
        // the same transaction still come back in a stable order.
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.assetEvent.count({ where }),
    ]);

    return paginate(rows.map(toAssetEvent), total, query.page, query.pageSize);
  }

  /** Every event that mentions an employee, for the employee detail page. */
  async historyForEmployee(
    employeeId: string,
    query: { page: number; pageSize: number },
  ): Promise<Paginated<AssetEvent>> {
    const where: Prisma.AssetEventWhereInput = { employeeId };
    const { skip, take } = toSkipTake(query.page, query.pageSize);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assetEvent.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.assetEvent.count({ where }),
    ]);

    return paginate(rows.map(toAssetEvent), total, query.page, query.pageSize);
  }
}

export function toAssetEvent(row: EventRow): AssetEvent {
  return {
    id: row.id,
    assetId: row.assetId,
    eventType: row.eventType,
    occurredAt: row.occurredAt.toISOString(),
    performedBy: row.performedBy,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    employeeId: row.employeeId,
    locationId: row.locationId,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    notes: row.notes,
    actor: row.actor,
    employee: row.employee
      ? {
          id: row.employee.id,
          employeeCode: row.employee.employeeCode,
          fullName: `${row.employee.firstName} ${row.employee.lastName}`,
        }
      : null,
    location: row.location,
  };
}
