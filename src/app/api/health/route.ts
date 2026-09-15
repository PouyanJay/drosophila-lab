export const dynamic = 'force-dynamic';

/** Local launcher readiness/instance check; never return configuration or secrets. */
export function GET() {
  return Response.json(
    {
      status: 'ready',
      workspace: 'drosophila-local',
      instance: process.env.LOCAL_WORKSPACE_ID || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
