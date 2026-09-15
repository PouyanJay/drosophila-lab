import { guideInput } from '@/lib/contracts/guide-contract';
import { respond } from '@/lib/planning/experiment-planner';
import { suggestionForPrompt } from '@/lib/planning/experiment-suggestions';
import { labConversation } from '@/lib/planning/lab-conversation';
import { getLocalUser } from '@/server/auth/local-user';
import { callGuide } from '@/server/guide-adapter';
import { listProviderModels } from '@/server/model-providers';
import { providerCredential } from '@/server/provider-credentials';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origin mismatch' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 100000)
    return Response.json({ error: 'Conversation too large' }, { status: 413 });
  let parsed;
  try {
    parsed = guideInput.safeParse(JSON.parse(raw));
  } catch {
    return Response.json({ error: 'Invalid conversation' }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: 'Invalid conversation' }, { status: 400 });
  const d = parsed.data;
  const starter = suggestionForPrompt(d.text);
  if (d.provider === 'guided' && d.execution === 'browser' && starter)
    return Response.json({
      text: 'Your browser comparison is ready: 32 inherited central-brain copies, three paired seeds, 12 readout-training updates, and 24 / 12 / 24 examples per seed. Internal connections remain fixed in this approach. The comparison includes validation-selected checkpoints, held-out decisions, latency and recurrence ablation. Review the plan below before starting. Keep this tab open during execution.',
      stage: 4,
      plan: {
        ...d.plan,
        task: starter.id === 'cue-memory' ? 'beacon' : 'evidence',
        goal: starter.id === 'cue-memory' ? 'accuracy' : 'balance',
        duplicates: 32,
        population: 'cb_intrinsic',
        prune: 0,
        memory: false,
        seeds: 3,
        epochs: 12,
        seed: 41,
        budget: 'quick',
      },
      mode: 'guided',
      provider: 'guided',
      model: 'Offline guide',
    });
  if (d.provider === 'guided')
    return Response.json({
      ...(d.execution === 'lab'
        ? labConversation(d.text, d.stage, d.plan, d.labConfig)
        : respond(d.text, d.stage, d.plan)),
      mode: 'guided',
      provider: 'guided',
      model: 'Offline guide',
    });
  const user = await getLocalUser();
  if (!user)
    return Response.json({ error: 'Sign in to use your model connections.' }, { status: 401 });
  try {
    const credential = await providerCredential(user.userId, d.provider);
    if (!credential)
      return Response.json(
        {
          error: `Connect ${d.provider === 'openai' ? 'OpenAI' : 'Claude'} from the model menu first.`,
        },
        { status: 409 },
      );
    const models = await listProviderModels(d.provider, credential.key);
    if (!models.some((m) => m.id === d.model))
      return Response.json(
        {
          error:
            'This model is not in your account’s available model list. Refresh the model menu and choose again.',
        },
        { status: 400 },
      );
    return Response.json(await callGuide(d.provider, d.model, credential.key, d, request.signal), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return Response.json(
      {
        error: e.status
          ? e.message
          : e.name === 'TimeoutError'
            ? 'The model took too long to respond. Retry or select a faster model.'
            : 'The model connection failed. Your message and experiment plan are intact.',
      },
      { status: e.status || 502 },
    );
  }
}
