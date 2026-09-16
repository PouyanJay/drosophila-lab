export type Provider = 'openai' | 'anthropic';
/** `priced` is false when the local pricing table has no rate for the model. */
export type ModelOption = { id: string; name: string; priced?: boolean };
export type ProviderStatus = {
  id: Provider;
  name: string;
  status: 'connected' | 'missing' | 'error';
  models: ModelOption[];
  message?: string;
  hint?: string;
  source?: 'personal' | 'site';
};
export const providerName = (p: Provider) => (p === 'openai' ? 'OpenAI' : 'Claude');
export function modelName(id: string) {
  return id
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/^gpt-/, 'GPT-')
    .replace(/^claude-/, 'Claude ')
    .replace(/-/g, ' ')
    .replace(/^GPT /, 'GPT-')
    .replace(
      /\b(opus|sonnet|haiku|mini|nano|pro|astra|sol|terra|luna)\b/gi,
      (s) => s[0].toUpperCase() + s.slice(1),
    );
}
