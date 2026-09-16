export type Plan = {
  task: string;
  goal: string;
  duplicates: number;
  prune: number;
  memory: boolean;
  population: string;
  budget: string;
  seeds: number;
  epochs: number;
  seed: number;
};
export type Message = {
  role: 'assistant' | 'user';
  text: string;
  provider?: string;
  model?: string;
  /**
   * USD cost of the provider call that produced this reply: null when the model had no stored
   * rate, 'unrecorded' when the call could not be written to the local ledger.
   */
  cost?: number | null | 'unrecorded';
};
export const defaultPlan: Plan = {
  task: '',
  goal: '',
  duplicates: 128,
  prune: 0,
  memory: true,
  population: 'descending_neuron',
  budget: '',
  seeds: 3,
  epochs: 60,
  seed: 11,
};
export const tasks: Record<string, { name: string; description: string }> = {
  beacon: {
    name: 'Delayed beacon',
    description: 'Remember the first beacon through a delay, then choose the matching gate.',
  },
  evidence: {
    name: 'Noisy evidence',
    description: 'Integrate six noisy cues to infer the hidden direction.',
  },
  rule: {
    name: 'Two-cue rule',
    description: 'Choose right when two separated cues disagree; otherwise choose left.',
  },
};
export const greeting =
  'What would you like the fruit-fly network to become better at? We can test memory, decisions under noise, or combining separated cues. I’ll help you define the change and a fair comparison before anything runs.';
export function options(stage: number) {
  return stage === 0
    ? ['Remember a beacon', 'Decide under noise', 'Combine two cues']
    : stage === 1
      ? ['Higher accuracy', 'Faster decisions', 'Balance both']
      : stage === 2
        ? ['Add 128 memory copies', 'Prune 15% of weak edges', 'Expand and prune']
        : stage === 3
          ? ['Quick check · 1 seed', 'Paired study · 3 seeds', 'Stronger check · 5 seeds']
          : ['Review the plan', 'Use 256 copies', 'Use 30% pruning'];
}
export function respond(
  text: string,
  stage: number,
  plan: Plan,
): { text: string; stage: number; plan: Plan } {
  const t = text.toLowerCase(),
    p = { ...plan };
  if (/doom|mario|minecraft|robot|physics|flight|reinforcement/.test(t))
    return {
      stage,
      plan: p,
      text: 'Those embodied tasks need a task adapter and an external simulation/training service, which are not connected here. The current arena can replay real memory and decision outputs. Which of those would be a useful first benchmark?',
    };
  const task = /nois|evidence/.test(t)
    ? 'evidence'
    : /two cue|two-cue|combine|xor|rule/.test(t)
      ? 'rule'
      : /beacon|remember|memory|recall/.test(t)
        ? 'beacon'
        : null;
  if (stage === 0) {
    if (!task)
      return {
        stage,
        plan: p,
        text: 'Let’s make that measurable. Do you mean remembering an earlier cue, deciding from noisy evidence, or combining two separated cues? Choose one, or describe how the network should decide.',
      };
    p.task = task;
    return {
      stage: 1,
      plan: p,
      text: `We’ll use ${tasks[task].name.toLowerCase()}: ${tasks[task].description} What matters most: higher held-out accuracy, faster decisions, or balancing both?`,
    };
  }
  if (stage === 1) {
    if (!/accur|fast|speed|latency|both|balanc/.test(t))
      return {
        stage,
        plan: p,
        text: 'I need a success criterion before choosing a change. Should we prioritize accuracy, decision speed, or both?',
      };
    p.goal = /both|balanc/.test(t)
      ? 'balance'
      : /fast|speed|latency/.test(t)
        ? 'speed'
        : 'accuracy';
    p.prune = p.goal === 'speed' ? 0.15 : 0;
    p.duplicates = p.goal === 'speed' ? 0 : 128;
    return {
      stage: 2,
      plan: p,
      text:
        p.goal === 'speed'
          ? 'I suggest pruning weak measured connections while retaining every original neuron. It may reduce compute, but it can also remove useful pathways. Would you like pruning alone, or source-neuron expansion as well?'
          : 'I suggest duplicating 128 descending neurons, inheriting their measured incoming and outgoing connections, and giving the copies slower state decay. The hypothesis is better memory; added recurrence may increase latency. Would you like expansion, pruning, or both?',
    };
  }
  if (stage === 2 || stage === 4) {
    const count = t.match(
      /(?:add|use|duplicate|copies|expand|neurons?)\s*(\d+)|\b(\d+)\s*(?:copies|neurons|memory)/,
    );
    const percent = t.match(/(\d+)\s*%/);
    if (/prun/.test(t)) {
      p.prune = percent ? (Number(percent[1]) >= 25 ? 0.3 : 0.15) : 0.15;
      if (stage === 2 && !/expand|add|both/.test(t)) p.duplicates = 0;
    }
    if (/expand|add|copies|duplicate|both/.test(t))
      p.duplicates = count ? Math.max(0, Math.min(512, Number(count[1] || count[2]))) : 128;
    if (/no prun|without prun/.test(t)) p.prune = 0;
    if (/no memor|same decay/.test(t)) p.memory = false;
    if (task && stage === 4) p.task = task;
    if (!/prun|expand|add|copies|duplicate|both|review|same decay|memory|beacon|nois|rule/.test(t))
      return {
        stage,
        plan: p,
        text: 'I can configure source-derived copies (0–512), weak-edge pruning (0%, 15%, or 30%), and slower decay for copies. Tell me the change you want, or use one of the suggestions.',
      };
    if (stage === 4)
      return {
        stage: 4,
        plan: p,
        text: 'I’ve updated the plan below. The original connectome stays the comparison baseline. Review the exact change and start when ready.',
      };
    return {
      stage: 3,
      plan: p,
      text: `The candidate will add ${p.duplicates} source-derived copies and ${p.prune ? 'prune up to ' + Math.round(p.prune * 100) + '% of the weakest edges' : 'keep all measured edges'}. Both models get the same inputs and readout capacity. How much evidence would you like: a quick execution check, three paired seeds, or five?`,
    };
  }
  if (stage === 3) {
    if (!/quick|one|1|three|3|five|5|paired|strong/.test(t))
      return {
        stage,
        plan: p,
        text: 'Choose a quick one-seed check, a three-seed paired study, or a five-seed check. Larger studies take longer on this device.',
      };
    p.seeds = /5|five|strong/.test(t) ? 5 : /quick|one|1/.test(t) ? 1 : 3;
    p.budget = p.seeds === 1 ? 'quick' : 'study';
    p.epochs = p.seeds === 1 ? 30 : 60;
    return {
      stage: 4,
      plan: p,
      text: `The plan is ready. I’ll verify the full source graph, train both decision readouts, select checkpoints using validation loss, then evaluate held-out trials and test whether gains survive removal of recurrent edges. ${p.seeds === 1 ? 'A single seed is an execution check, not evidence of a reliable gain.' : 'The report will show paired seed variation and an exploratory uncertainty interval.'} No improvement is assumed.`,
    };
  }
  return {
    stage,
    plan: p,
    text: 'Review the plan below, or tell me which architecture setting to change.',
  };
}
