import { getLocalUser } from '@/server/auth/local-user';
import { acknowledgeAlert, alertStep, listAlerts, setAlertStep } from '@/server/llm-costs';
const noStore = { 'Cache-Control': 'no-store' };
async function guard(request: Request | null) {
  if (request && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origin mismatch' }, { status: 403 });
  if (!(await getLocalUser()))
    return Response.json(
      { error: 'Start the local workspace.' },
      { status: 401, headers: noStore },
    );
  return null;
}
async function payload(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > 1024) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
export async function GET() {
  const denied = await guard(null);
  if (denied) return denied;
  try {
    return Response.json(
      { alerts: await listAlerts(), stepUsd: await alertStep() },
      { headers: noStore },
    );
  } catch {
    return Response.json({ error: 'Alerts are unavailable.' }, { status: 503, headers: noStore });
  }
}
/** Acknowledge one alert by id. */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await payload(request);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: 'Invalid alert' }, { status: 400 });
  try {
    return Response.json({ acknowledged: await acknowledgeAlert(id) }, { headers: noStore });
  } catch {
    return Response.json({ error: 'The alert could not be updated.' }, { status: 503 });
  }
}
/** Change the spend step (default $50) that triggers the next alerts. */
export async function PATCH(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await payload(request);
  const step = Number(body?.stepUsd);
  if (!Number.isFinite(step) || step < 1 || step > 100000)
    return Response.json(
      { error: 'Enter an alert step between $1 and $100,000.' },
      { status: 400 },
    );
  try {
    return Response.json({ stepUsd: await setAlertStep(step) }, { headers: noStore });
  } catch {
    return Response.json({ error: 'The alert step could not be saved.' }, { status: 503 });
  }
}
