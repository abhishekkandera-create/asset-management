import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  Assignment,
  Paginated,
  UserRole,
  listAssignmentsQuerySchema,
  writeOffAssignmentSchema,
} from '@asset/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { UuidParam } from '../../common/pipes/uuid-param.pipe';
import { AssignmentsService } from './assignments.service';

class ListAssignmentsQueryDto extends createZodDto(listAssignmentsQuerySchema) {}
class WriteOffAssignmentDto extends createZodDto(writeOffAssignmentSchema) {}

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'The assignment ledger: who held what, and when' })
  list(@Query() query: ListAssignmentsQueryDto): Promise<Paginated<Assignment>> {
    return this.assignments.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One assignment' })
  findOne(@UuidParam('id') id: string): Promise<Assignment> {
    return this.assignments.findOne(id);
  }

  @Post(':id/write-off')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close an assignment without a physical return' })
  writeOff(
    @UuidParam('id') id: string,
    @Body() body: WriteOffAssignmentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<Assignment> {
    return this.assignments.writeOff(id, body, actorId);
  }
}
