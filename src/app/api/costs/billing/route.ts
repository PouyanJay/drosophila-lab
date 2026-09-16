import { getLocalUser } from '@/server/auth/local-user';
import {
  billingConnections,
  BillingError,
  fetchProviderCosts,
  removeBillingCredential,
  saveBillingCredential,
} from '@/server/llm-costs';
import { z } from 'zod';
const noStore = { 'Cache-Control': 'no-store' };
const provider = z.enum(['openai', 'anthropic']);
export async function GET() {
  const user = await getLocalUser();
  if (!user)
    return Response.json(
      { error: 'Start the local workspace.' },
      { status: 401, headers: noStore },
    );
  try {
    return Response.json(
      { connections: await billingConnections(user.userId) },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      { error: 'Billing connections are unavailable.' },
      { status: 503, headers: noStore },
    );
  }
}
async function mutate(request: Request, remove: boolean) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origin mismatch' }, { status: 403 });
  const user = await getLocalUser();
  if (!user)
    return Response.json(
      { error: 'Start the local workspace.' },
      { status: 401, headers: noStore },
    );
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: 'Request too large' }, { status: 413 });
  let body: { provider?: unknown; apiKey?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const p = provider.safeParse(body.provider);
  if (!p.success) return Response.json({ error: 'Unknown provider' }, { status: 400 });
  try {
    if (remove) {
      await removeBillingCredential(user.userId, p.data);
      return Response.json({ removed: true }, { headers: noStore });
    }
    const value = z
      .string()
      .trim()
      .min(20)
      .max(2048)
      .regex(/^[!-~]+$/)
      .safeParse(body.apiKey);
    if (!value.success)
      return Response.json({ error: 'Enter a valid admin API key.' }, { status: 400 });
    // Verify the key can read a cost report before storing it.
    const today = new Date().toISOString().slice(0, 10);
    await fetchProviderCosts(p.data, value.data, today, today);
    await saveBillingCredential(user.userId, p.data, value.data);
    return Response.json(
      { connections: await billingConnections(user.userId) },
      { headers: noStore },
    );
  } catch (e) {
    if (e instanceof BillingError)
      return Response.json({ error: e.message }, { status: e.status, headers: noStore });
    return Response.json(
      {
        error:
          e instanceof Error && e.name === 'TimeoutError'
            ? 'The provider took too long to respond. Retry.'
            : 'The billing connection could not be saved. Try again.',
      },
      { status: 503, headers: noStore },
    );
  }
}
export async function POST(request: Request) {
  return mutate(request, false);
}
export async function DELETE(request: Request) {
  return mutate(request, true);
}
