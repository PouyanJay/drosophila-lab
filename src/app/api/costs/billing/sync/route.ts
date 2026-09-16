import { getLocalUser } from '@/server/auth/local-user';
import { billingConnections, syncProviderCosts } from '@/server/llm-costs';
const noStore = { 'Cache-Control': 'no-store' };
/** Pull billed amounts for every connected provider over the last N days (default 30). */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origin mismatch' }, { status: 403 });
  const user = await getLocalUser();
  if (!user)
    return Response.json(
      { error: 'Start the local workspace.' },
      { status: 401, headers: noStore },
    );
  const raw = await request.text();
  let days = 30;
  if (raw.length && raw.length <= 256) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const value = Number((parsed as { days?: unknown } | null)?.days);
      if (Number.isFinite(value)) days = Math.max(1, Math.min(180, Math.trunc(value)));
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400, headers: noStore });
    }
  }
  try {
    const connected = (await billingConnections(user.userId)).filter(
      (c) => c.status === 'connected',
    );
    if (!connected.length)
      return Response.json(
        { error: 'Connect an admin key for OpenAI or Claude first.' },
        { status: 409, headers: noStore },
      );
    const syncs = [];
    for (const c of connected) syncs.push(await syncProviderCosts(user.userId, c.provider, days));
    return Response.json(
      { syncs, connections: await billingConnections(user.userId) },
      { status: syncs.every((s) => s.status === 'succeeded') ? 200 : 502, headers: noStore },
    );
  } catch {
    return Response.json({ error: 'Billing sync failed.' }, { status: 503, headers: noStore });
  }
}
