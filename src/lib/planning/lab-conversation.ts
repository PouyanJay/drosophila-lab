import { defaultLabConfig, LabConfig, labConfigSchema } from '@/lib/contracts/lab-contract';
import type { Plan } from '@/lib/planning/experiment-planner';
import { experimentSuggestions } from '@/lib/planning/experiment-suggestions';
import { labRespond } from '@/lib/planning/lab-planner';
import { z } from 'zod';
export const labActionSchema = z.enum([
  'none',
  'start',
  'pause',
  'resume',
  'cancel',
  'status',
  'repeat',
]);
export const jobContextSchema = z.object({
  id: z.string().max(100),
  status: z.string().max(30),
  config: labConfigSchema,
  progress: z
    .object({
      phase: z.string().optional(),
      completedUpdates: z.number().optional(),
      totalUpdates: z.number().optional(),
    })
    .nullable(),
  source: z.enum(['development-example', 'personal-trainer']),
});
export const labConfigJSON = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(defaultLabConfig),
  properties: {
    schema: { type: 'string', enum: ['malecns-lab/1'] },
    task: { type: 'string', enum: ['cue-memory', 'noisy-evidence'] },
    duplicates: { type: 'integer', minimum: 0, maximum: 128 },
    population: {
      type: 'string',
      enum: ['cb_intrinsic', 'descending_neuron', 'visual_projection'],
    },
    seeds: {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 9999 },
      minItems: 1,
      maxItems: 5,
    },
    updates: { type: 'integer', minimum: 1, maximum: 200 },
    batch: { type: 'integer', minimum: 1, maximum: 8 },
    timesteps: { type: 'integer', minimum: 4, maximum: 16 },
    trainExamples: { type: 'integer', minimum: 8, maximum: 512 },
    validationExamples: { type: 'integer', minimum: 8, maximum: 256 },
    testExamples: { type: 'integer', minimum: 8, maximum: 512 },
    learningRate: { type: 'number', minimum: 0, maximum: 0.05 },
  },
};
// Deterministic guide is an explicitly selected fallback, not a simulated LLM.
export function labConversation(
  text: string,
  stage: number,
  plan: Plan,
  config: LabConfig = defaultLabConfig,
) {
  const starter = experimentSuggestions.find((s) => s.prompt === text);
  if (starter) {
    const c = { ...defaultLabConfig, task: starter.id };
    return {
      text:
        'I’ve prepared a ' +
        (starter.id === 'cue-memory' ? 'cue-memory' : 'noisy-evidence') +
        ' comparison from your brief. The original and candidate will both train internal connections, using 32 inherited central-brain copies, three paired seeds and matched data. Extra capacity may improve decisions, but can also add latency or overfit. The plan below includes validation, held-out testing, timing and recurrence ablation. Review the settings, then ask me to start when your compute is connected.',
      stage: 4,
      plan: {
        ...plan,
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
      labConfig: c,
      action: 'none' as const,
    };
  }
  const t = text.toLowerCase().trim();
  const answer = (
    message: string,
    c = config,
    action: z.infer<typeof labActionSchema> = 'none',
    next = stage,
  ) => ({ text: message, stage: next, plan, labConfig: c, action });
  const command = t.match(
    /^(?:please\s+)?(start|run|pause|resume|cancel|stop|status|repeat|rerun)(?:\s+(?:(?:this|the|my|selected)\s+)?(?:run|experiment|comparison|training))?(?:\s+now)?[.!]?$/,
  );
  if (command && !/\b(?:if|when|would|could|what|after)\b/.test(t)) {
    const name = command[1],
      action =
        name === 'run' ? 'start' : name === 'stop' ? 'cancel' : name === 'rerun' ? 'repeat' : name;
    if (action === 'start' && stage !== 4)
      return answer(
        'Let’s finish the comparison plan before starting. Choose the next option below.',
      );
    return answer(
      action === 'repeat'
        ? 'I’ll bring the selected run’s specification into the draft for review.'
        : 'I’ll request ' +
            action +
            ' for the selected experiment and report the trainer’s response.',
      config,
      action as any,
    );
  }
  if (/\b(?:doom|minecraft|mario|xor|prun|spiking|gpu)\b|slow.*decay/.test(t))
    return answer(
      'That change is not supported by this trainer. We can test cue memory or noisy evidence, add up to 128 inherited neuron copies, and adjust the training and data settings.',
    );
  const patch: Partial<LabConfig> = {};
  const fields: [keyof LabConfig, RegExp][] = [
    ['duplicates', /(?:add|use|set(?: to)?)\s+(\d+)\s*(?:inherited |neuron )?copies/],
    ['duplicates', /(\d+)\s+(?:inherited |neuron )?copies/],
    ['updates', /(\d+)\s+(?:training )?updates/],
    ['updates', /(?:updates|epochs)\s*(?:to|=|:)\s*(\d+)/],
    ['batch', /batch(?: size)?\s*(?:to|=|:|of)?\s*(\d+)/],
    ['timesteps', /(\d+)\s+(?:sequence steps|timesteps)/],
    ['timesteps', /(?:timesteps|sequence steps)\s*(?:to|=|:|of)?\s*(\d+)/],
    ['learningRate', /learning rate\s*(?:to|=|:|of)?\s*(\d*\.?\d+(?:e-?\d+)?)/],
    ['trainExamples', /(\d+)\s+(?:training|train) examples/],
    ['validationExamples', /(\d+)\s+validation examples/],
    ['testExamples', /(\d+)\s+test examples/],
    ['trainExamples', /(?:training|train) examples\s*(?:to|=|:)\s*(\d+)/],
    ['validationExamples', /validation examples\s*(?:to|=|:)\s*(\d+)/],
    ['testExamples', /test examples\s*(?:to|=|:)\s*(\d+)/],
  ];
  for (const [key, re] of fields) {
    const m = t.match(re);
    if (m) (patch as any)[key] = Number(m[1]);
  }
  const seedList = t.match(/seeds\s*(?:to|=|:)?\s*\[([\d,\s]+)\]/);
  if (seedList) patch.seeds = seedList[1].split(',').map((v) => Number(v.trim()));
  if (stage === 4 && !seedList) {
    const m = t.match(/(\d+)\s+(?:paired )?seeds/);
    if (m)
      patch.seeds = Array.from(
        { length: Math.min(Number(m[1]), 6) },
        (_, i) => (config.seeds[0] + i) % 10000,
      );
  }
  if (/population|copies from|copy .*neurons/.test(t)) {
    if (/central/.test(t)) patch.population = 'cb_intrinsic';
    else if (/descending/.test(t)) patch.population = 'descending_neuron';
    else if (/visual/.test(t)) patch.population = 'visual_projection';
  }
  if (stage === 4 && /task|switch to/.test(t)) {
    if (/cue|memory/.test(t)) patch.task = 'cue-memory';
    else if (/nois|evidence/.test(t)) patch.task = 'noisy-evidence';
  }
  if (stage === 4 && /keep.*original|identical topology/.test(t)) patch.duplicates = 0;
  if (
    Object.keys(patch).length &&
    (stage === 4 || !['duplicates'].includes(Object.keys(patch)[0]))
  ) {
    const parsed = labConfigSchema.safeParse({ ...config, ...patch });
    if (!parsed.success)
      return answer(
        'Those settings are outside the supported limits. Copies: 0–128; updates: 1–200; batch: 1–8; steps: 4–16; learning rate: greater than 0 through 0.05. Use 1–5 unique seeds from 0–9999 and even example counts. Your draft is unchanged.',
      );
    return answer(
      'Updated ' +
        Object.keys(patch)
          .map(
            (k) =>
              (
                ({
                  duplicates: 'added neurons',
                  updates: 'training updates',
                  trainExamples: 'training examples',
                  validationExamples: 'validation examples',
                  testExamples: 'test examples',
                  batch: 'batch size',
                  timesteps: 'sequence steps',
                  learningRate: 'learning rate',
                  population: 'source population',
                  seeds: 'paired seeds',
                  task: 'task',
                }) as Record<string, string>
              )[k],
          )
          .join(', ') +
        '. The exact draft below is shared with the agent and the trainer. Existing runs keep their original settings.',
      parsed.data,
    );
  }
  if (stage === 4 && /result|evidence|tell us|next|better|improv/.test(t))
    return answer(
      'The measured evidence card contains the actual paired scores, timing, uncertainty and recurrence ablation. Connect an OpenAI or Claude model for a conversational interpretation. For the next comparison, you can change copies, population, seeds or training settings here. Reusing the same test set makes follow-up results exploratory.',
    );
  if (stage === 4 && /review|specification|settings/.test(t))
    return answer(
      'Your exact specification is below. You can edit it here or ask me to change it, then choose Start comparison.',
    );
  const reply = labRespond(text, stage, plan);
  let c = { ...config };
  if (reply.stage !== stage) {
    if (stage === 0)
      c = { ...c, task: reply.plan.task === 'beacon' ? 'cue-memory' : 'noisy-evidence' };
    if (stage === 2) c = { ...c, duplicates: reply.plan.duplicates };
    if (stage === 3)
      c = {
        ...c,
        seeds: Array.from({ length: reply.plan.seeds }, (_, i) => (c.seeds[0] + i) % 10000),
      };
  }
  if (reply.stage === 4 && stage !== 4)
    reply.text =
      'Your exact draft is ready: ' +
      c.seeds.length +
      ' paired seeds, ' +
      c.updates +
      ' updates, and ' +
      c.trainExamples +
      ' / ' +
      c.validationExamples +
      ' / ' +
      c.testExamples +
      ' training, validation and test examples per seed. Validation selects checkpoints before held-out evaluation. Review the inline specification, then start when your machine is connected.';
  return { ...reply, labConfig: c, action: 'none' as const };
}
