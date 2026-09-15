import { LabConfig, labConfigSchema } from '@/lib/contracts/lab-contract';
export function actionBlock(
  name: string,
  connected: boolean,
  stage: number,
  job: any,
  example: boolean,
) {
  if (!connected)
    return 'Your training machine is not connected. No run request was sent. Open Compute in the chat to connect your machine.';
  if (name === 'start' && stage !== 4)
    return 'Let’s finish the task, goal, change and budget before starting.';
  if (
    name === 'start' &&
    job &&
    ['queued', 'running', 'pausing', 'paused', 'cancelling'].includes(job.status)
  )
    return 'An experiment is already active. Finish or cancel it before starting the next comparison.';
  if (name !== 'start' && (!job || example))
    return 'Select a real experiment from Saved runs before controlling it.';
  const allowed: Record<string, string[]> = {
    pause: ['queued', 'running'],
    resume: ['paused', 'failed'],
    cancel: ['queued', 'running', 'pausing', 'paused'],
  };
  if (name !== 'start' && !allowed[name]?.includes(job.status))
    return 'That action is unavailable while the selected run is ' + job.status + '.';
  return null;
}
export class LabSubmission {
  private pending: { key: string; config: string } | null = null;
  async start(config: LabConfig, request: (path: string, options: RequestInit) => Promise<any>) {
    const parsed = labConfigSchema.parse(config),
      text = JSON.stringify(parsed);
    if (!this.pending || this.pending.config !== text)
      this.pending = { key: crypto.randomUUID(), config: text };
    const job = await request('jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestKey: this.pending.key, config: parsed }),
    });
    this.pending = null;
    return job;
  }
}
