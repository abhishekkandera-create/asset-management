import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  Assignment,
  AssetEvent,
  AuthUser,
  Clearance,
  Employee,
  EmployeeHoldings,
  Paginated,
} from '@asset/shared';
import { UserRole } from '@asset/shared';
import { CurrentUser, Roles } from '../../common/decorators';
import { UuidParam } from '../../common/pipes/uuid-param.pipe';
import { EventsService } from '../events/events.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  ExitEmployeeDto,
  ListAssignmentsQueryDto,
  ListEmployeesQueryDto,
  PaginationQueryDto,
  UpdateEmployeeDto,
} from './dto/employees.dto';

/**
 * There is no delete endpoint here, and there never will be: employees are
 * soft-archived so the audit trail keeps pointing at a real row (§2.2).
 */
@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly assignments: AssignmentsService,
    private readonly events: EventsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Paginated, searchable employee list' })
  list(@Query() query: ListEmployeesQueryDto): Promise<Paginated<Employee>> {
    return this.employees.list(query);
  }

  @Get('departments')
  @ApiOperation({ summary: 'Distinct department names, for filter dropdowns' })
  departments(): Promise<string[]> {
    return this.employees.departments();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One employee' })
  findOne(@UuidParam('id') id: string): Promise<Employee> {
    return this.employees.findOne(id);
  }

  @Get(':id/assets')
  @ApiOperation({ summary: 'What this employee currently holds' })
  holdings(@UuidParam('id') id: string): Promise<EmployeeHoldings> {
    return this.employees.holdings(id);
  }

  @Get(':id/assignments')
  @ApiOperation({ summary: 'Full assignment history for this employee, past and present' })
  assignmentHistory(
    @UuidParam('id') id: string,
    @Query() query: ListAssignmentsQueryDto,
  ): Promise<Paginated<Assignment>> {
    return this.assignments.list({ ...query, employeeId: id });
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Every asset event that involved this employee' })
  history(
    @UuidParam('id') id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<AssetEvent>> {
    return this.events.historyForEmployee(id, query);
  }

  @Get(':id/clearance')
  @ApiOperation({ summary: 'Open assignments blocking this employee from being marked as exited' })
  clearance(@UuidParam('id') id: string): Promise<Clearance> {
    return this.employees.clearance(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add an employee record' })
  create(@Body() body: CreateEmployeeDto, @CurrentUser('id') actorId: string): Promise<Employee> {
    return this.employees.create(body, actorId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit an employee. Exit goes through POST /:id/exit.' })
  update(
    @UuidParam('id') id: string,
    @Body() body: UpdateEmployeeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<Employee> {
    return this.employees.update(id, body, actorId);
  }

  @Post(':id/exit')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an employee as exited; blocked while they still hold anything' })
  @ApiResponse({ status: 422, description: 'EMPLOYEE_HAS_OPEN_ASSIGNMENTS' })
  exit(
    @UuidParam('id') id: string,
    @Body() body: ExitEmployeeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Employee> {
    return this.employees.exit(id, body, user.id);
  }
}
