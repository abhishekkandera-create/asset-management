import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: { database: 'up' | 'down' };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and database readiness' })
  async check(): Promise<HealthReport> {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database },
    };
  }
}
