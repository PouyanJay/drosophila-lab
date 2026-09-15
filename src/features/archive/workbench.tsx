'use client';
import BrandLogo from '@/components/brand-logo';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Eye,
  FileJson,
  FlaskConical,
  Focus,
  GitBranch,
  Layers3,
  Network,
  Orbit,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import AtlasView, { AtlasSettings } from '@/features/atlas/atlas-view';
import './workbench.css';
import { downloadFile as download } from '@/lib/client/download';
import Link from 'next/link';
import { Connectivity, LossChart } from './charts';
import { Choice, Field, NumericInput } from './controls';
import { nice, num } from './presentation';
const COLORS = ['#70b8cc', '#a4a4da', '#d9c291', '#89b99b'];
const GROUPS = ['Left optic lobe', 'Right optic lobe', 'Central brain', 'Ventral nerve cord'];
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const initialJob = {
  schema: 'malecns-job/1',
  name: 'Whole-CNS recurrent expansion',
  task: 'cue-recall',
  steps: 100,
  batch: 8,
  sequenceLength: 12,
  trainExamples: 1024,
  validationExamples: 256,
  testExamples: 512,
  learningRate: 0.01,
  seeds: [11, 22, 33, 44, 55],
  variants: [
    {
      name: 'Descending population expansion',
      duplicates: 64,
      population: 'descending_neuron',
      graft: 0,
      prune: 0,
    },
  ],
};

