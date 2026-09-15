import type { Plan } from '@/lib/planning/experiment-planner';
import { z } from 'zod';
export const labConfigSchema = z
  .object({
    schema: z.literal('malecns-lab/1'),
    task: z.enum(['cue-memory', 'noisy-evidence']),
    duplicates: z.number().int().min(0).max(128),
    population: z.enum(['cb_intrinsic', 'descending_neuron', 'visual_projection']),
    seeds: z
      .array(z.number().int().min(0).max(9999))
      .min(1)
      .max(5)
      .refine((a) => new Set(a).size === a.length),
    updates: z.number().int().min(1).max(200),
    batch: z.number().int().min(1).max(8),
    timesteps: z.number().int().min(4).max(16),
    trainExamples: z.number().int().min(8).max(512).multipleOf(2),
    validationExamples: z.number().int().min(8).max(256).multipleOf(2),
    testExamples: z.number().int().min(8).max(512).multipleOf(2),
    learningRate: z.number().positive().max(0.05),
  })
  .strict();
export type LabConfig = z.infer<typeof labConfigSchema>;
export const defaultLabConfig: LabConfig = {
  schema: 'malecns-lab/1',
  task: 'cue-memory',
  duplicates: 32,
  population: 'cb_intrinsic',
  seeds: [41, 42, 43],
  updates: 12,
  batch: 4,
  timesteps: 8,
  trainExamples: 32,
  validationExamples: 16,
  testExamples: 32,
  learningRate: 0.01,
};
export function labConfigFromPlan(p: Plan): LabConfig {
  if (!['beacon', 'evidence'].includes(p.task))
    throw Error(
      'The persistent lab currently supports cue memory and noisy evidence. Ask the guide to choose one of those tasks.',
    );
  if (p.prune || p.memory || p.duplicates > 128)
    throw Error(
      'This milestone supports up to 128 inherited copies, without pruning or a separate slow-memory rule. Ask the guide to revise those settings.',
    );
  const study = p.budget === 'study';
  return labConfigSchema.parse({
    ...defaultLabConfig,
    task: p.task === 'beacon' ? 'cue-memory' : 'noisy-evidence',
    duplicates: p.duplicates,
    population: p.population,
    seeds: Array.from({ length: p.seeds }, (_, i) => (p.seed + i) % 10000),
    updates: p.epochs,
    trainExamples: study ? 64 : 32,
    validationExamples: study ? 32 : 16,
    testExamples: study ? 64 : 32,
  });
}
