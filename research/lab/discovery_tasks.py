"""Versioned task plugins. Search never chooses an easier scoring distribution.

Each plugin supplies scenarios, deterministic split generation and an I/O contract.
Adapters supply differentiable loss, normalized score and prediction decoding.
New environments implement this same contract without changing the search worker.
"""
from dataclasses import dataclass
import json
import numpy as np
import torch

@dataclass(frozen=True)
class Task:
    id: str
    name: str
    version: str = '1'
    input_channels: int = 6
    classes: int = 4
    metric_name: str = 'Accuracy'

    def loss(self, logits, targets):
        return torch.nn.functional.cross_entropy(logits,targets)

    def score(self, logits, targets):
        # The generic search contract uses a normalized, higher-is-better score.
        return float((logits.argmax(1)==targets).float().mean())

    def decode(self, logits):
        return logits.argmax(1).tolist()

    def probabilities(self, logits):
        return logits.softmax(1).tolist()

    def validate_parameters(self, parameters):
        if parameters:raise ValueError('This task has no additional parameters')

    def describe(self):
        return dict(id=self.id,name=self.name,version=self.version,inputChannels=self.input_channels,classes=self.classes,metricName=self.metric_name,parameterHelp='No extra parameters')

    def scenarios(self, config):
        return [dict(delay=d, noise=n, length=l)
                for d in config['delays'] for n in config['noise']
                for l in (config['lengths'] if self.id == 'sequence-recall' else [1])]

    def generate(self, config, seed, split, scenario_index, count):
        domains={'train':11,'validation':23,'confirmation-train':37,
                 'confirmation-validation':43,'test':59}
        s=self.scenarios(config)[scenario_index]
        rng=np.random.default_rng(np.random.SeedSequence([seed,domains[split],scenario_index,91703]))
        y=np.arange(count,dtype=np.int64)%self.classes;rng.shuffle(y)
        steps=s['delay']+s['length']+1
        x=np.zeros((steps,count,self.input_channels),np.float32)
        x[:,:,:4]=rng.normal(0,s['noise'],(steps,count,4))
        if self.id=='noisy-evidence':
            x[np.arange(steps)[:,None],np.arange(count)[None,:],y[None,:]]+=.65
            x[:,:,4]=1
        elif self.id=='cue-memory':
            x[0,:,:4]=np.eye(4)[y];x[0,:,4]=1
        else:
            # A final query asks for either the first or last direction of a sequence.
            # Targets are balanced; distractors and queried positions are independent.
            query=rng.integers(0,2,count);tokens=rng.integers(0,4,(s['length'],count))
            position=query*(s['length']-1);tokens[position,np.arange(count)]=y
            x[:s['length'],:,:4]=np.eye(4)[tokens];x[:s['length'],:,4]=1
            x[-1,:,5]=query*2-1
        return torch.from_numpy(x),torch.from_numpy(y)

TASKS={t.id:t for t in [Task('cue-memory','Remember a direction'),
                       Task('sequence-recall','Recall an ordered sequence'),
                       Task('noisy-evidence','Decide under noise')]}
def get_task(id):
    if id not in TASKS: raise ValueError('Unsupported discovery task. Register and test a task plugin first.')
    return TASKS[id]