export default function Workbench() {
  const [mode, setMode] = useState('atlas'),
    [graph, setGraph] = useState<any>(null),
    [regions, setRegions] = useState<any[]>([]),
    [ready, setReady] = useState(0),
    [collapsed, setCollapsed] = useState(false),
    [compact, setCompact] = useState(false),
    [rendererMode, setRendererMode] = useState<'webgl' | '2d'>('webgl'),
    [explorerOpen, setExplorerOpen] = useState(false),
    [showReference, setShowReference] = useState(false),
    [layer, setLayer] = useState(2),
    [selection, setSelection] = useState<any>(null),
    [settings, setSettings] = useState<AtlasSettings>({
      surfaces: true,
      somas: false,
      fibers: true,
      opacity: 45,
      explode: 0,
      view: 'front',
      scope: 'brain',
      group: -1,
      selectedBody: null,
      selectedRegion: null,
      multi: false,
      slice: 0,
    }),
    [job, setJob] = useState<any>(initialJob),
    [variant, setVariant] = useState(0),
    [runs, setRuns] = useState<any[]>([]),
    [runIndex, setRunIndex] = useState(0),
    [modelIndex, setModelIndex] = useState(1),
    [dialog, setDialog] = useState(''),
    [catalog, setCatalog] = useState<any[]>([]),
    [query, setQuery] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [history, setHistory] = useState<any[]>([]),
    [saved, setSaved] = useState<any[]>([]),
    [selectedClass, setSelectedClass] = useState<number | null>(null),
    [ancestry, setAncestry] = useState<any>(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)');
    const update = () => {
      setCompact(mq.matches);
      setSettings((s) => ({ ...s, interactive: !mq.matches }));
      if (!mq.matches) setExplorerOpen(false);
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const file = useRef<HTMLInputElement>(null);
  const change = (p: Partial<AtlasSettings>) => setSettings((s) => ({ ...s, ...p }));
  useEffect(() => {
    Promise.all([
      fetch('/research/graph.json').then((r) => r.json()),
      fetch('/malecns/meshes.json').then((r) => r.json()),
      fetch('/research/results.json').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([g, r, runs]: any) => {
        setGraph(g);
        setRegions(r);
        setRuns((prev) => [
          ...runs.map((r: any) => ({ ...r, origin: 'Bundled CPU measurement' })),
          ...prev.filter((r: any) => r.origin === 'Imported result'),
        ]);
      })
      .catch(() => setError('Could not load the research dataset. Reload to retry.'));
    fetch('/api/records?kind=study')
      .then((r) => r.json())
      .then((r: any) => setSaved(r.records || []))
      .catch(() => {});
    fetch('/api/records?kind=study-run')
      .then((r) => r.json())
      .then((r: any) => {
        if (r.records?.length)
          setRuns((prev) => [
            ...prev,
            ...r.records.map((x: any) => ({ ...x.data, origin: 'Imported result' })),
          ]);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setDialog('search');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (dialog !== 'search' || catalog.length) return;
    fetch('/malecns/neurons.json')
      .then((r) => r.json())
      .then((d: any) => setCatalog(d))
      .catch(() => setError('Neuron catalogue could not be loaded.'));
  }, [dialog, catalog.length]);
  const matches = useMemo(() => {
    const q = query.toLowerCase();
    return catalog
      .filter((n) =>
        q
          ? (String(n[0]) + ' ' + n[1] + ' ' + n[2]).toLowerCase().includes(q)
          : ['MBON11', 'PPL101', 'DNa02', 'DNp01'].includes(n[1]),
      )
      .slice(0, 40);
  }, [catalog, query]);
  const updateVariant = (patch: any) => {
    setHistory((h) => [...h.slice(-19), structuredClone(job)]);
    setJob((j: any) => ({
      ...j,
      variants: j.variants.map((v: any, i: number) => (i === variant ? { ...v, ...patch } : v)),
    }));
  };
  const current = job.variants[variant] || job.variants[0];
  const sourceAncestors = (
    ancestry?.populations?.[current.population || 'descending_neuron']?.[
      String(Math.round(current.prune * 100))
    ] || []
  ).slice(0, current.duplicates || 0);
  useEffect(() => {
    if (mode === 'architecture' && !ancestry)
      fetch('/research/ancestry.json')
        .then((r) => r.json())
        .then(setAncestry)
        .catch(() => setError('Source ancestry preview could not be loaded.'));
  }, [mode, ancestry]);
  useEffect(() => {
    change({
      ancestors:
        mode === 'architecture'
          ? sourceAncestors.filter((n: any) => n.catalog).map((n: any) => n.catalog.slice(7, 10))
          : [],
    });
  }, [mode, ancestry, current.duplicates, current.population, current.prune]);
  const run = runs[runIndex],
    model = run?.models?.[modelIndex] || run?.models?.[0];
  const save = async () => {
    try {
      const id = crypto.randomUUID();
      const r = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          kind: 'study',
          name: job.name,
          data: { ...job, graphSha256: graph.graphSha256 },
        }),
      });
      if (!r.ok) throw Error();
      setSaved((s) => [{ id, name: job.name, data: job }, ...s]);
      setNotice('Experiment specification saved.');
    } catch {
      setError('Save failed. Export the job to keep your configuration.');
    }
  };
  const importRun = async (e: any) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.size > 1500000) throw Error('Result exceeds the 1.5 MB limit.');
      const d = JSON.parse(await f.text());
      if (
        d.schema !== 'malecns-result/1' ||
        d.status !== 'completed' ||
        d.graph?.graphSha256 !== graph?.graphSha256 ||
        !Array.isArray(d.models) ||
        !d.models.length ||
        d.models.length > 9 ||
        !d.config ||
        d.models.some(
          (m: any) =>
            !Array.isArray(m.seeds) ||
            !m.seeds.length ||
            !Number.isFinite(m.meanAccuracy) ||
            m.meanAccuracy < 0 ||
            m.meanAccuracy > 1 ||
            !Number.isFinite(m.meanLatencyMs) ||
            m.meanLatencyMs <= 0 ||
            m.seeds.some(
              (s: any) =>
                !Array.isArray(s.history) ||
                !Number.isFinite(s.testAccuracy) ||
                !Number.isFinite(s.validationLoss),
            ),
        )
      )
        throw Error('Expected a completed full-MaleCNS result matching this graph.');
      const r = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: d.id,
          kind: 'study-run',
          name: d.config.name || 'Imported experiment',
          data: d,
        }),
      });
      if (!r.ok) throw Error('Result could not be saved.');
      setRuns((a) => [...a, { ...d, origin: 'Imported result' }]);
      setRunIndex(runs.length);
      navigate('compare');
      setNotice('Result imported. Measurements are supplied by the runner.');
    } catch (e: any) {
      setError(e.message || 'Invalid result file.');
    } finally {
      e.target.value = '';
    }
  };
  function navigate(next: string) {
    setMode(next);
    setShowReference(false);
    setExplorerOpen(false);
    if (compact) window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function selectRegion(r: any) {
    setExplorerOpen(false);
    setSelection({ kind: 'region', ...r });
    change({ selectedRegion: r.id, selectedBody: null, selectedPoint: null });
  }
  function selectNeuron(n: any) {
    setExplorerOpen(false);
    setSelection({ kind: 'neuron', data: n });
    change({
      selectedRegion: null,
      selectedBody: String(n[0]),
      selectedPoint: n.slice(7, 10),
      group: -1,
      explode: 0,
      scope: n[6] === 3 ? 'cns' : 'brain',
    });
    setDialog('');
  }
  const explorer = (
    <>
      <div className="fs-panel-title">
        <span>EXPLORER</span>
        <button
          className="fs-icon"
          aria-label={compact ? 'Close explorer' : 'Collapse explorer'}
          onClick={() => (compact ? setExplorerOpen(false) : setCollapsed(true))}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="fs-specimen">
        <span>01 / REFERENCE CONNECTOME</span>
        <h1>
          Drosophila
          <br />
          <i>melanogaster</i>
        </h1>
        <p>Adult male · Central nervous system</p>
        <div>
          <Database size={13} />
          MaleCNS v1.0 <Check size={13} />
        </div>
      </div>
      <div className="fs-tree-root">
        <ChevronDown size={14} />
        <Layers3 size={15} />
        <b>Anatomy</b>
        <span>{regions.length}</span>
      </div>
      {GROUPS.map((g, i) => (
        <div key={g}>
          <div className={'fs-tree-group ' + (layer === i ? 'chosen' : '')}>
            <button
              className="fs-group-toggle"
              aria-expanded={layer === i}
              onClick={() => {
                setLayer(layer === i ? -1 : i);
                change({ group: -1, scope: i === 3 ? 'cns' : 'brain' });
              }}
            >
              {layer === i ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <i style={{ background: COLORS[i] }} />
              <span>{g}</span>
            </button>
            <button
              className="fs-eye"
              aria-label={'Isolate ' + g}
              title={'Isolate ' + g}
              onClick={(e) => {
                e.stopPropagation();
                change({ group: settings.group === i ? -1 : i, scope: i === 3 ? 'cns' : 'brain' });
              }}
            >
              <Eye size={13} />
            </button>
          </div>
          {layer === i && (
            <div className="fs-tree-items">
              {regions
                .filter((r) => r.group === i)
                .map((r) => (
                  <button
                    key={r.id}
                    className={settings.selectedRegion === r.id ? 'selected' : ''}
                    onClick={() => {
                      selectRegion(r);
                      navigate('atlas');
                    }}
                  >
                    <span className="fs-tree-line" />
                    {r.label}
                    <Box size={12} />
                  </button>
                ))}
            </div>
          )}
        </div>
      ))}
      <div className="fs-tree-root fs-architecture-root">
        <ChevronDown size={14} />
        <GitBranch size={15} />
        <b>Architectures</b>
        <button
          className="fs-icon"
          aria-label="Add architecture variant"
          onClick={() => {
            setJob((j: any) => ({
              ...j,
              variants: [
                ...j.variants,
                {
                  name: 'Variant ' + (j.variants.length + 1),
                  duplicates: 64,
                  population: 'descending_neuron',
                  graft: 0,
                  prune: 0,
                },
              ].slice(0, 8),
            }));
            setVariant(Math.min(job.variants.length, 7));
            navigate('architecture');
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <button
        className="fs-model-row"
        onClick={() => {
          navigate('architecture');
          setSelectedClass(null);
        }}
      >
        <span className="fs-branch-line" />
        <div>
          Original topology<small>{num(graph?.neurons)} biological neurons</small>
        </div>
        <span className="fs-locked">REF</span>
      </button>
      {job.variants.map((v: any, i: number) => (
        <button
          key={i}
          className={'fs-model-row ' + (mode === 'architecture' && variant === i ? 'selected' : '')}
          onClick={() => {
            setVariant(i);
            navigate('architecture');
          }}
        >
          <GitBranch size={14} />
          <div>
            {v.name}
            <small>
              +{v.graft + (v.duplicates || 0)} units · {Math.round(v.prune * 100)}% pruning
            </small>
          </div>
          <i className="fs-variant-dot" />
        </button>
      ))}
      {saved.length > 0 && (
        <details className="fs-saved">
          <summary>Saved specifications · {saved.length}</summary>
          {saved.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setJob(s.data);
                setVariant(0);
                navigate('experiments');
              }}
            >
              {s.name}
            </button>
          ))}
        </details>
      )}
      <div className="fs-source-foot">
        <span>
          HHMI Janelia · Cambridge · MRC LMB
          <br />
          Google Research
        </span>
        <a href="https://male-cns.janelia.org/download/" target="_blank" rel="noreferrer">
          Dataset & attribution <ArrowUpRight size={13} />
        </a>
      </div>
    </>
  );
  return (
    <div className={'fly-studio ' + (collapsed ? 'is-collapsed' : '')}>
      <header className="fs-header">
        <Link className="fs-logo" href="/" aria-label="Drosophila studio">
          <BrandLogo size={32} />
          <strong>DROSOPHILA</strong>
          <span>RESEARCH STUDIO</span>
        </Link>
        <div className="fs-project">
          <span>MaleCNS</span>
          <ChevronRight size={13} />
          <b>Architecture research</b>
          <span className="fs-version">v1.0</span>
        </div>
        <button
          className="fs-command"
          aria-label="Find a neuron"
          onClick={() => setDialog('search')}
        >
          <Search size={15} />
          <span>Find neuron</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className="fs-icon"
          title="Research protocol"
          aria-label="Research protocol"
          onClick={() => setDialog('protocol')}
        >
          <BookOpen size={19} />
        </button>
      </header>
      <nav className="fs-rail" aria-label="Workspace">
        <div>
          {[
            ['atlas', Orbit, 'Atlas'],
            ['architecture', GitBranch, 'Architect'],
            ['experiments', FlaskConical, 'Experiments'],
            ['compare', ChartNoAxesCombined, 'Compare'],
          ].map(([id, Icon, label]: any) => (
            <button
              key={id}
              className={mode === id ? 'active' : ''}
              aria-current={mode === id ? 'page' : undefined}
              aria-label={label}
              title={label}
              onClick={() => navigate(id)}
            >
              <Icon size={21} strokeWidth={1.5} />
              <span>{compact && id === 'experiments' ? 'Train / eval' : label}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setDialog('compute')} title="Execution environment">
          <Cpu size={21} strokeWidth={1.5} />
          <span>Compute</span>
        </button>
      </nav>
      <aside className="fs-browser">{explorer}</aside>
      <main className="fs-main">
        <div className="fs-workbar">
          {collapsed && (
            <button
              className="fs-icon"
              aria-label="Expand explorer"
              onClick={() => setCollapsed(false)}
            >
              <PanelLeftOpen size={17} />
            </button>
          )}
          <Tabs value={mode} onValueChange={navigate}>
            <TabsList className="fs-tabs">
              <TabsTrigger value="atlas">Anatomical atlas</TabsTrigger>
              <TabsTrigger value="architecture">Architecture editor</TabsTrigger>
              <TabsTrigger value="experiments">Experiment design</TabsTrigger>
              <TabsTrigger value="compare">Results</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="fs-workbar-right">
            <span>FULL GRAPH</span>
            <b>{num(graph?.neurons)} neurons</b>
            <span className="fs-separator" />
            <b>{graph ? (graph.edges / 1e6).toFixed(2) + 'M' : '—'} edges</b>
          </div>
        </div>
        <div className="fs-compact-tools">
          <button onClick={() => setExplorerOpen(true)} aria-expanded={explorerOpen}>
            <Layers3 size={18} />
            Explorer
          </button>
          <span>
            MaleCNS <b>v1.0</b>
          </span>
          <button aria-label="Execution environment" onClick={() => setDialog('compute')}>
            <Cpu size={19} />
          </button>
          <button aria-label="Research protocol" onClick={() => setDialog('protocol')}>
            <BookOpen size={19} />
          </button>
        </div>
        {(notice || error) && (
          <div className={'fs-notice ' + (error ? 'error' : '')} role="status">
            {error || notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => {
                setNotice('');
                setError('');
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {compact && mode !== 'atlas' && mode !== 'compare' && (
          <button
            className="fs-toggle-atlas"
            aria-expanded={showReference}
            onClick={() => setShowReference(!showReference)}
          >
            <Orbit size={18} />
            {showReference ? 'Hide source anatomy' : 'Show source anatomy'}
            <ChevronDown size={17} />
          </button>
        )}
        <div
          className={
            'fs-view-body ' +
            (mode === 'atlas' ? 'atlas' : '') +
            (compact && mode !== 'atlas' && !showReference ? ' no-reference' : '')
          }
          style={{ display: mode === 'compare' ? 'none' : undefined }}
        >
          <section className="fs-space">
            <AtlasView
              settings={settings}
              onPick={selectRegion}
              onReady={setReady}
              onRenderer={setRendererMode}
            />
            <div className="fs-view-heading">
              <div className="fs-small-label">
                {mode === 'atlas' ? 'REFERENCE ANATOMY' : 'BIOLOGICAL BACKBONE'}{' '}
                <span>/ {settings.scope === 'cns' ? 'FULL CNS' : 'BRAIN'}</span>
              </div>
              <h2>{mode === 'atlas' ? 'MaleCNS · anatomical space' : current.name}</h2>
              <p>
                {mode === 'atlas'
                  ? rendererMode === '2d'
                    ? 'Measured soma & root coordinates · 2D fallback'
                    : 'Original neuropil surfaces & neuron skeletons'
                  : `${num(graph?.neurons)} source neurons + ${current.graft + (current.duplicates || 0)} engineered units`}
              </p>
            </div>
            <div className="fs-view-controls">
              <button
                title="Reset camera"
                aria-label="Reset camera"
                onClick={() => change({ view: 'front', explode: 0, slice: 0, group: -1 })}
              >
                <Focus size={17} />
              </button>
              <button
                className={settings.multi ? 'selected' : ''}
                title="Linked anatomical views"
                aria-label="Toggle linked views"
                disabled={rendererMode === '2d'}
                onClick={() => change({ multi: !settings.multi })}
              >
                <Layers3 size={17} />
              </button>
              <button
                aria-label="Toggle full central nervous system"
                title="Show whole central nervous system"
                className={settings.scope === 'cns' ? 'selected' : ''}
                onClick={() =>
                  change({ scope: settings.scope === 'cns' ? 'brain' : 'cns', group: -1 })
                }
              >
                CNS
              </button>
              <span />
              {['front', 'side', 'top'].map((v) => (
                <button
                  key={v}
                  title={v + ' view'}
                  className={settings.view === v ? 'selected' : ''}
                  aria-label={v + ' view'}
                  aria-pressed={settings.view === v}
                  onClick={() => change({ view: v })}
                >
                  {v[0].toUpperCase()}
                </button>
              ))}
            </div>
            <div className="fs-orientation">
              <Orbit size={29} strokeWidth={1} />
              <span>Source space · µm</span>
            </div>
            {settings.multi && (
              <div className="fs-linked-label">Linked side / top views · source geometry</div>
            )}
            {selection && mode === 'atlas' && (
              <div className="fs-selection">
                <div className="fs-small-label">
                  {selection.kind === 'region' ? 'SELECTED NEUROPIL' : 'SELECTED NEURON'}
                  <button
                    className="fs-icon"
                    aria-label="Clear selection"
                    onClick={() => {
                      setSelection(null);
                      change({ selectedRegion: null, selectedBody: null, selectedPoint: null });
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <h3>
                  {selection.kind === 'region'
                    ? selection.label
                    : selection.data[1] || selection.data[0]}
                </h3>
                <p>
                  {selection.kind === 'region'
                    ? GROUPS[selection.group]
                    : `${selection.data[0]} · ${selection.data[5]} · ${nice(selection.data[3])}`}
                </p>
                <span>MaleCNS source geometry · µm</span>
              </div>
            )}

            {compact && rendererMode === 'webgl' && (
              <button
                className={'fs-touch-interaction ' + (settings.interactive ? 'is-active' : '')}
                aria-pressed={settings.interactive}
                onClick={() => change({ interactive: !settings.interactive })}
              >
                <Orbit size={17} />
                {settings.interactive ? 'Done · scroll page' : 'Interact with 3D'}
              </button>
            )}
            <div className="fs-canvas-bottom">
              <span>
                {rendererMode === '2d'
                  ? 'Front, side and top controls change the projection'
                  : compact
                    ? settings.interactive
                      ? 'Drag to rotate · Pinch to zoom'
                      : 'Scroll freely · Tap “Interact with 3D” to rotate'
                    : 'Drag to orbit · Scroll to zoom · Right-drag to pan'}
              </span>
              <span>
                {ready}/{regions.length || 83} regions · 137 sampled skeletons
              </span>
            </div>
          </section>
          {mode === 'atlas' ? (
            <aside className="fs-properties">
              <div className="fs-panel-title">
                <span>DISPLAY LAYERS</span>
                <SlidersHorizontal size={15} />
              </div>
              {(
                [
                  ['surfaces', 'Neuropil surfaces'],
                  ['fibers', 'Neuron skeletons'],
                  ['somas', 'Soma / root positions'],
                ] as const
              ).map(([id, label]) => (
                <div className="fs-switch-row" key={id}>
                  <label htmlFor={id}>{label}</label>
                  <Switch
                    id={id}
                    disabled={rendererMode === '2d'}
                    checked={rendererMode === '2d' ? id === 'somas' : settings[id]}
                    onCheckedChange={(v) => change({ [id]: v })}
                  />
                </div>
              ))}
              <Field label="Surface opacity" value={settings.opacity + '%'}>
                <Slider
                  disabled={rendererMode === '2d'}
                  aria-label="Surface opacity"
                  value={[settings.opacity]}
                  onValueChange={(v) => change({ opacity: v[0] })}
                  min={5}
                  max={85}
                />
              </Field>
              <Field label="Anatomical cutaway" value={(settings.slice || 0) + '%'}>
                <Slider
                  disabled={rendererMode === '2d'}
                  aria-label="Anatomical cutaway"
                  value={[settings.slice || 0]}
                  onValueChange={(v) => change({ slice: v[0] })}
                  max={100}
                />
              </Field>
              <Field label="Compartment separation" value={settings.explode + '%'}>
                <Slider
                  disabled={rendererMode === '2d'}
                  aria-label="Compartment separation"
                  value={[settings.explode]}
                  onValueChange={(v) => change({ explode: v[0] })}
                  max={100}
                />
              </Field>
              <div className="fs-panel-divider" />
              <div className="fs-small-label">CONNECTED RESEARCH GRAPH</div>
              <dl className="fs-facts">
                <dt>Retained neurons</dt>
                <dd>{num(graph?.neurons)}</dd>
                <dt>Directed connections</dt>
                <dd>{num(graph?.edges)}</dd>
                <dt>Observed synapses</dt>
                <dd>{num(graph?.synapses)}</dd>
                <dt>Edge threshold</dt>
                <dd>≥ 5 synapses</dd>
                <dt>Coordinate filter</dt>
                <dd>None</dd>
              </dl>
              <p className="fs-note">
                The anatomical overview samples neuron skeletons. Training uses the full retained
                graph, including neurons without coordinates.
              </p>
              <button className="fs-primary" onClick={() => navigate('architecture')}>
                <GitBranch size={16} />
                Design an architecture
                <ArrowRight size={16} />
              </button>
              <div className="fs-reference-links">
                <span>ATLAS REFERENCES</span>
                <a href="https://atlases.ebrains.eu/viewer/" target="_blank" rel="noreferrer">
                  siibra explorer <ArrowUpRight size={12} />
                </a>
                <a href="https://codex.flywire.ai/" target="_blank" rel="noreferrer">
                  FlyWire Codex <ArrowUpRight size={12} />
                </a>
                <a
                  href="https://connectivity.brain-map.org/3d-viewer"
                  target="_blank"
                  rel="noreferrer"
                >
                  Allen Brain Atlas <ArrowUpRight size={12} />
                </a>
              </div>
            </aside>
          ) : mode === 'architecture' ? (
            <aside className="fs-properties">
              <div className="fs-panel-title">
                <span>VARIANT {String(variant + 1).padStart(2, '0')}</span>
                <div>
                  <button
                    className="fs-icon"
                    disabled={!history.length}
                    aria-label="Undo architecture change"
                    onClick={() => {
                      setJob(history[history.length - 1]);
                      setHistory((h) => h.slice(0, -1));
                    }}
                  >
                    <Undo2 size={15} />
                  </button>
                  <button
                    className="fs-icon"
                    aria-label="Delete variant"
                    disabled={job.variants.length === 1}
                    onClick={() => {
                      setJob((j: any) => ({
                        ...j,
                        variants: j.variants.filter((_: any, i: number) => i !== variant),
                      }));
                      setVariant(0);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <Field label="Architecture name">
                <input
                  value={current.name}
                  maxLength={80}
                  onChange={(e) => updateVariant({ name: e.target.value })}
                />
              </Field>
              <div className="fs-operation">
                <div>
                  <Network size={18} />
                  <b>Duplicate source neurons</b>
                  <span>INHERITED</span>
                </div>
                <p>
                  Expand a real neuron population. Copies inherit measured incoming and outgoing
                  connectivity, transmitter sign and class membership.
                </p>
                <Field label="Source population">
                  <Choice
                    value={current.population || 'descending_neuron'}
                    onChange={(e) => updateVariant({ population: e.target.value })}
                  >
                    {[
                      'descending_neuron',
                      'ascending_neuron',
                      'cb_intrinsic',
                      'vnc_intrinsic',
                      'visual_projection',
                    ].map((p) => (
                      <option key={p} value={p}>
                        {nice(p)}
                      </option>
                    ))}
                  </Choice>
                </Field>
                <Field label="Additional source-derived neurons" value={current.duplicates || 0}>
                  <Slider
                    aria-label="Additional source-derived neurons"
                    value={[current.duplicates || 0]}
                    onValueChange={(v) => updateVariant({ duplicates: v[0] })}
                    min={0}
                    max={128}
                    step={16}
                  />
                </Field>
              </div>
              {sourceAncestors.length > 0 && (
                <div className="fs-ancestry-preview">
                  <div className="fs-small-label">SOURCE ANCESTRY</div>
                  <p>
                    {sourceAncestors.filter((n: any) => n.catalog).length} positioned source neurons
                    highlighted. New copies have no anatomical position.
                  </p>
                  <div>
                    {sourceAncestors.slice(0, 6).map((n: any) => (
                      <button
                        key={n.bodyId}
                        disabled={!n.catalog}
                        title={'Inspect source ' + n.bodyId}
                        onClick={() => {
                          selectNeuron(n.catalog);
                          navigate('atlas');
                        }}
                      >
                        {n.bodyId}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="fs-operation">
                <div>
                  <GitBranch size={18} />
                  <b>Gated memory module</b>
                  <span>LEARNED</span>
                </div>
                <p>
                  Add a gated recurrent module. It receives pooled biological activity and sends
                  learned feedback into the connectome.
                </p>
                <Field label="Additional recurrent units" value={current.graft}>
                  <Slider
                    aria-label="Additional recurrent units"
                    value={[current.graft]}
                    onValueChange={(v) => updateVariant({ graft: v[0] })}
                    min={0}
                    max={128}
                    step={8}
                  />
                </Field>
              </div>
              <div className="fs-operation">
                <div>
                  <Settings2 size={18} />
                  <b>Connectivity pruning</b>
                </div>
                <p>
                  Remove the weakest measured edges. Every biological neuron keeps its source
                  identity.
                </p>
                <Field label="Edges removed" value={Math.round(current.prune * 100) + '%'}>
                  <Slider
                    aria-label="Edges removed"
                    value={[Math.round(current.prune * 100)]}
                    onValueChange={(v) => updateVariant({ prune: v[0] / 100 })}
                    max={80}
                    step={5}
                  />
                </Field>
              </div>
              <dl className="fs-facts">
                <dt>Biological neurons</dt>
                <dd>{num(graph?.neurons)}</dd>
                <dt>Engineered units</dt>
                <dd className="acid">+{current.graft + (current.duplicates || 0)}</dd>
                <dt>Retained source edges</dt>
                <dd>{graph ? num(graph.edges - Math.floor(graph.edges * current.prune)) : '—'}</dd>
                <dt>Training</dt>
                <dd>Through recurrent state</dd>
              </dl>
              <button className="fs-primary" onClick={() => navigate('experiments')}>
                Configure benchmark
                <ArrowRight size={16} />
              </button>
              <button className="fs-secondary" onClick={save}>
                Save specification
              </button>
            </aside>
          ) : (
            <aside className="fs-properties fs-experiment-properties">
              <div className="fs-panel-title">
                <span>BENCHMARK PROTOCOL</span>
                <FlaskConical size={16} />
              </div>
              <Field label="Experiment name">
                <input
                  value={job.name}
                  maxLength={100}
                  onChange={(e) => setJob({ ...job, name: e.target.value })}
                />
              </Field>
              <Field label="Task">
                <Choice value={job.task} onChange={(e) => setJob({ ...job, task: e.target.value })}>
                  <option value="cue-recall">Cue → delayed recall</option>
                  <option value="temporal-xor">Temporal XOR</option>
                  <option value="evidence-integration">Evidence integration</option>
                </Choice>
              </Field>
              <div className="fs-form-grid">
                {[
                  ['Training steps', 'steps', 1, 10000],
                  ['Sequence length', 'sequenceLength', 3, 128],
                  ['Batch size', 'batch', 1, 128],
                  ['Learning rate', 'learningRate', 0.0001, 0.1],
                ].map(([label, key, min, max]: any) => (
                  <Field key={key} label={label}>
                    <NumericInput
                      min={min}
                      max={max}
                      step={key === 'learningRate' ? 0.001 : 1}
                      value={job[key]}
                      onCommit={(v) => setJob({ ...job, [key]: v })}
                    />
                  </Field>
                ))}
              </div>
              <div className="fs-panel-divider" />
              <div className="fs-small-label">INDEPENDENT DATA SPLITS</div>
              <div className="fs-splits">
                {[
                  ['Train', 'trainExamples'],
                  ['Validation', 'validationExamples'],
                  ['Test', 'testExamples'],
                ].map(([label, key]) => (
                  <Field key={key} label={label}>
                    <NumericInput
                      aria-label={label + ' examples'}
                      min={8}
                      max={10000}
                      step={1}
                      value={job[key]}
                      onCommit={(v) => setJob({ ...job, [key]: v })}
                    />
                  </Field>
                ))}
              </div>
              <Field label="Paired random seeds">
                <Choice
                  value={job.seeds.length}
                  onChange={(e) =>
                    setJob({
                      ...job,
                      seeds: Array.from({ length: +e.target.value }, (_, i) => (i + 1) * 11),
                    })
                  }
                >
                  <option value={3}>3 seeds · exploratory</option>
                  <option value={5}>5 seeds</option>
                  <option value={10}>10 seeds</option>
                </Choice>
              </Field>
              <p className="fs-note">
                Same data, updates and optimizer for every architecture. Validation selects
                checkpoints and the architecture. Test results are evaluated afterwards.
              </p>
              <button className="fs-primary" onClick={() => setDialog('compute')}>
                <Play size={15} />
                Execute {job.variants.length + 1} architectures
                <ArrowRight size={16} />
              </button>
              <button className="fs-secondary" onClick={save}>
                Save experiment
              </button>
            </aside>
          )}
        </div>
        {mode === 'architecture' && (
          <section className="fs-bottom-dock">
            <div className="fs-architecture-strip">
              <div className="fs-flow">
                <div className="fs-flow-node">
                  <span>01 / SOURCE</span>
                  <b>MaleCNS recurrent graph</b>
                  <small>{num(graph?.edges)} measured edges</small>
                </div>
                <ArrowRight size={20} />
                <div className="fs-flow-node engineered">
                  <span>02 / MODIFICATION</span>
                  <b>
                    {current.prune
                      ? `${Math.round(current.prune * 100)}% edge pruning`
                      : 'Original connectivity'}
                  </b>
                  <small>All {num(graph?.neurons)} neurons retained</small>
                </div>
                <ArrowRight size={20} />
                <div className="fs-flow-node engineered">
                  <span>03 / EXPANSION</span>
                  <b>+{(current.duplicates || 0) + current.graft} engineered units</b>
                  <small>
                    {current.duplicates
                      ? 'Source-neuron topology inherited'
                      : 'Class pooling ↔ learned feedback'}
                  </small>
                </div>
              </div>
              <div className="fs-flow-caption">
                <i />
                Engineered modules are computational additions, without anatomical coordinates.
              </div>
            </div>
            <div className="fs-dock-heading">
              <div>
                <span className="fs-small-label">CONNECTIVITY MAP</span>
                <h3>Observed class-to-class synapses</h3>
              </div>
              <p>Click a cell to inspect the source connection totals.</p>
            </div>
            {graph && (
              <Connectivity graph={graph} selected={selectedClass} onSelect={setSelectedClass} />
            )}
          </section>
        )}
        {mode === 'experiments' && (
          <section className="fs-experiment-ledger">
            <div className="fs-dock-heading">
              <h3>Comparison plan</h3>
              <span>
                {job.variants.length + 1} architectures × {job.seeds.length} seeds
              </span>
            </div>
            <div className="fs-ledger-row fs-ledger-head">
              <span>Architecture</span>
              <span>Recurrent units</span>
              <span>Edges</span>
              <span>Learning</span>
            </div>
            {[{ name: 'MaleCNS · original topology', graft: 0, prune: 0 }, ...job.variants].map(
              (v: any, i: number) => (
                <div className="fs-ledger-row" key={i}>
                  <span>
                    <i style={{ background: i ? '#d3ec93' : '#94adc2' }} />
                    {v.name}
                  </span>
                  <span data-label="Recurrent units">
                    {num((graph?.neurons || 0) + v.graft + (v.duplicates || 0))}
                  </span>
                  <span data-label="Edges">
                    {num(Math.round((graph?.edges || 0) * (1 - v.prune)))}
                    {v.duplicates ? ' + inherited' : ''}
                  </span>
                  <span data-label="Learning">Recurrent dynamics + readout</span>
                </div>
              ),
            )}
          </section>
        )}
        {mode === 'compare' && (
          <section className="fs-results">
            <div className="fs-results-heading">
              <div>
                <span className="fs-small-label">EXPERIMENT REGISTRY</span>
                <h1>Evidence, architecture by architecture.</h1>
              </div>
              <button className="fs-secondary" onClick={() => file.current?.click()}>
                <Upload size={15} />
                Import result
              </button>
            </div>
            {!run ? (
              <div className="fs-empty">
                <FlaskConical size={32} />
                <h2>No completed experiments yet</h2>
                <p>
                  Execute an exported specification with the research runner, then import its
                  result.
                </p>
                <button className="fs-primary" onClick={() => navigate('experiments')}>
                  Design experiment
                </button>
              </div>
            ) : (
              <>
                <div className="fs-run-toolbar">
                  <Choice
                    aria-label="Select completed experiment"
                    value={runIndex}
                    onChange={(e) => {
                      setRunIndex(+e.target.value);
                      setModelIndex(1);
                    }}
                  >
                    {runs.map((r: any, i: number) => (
                      <option key={i} value={i}>
                        {r.config.name} · {r.config.task}
                      </option>
                    ))}
                  </Choice>
                  <span>{run.origin}</span>
                  <a
                    className="fs-secondary"
                    href={
                      run.engine === 'malecns-recurrent/3.0'
                        ? '/research/memory-checkpoints.zip'
                        : '/research/topology-checkpoints.zip'
                    }
                    download
                    style={{
                      display: run.origin === 'Bundled CPU measurement' ? undefined : 'none',
                    }}
                  >
                    Checkpoints
                    <ArrowDownToLine size={14} />
                  </a>
                  <button
                    className="fs-icon"
                    aria-label="Export experiment result"
                    onClick={() => download('malecns-result.json', run)}
                  >
                    <ArrowDownToLine size={17} />
                  </button>
                </div>
                <div className="fs-evidence-banner">
                  <FlaskConical size={17} />
                  <p>
                    <b>Exploratory experiment.</b> {run.config.seeds.length} seeds ·{' '}
                    {run.config.steps} updates · {run.config.testExamples} test sequences per seed.{' '}
                    {run.config.task === 'cue-recall'
                      ? 'This recall task has only two distinct noiseless inputs. '
                      : ''}
                    Results do not establish broad generalization or better biological behavior.
                  </p>
                </div>
                <div className="fs-results-grid">
                  <div className="fs-chart-panel">
                    <div className="fs-chart-heading">
                      <h3>Validation loss</h3>
                      <span>Checkpoint selection · lower is better</span>
                    </div>
                    <LossChart run={run} />
                  </div>
                  <div className="fs-selection-panel">
                    <span className="fs-small-label">SELECTED BY VALIDATION LOSS</span>
                    <h2>{run.models[run.selectedModelIndex]?.name}</h2>
                    <dl className="fs-facts">
                      <dt>Whole graph</dt>
                      <dd>{num(run.graph.neurons)} neurons</dd>
                      <dt>Execution</dt>
                      <dd>
                        {run.hardware.device.toUpperCase()} · {run.hardware.threads} threads
                      </dd>
                      <dt>Total experiment</dt>
                      <dd>{(run.totalSeconds / 60).toFixed(1)} min</dd>
                      <dt>Graph fingerprint</dt>
                      <dd>
                        <code>{run.graph.graphSha256.slice(0, 12)}</code>
                      </dd>
                    </dl>
                    <button
                      className="fs-secondary"
                      onClick={() => {
                        const config = { ...run.config };
                        delete config.graphSha256;
                        setJob(config);
                        setVariant(0);
                        navigate('experiments');
                      }}
                    >
                      Use protocol for a new run
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="fs-result-table-wrap">
                  <table className="fs-result-table">
                    <thead>
                      <tr>
                        <th>Architecture</th>
                        <th>Test accuracy</th>
                        <th>Δ baseline</th>
                        <th>Latency / sequence</th>
                        <th>Speedup</th>
                        <th>Edges</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.models.map((m: any, i: number) => (
                        <tr
                          key={i}
                          className={modelIndex === i ? 'active' : ''}
                          onClick={() => setModelIndex(i)}
                        >
                          <td>
                            <button
                              aria-pressed={modelIndex === i}
                              onClick={() => setModelIndex(i)}
                            >
                              <i
                                style={{
                                  background: ['#8ea6bd', '#d3ec93', '#bdacf0', '#82cabb'][i % 4],
                                }}
                              />
                              {m.name}
                              {run.selectedModelIndex === i && <span>SELECTED</span>}
                            </button>
                          </td>
                          <td data-label="Test accuracy">{pct(m.meanAccuracy)}</td>
                          <td data-label="Change vs baseline">
                            {i
                              ? `${m.accuracyDelta >= 0 ? '+' : ''}${(m.accuracyDelta * 100).toFixed(1)} pp`
                              : 'Reference'}
                          </td>
                          <td data-label="Latency / sequence">{m.meanLatencyMs.toFixed(1)} ms</td>
                          <td data-label="Speedup">{i ? m.speedup.toFixed(2) + '×' : '1.00×'}</td>
                          <td data-label="Edges">{num(m.seeds[0].edges)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {model && (
                  <div className="fs-model-evidence">
                    <div>
                      <span className="fs-small-label">{model.name}</span>
                      <h3>Paired seeds & backbone ablation</h3>
                      <p>
                        Disabling connectome-derived recurrent connections, including inherited
                        copies, tests dependence on that wiring. If accuracy survives, the result
                        does not demonstrate an advantage from its wiring.
                      </p>
                      {model.pairedSeedBootstrap95 && (
                        <p>
                          95% paired-seed bootstrap interval for accuracy change:{' '}
                          <b>
                            {model.pairedSeedBootstrap95
                              .map((v: number) => (v * 100).toFixed(1))
                              .join(' to ')}{' '}
                            percentage points.
                          </b>{' '}
                          Few seeds give weak uncertainty estimates.
                        </p>
                      )}
                    </div>
                    <div className="fs-seed-table">
                      <div>
                        <b>Seed</b>
                        <b>Test</b>
                        <b>Backbone off</b>
                        <b>Best step</b>
                      </div>
                      {model.seeds.map((s: any) => (
                        <div key={s.seed}>
                          <span>{s.seed}</span>
                          <span>{pct(s.testAccuracy)}</span>
                          <span>{pct(s.backboneAblationAccuracy)}</span>
                          <span>{s.bestStep}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>
      <footer className="fs-status">
        <span>
          <Database size={12} />
          MaleCNS v1.0 <i /> CC BY 4.0 <i /> ≥ 5 observed synapses per edge
        </span>
        <span>
          {mode === 'compare' ? 'Recorded measurements' : 'Anatomy display ≠ simulation state'}
          <i />
          <button onClick={() => setDialog('compute')}>
            CPU runner available · cloud compute unconnected
          </button>
        </span>
      </footer>
      <Sheet open={explorerOpen} onOpenChange={setExplorerOpen}>
        <SheetContent side="left" className="fs-explorer-drawer" showCloseButton={false}>
          <SheetTitle className="sr-only">Connectome explorer</SheetTitle>
          <SheetDescription className="sr-only">
            Browse anatomy, choose architectures and open saved experiments.
          </SheetDescription>
          <div className="fly-studio fs-drawer-theme">
            <aside className="fs-browser">{explorer}</aside>
          </div>
        </SheetContent>
      </Sheet>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={importRun} />
      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog('')}>
        <DialogContent className={'fs-dialog ' + (dialog === 'search' ? 'fs-search-dialog' : '')}>
          <DialogTitle>
            {dialog === 'search'
              ? 'Find a MaleCNS neuron'
              : dialog === 'compute'
                ? 'Execute a full-connectome experiment'
                : 'Research protocol & provenance'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'search'
              ? 'Search source body IDs, cell types and instances.'
              : dialog === 'compute'
                ? 'Export this specification and run it on a CPU or CUDA machine. Import the measured result into the studio.'
                : 'What the model preserves, what it learns, and what an improvement means.'}
          </DialogDescription>
          {dialog === 'search' ? (
            <>
              <div className="fs-search-input">
                <Search size={18} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="MBON11, DNa02, body ID…"
                />
              </div>
              <div className="fs-search-results">
                {matches.map((n) => (
                  <button key={n[0]} onClick={() => selectNeuron(n)}>
                    <i style={{ background: COLORS[n[6]] }} />
                    <div>
                      <b>{n[1] || 'Untyped neuron'}</b>
                      <span>
                        {n[2]} · {nice(n[3])}
                      </span>
                    </div>
                    <code>{n[0]}</code>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
                {!catalog.length && <p>Loading the positioned neuron index…</p>}
                {catalog.length > 0 && !matches.length && <p>No matching positioned neuron.</p>}
              </div>
            </>
          ) : dialog === 'compute' ? (
            <>
              <div className="fs-compute-state">
                <Cpu size={27} />
                <div>
                  <b>CPU research runner included</b>
                  <p>
                    The website stores experiments and visualizes results. A persistent training
                    server is not attached.
                  </p>
                </div>
              </div>
              <ol className="fs-execute-steps">
                <li>
                  <b>Download the runner and job</b>
                  <p>
                    The runner downloads the official source data and builds the full graph. Allow
                    several GB of disk space and at least 8 GB RAM for the default CPU
                    configuration.
                  </p>
                  <div>
                    <a className="fs-secondary" href="/research/malecns-runner.zip" download>
                      <ArrowDownToLine size={15} />
                      Research runner
                    </a>
                    <button
                      className="fs-primary"
                      onClick={() =>
                        download('job.json', { ...job, graphSha256: graph?.graphSha256 })
                      }
                    >
                      <FileJson size={15} />
                      Export job.json
                    </button>
                  </div>
                </li>
                <li>
                  <b>Run on your machine</b>
                  <pre>
                    python -m pip install -r requirements.txt{'\n'}python runner.py job.json --out
                    runs/my-experiment
                  </pre>
                  <p>
                    CUDA path is implemented but untested here. CPU execution has been measured.
                    Checkpoints remain on the machine running the experiment.
                  </p>
                </li>
                <li>
                  <b>Bring the evidence back</b>
                  <p>
                    Import runs/my-experiment/result.json to compare accuracy, latency, seed
                    variability and biological-backbone ablations.
                  </p>
                  <button
                    className="fs-secondary"
                    onClick={() => {
                      setDialog('');
                      file.current?.click();
                    }}
                  >
                    <Upload size={15} />
                    Import measured result
                  </button>
                </li>
              </ol>
            </>
          ) : (
            <div className="fs-protocol">
              <h3>Biological starting point</h3>
              <p>
                All 165,122 neurons marked Traced in the MaleCNS v1.0 annotation table are retained.
                The model includes 6,235,682 directed edges with at least five observed synapses.
                This is a documented filter of the published 166,700-neuron reconstruction. Nodes
                are never removed for missing anatomical coordinates.
              </p>
              <h3>Trainable recurrence</h3>
              <p>
                Backpropagation through time trains class-specific recurrent gains, time constants,
                biases, sensory encoding and the readout. Added GRU units receive pooled class
                activity and feed learned signals back into the biological states. Individual
                observed synapse counts are fixed priors, normalized by incoming strength. These are
                modeled dynamics, not recovered physiology.
              </p>
              <h3>Expansion from source neurons</h3>
              <p>
                Population duplication selects the strongest connected source neurons in the chosen
                class. New computational neurons inherit their incoming and outgoing adjacency and
                transmitter signs. Their source body IDs are retained as ancestry; added edges are
                explicitly engineered. Duplication creates no invented anatomical positions. The
                source biological block stays intact before any requested pruning.
              </p>
              <h3>Architecture search & evaluation</h3>
              <p>
                The original topology and every candidate receive the same data, optimizer, learning
                rate and update count. Candidate architectures can differ in size and compute.
                Validation loss selects each checkpoint and the architecture. Test data is separate
                and evaluated afterwards. Reported latency is the median of seven warmed batch-one
                full-sequence measurements; speed is hardware-dependent.
              </p>
              <h3>Interpreting improvement</h3>
              <p>
                These are synthetic memory and sequence tasks. A larger module can improve one task
                and become slower. Backbone ablation exposes gains that survive removal of
                biological recurrent edges. Such gains do not prove that fruit-fly wiring is useful.
                There is no guarantee of significant improvement or transfer to navigation, games or
                robotics.
              </p>
              <h3>Anatomical atlas</h3>
              <p>
                83 source surface regions, 140,628 measured soma/root positions and a 137-neuron
                skeleton overview. Search retrieves original individual morphology. Linked views and
                cutaways render the same measured surface geometry; they are not electron-microscope
                image slices.
              </p>
              <a href="/research/graph.json" download>
                Download graph provenance and class connectivity <ArrowDownToLine size={14} />
              </a>
              <a href="/circuits">
                Open the earlier bounded-circuit workspace <ArrowUpRight size={14} />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
