import type { CostFilters } from '@/lib/contracts/costs';
import { getLocalUser } from '@/server/auth/local-user';
import { costSummary } from '@/server/llm-costs';
const noStore = { 'Cache-Control': 'no-store' };
const isoDate = (v: string | null) =>
  v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined;
const short = (v: string | null) => (v && v.length <= 200 ? v : undefined);
export async function GET(request: Request) {
  const user = await getLocalUser();
  if (!user)
    return Response.json(
      { error: 'Start the local workspace.' },
      { status: 401, headers: noStore },
    );
  const p = new URL(request.url).searchParams;
  const provider = p.get('provider');
  const filters: CostFilters = {
    from: isoDate(p.get('since')),
    to: isoDate(p.get('until')),
    experimentId: short(p.get('experiment')),
    provider: provider === 'openai' || provider === 'anthropic' ? provider : undefined,
    model: short(p.get('model')),
    keyHint: short(p.get('key')),
    surface: short(p.get('surface')),
  };
  try {
    return Response.json(await costSummary(filters), { headers: noStore });
  } catch {
    return Response.json(
      { error: 'Spending history is unavailable. Check that the workspace is running.' },
      { status: 503, headers: noStore },
    );
  }
}
