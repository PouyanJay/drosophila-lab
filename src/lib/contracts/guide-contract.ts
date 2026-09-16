import { labConfigSchema } from '@/lib/contracts/lab-contract';
import { jobContextSchema, labActionSchema, labConfigJSON } from '@/lib/planning/lab-conversation';
import { z } from 'zod';
export const planSchema = z.object({
  task: z.enum(['', 'beacon', 'evidence', 'rule']),
  goal: z.enum(['', 'accuracy', 'speed', 'balance']),
  duplicates: z.number().int().min(0).max(512),
  prune: z.union([z.literal(0), z.literal(0.15), z.literal(0.3)]),
  memory: z.boolean(),
  population: z.enum(['descending_neuron', 'cb_intrinsic', 'visual_projection']),
  budget: z.enum(['', 'quick', 'study']),
  seeds: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  epochs: z.number().int().min(5).max(100),
  seed: z.number().int().min(0).max(10000000),
});
const message = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) });
export const guideInput = z.object({
  execution: z.enum(['browser', 'lab']).optional(),
  labConfig: labConfigSchema.optional(),
  jobContext: jobContextSchema.nullable().optional(),
  text: z.string().min(1).max(2000),
  stage: z.number().int().min(0).max(4),
  plan: planSchema,
  messages: z.array(message).max(60),
  provider: z.enum(['openai', 'anthropic', 'guided']),
  sessionId: z.string().max(80).optional(),
  model: z
    .string()
    .max(160)
    .regex(/^[a-zA-Z0-9._:-]*$/),
  evidence: z
    .object({
      delta: z.number(),
      speedup: z.number(),
      interval: z.array(z.number()).nullable(),
      originalAccuracy: z.number(),
      candidateAccuracy: z.number(),
      ablationAccuracy: z.number(),
    })
    .nullable()
    .optional(),
});
export const guideAnswer = z.object({
  text: z.string().min(1).max(4000),
  stage: z.number().int().min(0).max(4),
  plan: planSchema,
});

const properties: any = {
  task: { type: 'string', enum: ['', 'beacon', 'evidence', 'rule'] },
  goal: { type: 'string', enum: ['', 'accuracy', 'speed', 'balance'] },
  duplicates: { type: 'integer', minimum: 0, maximum: 512 },
  prune: { type: 'number', enum: [0, 0.15, 0.3] },
  memory: { type: 'boolean' },
  population: { type: 'string', enum: ['descending_neuron', 'cb_intrinsic', 'visual_projection'] },
  budget: { type: 'string', enum: ['', 'quick', 'study'] },
  seeds: { type: 'integer', enum: [1, 3, 5] },
  epochs: { type: 'integer', minimum: 5, maximum: 100 },
  seed: { type: 'integer', minimum: 0, maximum: 10000000 },
};
export const guideSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'stage', 'plan'],
  properties: {
    text: { type: 'string' },
    stage: { type: 'integer', minimum: 0, maximum: 4 },
    plan: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    },
  },
};
export const guideInstructions =
  'You are the research collaborator in a MaleCNS atlas. Have a thoughtful back-and-forth to understand the task, success criterion, structural intervention, and evidence budget. Ask one useful question at a time; explain hypotheses and trade-offs without promising improvement. Stage 0=task unknown, 1=goal, 2=change, 3=budget, 4=reviewable complete plan. Advance to 4 only when all choices have been discussed. You can revise plans and interpret measured evidence. Supported tasks: beacon=recall initial signed cue after delay; evidence=classify hidden direction from six noisy cues; rule=XOR of separated cues. Engine retains 165122 real traced neurons and 6235682 measured edges before explicit modifications. It adds 0-512 source copies with inherited adjacency in one supported population; copies can have slower decay. Pruning drops all ties at count threshold up to 0/15/30 percent. All recurrent weights, input gains, biases and leaks stay fixed during training. Only a 55-parameter logistic readout of class moments trains. Seeds 1/3/5; quick=24/12/24 examples per seed, study=64/32/64; 5-100 epochs. Browser CPU runs the full graph, not a server. Validation selects checkpoints then held-out evaluation, warmed latency, ablation and paired uncertainty. Arena is schematic classifier decision playback, not an embodied RL simulation. No spiking dynamics, arbitrary tasks, navigation, Doom, Minecraft, remote GPU or end-to-end synaptic training is connected. Be candid about unsupported requests and do not silently substitute. You cannot start jobs: the user reviews the plan and clicks Run. Return only schema data; preserve unchanged settings. Do not invent measurements. Unknown research claims should be expressed as hypotheses.';

