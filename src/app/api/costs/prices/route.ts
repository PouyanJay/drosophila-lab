import { getLocalUser } from '@/server/auth/local-user';
import {
  listPrices,
  listRefreshes,
  pricesStale,
  refreshPrices,
  PRICE_SOURCE_URL,
} from '@/server/llm-costs';
const noStore = { 'Cache-Control': 'no-store' };
export async function GET() {
  const user = await getLocalUser();
  if (!user)
    return Response.json(
      { error: 'Start the local workspace.' },
      { status: 401, headers: noStore },
    );
  try {
    const [prices, refreshes] = await Promise.all([listPrices(), listRefreshes()]);
    return Response.json({ prices, refreshes, sourceUrl: PRICE_SOURCE_URL }, { headers: noStore });
  } catch {
    return Response.json({ error: 'Pricing is unavailable.' }, { status: 503, headers: noStore });
  }
}
/**
 * Manual refresh: pulls the online price list and updates every supported model row.
 * `?ifStale=<days>` skips the refresh when a successful one is newer than that.
 */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origin mismatch' }, { status: 403 });
  const user = await getLocalUser();
  if (!user)
    return Response.json(
      { error: 'Start the local workspace.' },
      { status: 401, headers: noStore },
    );
  try {
    const ifStale = Number(new URL(request.url).searchParams.get('ifStale'));
    if (Number.isFinite(ifStale) && ifStale > 0 && !(await pricesStale(ifStale)))
      return Response.json(
        { skipped: true, refreshes: await listRefreshes() },
        { headers: noStore },
      );
    const refresh = await refreshPrices();
    const prices = await listPrices();
    return Response.json(
      { refresh, prices, refreshes: await listRefreshes() },
      { status: refresh.status === 'succeeded' ? 200 : 502, headers: noStore },
    );
  } catch {
    return Response.json(
      { error: 'Pricing could not be refreshed. Existing prices are unchanged.' },
      { status: 503, headers: noStore },
    );
  }
}
