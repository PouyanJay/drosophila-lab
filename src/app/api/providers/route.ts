import { getLocalUser } from '@/server/auth/local-user';
import { listProviderModels } from '@/server/model-providers';
import {
  providerStatus,
  removeProviderCredential,
  saveProviderCredential,
  withPricing,
} from '@/server/provider-credentials';
import { z } from 'zod';
const provider = z.enum(['openai', 'anthropic']);
const noStore = { 'Cache-Control': 'no-store' };
export async function GET() {
  const user = await getLocalUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to manage model connections.' },
      { status: 401, headers: noStore },
    );
  const providers = await Promise.all([
    providerStatus(user.userId, 'openai'),
    providerStatus(user.userId, 'anthropic'),
  ]);
  return Response.json({ providers }, { headers: noStore });
}
async function mutate(request: Request, remove: boolean) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origin mismatch' }, { status: 403 });
  const user = await getLocalUser();
  if (!user)
    return Response.json({ error: 'Sign in to manage model connections.' }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: 'Request too large' }, { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const p = provider.safeParse(body.provider);
  if (!p.success) return Response.json({ error: 'Unknown provider' }, { status: 400 });
  try {
    if (remove) {
      await removeProviderCredential(user.userId, p.data);
      return Response.json({ removed: true }, { headers: noStore });
    }
    const value = z
      .string()
      .trim()
      .min(20)
      .max(2048)
      .regex(/^[!-~]+$/)
      .safeParse(body.apiKey);
    if (!value.success) return Response.json({ error: 'Enter a valid API key.' }, { status: 400 });
    const models = await listProviderModels(p.data, value.data);
    if (!models.length)
      return Response.json(
        { error: 'This key has no supported chat models. Check model permissions.' },
        { status: 400 },
      );
    await saveProviderCredential(user.userId, p.data, value.data);
    return Response.json(
      {
        provider: {
          id: p.data,
          name: p.data === 'openai' ? 'OpenAI' : 'Claude',
          status: 'connected',
          models: await withPricing(p.data, models),
          hint: '•••• ' + value.data.slice(-4),
          source: 'personal',
        },
      },
      { headers: noStore },
    );
  } catch (e: any) {
    return Response.json(
      {
        error: e.status
          ? e.message
          : e.name === 'TimeoutError'
            ? 'The provider took too long to respond. Retry.'
            : 'The connection could not be saved. Try again.',
      },
      { status: e.status || 503, headers: noStore },
    );
  }
}
export async function POST(request: Request) {
  return mutate(request, false);
}
export async function DELETE(request: Request) {
  return mutate(request, true);
}
