import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
  CreateSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { Kysely } from 'kysely';
import { Database } from '../../../db/schema';
import { KYSELY } from '../../../db/db.module';
import { loadConfig } from '../../../config/env';

interface QboTokens {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  access_expires_at: number;
  refresh_expires_at: number;
}

@Injectable()
export class QboAuthService {
  private readonly log = new Logger(QboAuthService.name);
  private readonly sm = new SecretsManagerClient({});

  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  authorizeUrl(tenantId: string, state: string): string {
    const cfg = loadConfig();
    const params = new URLSearchParams({
      client_id: cfg.QBO_CLIENT_ID ?? '',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: cfg.QBO_REDIRECT_URI ?? '',
      response_type: 'code',
      state: `${tenantId}:${state}`,
    });
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  }

  async exchange(tenantId: string, code: string, realmId: string): Promise<void> {
    const cfg = loadConfig();
    const basic = Buffer.from(`${cfg.QBO_CLIENT_ID}:${cfg.QBO_CLIENT_SECRET}`).toString('base64');
    const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: cfg.QBO_REDIRECT_URI ?? '',
      }),
    });
    if (!resp.ok) throw new Error(`QBO token exchange failed: ${resp.status}`);
    const j = (await resp.json()) as {
      access_token: string; refresh_token: string;
      expires_in: number; x_refresh_token_expires_in: number;
    };
    const tokens: QboTokens = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      realm_id: realmId,
      access_expires_at: Date.now() + j.expires_in * 1000,
      refresh_expires_at: Date.now() + j.x_refresh_token_expires_in * 1000,
    };
    await this.storeTokens(tenantId, tokens);
    await this.db
      .insertInto('tenant_integrations')
      .values({
        tenant_id: tenantId,
        provider: 'quickbooks',
        status: 'connected',
        config: { realm_id: realmId } as never,
        secret_arn: `qbo/${tenantId}`,
        connected_at: new Date(),
        last_error: null,
      })
      .onConflict((oc) =>
        oc.columns(['tenant_id', 'provider']).doUpdateSet({
          status: 'connected',
          config: { realm_id: realmId } as never,
          connected_at: new Date(),
          last_error: null,
        }),
      )
      .execute();
  }

  async getAccessToken(tenantId: string): Promise<{ token: string; realmId: string }> {
    const tokens = await this.loadTokens(tenantId);
    if (Date.now() > tokens.access_expires_at - 60_000) return this.refresh(tenantId, tokens);
    return { token: tokens.access_token, realmId: tokens.realm_id };
  }

  private async refresh(tenantId: string, tokens: QboTokens) {
    const cfg = loadConfig();
    const basic = Buffer.from(`${cfg.QBO_CLIENT_ID}:${cfg.QBO_CLIENT_SECRET}`).toString('base64');
    const resp = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }),
    });
    if (!resp.ok) {
      this.log.error(`QBO refresh failed for tenant ${tenantId}: ${resp.status}`);
      throw new Error('qbo_refresh_failed');
    }
    const j = (await resp.json()) as {
      access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number;
    };
    const next: QboTokens = {
      ...tokens,
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      access_expires_at: Date.now() + j.expires_in * 1000,
      refresh_expires_at: Date.now() + j.x_refresh_token_expires_in * 1000,
    };
    await this.storeTokens(tenantId, next);
    return { token: next.access_token, realmId: next.realm_id };
  }

  private async loadTokens(tenantId: string): Promise<QboTokens> {
    const r = await this.sm.send(new GetSecretValueCommand({ SecretId: `qbo/${tenantId}` }));
    return JSON.parse(r.SecretString ?? '{}');
  }

  private async storeTokens(tenantId: string, tokens: QboTokens) {
    const SecretId = `qbo/${tenantId}`;
    const SecretString = JSON.stringify(tokens);
    try {
      await this.sm.send(new PutSecretValueCommand({ SecretId, SecretString }));
    } catch {
      await this.sm.send(new CreateSecretCommand({ Name: SecretId, SecretString }));
    }
  }
}
