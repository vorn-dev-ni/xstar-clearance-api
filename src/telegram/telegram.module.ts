import { Global, Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

/**
 * Global module so any service — and the global exception filter in CommonModule —
 * can inject TelegramService without importing this module explicitly.
 */
@Global()
@Module({
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
