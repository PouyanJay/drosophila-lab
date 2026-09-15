import { discoveryJSON, discoverySchema } from '@/lib/contracts/discovery-contract';
import { listProviderModels, providerFailure } from '@/server/model-providers';
import { providerCredential } from '@/server/provider-credentials';
import { createHash } from 'node:crypto';
import { z } from 'zod';
const input = z.object({
  text: z.string().min(1).max(2000),
  config: discoverySchema,
  campaignId: z.string().uuid().nullable().optional(),
  provider: z.enum(['guided', 'openai', 'anthropic']),
  model: z.string().max(160),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(40),
});
const answer = z.object({
  text: z.string().min(1).max(4000),
  config: discoverySchema,
  ready: z.boolean(),
});
const instructions =
  'You are the collaborator in a local fruit-fly topology discovery lab. Turn the user objective into the provided strict campaign configuration. Ask a concise question if important requirements are missing. This is an accuracy-first search over actual MaleCNS graph modifications, with slower models permitted up to maxSlowdown. Tasks currently executable: cue-memory (four directions, delay and distractors), sequence-recall (ordered four-direction sequence, final first/last-position query), noisy-evidence (four-way evidence integration). Do not substitute for unsupported tasks: explain that an environment/task plugin is required and set ready=false. Preserve unchanged settings. Delays are discrete simulation steps, not biological seconds; noise is numerical amplitude. Up to 12 scenario combinations; lengths multiplies scenarios only for sequence-recall. Every array must contain unique values. Limits: delays 0..32 up to4, noise 0..3 up to3, lengths 2..8 up to4, copies1..64, candidates2..64, pilot updates1..100, full updates2..200, confirmation updates2..300 with increasing budgets, examples8..256 multiple of4, seeds3..5 unique integers0..9999, maxSeconds60..86400, patience2..32, minimumGain .001.. .5, maxSlowdown1..10, seed0..999999. Search uses train/validation only, one frozen finalist and fresh paired-seed confirmation. Stop on demonstrated gain, candidate/time budget, or stagnation. No improvement is valid. No biological intelligence or physical brain claims. You cannot launch or control execution: user reviews inline config and clicks Start discovery; pause/resume/cancel controls are inline too. Distinct topology and individual neuron dynamics are learned. Explain what changes and why; do not promise success. Return ready=true only for a reviewable supported task. Do not claim worker outcomes without evidence.';
