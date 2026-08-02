import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SendMessageDto } from './dto/send-message.dto';
import { TelegramService, type TelegramSendResult } from './telegram.service';

/**
 * Manual Telegram sends for verifying the alert channel end-to-end. Left under
 * the global JwtAuthGuard (authenticated users only) so it can't be used as an
 * open spam relay.
 */
@ApiTags('telegram')
@ApiBearerAuth()
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Post('test')
  @ApiOperation({ summary: 'Send a canned test alert to the Telegram channel' })
  sendTest(): Promise<TelegramSendResult> {
    return this.telegram.sendTestAlert();
  }

  @Post('message')
  @ApiOperation({
    summary: 'Send an arbitrary message to the Telegram channel',
  })
  sendMessage(@Body() dto: SendMessageDto): Promise<TelegramSendResult> {
    return this.telegram.sendMessage(dto.text);
  }
}
