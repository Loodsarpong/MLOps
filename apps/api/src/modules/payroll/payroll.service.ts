import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../db/schema';
import { KYSELY } from '../../db/db.module';
import { currentTenant } from '../../common/tenancy/tenant.context';
import { AuditService } from '../../common/audit/audit.service';
import { estimateMonthlyTax } from './payroll.util';

export interface CreateEmployeeInput {
  code: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  position?: string | null;
  base_salary: number;
  currency?: string;
  hired_on: string;
  terminated_on?: string | null;
  bank_details?: Record<string, unknown> | null;
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {}

export interface CreateRunInput {
  period_start: string;
  period_end: string;
}

@Injectable()
export class PayrollService {
  constructor(
    @Inject(KYSELY) private readonly db: Kysely<Database>,
    private readonly audit: AuditService,
  ) {}

  // ---- Employees ----------------------------------------------------------

  async listEmployees(includeTerminated = false) {
    const t = currentTenant();
    let q = this.db
      .selectFrom('employees')
      .select([
        'id', 'code', 'full_name', 'email', 'department', 'position',
        'base_salary', 'currency', 'hired_on', 'terminated_on',
      ])
      .where('tenant_id', '=', t.tenantId);
    if (!includeTerminated) q = q.where('terminated_on', 'is', null);
    return q.orderBy('full_name').execute();
  }

  async findEmployee(id: string) {
    const t = currentTenant();
    const row = await this.db
      .selectFrom('employees')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  async createEmployee(input: CreateEmployeeInput) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('employees')
        .select('id')
        .where('tenant_id', '=', t.tenantId)
        .where('code', '=', input.code)
        .executeTakeFirst();
      if (existing) throw new ConflictException(`An employee with code ${input.code} already exists`);

      const row = await trx
        .insertInto('employees')
        .values({
          tenant_id: t.tenantId,
          code: input.code,
          full_name: input.full_name,
          email: input.email ?? null,
          department: input.department ?? null,
          position: input.position ?? null,
          base_salary: input.base_salary.toFixed(2),
          currency: input.currency ?? 'USD',
          hired_on: input.hired_on,
          terminated_on: input.terminated_on ?? null,
          bank_details: (input.bank_details ?? null) as never,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.audit.log({ action: 'create', entityType: 'employee', entityId: row.id });
      return row;
    });
  }

  async updateEmployee(id: string, patch: UpdateEmployeeInput) {
    const t = currentTenant();
    const updates: Record<string, unknown> = {};
    if (patch.code !== undefined) updates.code = patch.code;
    if (patch.full_name !== undefined) updates.full_name = patch.full_name;
    if (patch.email !== undefined) updates.email = patch.email;
    if (patch.department !== undefined) updates.department = patch.department;
    if (patch.position !== undefined) updates.position = patch.position;
    if (patch.base_salary !== undefined) updates.base_salary = patch.base_salary.toFixed(2);
    if (patch.currency !== undefined) updates.currency = patch.currency;
    if (patch.hired_on !== undefined) updates.hired_on = patch.hired_on;
    if (patch.terminated_on !== undefined) updates.terminated_on = patch.terminated_on;
    if (patch.bank_details !== undefined) updates.bank_details = patch.bank_details as never;

    if (!Object.keys(updates).length) throw new BadRequestException('No fields to update');

    const row = await this.db
      .updateTable('employees')
      .set(updates)
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  // ---- Runs ---------------------------------------------------------------

  async listRuns() {
    const t = currentTenant();
    return this.db
      .selectFrom('payroll_runs')
      .selectAll()
      .where('tenant_id', '=', t.tenantId)
      .orderBy('period_start', 'desc')
      .execute();
  }

  async findRun(id: string) {
    const t = currentTenant();
    const run = await this.db
      .selectFrom('payroll_runs')
      .selectAll()
      .where('id', '=', id)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!run) throw new NotFoundException('Payroll run not found');

    const payslips = await this.db
      .selectFrom('payslips as ps')
      .innerJoin('employees as e', 'e.id', 'ps.employee_id')
      .select([
        'ps.id', 'ps.employee_id', 'e.code as employee_code', 'e.full_name',
        'ps.gross', 'ps.tax', 'ps.deductions', 'ps.net',
      ])
      .where('ps.run_id', '=', id)
      .where('ps.tenant_id', '=', t.tenantId)
      .orderBy('e.full_name')
      .execute();

    return { ...run, payslips };
  }

