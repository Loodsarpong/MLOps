import { Inject, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import PDFDocument from 'pdfkit';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { loadConfig } from '../../config/env';

@Injectable()
export class InvoicePdfService {
  private readonly s3 = new S3Client({});

  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async generate(invoiceId: string): Promise<{ key: string; signedUrl: string }> {
    const inv = await this.db
      .selectFrom('invoices')
      .selectAll()
      .where('id', '=', invoiceId)
      .executeTakeFirstOrThrow();

    const lines = await this.db
      .selectFrom('invoice_lines')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .execute();

    const customer = await this.db
      .selectFrom('customers')
      .selectAll()
      .where('id', '=', inv.customer_id)
      .executeTakeFirstOrThrow();

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.on('data', (c) => chunks.push(c as Buffer));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

    doc.fontSize(18).text('NaturalShea Care', { align: 'right' });
    doc.fontSize(10).text('Invoice', { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).text(`Invoice #: ${inv.invoice_no}`);
    doc.text(`Date: ${inv.issue_date}`);
    doc.text(`Due: ${inv.due_date}`);
    doc.moveDown().text(`Bill to: ${customer.name}`);
    if (customer.email) doc.text(customer.email);
    doc.moveDown();

    doc.font('Helvetica-Bold');
    doc.text('Description', 50, doc.y, { continued: true, width: 260 });
    doc.text('Qty', 310, undefined, { continued: true, width: 60, align: 'right' });
    doc.text('Unit', 370, undefined, { continued: true, width: 80, align: 'right' });
    doc.text('Total', 450, undefined, { width: 100, align: 'right' });
    doc.font('Helvetica');

    for (const l of lines) {
      doc.text(l.description, 50, doc.y, { continued: true, width: 260 });
      doc.text(l.quantity, 310, undefined, { continued: true, width: 60, align: 'right' });
      doc.text(l.unit_price, 370, undefined, { continued: true, width: 80, align: 'right' });
      doc.text(l.line_total, 450, undefined, { width: 100, align: 'right' });
    }

    doc.moveDown().font('Helvetica-Bold');
    doc.text(`Subtotal: ${inv.currency} ${inv.subtotal}`, { align: 'right' });
    doc.text(`Tax: ${inv.currency} ${inv.tax_total}`, { align: 'right' });
    doc.text(`Total: ${inv.currency} ${inv.total}`, { align: 'right' });
    doc.text(`Paid: ${inv.currency} ${inv.amount_paid}`, { align: 'right' });
    doc.text(`Balance: ${inv.currency} ${inv.balance_due}`, { align: 'right' });
    doc.end();

    const body = await done;
    const key = `invoices/${inv.tenant_id}/${inv.id}.pdf`;
    const cfg = loadConfig();

    await this.s3.send(
      new PutObjectCommand({
        Bucket: cfg.S3_INVOICES_BUCKET,
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'aws:kms',
      }),
    );

    await this.db
      .updateTable('invoices')
      .set({ pdf_s3_key: key })
      .where('id', '=', invoiceId)
      .execute();

    const signedUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: cfg.S3_INVOICES_BUCKET, Key: key }),
      { expiresIn: 60 * 60 },
    );

    return { key, signedUrl };
  }
}
