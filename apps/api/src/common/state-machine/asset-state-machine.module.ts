import { Global, Module } from '@nestjs/common';
import { AssetStateMachine } from './asset-state-machine.service';

/**
 * Global so no module can accidentally provide its own instance and bypass
 * the single-writer rule (CLAUDE.md §2.5).
 */
@Global()
@Module({
  providers: [AssetStateMachine],
  exports: [AssetStateMachine],
})
export class AssetStateMachineModule {}
