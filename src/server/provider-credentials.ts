import {
  type ModelOption,
  type Provider,
  type ProviderStatus,
  providerName,
} from '@/lib/contracts/providers';
import { sealCredential, unsealCredential } from '@/server/credential-crypto';
import { database } from '@/server/database';
import { pricedModels } from '@/server/llm-costs';
import { listProviderModels } from '@/server/model-providers';
import 'server-only';
const env = process.env;
export const providerEnvironment = () =>
  env as unknown as {
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    PROVIDER_ENCRYPTION_KEY?: string;
  };
const idFor = (userId: string, p: Provider) => JSON.stringify([userId, p]);
export async function providerCredential(userId: string, provider: Provider) {
  const e = providerEnvironment();
  const row: any =
    (
      await database().query(
        'SELECT sealed_key,key_hint FROM provider_connections WHERE id = $1 AND user_id = $2',
        [idFor(userId, provider), userId],
      )
    ).rows[0] ?? null;
  if (row)
    return {
      key: await unsealCredential(
        row.sealed_key,
        e.PROVIDER_ENCRYPTION_KEY || '',
        idFor(userId, provider),
      ),
      hint: row.key_hint,
      source: 'personal' as const,
    };
  const key = provider === 'openai' ? e.OPENAI_API_KEY : e.ANTHROPIC_API_KEY;
  return key ? { key, hint: 'Site connection', source: 'site' as const } : null;
}
export async function saveProviderCredential(userId: string, provider: Provider, key: string) {
  const id = idFor(userId, provider),
    sealed = await sealCredential(key, providerEnvironment().PROVIDER_ENCRYPTION_KEY || '', id);
  await database().query(
    'INSERT INTO provider_connections (id,user_id,provider,sealed_key,key_hint,updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET sealed_key=excluded.sealed_key,key_hint=excluded.key_hint,updated_at=excluded.updated_at',
    [id, userId, provider, sealed, '•••• ' + key.slice(-4), new Date().toISOString()],
  );
}
export async function removeProviderCredential(userId: string, provider: Provider) {
  await database().query('DELETE FROM provider_connections WHERE id = $1 AND user_id = $2', [
    idFor(userId, provider),
    userId,
  ]);
}
/** Mark models that have no stored rate so the picker can warn before a call is made. */
export async function withPricing(provider: Provider, models: ModelOption[]) {
  try {
    const priced = await pricedModels(
      provider,
      models.map((m) => m.id),
    );
    return models.map((m) => ({ ...m, priced: priced.has(m.id) }));
  } catch {
    return models;
  }
}
export async function providerStatus(userId: string, provider: Provider): Promise<ProviderStatus> {
  try {
    const credential = await providerCredential(userId, provider);
    if (!credential)
      return { id: provider, name: providerName(provider), status: 'missing', models: [] };
    const models = await withPricing(provider, await listProviderModels(provider, credential.key));
    return {
      id: provider,
      name: providerName(provider),
      status: 'connected',
      models,
      hint: credential.hint,
      source: credential.source,
    };
  } catch (e: any) {
    return {
      id: provider,
      name: providerName(provider),
      status: 'error',
      models: [],
      message:
        e.name === 'TimeoutError'
          ? 'Connection check timed out. Retry.'
          : e.status
            ? e.message
            : 'The connection could not be loaded. Retry.',
    };
  }
}
