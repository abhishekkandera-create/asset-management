import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [EventsModule, AssignmentsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
