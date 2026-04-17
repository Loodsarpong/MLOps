/**
 * Standalone worker entrypoint. Runs as a separate ECS service.
 *
 * Listens on SQS queues:
 *   - ns-qbo-sync:  { type:'invoice', tenantId, invoiceId }
 *   - ns-email-out: { to, template, payload }
 *   - ns-sms-out:   { to, body }
 *
 * Deployed with the same Docker image; `CMD node dist/workers/main.worker.js`.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { QboSyncService } from '../modules/integrations/quickbooks/qbo-sync.service';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { loadConfig } from '../config/env';

async function main() {
  const cfg = loadConfig();
  const app = await NestFactory.createApplicationContext(AppModule);
  const qbo = app.get(QboSyncService);
  const sqs = new SQSClient({});

  console.log('worker started');
  for (;;) {
    if (!cfg.SQS_QBO_SYNC_URL) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const r = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: cfg.SQS_QBO_SYNC_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
      }),
    );
    for (const m of r.Messages ?? []) {
      try {
        const body = JSON.parse(m.Body ?? '{}');
        if (body.type === 'invoice') {
          await qbo.syncInvoice(body.tenantId, body.invoiceId);
        }
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: cfg.SQS_QBO_SYNC_URL,
            ReceiptHandle: m.ReceiptHandle!,
          }),
        );
      } catch (e) {
        console.error('worker msg failed', e);
      }
    }
  }
}

main();
