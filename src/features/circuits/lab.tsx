'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Box,
  ChevronRight,
  CircleHelp,
  Download,
  FlaskConical,
  GitBranch,
  Layers3,
  Network,
  Pause,
  Play,
  Save,
  Square,
  Undo2,
  Workflow,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toaster, toast } from 'sonner';
import NetworkView from '@/features/circuits/network-view';
import {
  COLORS,
  ENGINE_VERSION,
  GROUPS,
  mutateGraph,
  randomizeGraph,
  replay,
  summarize,
  validateGraph,
} from '../../../public/engine.js';
import { downloadFile as download } from '@/lib/client/download';
import { Chart, Scatter } from './charts';
const TASKS = [
  ['memory', 'Delayed recall', 'Remember the binary input from three steps earlier.'],
  [
    'xor',
    'Temporal XOR',
    'Determine whether the current bit differs from the bit three steps earlier.',
  ],
  [
    'majority',
    'Window majority',
    'Classify whether the last four inputs contain more positive than negative bits.',
  ],
];
const LINE_COLORS = ['#8da9ce', '#b9ed82', '#b19af2'];
function Picker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[][];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="select" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem value={v} key={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

async function saveRecord(kind: string, id: string, name: string, data: any) {
  const res = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, id, name, data }),
  });
  const result: any = await res.json();
  if (!res.ok) throw Error(result.error || 'Save failed.');
  return result;
}
export default function Lab({ initialGraph }: { initialGraph: any }) {
  const [baseline, setBaseline] = useState<any>(() => structuredClone(initialGraph)),
    [candidate, setCandidate] = useState<any>(() => ({
      ...structuredClone(initialGraph),
      id: 'variant-' + initialGraph.id,
      name: initialGraph.name + ' variant',
      parent: initialGraph.id,
    })),
    [view, setView] = useState('candidate'),
    [tab, setTab] = useState('architecture'),
    [operation, setOperation] = useState('expand'),
    [amount, setAmount] = useState(25),
    [group, setGroup] = useState('2'),
    [explode, setExplode] = useState(0),
    [selected, setSelected] = useState<number | null>(null),
    [undo, setUndo] = useState<any[]>([]),
    [task, setTask] = useState('memory'),
    [epochs, setEpochs] = useState(30),
    [seeds, setSeeds] = useState(3),
    [seed, setSeed] = useState(42),
    [control, setControl] = useState(false),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState<any>(null),
    [result, setResult] = useState<any>(null),
    [runs, setRuns] = useState<any[]>([]),
    [graphs, setGraphs] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [storageError, setStorageError] = useState(''),
    [unsavedRun, setUnsavedRun] = useState<any>(null),
    [importOpen, setImportOpen] = useState(false),
    [methodOpen, setMethodOpen] = useState(false),
    [importText, setImportText] = useState(''),
    [importError, setImportError] = useState(''),
    [replayStep, setReplayStep] = useState(0),
    [replayModel, setReplayModel] = useState('1'),
    [playing, setPlaying] = useState(false),
    [replayOpen, setReplayOpen] = useState(false);
  const worker = useRef<Worker | null>(null),
    mutationCounter = useRef(100),
    activeGraph = view === 'baseline' ? baseline : candidate;
  const load = useCallback(async () => {
    setLoading(true);
    setStorageError('');
    try {
      const responses = await Promise.all(
        ['run', 'graph'].map((k) =>
          fetch('/api/records?kind=' + k).then(async (r) => {
            const d: any = await r.json();
            if (!r.ok) throw Error(d.error);
            return d.records;
          }),
        ),
      );
      setRuns(responses[0]);
      setGraphs(responses[1]);
    } catch (e: any) {
      setStorageError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    return () => worker.current?.terminate();
  }, [load]);
  const persistRun = async (r: any) => {
    try {
      await saveRecord('run', r.id, r.name, r);
      setRuns((prev) => [
        { id: r.id, name: r.name, data: r, created_at: r.createdAt },
        ...prev.filter((x) => x.id !== r.id),
      ]);
      setUnsavedRun(null);
      toast.success('Experiment and checkpoints saved.');
    } catch (e: any) {
      setUnsavedRun(r);
      toast.error(e.message);
    }
  };
  const start = useCallback(() => {
    if (worker.current) return;
    setRunning(true);
    setProgress(null);
    setResult(null);
    setTab('experiments');
    const config = { task, epochs, seeds, seed };
    const runGraphs = control
      ? [baseline, candidate, randomizeGraph(candidate, 91)]
      : [baseline, candidate];
    try {
      const w = new Worker('/train-worker.js', { type: 'module' });
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (data.type === 'progress') setProgress(data.data);
        if (data.type === 'error') {
          toast.error(data.message);
          w.terminate();
          worker.current = null;
          setRunning(false);
        }
        if (data.type === 'complete') {
          const r = {
            ...data.data,
            id: 'run-' + crypto.randomUUID(),
            name: (TASKS.find((t) => t[0] === task)?.[1] || task) + ' · ' + candidate.name,
            environment: {
              userAgent: navigator.userAgent,
              logicalCores: navigator.hardwareConcurrency || null,
            },
            source: 'Measured in browser',
          };
          setResult(r);
          setRunning(false);
          w.terminate();
          worker.current = null;
          persistRun(r);
        }
      };
      w.onerror = () => {
        toast.error('Training stopped unexpectedly. Try a smaller graph or fewer epochs.');
        setRunning(false);
        w.terminate();
        worker.current = null;
      };
      w.postMessage({ config, graphs: runGraphs });
    } catch (e: any) {
      setRunning(false);
      worker.current = null;
      toast.error(e.message);
    }
  }, [task, epochs, seeds, seed, control, baseline, candidate]);
  const cancel = () => {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
    setProgress(null);
    toast('Experiment cancelled. No partial result was saved.');
  };
  const applyMutation = () => {
    try {
      setUndo((u) => [...u, candidate]);
      const next = mutateGraph(
        candidate,
        operation,
        amount,
        ++mutationCounter.current,
        Number(group),
      );
      setCandidate(next);
      setView('candidate');
      setSelected(null);
      toast.success('Variant updated. Run a comparison to measure the effect.');
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const saveGraph = async () => {
    try {
      await saveRecord('graph', candidate.id, candidate.name, candidate);
      await load();
      toast.success('Architecture saved.');
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const importGraph = () => {
    try {
      const data = validateGraph(JSON.parse(importText));
      const g = {
        ...data,
        id: 'import-' + crypto.randomUUID(),
        name: data.name || 'Imported graph',
        provenance: String(
          data.provenance || 'User-imported graph. Biological provenance unverified.',
        ).slice(0, 300),
        history: [],
        parent: null,
      };
      setBaseline(g);
      setCandidate({
        ...structuredClone(g),
        id: 'variant-' + crypto.randomUUID(),
        name: g.name + ' variant',
        parent: g.id,
      });
      setSelected(null);
      setUndo([]);
      setImportOpen(false);
      saveRecord('graph', g.id, g.name, g)
        .then(() => load())
        .catch((e: any) => toast.error(e.message));
      toast.success('Graph imported as the new baseline.');
    } catch (e: any) {
      setImportError(e.message);
    }
  };
  const node = selected === null ? null : activeGraph.nodes[selected];
  const edges = activeGraph.edges.length,
    deltaNodes = candidate.nodes.length - baseline.nodes.length,
    deltaEdges = candidate.edges.length - baseline.edges.length;
  const changeNeuron = (field: string, value: number) => {
    if (view === 'baseline' || selected === null || !Number.isFinite(value)) return;
    setCandidate((g: any) => ({
      ...g,
      id: 'graph-' + crypto.randomUUID(),
      nodes: g.nodes.map((n: any) =>
        n.id === selected ? { ...n, [field]: Math.min(10, Math.max(-10, value)) } : n,
      ),
    }));
  };
  const currentReplay = result?.models[Number(replayModel)] || result?.models[0];
  const replayFrames = useMemo(
    () =>
      currentReplay
        ? replay(
            currentReplay.graph,
            currentReplay.runs[0].weights,
            currentReplay.runs[0].example.xs,
          )
        : [],
    [currentReplay],
  );
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setReplayStep((s) => (s + 1) % 16), 400);
    return () => clearInterval(t);
  }, [playing]);
  useEffect(() => {
    const mc = (document as any).modelContext;
    if (!mc?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      mc.registerTool(
        {
          name: 'inspect_neural_experiment',
          description:
            'Read the current architecture sizes, experiment configuration and measured results.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true },
          execute: (input: any) => {
            if (!input || Object.keys(input).length) throw Error('No parameters accepted.');
            return {
              baseline: { neurons: baseline.nodes.length, connections: baseline.edges.length },
              variant: { neurons: candidate.nodes.length, connections: candidate.edges.length },
              config: { task, epochs, seeds, seed },
              running,
              result: result
                ? result.models.map((m: any) => ({
                    name: m.name,
                    accuracy: m.accuracy,
                    latency: m.latency,
                  }))
                : null,
            };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [baseline, candidate, task, epochs, seeds, seed, running, result]);
  const series = result
    ? result.models.map((m: any, i: number) => ({
        name: m.name,
        color: LINE_COLORS[i],
        points: m.runs[0].curve.map((_: any, e: number) => ({
          x: e,
          y: m.runs.reduce((s: number, r: any) => s + r.curve[e].val, 0) / m.runs.length,
        })),
      }))
    : progress
      ? [
          {
            name: progress.name + ' · validation',
            color: '#b9ed82',
            points: progress.curve.map((p: any) => ({ x: p.epoch, y: p.val })),
          },
          {
            name: 'Training',
            color: '#759bcc',
            points: progress.curve.map((p: any) => ({ x: p.epoch, y: p.train })),
          },
        ]
      : [];
  const paired = result
    ? result.models[1].runs.map(
        (r: any, i: number) => (r.testAccuracy - result.models[0].runs[i].testAccuracy) * 100,
      )
    : [];
  const diff = paired.length ? summarize(paired) : null;
  const latencyChange = result
    ? result.models[0].latency.mean / result.models[1].latency.mean
    : null;
  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <header className="topbar">
        <div className="brand">
          <img src="/brand/neural-fly.svg" alt="" />
          connectome<span>/ lab</span>
        </div>
        <div className="topmeta">
          <span className="hidetablet">Architecture research workspace</span>
          <span className="tag">
            <Box size={12} /> Browser compute
          </span>
          <button
            className="iconbtn"
            title="Experiment methodology"
            onClick={() => setMethodOpen(true)}
          >
            <CircleHelp size={16} />
          </button>
        </div>
      </header>
      <main className="workspace">
        <div className="heading">
          <div>
            <div className="eyebrow">PROJECT 001 / STRUCTURE → PERFORMANCE</div>
            <h1>Neural architecture laboratory</h1>
            <p className="subtitle">
              Inspect the structure. Change the connections. Measure the difference.
            </p>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setImportOpen(true)} disabled={running}>
              <ArrowUpFromLine size={15} />
              Import graph
            </button>
            <button className="btn primary" onClick={start} disabled={running}>
              <Play size={15} />
              {running ? 'Experiment running' : 'Run comparison'}
            </button>
          </div>
        </div>
        {storageError && (
          <div className="notice error">
            {storageError}{' '}
            <button className="btn small" onClick={load}>
              Retry storage
            </button>{' '}
            You can still work and export results.
          </div>
        )}
        {unsavedRun && (
          <div className="notice">
            This result has not been saved. Keep this tab open or export it.{' '}
            <button className="btn small" onClick={() => persistRun(unsavedRun)}>
              Retry save
            </button>
            <button className="btn small" onClick={() => download('experiment.json', unsavedRun)}>
              Export result
            </button>
          </div>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="navtabs">
            <TabsTrigger value="architecture">
              <Network size={16} />
              Architecture
            </TabsTrigger>
            <TabsTrigger value="experiments">
              <FlaskConical size={16} />
              Experiments{running && <span className="tag">Running</span>}
            </TabsTrigger>
            <TabsTrigger value="compare">
              <Activity size={16} />
              Results
            </TabsTrigger>
            <TabsTrigger value="protocol">
              <Workflow size={16} />
              Protocol
            </TabsTrigger>
          </TabsList>
          <TabsContent value="architecture">
            <div className="editor">
              <aside className="leftpanel">
                <div className="paneltitle">
                  ARCHITECTURES <GitBranch size={15} />
                </div>
                <button
                  className={'architecture-card ' + (view === 'baseline' ? 'active' : '')}
                  onClick={() => {
                    setView('baseline');
                    setSelected(null);
                  }}
                >
                  <span className="smalllabel">00 · baseline</span>
                  <strong>{baseline.name}</strong>
                  <small>
                    {baseline.nodes.length} neurons · {baseline.edges.length} edges
                  </small>
                </button>
                <button
                  className={'architecture-card ' + (view === 'candidate' ? 'active' : '')}
                  onClick={() => {
                    setView('candidate');
                    setSelected(null);
                  }}
                >
                  <span className="smalllabel">01 · working variant</span>
                  <strong>{candidate.name}</strong>
                  <small>
                    {candidate.nodes.length} neurons · {candidate.edges.length} edges
                  </small>
                </button>
                <div className="panelgroup">
                  <div className="smalllabel">Functional groups</div>
                  {GROUPS.map((g: string, i: number) => (
                    <div className="legend" key={g}>
                      <span>
                        <i style={{ background: COLORS[i] }} />
                        {g}
                      </span>
                      <span className="muted">
                        {activeGraph.nodes.filter((n: any) => n.group === i).length}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="panelgroup">
                  <div className="smalllabel">Graph provenance</div>
                  <p className="micro" style={{ marginTop: 10 }}>
                    {activeGraph.provenance}
                  </p>
                </div>
                <div className="panelgroup">
                  <button
                    className="btn small wfull"
                    onClick={() => download('architecture.json', activeGraph)}
                  >
                    <Download size={13} />
                    Export graph
                  </button>
                </div>
              </aside>
              <NetworkView
                graph={activeGraph}
                explode={explode}
                selected={selected}
                onSelect={setSelected}
              />
              <aside className="rightpanel">
                <div className="paneltitle">
                  MODIFY VARIANT <Layers3 size={15} />
                </div>
                <div className="field">
                  <label>Structural operation</label>
                  <Picker
                    value={operation}
                    onChange={setOperation}
                    options={[
                      ['expand', 'Expand a group'],
                      ['prune', 'Prune connections'],
                      ['rewire', 'Rewire connections'],
                    ]}
                    label="Structural operation"
                  />
                </div>
                {operation === 'expand' && (
                  <div className="field">
                    <label>Target group</label>
                    <Picker
                      value={group}
                      onChange={setGroup}
                      options={GROUPS.map((g: string, i: number) => [String(i), g])}
                      label="Target group"
                    />
                  </div>
                )}
                <div className="field">
                  <label>
                    Mutation size <b>{amount}%</b>
                  </label>
                  <Slider
                    value={[amount]}
                    onValueChange={(v) => setAmount(v[0])}
                    min={5}
                    max={50}
                    step={5}
                    aria-label="Mutation percentage"
                  />
                </div>
                <button
                  className="btn primary wfull"
                  onClick={applyMutation}
                  disabled={running || (operation === 'expand' && candidate.nodes.length >= 512)}
                >
                  <GitBranch size={14} />
                  Apply mutation
                </button>
                <div className="changebox">
                  <div className="mutationpill">
                    <GitBranch size={13} />
                    Changes from baseline
                  </div>
                  <div>
                    {deltaNodes >= 0 ? '+' : ''}
                    {deltaNodes} neurons · {deltaEdges >= 0 ? '+' : ''}
                    {deltaEdges} connections
                  </div>
                  <div className="micro">{candidate.history?.length || 0} structural changes</div>
                </div>
                <div className="actions">
                  <button
                    className="btn small"
                    title="Undo last structural mutation"
                    disabled={!undo.length || running}
                    onClick={() => {
                      setCandidate(undo[undo.length - 1]);
                      setUndo((u) => u.slice(0, -1));
                      setSelected(null);
                    }}
                  >
                    <Undo2 size={13} />
                    Undo
                  </button>
                  <button className="btn small" onClick={saveGraph}>
                    <Save size={13} />
                    Save
                  </button>
                </div>
                <div className="field mt">
                  <label>
                    Separate groups <b>{explode}%</b>
                  </label>
                  <Slider
                    value={[explode]}
                    onValueChange={(v) => setExplode(v[0])}
                    min={0}
                    max={100}
                    step={1}
                    aria-label="Visual group separation"
                  />
                  <p className="micro" style={{ marginTop: 8 }}>
                    Visual layout only. Connectivity is unchanged.
                  </p>
                </div>
                <div className="nodetail">
                  <div className="field">
                    <label>Inspect neuron</label>
                    <Picker
                      label="Inspect neuron"
                      value={selected === null ? 'none' : String(selected)}
                      onChange={(v) => setSelected(v === 'none' ? null : Number(v))}
                      options={[
                        ['none', 'Select a neuron'],
                        ...activeGraph.nodes.map((n: any) => [
                          String(n.id),
                          'N' + n.id + ' · ' + GROUPS[n.group],
                        ]),
                      ]}
                    />
                  </div>
                  {node && (
                    <>
                      <h3>
                        N{node.id} / {GROUPS[node.group]}
                      </h3>
                      <p>
                        {activeGraph.edges.filter((e: any) => e.target === node.id).length} incoming
                        · {activeGraph.edges.filter((e: any) => e.source === node.id).length}{' '}
                        outgoing
                      </p>
                      <div className="split">
                        <label>
                          Input gain
                          <input
                            aria-label="Neuron input gain"
                            disabled={view === 'baseline' || running}
                            type="number"
                            step=".05"
                            min="-10"
                            max="10"
                            value={Number(node.input.toFixed(3))}
                            onChange={(e) => changeNeuron('input', Number(e.target.value))}
                          />
                        </label>
                        <label>
                          Bias
                          <input
                            aria-label="Neuron bias"
                            disabled={view === 'baseline' || running}
                            type="number"
                            step=".05"
                            min="-10"
                            max="10"
                            value={Number(node.bias.toFixed(3))}
                            onChange={(e) => changeNeuron('bias', Number(e.target.value))}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </aside>
            </div>
            <div className="stats">
              <div className="stat">
                <label>NEURONS</label>
                <strong>{activeGraph.nodes.length.toLocaleString()}</strong>
                <small>All neurons rendered</small>
              </div>
              <div className="stat">
                <label>DIRECTED CONNECTIONS</label>
                <strong>{edges.toLocaleString()}</strong>
                <small>
                  {((edges / activeGraph.nodes.length ** 2) * 100).toFixed(1)}% graph density
                </small>
              </div>
              <div className="stat">
                <label>TRAINABLE PARAMETERS</label>
                <strong>{activeGraph.nodes.length + 1}</strong>
                <small>Logistic readout weights + bias</small>
              </div>
              <div className="stat">
                <label>COMPLETED COMPARISONS</label>
                <strong>{runs.length || '0'}</strong>
                <small>
                  {loading ? 'Loading saved experiments' : 'Durable experiment history'}
                </small>
              </div>
            </div>
            <div className="footnote">
              <CircleHelp size={16} />
              <span>
                The baseline is an extracted MaleCNS circuit with measured connections. The variant
                starts as an exact copy. Added neurons and rewired edges are engineered changes.
                Dynamics and task interfaces are modeling choices.{' '}
                <button onClick={() => setTab('protocol')} style={{ color: '#b9ed82' }}>
                  View scientific scope <ChevronRight size={12} style={{ display: 'inline' }} />
                </button>
              </span>
            </div>
            {graphs.length > 0 && (
              <div className="panel mt">
                <div className="panelhead">
                  <h2>Saved architectures</h2>
                  <span className="micro">{graphs.length} available</span>
                </div>
                {graphs.map((g) => (
                  <div className="runitem" key={g.id}>
                    <div>
                      <strong>{g.name}</strong>
                      <p>
                        {g.data.nodes.length} neurons · {g.data.edges.length} connections
                      </p>
                    </div>
                    <button
                      className="btn small"
                      disabled={running}
                      onClick={() => {
                        setCandidate(g.data);
                        setView('candidate');
                        setSelected(null);
                        setUndo([]);
                        toast('Saved graph loaded as the working variant.');
                      }}
                    >
                      Load variant
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="experiments">
            <div className="expgrid">
              <aside className="panel">
                <div className="panelhead">
                  <h2>Experiment setup</h2>
                  <FlaskConical size={17} className="muted" />
                </div>
                <div className="field">
                  <label>Benchmark task</label>
                  <Picker
                    label="Benchmark task"
                    value={task}
                    onChange={(v) => !running && setTask(v)}
                    options={TASKS.map((t) => [t[0], t[1]])}
                  />
                  <p className="micro" style={{ marginTop: 10 }}>
                    {TASKS.find((t) => t[0] === task)?.[2]}
                  </p>
                </div>
                <div className="field">
                  <label>
                    Training epochs <b>{epochs}</b>
                  </label>
                  <Slider
                    disabled={running}
                    value={[epochs]}
                    onValueChange={(v) => setEpochs(v[0])}
                    min={10}
                    max={100}
                    step={10}
                    aria-label="Training epochs"
                  />
                </div>
                <div className="split">
                  <div className="field">
                    <label htmlFor="seeds">Paired seeds</label>
                    <input
                      id="seeds"
                      type="number"
                      disabled={running}
                      min="1"
                      max="5"
                      value={seeds}
                      onChange={(e) =>
                        setSeeds(Math.max(1, Math.min(5, Math.round(Number(e.target.value)))))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="seed">Base seed</label>
                    <input
                      id="seed"
                      type="number"
                      disabled={running}
                      min="0"
                      max="1000000"
                      value={seed}
                      onChange={(e) =>
                        setSeed(Math.max(0, Math.min(1000000, Math.round(Number(e.target.value)))))
                      }
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="control">
                    Random matched control
                    <Switch
                      id="control"
                      checked={control}
                      disabled={running}
                      onCheckedChange={setControl}
                    />
                  </label>
                  <p className="micro">
                    Same neuron and edge counts as the variant. Random connectivity and weights.
                  </p>
                </div>
                <div className="panelgroup">
                  <div className="legend">
                    <span>Training sequences</span>
                    <b>384</b>
                  </div>
                  <div className="legend">
                    <span>Validation sequences</span>
                    <b>192</b>
                  </div>
                  <div className="legend">
                    <span>Test sequences</span>
                    <b>384</b>
                  </div>
                  <div className="legend">
                    <span>Inputs per sequence</span>
                    <b>16</b>
                  </div>
                </div>
                <button
                  className={'btn wfull mt ' + (running ? '' : 'primary')}
                  onClick={running ? cancel : start}
                >
                  {running ? <Square size={14} /> : <Play size={14} />}{' '}
                  {running ? 'Cancel experiment' : 'Train, evaluate & test'}
                </button>
                <p className="micro mt">
                  Runs on this device. Keep the tab open. Results and checkpoints save when the run
                  completes.
                </p>
              </aside>
              <div>
                <div className="panel">
                  <div className="panelhead">
                    <div>
                      <h2>Learning curves</h2>
                      <p className="micro" style={{ marginTop: 7 }}>
                        Validation accuracy ·{' '}
                        {result
                          ? 'mean across paired seeds'
                          : running
                            ? 'current training run'
                            : 'measured during training'}
                      </p>
                    </div>
                    <span className="badge-neutral">
                      {running ? 'Training' : result ? 'Complete' : 'Ready'}
                    </span>
                  </div>
                  {running && progress && (
                    <div className="progressbox">
                      <div className="runline">
                        <span>
                          {progress.name} · seed {progress.seed}/{seeds}
                        </span>
                        <span>
                          {progress.epoch}/{progress.epochs}
                        </span>
                      </div>
                      <Progress
                        value={
                          ((progress.completed + progress.epoch / progress.epochs) /
                            progress.total) *
                          100
                        }
                      />
                    </div>
                  )}
                  {series.length ? (
                    <Chart series={series} />
                  ) : (
                    <div className="empty">
                      <Activity size={34} strokeWidth={1} />
                      <h2>Every curve starts with an experiment</h2>
                      <p>
                        Run the baseline and your variant on identical data splits. Results appear
                        here as the networks train.
                      </p>
                      <button className="btn primary" onClick={start} disabled={running}>
                        <Play size={14} />
                        Run first comparison
                      </button>
                    </div>
                  )}
                  {result && (
                    <div className="actions mt">
                      <button className="btn primary" onClick={() => setTab('compare')}>
                        Explore test results <ArrowRight size={14} />
                      </button>
                      <span className="micro">
                        Completed in {(result.elapsedMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                  )}
                </div>
                <div className="panel mt">
                  <div className="panelhead">
                    <h2>Experiment history</h2>
                    <span className="micro">{runs.length} saved</span>
                  </div>
                  {!runs.length ? (
                    <p className="micro">
                      {loading
                        ? 'Loading history…'
                        : 'Completed comparisons will appear here. No example scores are prefilled.'}
                    </p>
                  ) : (
                    runs.map((run) => (
                      <div className="runitem" key={run.id}>
                        <div>
                          <strong>{run.name}</strong>
                          <p>
                            {new Date(run.created_at).toLocaleString()} · {run.data.config.seeds}{' '}
                            seeds · {run.data.config.epochs} epochs
                          </p>
                        </div>
                        <button
                          className="btn small"
                          onClick={() => {
                            setResult(run.data);
                            setReplayStep(0);
                            setTab('compare');
                          }}
                        >
                          Open <ChevronRight size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="compare">
            {!result ? (
              <div className="panel empty">
                <FlaskConical size={34} strokeWidth={1} />
                <h2>No completed comparison selected</h2>
                <p>
                  Train a variant or open an experiment from history to see its held-out accuracy,
                  speed and variability.
                </p>
                <button className="btn primary" onClick={() => setTab('experiments')}>
                  Go to experiments <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="panelhead">
                  <div>
                    <h2>{result.name}</h2>
                    <p className="micro" style={{ marginTop: 7 }}>
                      {result.config.seeds} paired seeds · {result.config.epochs} epochs ·{' '}
                      {result.source || 'Measured experiment'} · engine {result.engineVersion}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      className="btn small"
                      onClick={() =>
                        download('connectome-experiment-' + result.id + '.json', result)
                      }
                    >
                      <ArrowDownToLine size={14} />
                      Full report
                    </button>
                    <button
                      className="btn small"
                      onClick={() => {
                        const rows = [
                          [
                            'architecture',
                            'neurons',
                            'edges',
                            'test_accuracy_mean',
                            'test_accuracy_sd',
                            'latency_ms',
                            'training_ms',
                          ],
                          ...result.models.map((m: any) => [
                            m.name,
                            m.graph.nodes.length,
                            m.graph.edges.length,
                            m.accuracy.mean,
                            m.accuracy.sd,
                            m.latency.mean,
                            m.training.mean,
                          ]),
                        ];
                        download(
                          'benchmark.csv',
                          rows
                            .map((r) =>
                              r
                                .map((v: any) => '"' + String(v).replaceAll('"', '""') + '"')
                                .join(','),
                            )
                            .join('\n'),
                          'text/csv',
                        );
                      }}
                    >
                      <Download size={14} />
                      CSV
                    </button>
                  </div>
                </div>
                <div className="summary-strip">
                  <strong className={(diff?.mean || 0) >= 0 ? 'delta' : 'negative'}>
                    {(diff?.mean || 0) > 0 ? '+' : ''}
                    {diff?.mean.toFixed(2)} percentage points versus baseline
                  </strong>
                  <p>
                    Paired test accuracy difference: mean ± SD {diff?.mean.toFixed(2)} ±{' '}
                    {diff?.sd.toFixed(2)} pp. Variant decision speed: {latencyChange?.toFixed(2)}×
                    baseline speed.{' '}
                    {result.config.seeds < 3
                      ? 'Use at least 3 seeds to inspect variability.'
                      : 'These descriptive measurements do not establish statistical significance.'}
                  </p>
                </div>
                <div className="panel">
                  <div className="panelhead">
                    <h2>Benchmark scorecard</h2>
                    <span className="micro">Test set · higher accuracy, lower latency</span>
                  </div>
                  <Table className="results-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Architecture</TableHead>
                        <TableHead>Neurons / edges</TableHead>
                        <TableHead>Test accuracy ± SD</TableHead>
                        <TableHead>Decision latency</TableHead>
                        <TableHead>Training time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.models.map((m: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell>
                            <span style={{ color: LINE_COLORS[i] }}>
                              {i === 0 ? 'Baseline' : i === 1 ? 'Variant' : 'Control'}
                            </span>
                            <p className="micro">{m.name}</p>
                          </TableCell>
                          <TableCell>
                            {m.graph.nodes.length} / {m.graph.edges.length}
                          </TableCell>
                          <TableCell>
                            {(m.accuracy.mean * 100).toFixed(2)} ±{' '}
                            {(m.accuracy.sd * 100).toFixed(2)}%
                          </TableCell>
                          <TableCell>{m.latency.mean.toFixed(4)} ms</TableCell>
                          <TableCell>{(m.training.mean / 1000).toFixed(2)} s</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="micro mt">
                    Latency includes one recurrent update and one readout. Medians of five timed
                    batches, then averaged across seeds. Browser scheduling, thermal state and timer
                    precision can affect small differences.
                  </p>
                </div>
                <div className="comparison-grid">
                  <div className="panel">
                    <div className="panelhead">
                      <h2>Learning efficiency</h2>
                      <span className="micro">Validation accuracy</span>
                    </div>
                    <Chart series={series} />
                  </div>
                  <div className="panel">
                    <div className="panelhead">
                      <h2>Accuracy / compute trade-off</h2>
                      <span className="micro">Upper left is better</span>
                    </div>
                    <Scatter models={result.models} />
                  </div>
                </div>
                <div className="panel mt">
                  <div className="panelhead">
                    <div>
                      <h2>Checkpoint inspection</h2>
                      <p className="micro" style={{ marginTop: 7 }}>
                        Replay a measured test input through the selected network.
                      </p>
                    </div>
                    <button className="btn" onClick={() => setReplayOpen(!replayOpen)}>
                      <Box size={14} />
                      {replayOpen ? 'Close replay' : 'Inspect in 3D'}
                    </button>
                  </div>
                  {replayOpen && currentReplay && (
                    <>
                      <div className="split">
                        <div>
                          <Picker
                            value={replayModel}
                            onChange={(v) => {
                              setReplayModel(v);
                              setReplayStep(0);
                            }}
                            options={result.models.map((m: any, i: number) => [String(i), m.name])}
                            label="Replay architecture"
                          />
                          <NetworkView
                            graph={currentReplay.graph}
                            activity={replayFrames[replayStep]?.state}
                            compact
                          />
                        </div>
                        <div className="panel">
                          <div className="replay-controls">
                            <button
                              className="iconbtn"
                              title={playing ? 'Pause replay' : 'Play replay'}
                              onClick={() => setPlaying(!playing)}
                            >
                              {playing ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                            <span className="micro">
                              Step {replayStep + 1} / 16 · first training seed
                            </span>
                          </div>
                          <Slider
                            value={[replayStep]}
                            onValueChange={(v) => {
                              setPlaying(false);
                              setReplayStep(v[0]);
                            }}
                            min={0}
                            max={15}
                            step={1}
                            aria-label="Replay time step"
                          />
                          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className="stat">
                              <label>INPUT</label>
                              <strong>{replayFrames[replayStep]?.input}</strong>
                            </div>
                            <div className="stat">
                              <label>P(CLASS 1)</label>
                              <strong>
                                {(100 * (replayFrames[replayStep]?.probability || 0)).toFixed(1)}%
                              </strong>
                            </div>
                          </div>
                          <p className="micro">
                            The classifier is trained on final sequence states. Intermediate
                            predictions are exploratory. Final target class:{' '}
                            {currentReplay.runs[0].example.y}. Neuron brightness reflects absolute
                            activation, not biological spike recordings.
                          </p>
                          <div className="panelgroup">
                            <h3>Checkpoint chosen by validation loss</h3>
                            <p className="micro mt">
                              Epochs across seeds:{' '}
                              {currentReplay.runs.map((r: any) => r.bestEpoch).join(', ')}. Readout
                              parameters are included in the full report for exact replay.
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="footnote">
                  <CircleHelp size={16} />
                  <span>
                    The test split is separate from training and checkpoint selection. Repeated
                    architecture tuning on these displayed test scores makes them exploratory; use
                    fresh seeds for a confirmatory run. Expansion uses more capacity and is not a
                    compute-matched comparison.
                  </span>
                </div>
              </>
            )}
          </TabsContent>
          <TabsContent value="protocol">
            <div className="panel method">
              <div className="eyebrow">EXPERIMENT CONTRACT / V1.0</div>
              <h1>Know what you are measuring.</h1>
              <p className="subtitle">
                Connectome-derived experiments with source-preserving architecture snapshots.
              </p>
              <h2>What runs today</h2>
              <p>
                Interactive 3D graph inspection; group expansion, connection pruning and rewiring;
                custom neuron input gain and bias; JSON graph import and export; real training,
                validation and held-out testing; paired seed comparisons; measured latency; saved
                graphs, results and checkpoints.
              </p>
              <h2>Network and learning rule</h2>
              <p>
                The included seed is a 192-neuron induced circuit extracted from MaleCNS v1.0. It
                retains original body IDs, measured connection counts and annotated coordinates.
                Connections with fewer than five synapses are excluded. Input is applied to the
                named seed neurons. GABA is modeled as inhibitory; all other transmitters are
                treated as excitatory, an approximation that omits receptor-specific effects. Each
                recurrent step combines the previous state with a tanh activation. Incoming absolute
                weights are normalized to a sum of 0.95; the state leak is 0.7. A logistic readout
                sees every final neuron state and is trained with shuffled stochastic gradient
                descent. Recurrent weights, input gains and neuron biases are fixed during training.
                Structural edits alter these fixed dynamics.
              </p>
              <h2>Data and selection</h2>
              <p>
                Each seed generates distinct training, validation and test sequences with
                independent pseudorandom streams. All architectures receive the same sequences for
                that seed. There are 384 training, 192 validation and 384 test examples, each 16
                steps long. The readout checkpoint with lowest validation loss is selected; its test
                accuracy is then measured once. Reported variation is sample standard deviation
                across seeds, not a confidence interval. Graph initialization and the random control
                are fixed across these seeds; variation measures data and optimizer effects.
              </p>
              <h2>Benchmarks</h2>
              <ul>
                {TASKS.map((t) => (
                  <li key={t[0]}>
                    <strong>{t[1]}:</strong> {t[2]}
                  </li>
                ))}
              </ul>
              <p>
                Recall and XOR have an expected 50% majority-class baseline. Window majority uses a
                strict positive sum, so ties are class 0 and its expected majority-class baseline is
                68.75%. These are bounded diagnostic tasks, not evidence of game-playing ability or
                general intelligence.
              </p>
              <h2>Fair comparison and timing</h2>
              <p>
                Baseline and variant share data and optimizer settings. The optional random control
                matches variant neuron and edge counts, not degree sequence or every dynamical
                property. Expanded graphs increase both recurrent and readout capacity. Model
                execution order rotates across seeds. Decision latency measures warmed recurrent
                updates plus readout; it excludes rendering and data generation. Training time
                includes feature extraction and progress yielding. Hardware, browser scheduling, and
                early execution warm-up can influence results. No GPU speed or energy claim is made.
              </p>
              <h2>What full connectome research still needs</h2>
              <p>
                This browser engine accepts 8–512 neurons and up to 20,000 directed edges. The atlas
                uses real MaleCNS anatomy. Circuit experiments operate on explicitly documented
                extracts rather than the full 166,000-neuron nervous system. Full-system simulation,
                remote GPU job execution, training recurrent synapses, reinforcement learning in
                Doom or a physics simulator, and automated architecture search require additional
                compute integration. This version does not pretend to run those jobs.
              </p>
              <h2>Bring your own graph</h2>
              <p>
                Import the schema below. IDs must be consecutive integers starting at 0; groups
                range from 0 to 3. Coordinates are used only for visualization. Input and bias must
                be finite values between −10 and 10. Edge magnitudes may be up to 1,000,000 to
                preserve original synapse counts. Duplicate directed edges are rejected. Save a
                source citation in provenance for biological extracts.
              </p>
              <pre className="schema">
                {JSON.stringify(
                  {
                    name: 'My graph',
                    provenance: 'Source and extraction method',
                    nodes: [{ id: 0, group: 0, x: -1, y: 0, z: 0, input: 0.5, bias: 0 }],
                    edges: [{ source: 0, target: 1, weight: 0.3 }],
                  },
                  null,
                  2,
                )}
                {'\n// Shape illustration only. Download the valid template below.'}
              </pre>
              <button className="btn mt" onClick={() => download('graph-template.json', baseline)}>
                <Download size={14} />
                Download valid graph template
              </button>
              <h2>Reproducibility</h2>
              <p>
                Full reports include architecture snapshots, configuration, seeds, learning curves,
                selected readout checkpoints, device information and engine version. Loading a graph
                never changes an already completed experiment. Saved records persist across
                sessions; in-progress computation requires the browser tab to remain open.
              </p>
              <h2>Research references</h2>
              <p>
                <a href="https://male-cns.janelia.org/" target="_blank" rel="noreferrer">
                  MaleCNS dataset
                </a>{' '}
                ·{' '}
                <a href="https://arxiv.org/abs/2602.17997" target="_blank" rel="noreferrer">
                  FlyGM
                </a>{' '}
                ·{' '}
                <a href="https://arxiv.org/abs/2607.00025" target="_blank" rel="noreferrer">
                  FLYNN
                </a>
                . These projects motivate the research direction; their published results are not
                results from this platform.
              </p>
            </div>
          </TabsContent>
        </Tabs>
        <footer className="footer">
          <span>CONNECTOME LAB · Experimental workspace</span>
          <span>Engine {ENGINE_VERSION} · MaleCNS circuit extract · Measured results only</span>
        </footer>
      </main>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent style={{ maxWidth: 620 }}>
          <DialogHeader>
            <DialogTitle>Import a neural graph</DialogTitle>
            <DialogDescription>
              Load a small connectome extract or your own architecture. The imported graph becomes
              the baseline. Maximum 512 neurons and 20,000 edges.
            </DialogDescription>
          </DialogHeader>
          <input
            aria-label="Choose graph JSON file"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1500000) {
                setImportError('Choose a JSON file under 1.5 MB.');
                return;
              }
              setImportText(await f.text());
              setImportError('');
            }}
          />
          <textarea
            aria-label="Graph JSON"
            rows={10}
            value={importText}
            placeholder="Paste graph JSON…"
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError('');
            }}
          />
          <p className="micro">
            Required fields: name, nodes (id, group, x, y, z, input, bias), edges (source, target,
            weight). Add provenance to identify the source.
          </p>
          {importError && (
            <p className="error" role="alert">
              {importError}
            </p>
          )}
          <div className="actions">
            <button className="btn" onClick={() => download('graph-template.json', baseline)}>
              Get template
            </button>
            <button
              className="btn primary"
              disabled={!importText.trim() || running}
              onClick={importGraph}
            >
              Import as baseline
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A laboratory with measurable results</DialogTitle>
            <DialogDescription>
              This version runs real small-network experiments in your browser and saves their
              outputs.
            </DialogDescription>
          </DialogHeader>
          <p className="subtitle">
            Start with the selected MaleCNS circuit, modify a variant, then run a comparison. A
            logistic readout learns to solve a temporal task using the fixed recurrent network. Test
            accuracy and latency are measured, never generated for presentation.
          </p>
          <p className="subtitle">
            This is not a full fruit fly simulation. Full MaleCNS training and remote GPU execution
            are not connected in this version.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              setMethodOpen(false);
              setTab('protocol');
            }}
          >
            Read the full protocol
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