export async function POST(request: Request) {
  if (
    process.env.LOCAL_WORKSPACE !== '1' ||
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Local same-origin request required' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 100000)
    return Response.json({ error: 'Conversation too large' }, { status: 413 });
  let d;
  try {
    d = input.parse(JSON.parse(raw));
  } catch {
    return Response.json({ error: 'Invalid discovery conversation' }, { status: 400 });
  }
  if (d.provider === 'guided')
    return Response.json({
      text: 'Discovery uses the task and limits shown below. The offline guide cannot interpret arbitrary changes: use the task selector and Advanced settings, or connect an AI model to edit this draft conversationally. Review before starting. A better variant is a hypothesis, not a promised result.',
      config: d.config,
      ready: true,
      provider: 'guided',
      model: 'Offline guide',
    });
  try {
    const credential = await providerCredential('local-workspace', d.provider);
    if (!credential) throw Error('Connect your model in the model picker first.');
    const models = await listProviderModels(d.provider, credential.key);
    if (!models.some((m) => m.id === d.model)) throw Error('Choose an available model.');
    let registered: any[] = [];
    let evidence: any = null;
    const service = process.env.LAB_SERVICE_URL;
    if (service && process.env.LAB_SERVICE_TOKEN) {
      const base = new URL(service);
      if (base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)) {
        const response = await fetch(new URL('/discovery-tasks', base), {
          headers: {
            Authorization: 'Bearer ' + process.env.LAB_SERVICE_TOKEN,
            'X-Lab-Owner': createHash('sha256').update('local-workspace').digest('hex'),
          },
          signal: AbortSignal.timeout(8000),
        });
        if (response.ok) {
          const payload: any = await response.json();
          registered = payload.tasks || [];
        }
        if (d.campaignId) {
          const r = await fetch(new URL('/discoveries/' + d.campaignId, base), {
            headers: {
              Authorization: 'Bearer ' + process.env.LAB_SERVICE_TOKEN,
              'X-Lab-Owner': createHash('sha256').update('local-workspace').digest('hex'),
            },
            signal: AbortSignal.timeout(8000),
          });
          if (r.ok) {
            const j: any = await r.json();
            evidence = {
              status: j.status,
              error: j.error,
              config: j.config,
              phase: j.progress?.phase,
              result: j.result
                ? {
                    outcome: j.result.outcome,
                    improved: j.result.improved,
                    metricName: j.result.metricName,
                    searchStop: j.result.searchStop,
                    variantId: j.result.variantId,
                    candidates: j.result.candidates.map((c: any) => ({
                      id: c.id,
                      parent: c.parent,
                      validationGain: c.validationGain,
                      promoted: c.promoted,
                    })),
                    confirmation: j.result.confirmation
                      ? {
                          delta: j.result.confirmation.delta,
                          interval: j.result.confirmation.interval,
                          slowdown: j.result.confirmation.slowdown,
                          accepted: j.result.confirmation.accepted,
                          caveat: j.result.confirmation.caveat,
                        }
                      : null,
                  }
                : null,
            };
          }
        }
      }
    }
    const taskInstructions =
      instructions +
      ' taskParameters is a JSON-encoded object string, {} for built-in tasks. Score is normalized to [0,1] with higher better; registered adapters can provide a different metric, loss and I/O. Examples must balance the task output count. Additional registered task adapters may override the built-in task list; their parameterHelp describes required parameters. Do not invent an unregistered task. Installed task descriptions: ' +
      JSON.stringify(registered);
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'config', 'ready'],
      properties: { text: { type: 'string' }, config: discoveryJSON, ready: { type: 'boolean' } },
    };
    const messages = d.messages.map((m) => ({ role: m.role, content: m.text }));
    while (messages[0]?.role === 'assistant') messages.shift();
    messages.push({
      role: 'user',
      content: JSON.stringify({
        message: d.text,
        currentConfig: d.config,
        verifiedLocalCampaign: evidence,
      }),
    });
    const openai = d.provider === 'openai';
    const r = await fetch(
      openai ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: openai
          ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credential.key }
          : {
              'Content-Type': 'application/json',
              'x-api-key': credential.key,
              'anthropic-version': '2023-06-01',
            },
        body: JSON.stringify(
          openai
            ? {
                model: d.model,
                store: false,
                instructions: taskInstructions,
                input: messages,
                max_output_tokens: 6000,
                text: {
                  format: { type: 'json_schema', name: 'discovery_plan', strict: true, schema },
                },
              }
            : {
                model: d.model,
                system: taskInstructions,
                messages,
                max_tokens: 6000,
                output_config: { format: { type: 'json_schema', schema } },
              },
        ),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
      },
    );
    if (!r.ok) throw providerFailure(r.status, d.provider);
    const body: any = await r.json();
    if ((openai && body.status !== 'completed') || (!openai && body.stop_reason !== 'end_turn'))
      throw Error('The model did not finish. Your draft is unchanged.');
    const text = openai
      ? body.output
          ?.flatMap((o: any) => o.content || [])
          .filter((o: any) => o.type === 'output_text')
          .map((o: any) => o.text)
          .join('')
      : body.content
          ?.filter((o: any) => o.type === 'text')
          .map((o: any) => o.text)
          .join('');
    return Response.json({
      ...answer.parse(JSON.parse(text)),
      provider: d.provider,
      model: d.model,
    });
  } catch (e: any) {
    return Response.json(
      {
        error:
          e.name === 'ZodError'
            ? 'The model proposed settings outside the supported limits. Your draft is unchanged.'
            : e.message || 'Discovery guide unavailable',
      },
      { status: 502 },
    );
  }
}
