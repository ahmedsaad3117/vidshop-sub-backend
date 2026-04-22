import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { FreemiusWebhookDto } from './dto/freemius-webhook.dto';
import { FreemiusService } from './freemius.service';
import { PaymentsService } from './payments.service';

@ApiTags('webhooks')
@Controller('webhooks/freemius')
export class FreemiusWebhookController {
  private readonly logger = new Logger(FreemiusWebhookController.name);

  constructor(
    private readonly freemiusService: FreemiusService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  @HttpCode(200)
  @SkipThrottle()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }))
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: FreemiusWebhookDto,
    @Headers('x-freemius-signature') freemiusSignature?: string,
    @Headers('x-signature') signature?: string,
  ) {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);
    const providedSignature = freemiusSignature || signature || '';

    this.logger.log(`Webhook received: type=${body.type}, id=${body.id}`);

    if (!this.freemiusService.verifyWebhookSignature(raw, providedSignature)) {
      this.logger.warn('Webhook signature verification failed');
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Freemius webhook verified: ${body.type}`);
    await this.paymentsService.handleWebhookEvent(body);
    return { received: true };
  }
}
