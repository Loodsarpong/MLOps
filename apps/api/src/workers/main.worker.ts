/**
 * Standalone worker entrypoint. Runs as a separate ECS service.
 *
 * Listens on SQS queues:
 *   - ns-qbo-sync:  { type:'invoice', tenantId, invoiceId }
 *   - ns-email-out: { type:'order-fulfillment', tenantId, orderId, to, from, subject, html, text }
 *
 * Deployed with the same Docker image; `CMD node dist/workers/main.worker.js`.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { QboSyncService } from '../modules/integrations/quickbooks/qbo-sync.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { Kysely } from 'kysely';
import { KYSELY } from '../db/db.module';
import type { Database } from '../db/schema';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { loadConfig } from '../config/env';

interface QueueHandler {
  url: string;
  name: string;
  handle: (body: unknown) => Promise<void>;
}

async function pollQueue(sqs: SQSClient, q: QueueHandler) {
  for (;;) {
    try {
      const r = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: q.url,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
        }),
      );
      for (const m of r.Messages ?? []) {
        try {
          await q.handle(JSON.parse(m.Body ?? '{}'));
          await sqs.send(new DeleteMessageCommand({ QueueUrl: q.url, ReceiptHandle: m.ReceiptHandle! }));
        } catch (e) {
          console.error(`[${q.name}] message failed`, e);
        }
      }
    } catch (e) {
      console.error(`[${q.name}] poll failed`, e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  const cfg = loadConfig();
  const app = await NestFactory.createApplicationContext(AppModule);
  const qbo = app.get(QboSyncService);
  const notifications = app.get(NotificationsService);
  const db = app.get<Kysely<Database>>(KYSELY);
  const sqs = new SQSClient({});
  const handlers: QueueHandler[] = [];

  if (cfg.SQS_QBO_SYNC_URL) {
    handlers.push({
      url: cfg.SQS_QBO_SYNC_URL,
      name: 'qbo-sync',
      handle: async (body: any) => {
        if (body.type === 'invoice') await qbo.syncInvoice(body.tenantId, body.invoiceId);
      },
    });
  }

  if (cfg.SQS_EMAIL_URL) {
    handlers.push({
      url: cfg.SQS_EMAIL_URL,
      name: 'email-out',
      handle: async (body: any) => {
        if (body.type === 'order-fulfillment') {
          const messageId = await notifications.sendViaSes({
            from: body.from,
            to: body.to,
            subject: body.subject,
            html: body.html,
            text: body.text,
          });
          await db
            .updateTable('notification_log')
            .set({ status: 'sent', message_id: messageId ?? null })
            .where('ref_type', '=', 'order-fulfillment')
            .where('ref_id', '=', body.orderId)
            .execute();
        }
      },
    });
  }

  console.log(`worker started; queues: ${handlers.map((h) => h.name).join(', ') || 'none'}`);
  if (!handlers.length) {
    setInterval(() => {}, 1 << 30); // keep alive even with no queues configured
    return;
  }
  await Promise.all(handlers.map((h) => pollQueue(sqs, h)));
}

main();