  async createRun(input: CreateRunInput) {
    const t = currentTenant();
    if (input.period_end < input.period_start) {
      throw new BadRequestException('period_end must be on or after period_start');
    }
    const run = await this.db
      .insertInto('payroll_runs')
      .values({
        tenant_id: t.tenantId,
        period_start: input.period_start,
        period_end: input.period_end,
        status: 'draft',
        total_gross: '0',
        total_net: '0',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.audit.log({ action: 'create', entityType: 'payroll_run', entityId: run.id });
    return run;
  }

  /**
   * Generate payslips for every employee active during the run's period.
   * Idempotent — re-running clears prior payslips and recomputes. Locked once
   * the run is approved.
   */
  async calculate(runId: string) {
    const t = currentTenant();
    return this.db.transaction().execute(async (trx) => {
      const run = await trx
        .selectFrom('payroll_runs')
        .selectAll()
        .where('id', '=', runId)
        .where('tenant_id', '=', t.tenantId)
        .executeTakeFirst();
      if (!run) throw new NotFoundException('Payroll run not found');
      if (run.status === 'approved') throw new ConflictException('Run is approved and locked');

      const employees = await trx
        .selectFrom('employees')
        .select(['id', 'base_salary'])
        .where('tenant_id', '=', t.tenantId)
        .where('hired_on', '<=', run.period_end)
        .where((eb) =>
          eb.or([
            eb('terminated_on', 'is', null),
            eb('terminated_on', '>=', run.period_start),
          ]),
        )
        .execute();

      // Recompute from scratch.
      await trx.deleteFrom('payslips').where('run_id', '=', runId).where('tenant_id', '=', t.tenantId).execute();

      let totalGross = 0;
      let totalNet = 0;
      for (const e of employees) {
        const gross = Number(e.base_salary);
        const tax = estimateMonthlyTax(gross);
        const deductions = 0;
        const net = +(gross - tax - deductions).toFixed(2);
        totalGross += gross;
        totalNet += net;
        await trx
          .insertInto('payslips')
          .values({
            tenant_id: t.tenantId,
            run_id: runId,
            employee_id: e.id,
            gross: gross.toFixed(2),
            tax: tax.toFixed(2),
            deductions: deductions.toFixed(2),
            net: net.toFixed(2),
          })
          .execute();
      }

      await trx
        .updateTable('payroll_runs')
        .set({
          status: 'calculated',
          total_gross: totalGross.toFixed(2),
          total_net: totalNet.toFixed(2),
        })
        .where('id', '=', runId)
        .execute();

      return {
        run_id: runId,
        employee_count: employees.length,
        total_gross: +totalGross.toFixed(2),
        total_net: +totalNet.toFixed(2),
      };
    });
  }

  async approve(runId: string) {
    const t = currentTenant();
    const run = await this.db
      .selectFrom('payroll_runs')
      .select(['id', 'status'])
      .where('id', '=', runId)
      .where('tenant_id', '=', t.tenantId)
      .executeTakeFirst();
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'draft') throw new ConflictException('Calculate the run before approving');
    if (run.status === 'approved') return this.findRun(runId);

    await this.db
      .updateTable('payroll_runs')
      .set({ status: 'approved', approved_by: t.userId, approved_at: new Date() })
      .where('id', '=', runId)
      .where('tenant_id', '=', t.tenantId)
      .execute();
    await this.audit.log({ action: 'approve', entityType: 'payroll_run', entityId: runId });
    return this.findRun(runId);
  }
}
