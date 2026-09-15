export const experimentSuggestions=[
 {id:'cue-memory',title:'Remember a cue',description:'Test recall after a distraction.',prompt:`Design a reproducible fruit-fly experiment: Remember a cue.

Task: Show an initial directional cue, introduce a delay with distractor noise, then ask the network to recall the cue.

Goal and change: Test whether 32 inherited copies of central-brain neurons improve held-out accuracy against the original MaleCNS network. Explain why this might help and why it might fail.

Fair comparison: Start with three paired seeds, 12 training updates, and 32 / 16 / 32 training, validation and test examples per seed. Keep both networks on the same data and training budget. Use validation to select checkpoints before testing.

Evidence: Show learning curves, paired test decisions, uncertainty, decision speed and a recurrence ablation. Preserve the exact configuration and source ancestry for reproduction. Do not promise an improvement.

Next step: Use the selected training approach, explain its limits, and turn this brief into a complete reviewable plan. Ask only for important missing decisions. Check compute readiness before execution and wait for my instruction to start.`},
 {id:'noisy-evidence',title:'Decide under noise',description:'Find a weak signal in noisy inputs.',prompt:`Design a reproducible fruit-fly experiment: Decide under noise.

Task: Present noisy observations of a hidden direction, then compare how accurately the original and modified MaleCNS networks infer that direction.

Goal and change: Test whether 32 inherited copies of central-brain neurons improve held-out accuracy without an excessive increase in decision time. Explain the capacity and speed trade-off.

Fair comparison: Start with three paired seeds, 12 training updates, and 32 / 16 / 32 training, validation and test examples per seed. Use identical examples and budgets for both networks, select checkpoints with validation, and evaluate held-out tests afterwards.

Evidence: Show train and validation curves, paired decisions, accuracy differences with uncertainty, warmed inference timing, and recurrence ablation. Save the settings and ancestry so the comparison is reproducible.

Next step: Use the selected training approach and explain its limits. Prepare the complete plan from this brief, ask only for important missing decisions, and wait for my instruction before starting. Report ties or regressions honestly.`}
] as const;
export function suggestionPrompt(suggestion:typeof experimentSuggestions[number],execution:'lab'|'browser'){
 return execution==='lab'?suggestion.prompt:suggestion.prompt.replaceAll('32 / 16 / 32','24 / 12 / 24').replace('Use the selected training approach','Use browser readout training, with internal connections fixed');
}
export function suggestionForPrompt(text:string){return experimentSuggestions.find(s=>s.prompt===text||suggestionPrompt(s,'browser')===text);}
