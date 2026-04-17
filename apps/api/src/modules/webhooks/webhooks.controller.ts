import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  @Post('quickbooks')
  @HttpCode(200)
  quickbooks(
    @Headers('intuit-signature') sig: string,
    @Body() body: Record<string, unknown>,
  ) {
    const secret = process.env.QBO_WEBHOOK_SECRET ?? '';
    const expected = createHmac('sha256', secret).update(JSON.stringify(body)).digest('base64');
    const actual = Buffer.from(sig ?? '', 'base64');
    const ok =
      actual.length === Buffer.from(expected, 'base64').length &&
      timingSafeEqual(actual, Buffer.from(expected, 'base64'));
    if (!ok) return { ok: false };
    // TODO: enqueue qbo-inbound SQS job for each entity change
    return { ok: true };
  }
}
