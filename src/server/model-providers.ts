import {
  modelName,
  providerName,
  type ModelOption,
  type Provider,
} from '@/lib/contracts/providers';
import 'server-only';
export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}
export function providerFailure(status: number, p: Provider) {
  const name = providerName(p);
  return status === 401
    ? new ProviderError(`${name} rejected the API key. Reconnect with a valid key.`, 401)
    : status === 403
      ? new ProviderError(`${name} denied access. Check the key permissions and model access.`, 403)
      : status === 429
        ? new ProviderError(
            `${name} reached a rate or account quota limit. Check API billing or try again later.`,
            429,
          )
        : new ProviderError(
            `${name} could not complete the request${status === 400 ? '; the selected model or request may be unsupported' : ''}. Try another model or retry.`,
            502,
          );
}
export async function listProviderModels(
  provider: Provider,
  apiKey: string,
): Promise<ModelOption[]> {
  const headers: Record<string, string> =
    provider === 'openai'
      ? { Authorization: 'Bearer ' + apiKey }
      : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  const response = await fetch(
    provider === 'openai'
      ? 'https://api.openai.com/v1/models'
      : 'https://api.anthropic.com/v1/models?limit=1000',
    { headers, signal: AbortSignal.timeout(12000) },
  );
  if (!response.ok) throw providerFailure(response.status, provider);
  const body: any = await response.json();
  if (!Array.isArray(body.data))
    throw new ProviderError('The provider returned an invalid model list.');
  const usable = body.data.filter(
    (m: any) =>
      typeof m.id === 'string' &&
      (provider === 'anthropic'
        ? m.id.startsWith('claude-') && m.capabilities?.structured_outputs?.supported !== false
        : /^(gpt-(?:4\.1|4o|5|6)|o[134](?:-|$))/.test(m.id) &&
          !/audio|realtime|transcrib|image|search|deep-research|codex|instruct/.test(m.id)),
  );
  const seen = new Set<string>();
  return usable
    .sort(
      (a: any, b: any) =>
        (b.created || Date.parse(b.created_at) || 0) - (a.created || Date.parse(a.created_at) || 0),
    )
    .filter((m: any) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .map((m: any) => ({ id: m.id, name: m.display_name || modelName(m.id) }));
}
