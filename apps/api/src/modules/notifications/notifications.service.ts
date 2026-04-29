import { Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { loadConfig } from '../../config/env';
import { currentTenant } from '../../common/tenancy/tenant.context';
import { renderOrderFulfillment } from './templates/order-fulfillment';

export interface OrderFulfillmentPayload {
  orderId: string;
  orderNo: string;
  invoiceNo: string;
  warehouse: {
    id: string;
    code: string;
    name: string;
    clerk_name: string | null;
    clerk_email: string | null;
    address: unknown;
  };
  customerName: string | null;
  paymentMethod: string;
  currency: string;
  totals: { subtotal: number; tax: number; total: number };
  lines: Array<{ sku: string | null; description: string; quantity: number; unit_price: number; line_total: number }>;
  occurredAt: Date;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  private readonly cfg = loadConfig();
  private readonly ses = new SESClient({});
  private readonly sqs = new SQSClient({});
  private readonly fromAllowlist = new Set(
    this.cfg.SES_FROM_ALLOWLIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  /**
   * Resolves the From address for the current request. If the logged-in user's
   * email is in the allowlist, we use it (so customer service replies land in
   * their inbox); otherwise fall back to the configured SES_FROM default.
   */
  private resolveFrom(): string {
    const t = currentTenant();
    const userEmail = t.email?.toLowerCase();
    if (userEmail && this.fromAllowlist.has(userEmail)) return t.email!;
    return this.cfg.SES_FROM;
  }

  async sendOrderFulfillmentEmail(p: OrderFulfillmentPayload): Promise<void> {
    const t = currentTenant();
    const to = p.warehouse.clerk_email;
    if (!to) {
      this.log.warn(`No clerk_email on warehouse ${p.warehouse.code}; skipping fulfillment email`);
      return;
    }
    const from = this.resolveFrom();
    const channel = this.cfg.SQS_EMAIL_URL ? 'email-sqs' : 'email-direct';

    // Idempotency: insert log row first; unique (ref_type, ref_id) means a
    // duplicate dispatch is a no-op. Use status='queued' as a sentinel.
    const existing = await this.db
      .selectFrom('notification_log')
      .select(['id', 'status'])
      .where('ref_type', '=', 'order-fulfillment')
      .where('ref_id', '=', p.orderId)
      .executeTakeFirst();
    if (existing) {
      this.log.log(`order-fulfillment for ${p.orderNo} already ${existing.status}; skipping`);
      return;
    }

    const inserted = await this.db
      .insertInto('notification_log')
      .values({
        tenant_id: t.tenantId,
        ref_type: 'order-fulfillment',
        ref_id: p.orderId,
        recipient: to,
        from_addr: from,
        channel,
        status: 'queued',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const subject = `[Fulfillment] ${p.orderNo} — ${p.warehouse.name}`;
    const { html, text } = renderOrderFulfillment(p);

    try {
      let messageId: string | undefined;
      if (this.cfg.SQS_EMAIL_URL) {
        // Decoupled path: enqueue and let the worker call SES.
        const r = await this.sqs.send(
          new SendMessageCommand({
            QueueUrl: this.cfg.SQS_EMAIL_URL,
            MessageBody: JSON.stringify({
              type: 'order-fulfillment',
              tenantId: t.tenantId,
              orderId: p.orderId,
              to,
              from,
              subject,
              html,
              text,
            }),
          }),
        );
        messageId = r.MessageId;
        await this.db
          .updateTable('notification_log')
          .set({ status: 'queued', message_id: messageId ?? null })
          .where('id', '=', inserted.id)
          .execute();
      } else {
        // Direct path: hand off to SES inline.
        messageId = await this.sendViaSes({ from, to, subject, html, text });
        await this.db
          .updateTable('notification_log')
          .set({ status: 'sent', message_id: messageId ?? null })
          .where('id', '=', inserted.id)
          .execute();
      }
    } catch (err) {
      this.log.error(`order-fulfillment dispatch failed for ${p.orderNo}`, err as Error);
      await this.db
        .updateTable('notification_log')
        .set({ status: 'failed', error: (err as Error).message?.slice(0, 500) ?? 'unknown' })
        .where('id', '=', inserted.id)
        .execute();
      throw err;
    }
  }

  /**
   * Lower-level SES send. Used by the inline path here and by the worker when
   * draining the SQS_EMAIL_URL queue.
   */
  async sendViaSes(args: { from: string; to: string; subject: string; html: string; text: string }) {
    const r = await this.ses.send(
      new SendEmailCommand({
        Source: args.from,
        Destination: { ToAddresses: [args.to] },
        Message: {
          Subject: { Data: args.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: args.html, Charset: 'UTF-8' },
            Text: { Data: args.text, Charset: 'UTF-8' },
          },
        },
      }),
    );
    return r.MessageId;
  }
}