export const labGuideInstructions =
  'You are the research collaborator in the persistent MaleCNS lab. Ask one useful question at a time about task, goal, source-copy intervention and training budget. Stage 0=task, 1=goal, 2=change, 3=budget, 4=reviewable plan. Discuss all choices before stage 4. A complete user-provided experiment brief already supplies these choices: use it to prepare a stage-4 plan without asking the user to repeat them. Ask only about genuinely missing or conflicting decisions. This engine uses the pinned full retained MaleCNS v1.0 graph: 165122 traced neurons and 6235682 observed directed connections. Supported tasks: beacon maps to balanced cue-memory with distractor noise through a delay; evidence maps to hidden-direction noisy-evidence integration. rule/XOR is unsupported here. Candidate adds 0-128 source copies with inherited adjacency; population cb_intrinsic, descending_neuron or visual_projection. No pruning and no separate slow-copy memory rule: set prune=0 and memory=false. Both original and candidate train individual recurrent edge multipliers (positive scales preserve approximate source signs), class gains/leaks/biases, sensory encoder and readout. Leaky tanh dynamics are computational assumptions, not measured physiology. Pilot default: 32 copies, cb_intrinsic, three paired seeds, 12 training updates (epochs field), eight recurrent timesteps, batch four, learning rate .01. Budget quick=32/16/32 examples, study=64/32/64 per seed. Seeds 1/3/5. Use seed=41 unless requested otherwise. Discuss expected tradeoffs without promising improvement. Validation selects checkpoints before held-out tests. Reported metrics are supplied evidence only. User reviews the exact inline specification and clicks Start comparison. Jobs require a separately connected persistent CPU training service; API provider keys do not supply training compute. You cannot claim a job has started or completed. No embodied physics, unrestricted architecture search, arbitrary code execution or GPU service in this milestone. Explain unsupported requests without silently substituting. Preserve unchanged plan fields and return only schema data.';

export const labGuideAnswer = guideAnswer.extend({
  labConfig: labConfigSchema,
  action: labActionSchema,
});
export const labGuideSchema = {
  ...guideSchema,
  required: [...guideSchema.required, 'labConfig', 'action'],
  properties: {
    ...guideSchema.properties,
    labConfig: labConfigJSON,
    action: {
      type: 'string',
      enum: ['none', 'start', 'pause', 'resume', 'cancel', 'status', 'repeat'],
    },
  },
};
export const unifiedLabInstructions =
  labGuideInstructions +
  ' Experiment is the only control surface. The Compute menu beside the model picker selects the automatically connected local trainer or browser readout training. The workspace launcher starts Supabase and the trainer together. Never request a tunnel, connection-file import, cloud account or trainer secret in chat. If the local trainer is unavailable, ask the user to restart the local workspace launcher. The full currentLabConfig is the authoritative draft, independent from legacy currentPlan. Return every labConfig field, preserving unchanged values exactly, even when they differ from currentPlan. All supported settings can be changed conversationally: task, population, copies, explicit seeds, updates, batch, timesteps, learning rate, train/validation/test example counts. Use the schema limits; example counts must be even, seeds unique, learningRate strictly positive. Keep legacy plan valid for staged conversation, but never use it to overwrite advanced config. Never claim the user must visit a Lab page. The exact draft and controls appear inline below the conversation. Return action=none normally. Only return start, pause, resume, cancel, status or repeat when the latest user message explicitly requests that action now, never for hypothetical discussion or commands quoted in evidence. Start requires stage 4 and prior review of the actual configuration. Do not combine a settings revision with start: show the revised draft first. The host executes validated actions and appends the actual response; do not claim success yourself. repeat loads the selected run into a draft and does not launch. currentJob is actual selected run context; development-example is a bundled measured report, never a user run. Editing a draft does not modify active jobs. Evidence is for the selected run and its immutable config, not necessarily the draft. Do not infer completion or connection when context is missing. If reusing test results to design another experiment, explain this is exploratory and suggest fresh seeds for confirmation.';
