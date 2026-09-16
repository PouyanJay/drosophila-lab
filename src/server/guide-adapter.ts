import {
  guideAnswer,
  guideInstructions,
  guideSchema,
  labGuideAnswer,
  labGuideSchema,
  unifiedLabInstructions,
} from '@/lib/contracts/guide-contract';
import type { Provider } from '@/lib/contracts/providers';
import { usageFromResponse } from '@/server/llm-costs';
import { ProviderError, providerFailure } from '@/server/model-providers';
import 'server-only';
export function claudeSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(claudeSchema);
  if (schema && typeof schema === 'object')
    return Object.fromEntries(
      Object.entries(schema)
        .filter(([k]) => !['minimum', 'maximum', 'minLength', 'maxLength'].includes(k))
        .map(([k, v]) => [k, claudeSchema(v)]),
    );
  return schema;
}
export function guideRequest(
  provider: Provider,
  model: string,
  key: string,
  d: any,
): { url: string; headers: Record<string, string>; body: any } {
  const messages = d.messages.map((m: any) => ({ role: m.role, content: m.text }));
  while (messages[0]?.role === 'assistant') messages.shift();
  messages.push({
    role: 'user',
    content: JSON.stringify({
      message: d.text,
      currentStage: d.stage,
      currentPlan: d.plan,
      currentLabConfig: d.labConfig || null,
      currentJob: d.jobContext || null,
      measuredEvidence: d.evidence || null,
    }),
  });
  if (provider === 'openai')
    return {
      url: 'https://api.openai.com/v1/responses',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: {
        model,
        store: false,
        max_output_tokens: 8192,
        instructions: d.execution === 'lab' ? unifiedLabInstructions : guideInstructions,
        input: messages,
        text: {
          format: {
            type: 'json_schema',
            name: 'experiment_plan',
            strict: true,
            schema: d.execution === 'lab' ? labGuideSchema : guideSchema,
          },
        },
      },
    };
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: {
      model,
      max_tokens: 8192,
      system: d.execution === 'lab' ? unifiedLabInstructions : guideInstructions,
      messages,
      output_config: {
        format: {
          type: 'json_schema',
          schema: claudeSchema(d.execution === 'lab' ? labGuideSchema : guideSchema),
        },
      },
    },
  };
}
export function parseGuideReply(provider: Provider, body: any, execution?: string) {
  if (
    (provider === 'openai' && body.status && body.status !== 'completed') ||
    (provider === 'anthropic' && ['max_tokens', 'refusal'].includes(body.stop_reason))
  )
    throw new ProviderError(
      'The model did not finish its response. Retry or choose another model.',
    );
  const text =
    provider === 'openai'
      ? body.output
          ?.flatMap((x: any) => x.content || [])
          .filter((x: any) => x.type === 'output_text')
          .map((x: any) => x.text)
          .join('')
      : body.content
          ?.filter((x: any) => x.type === 'text')
          .map((x: any) => x.text)
          .join('');
  let result;
  try {
    result = (execution === 'lab' ? labGuideAnswer : guideAnswer).parse(JSON.parse(text));
  } catch {
    throw new ProviderError(
      'The model did not return a valid experiment plan. Your current plan has been preserved.',
    );
  }
  if (result.stage === 4 && (!result.plan.task || !result.plan.goal || !result.plan.budget))
    throw new ProviderError(
      'The model returned an incomplete plan. Ask it to complete the missing choices.',
    );
  return result;
}
export async function callGuide(
  provider: Provider,
  model: string,
  key: string,
  d: any,
  signal?: AbortSignal,
) {
  const call = guideRequest(provider, model, key, d);
  const response = await fetch(call.url, {
    method: 'POST',
    headers: call.headers,
    body: JSON.stringify(call.body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
      : AbortSignal.timeout(120000),
  });
  if (!response.ok) throw providerFailure(response.status, provider);
  const body: any = await response.json();
  const usage = usageFromResponse(provider, body);
  let reply;
  try {
    reply = parseGuideReply(provider, body, d.execution);
  } catch (e) {
    // The provider billed this reply even though it is unusable; let the route record it.
    if (e instanceof ProviderError) e.usage = usage;
    throw e;
  }
  if (
    'action' in reply &&
    'labConfig' in reply &&
    reply.action === 'start' &&
    (d.stage !== 4 || JSON.stringify(reply.labConfig) !== JSON.stringify(d.labConfig))
  ) {
    reply.action = 'none';
    reply.text += ' Review the exact updated draft below before starting.';
  }
  return {
    ...reply,
    mode: 'ai',
    provider,
    model: body.model || model,
    usage,
  };
}
