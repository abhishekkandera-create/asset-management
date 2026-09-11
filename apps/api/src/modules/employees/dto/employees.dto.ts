import { createZodDto } from 'nestjs-zod';
import {
  createEmployeeSchema,
  exitEmployeeSchema,
  listAssignmentsQuerySchema,
  listEmployeesQuerySchema,
  paginationQuerySchema,
  updateEmployeeSchema,
} from '@asset/shared';

export class ListEmployeesQueryDto extends createZodDto(listEmployeesQuerySchema) {}
export class CreateEmployeeDto extends createZodDto(createEmployeeSchema) {}
export class UpdateEmployeeDto extends createZodDto(updateEmployeeSchema) {}
export class ExitEmployeeDto extends createZodDto(exitEmployeeSchema) {}
export class ListAssignmentsQueryDto extends createZodDto(listAssignmentsQuerySchema) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
