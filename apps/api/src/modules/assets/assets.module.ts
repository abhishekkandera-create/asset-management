import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetsRepository } from './assets.repository';

@Module({
  imports: [EventsModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetsRepository],
  exports: [AssetsService, AssetsRepository],
})
export class AssetsModule {}
