'use client';
import { takeBrowserWorker } from '@/lib/client/browser-compute';
import DiscoveryPanel from '@/features/discovery/discovery-panel';
import {
  DiscoveryConfig,
  defaultDiscovery,
  discoverySchema,
} from '@/lib/contracts/discovery-contract';
import SessionHistory from '@/features/studio/session-history';
import { flushRecords, pendingRecords, queueRecord } from '@/lib/client/local-outbox';
import BrandLogo from '@/components/brand-logo';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Focus,
  GitCompareArrows,
  History,
  Info,
  Layers3,
  MessageCircle,
  PanelLeftClose,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Wallet,
  Square,
  Undo2,
  Waves,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AtlasView, { AtlasSettings } from '@/features/atlas/atlas-view';
import DecisionArena from '@/features/lab/decision-arena';
import { Message, Plan, defaultPlan, options, tasks } from '@/lib/planning/experiment-planner';
import ModelPicker, { ModelSelection, ProviderIcon } from '@/features/connections/model-picker';
import CostDashboard from '@/features/costs/cost-dashboard';
import { useSpendAlerts } from '@/features/costs/use-spend-alerts';
import { formatUsd } from '@/lib/contracts/costs';
import './studio.css';
import LabPanel, { LabHandle } from '@/features/lab/lab-panel';
import ComputePicker from '@/features/connections/compute-picker';
import {
  experimentSuggestions,
  suggestionForPrompt,
  suggestionPrompt,
} from '@/lib/planning/experiment-suggestions';
import './experiment.css';
import './workspace.css';
import { useAtlasVariant } from '@/features/atlas/use-atlas-variant';
import { labOptions } from '@/lib/planning/lab-planner';
import { LabConfig, defaultLabConfig, labConfigSchema } from '@/lib/contracts/lab-contract';
import { useMediaQuery } from '@/hooks/use-media-query';
import { downloadJSON as exportJSON } from '@/lib/client/download';
import type { ProviderStatus } from '@/lib/contracts/providers';
import Link from 'next/link';
import { useScrollActivity } from './use-scroll-activity';
const greeting =
  'What would you like the fruit-fly network to become better at? We can start with remembering a cue or making decisions under noise. I’ll help you define a change and a fair comparison. Settings, controls and measured results stay in this conversation.';
const colors = ['#83b5d9', '#b3a0db', '#d9b486', '#91c5b3'],
  groups = ['Left optic lobe', 'Right optic lobe', 'Central brain', 'Ventral nerve cord'];
const n = (v: number) => v.toLocaleString(),
  pc = (v: number) => `${(v * 100).toFixed(1)}%`;

const initialSettings: AtlasSettings = {
  surfaces: true,
  somas: false,
  fibers: true,
  opacity: 0,
  explode: 0,
  view: 'front',
  scope: 'brain',
  group: -1,
  selectedBody: null,
  selectedRegion: null,
  multi: false,
  slice: 0,
  interactive: true,
  inventory: false,
  labels: true,
  hidden: [],
};
export default function AtlasStudio() {
  const [mode, setMode] = useState('atlas'),
    [settings, setSettings] = useState(initialSettings),
    [renderer, setRenderer] = useState('webgl'),
    [regions, setRegions] = useState<any[]>([]),
    [graph, setGraph] = useState<any>(null),
    [catalog, setCatalog] = useState<any[]>([]),
    [query, setQuery] = useState(''),
    [drawer, setDrawer] = useState(''),
    [dialog, setDialog] = useState(''),
    [selected, setSelected] = useState<any>(null),
    [ready, setReady] = useState(0),
    [plan, setPlan] = useState<Plan>(defaultPlan),
    [stage, setStage] = useState(0),
    [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: greeting }]),
    [draft, setDraft] = useState(''),
    [, setGuideMode] = useState('ai'),
    [modelSelection, setModelSelection] = useState<ModelSelection>({
      provider: 'openai',
      model: '',
      name: 'OpenAI',
    }),
    [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]),
    [thinking, setThinking] = useState(false),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState<any>(null),
    [result, setResult] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]),
    [error, setError] = useState(''),
    [saveState, setSaveState] = useState(''),
    [restored, setRestored] = useState(false),
    [sessionLoaded, setSessionLoaded] = useState(false),
    [metric, setMetric] = useState('validationLoss'),
    [trialIndex, setTrialIndex] = useState(0),
    [seedIndex, setSeedIndex] = useState(0),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState('Ready to configure');
  const [discoveryReady, setDiscoveryReady] = useState(true);
  const [discoveryMode, setDiscoveryMode] = useState(false),
    [discoveryConfig, setDiscoveryConfig] = useState<DiscoveryConfig>(defaultDiscovery),
    [discoveryId, setDiscoveryId] = useState<string | null>(null),
    [discoveryVariant, setDiscoveryVariant] = useState<any>(null);
  const [sessionId, setSessionId] = useState(''),
    [historyOpen, setHistoryOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false),
    [spendVersion, setSpendVersion] = useState(0),
    [sessionSpend, setSessionSpend] = useState<number | null>(null);
  const spendAlerts = useSpendAlerts();
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    fetch('/api/costs?experiment=' + encodeURIComponent(sessionId))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { totals?: { usd: number; calls: number } } | null) => {
        if (active) setSessionSpend(d?.totals?.calls ? d.totals.usd : null);
      })
      .catch(() => {
        if (active) setSessionSpend(null);
      });
    return () => {
      active = false;
    };
  }, [sessionId, spendVersion]);
  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);
  function restoreConversation(row: any) {
    if (row.kind === 'browser-run') {
      setExecution('browser');
      setResult(row.data);
      setVariantSource('run');
      showEvidence();
      return;
    }
    const s = row.data;
    setDiscoveryReady(s.discoveryReady !== false);
    setDiscoveryMode(!!s.discoveryMode);
    setDiscoveryConfig(
      discoverySchema.safeParse(s.discoveryConfig).success ? s.discoveryConfig : defaultDiscovery,
    );
    setDiscoveryId(s.discoveryId || null);
    setDiscoveryVariant(null);
    setSessionId(row.id);
    setPlan(s.plan);
    setStage(s.stage);
    setMessages(s.messages);
    setExecution(s.execution || 'lab');
    setComputeId(s.computeId || null);
    setLabProposal(labConfigSchema.safeParse(s.labConfig).success ? s.labConfig : defaultLabConfig);
    setSelectedJob(s.selectedJob || null);
    setResult(null);
    setDraft('');
    setReviewRuns(false);
    setVisualMode('original');
    setVariantSource('draft');
    setError('');
    if (s.resultId)
      fetch('/api/records?kind=browser-run&id=' + encodeURIComponent(s.resultId))
        .then((r) => r.json())
        .then((d: any) => {
          if (d.record) setResult(d.record.data);
        })
        .catch(() => setError('Saved result could not load. Open Past runs to retry.'));
  }
  const [execution, setExecution] = useState<'browser' | 'lab'>('lab'),
    [labProposal, setLabProposal] = useState<LabConfig>(defaultLabConfig),
    [labEvidence, setLabEvidence] = useState<any>(null);
  const labRef = useRef<LabHandle>(null),
    pendingSuggestion = useRef<string | null>(null);
  const [reviewRuns, setReviewRuns] = useState(false),
    [modelMenuRequest, setModelMenuRequest] = useState(0),
    [computeHealth, setComputeHealth] = useState<any>(null);
  const hasConversation = messages.some((m) => m.role === 'user') || stage > 0;
  const [computeId, setComputeId] = useState<string | null>(null),
    [computeOpen, setComputeOpen] = useState(false),
    [computeBusy, setComputeBusy] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string | null>(null),
    [labJob, setLabJob] = useState<any>(null);
  const welcome = !hasConversation && !reviewRuns && !selectedJob;
  const sidebarRef = useRef<PanelImperativeHandle | null>(null),
    sidebarWidth = useRef(430);
  const narrow = useMediaQuery('(max-width:800px)');
  useScrollActivity();
  useEffect(() => {
    if (!narrow) sidebarRef.current?.resize(sidebarWidth.current);
  }, [narrow]);
  function collapseChat() {
    sidebarRef.current?.collapse();
    setChatOpen(false);
    setMode('atlas');
  }
  const [chatOpen, setChatOpen] = useState(true),
    [evidenceOpen, setEvidenceOpen] = useState(false),
    [evidenceHost, setEvidenceHost] = useState<HTMLDivElement | null>(null),
    [browserHost, setBrowserHost] = useState<HTMLDivElement | null>(null),
    [visualMode, setVisualMode] = useState<'original' | 'candidate' | 'compare'>('original'),
    [variantSource, setVariantSource] = useState<'draft' | 'run'>('draft'),
    [labVisual, setLabVisual] = useState<any>(null);
  const measuredResult = execution === 'lab' ? labVisual?.result : result;
  const runConfig = execution === 'lab' ? labVisual?.config : result?.config;
  const visualConfig = discoveryMode
    ? {
        duplicates: discoveryVariant?.ancestors?.length || 0,
        population: discoveryConfig.population,
      }
    : variantSource === 'run' && runConfig
      ? runConfig
      : execution === 'lab'
        ? labProposal
        : plan;
  const runAncestors = discoveryMode
    ? discoveryVariant?.ancestors
    : execution === 'lab'
      ? labVisual?.ancestors
      : result?.models?.[1]?.ancestors;
  const variant = useAtlasVariant(
    execution,
    visualConfig,
    discoveryMode ? runAncestors : variantSource === 'run' ? runAncestors : undefined,
    discoveryMode ? !!discoveryVariant : stage === 4 || !!runConfig,
  );
  const atlasSettings = {
    ...settings,
    comparison: visualMode === 'compare',
    ancestors: visualMode === 'original' ? [] : variant.positions,
  };
  function showEvidence() {
    setEvidenceOpen(true);
    setMode('evidence');
  }
  function showChat() {
    if (!narrow) sidebarRef.current?.expand();
    setChatOpen(true);
    setMode('experiment');
  }
  function inspectChange() {
    setVisualMode('candidate');
    setVariantSource('draft');
    setMode('atlas');
  }
  function discussSelection() {
    if (!selected) return;
    setReviewRuns(false);
    const identity =
      selected.kind === 'neuron'
        ? `${selected.data[1] || 'Neuron'} (body ${selected.data[0]}, class ${selected.data[3] || 'unclassified'})`
        : `${selected.label} (${groups[selected.group]})`;
    setDraft(
      `I am inspecting ${identity} in the MaleCNS atlas. Help me design a fair experiment related to this selection. Explain how it relates to the supported source populations and whether the current training engine can target it. Do not claim that a region or individual neuron has been selected for training unless the experiment specification supports it.`,
    );
    showChat();
  }
  const worker = useRef<Worker | null>(null),
    conversationEnd = useRef<HTMLDivElement>(null),
    runId = useRef('');
  const modelReady =
    modelSelection.provider === 'guided' ||
    providerStatuses.some(
      (p) =>
        p.id === modelSelection.provider &&
        p.status === 'connected' &&
        p.models.some((m) => m.id === modelSelection.model),
    );
  const selectModel = (selection: ModelSelection) => {
    setModelSelection(selection);
    setGuideMode(selection.provider === 'guided' ? 'guided' : 'ai');
  };
  const change = (patch: Partial<AtlasSettings>) => setSettings((s) => ({ ...s, ...patch }));
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/malecns/meshes.json').then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
      fetch('/research/graph.json').then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
    ])
      .then(([a, g]) => {
        if (alive) {
          setRegions(a as any[]);
          setGraph(g);
        }
      })
      .catch(() => setError('The anatomy dataset could not load. Reload to retry.'));
    (async () => {
      try {
        await flushRecords();
      } catch {}
      try {
        const r = await fetch('/api/records?kind=browser-run');
        if (r.ok) {
          const d: any = await r.json();
          if (alive) setHistory(d.records || []);
        }
        const response = await fetch('/api/records?kind=agent-session');
        if (!response.ok) throw Error('History unavailable');
        const d: any = await response.json();
        if (alive && d.records?.[0]) restoreConversation(d.records[0]);
      } catch {
        const pending = await pendingRecords().catch(() => []);
        const latest = pending
          .filter((r) => r.kind === 'agent-session')
          .sort((a, b) => b.queuedAt - a.queuedAt)[0];
        if (alive && latest) restoreConversation(latest);
        setSaveState('Local history unavailable · retrying saves automatically');
      } finally {
        if (alive) {
          setSessionLoaded(true);
          setRestored(true);
        }
      }
    })();
    return () => {
      alive = false;
      worker.current?.terminate();
    };
  }, []);
  useEffect(() => {
    if (
      !restored ||
      !sessionLoaded ||
      (messages.length === 1 && stage === 0 && !selectedJob && !computeId && !discoveryMode)
    )
      return;
    const record = {
      id: sessionId,
      kind: 'agent-session',
      name:
        messages.find((m) => m.role === 'user')?.text.slice(0, 100) || 'Experiment conversation',
      data: {
        plan,
        stage,
        messages,
        execution,
        labConfig: labProposal,
        selectedJob,
        computeId,
        discoveryMode,
        discoveryConfig,
        discoveryId,
        discoveryReady,
        resultId: result?.id || null,
      },
    };
    setSaveState('Saving…');
    queueRecord(record)
      .then(() => flushRecords())
      .then(async () =>
        setSaveState((await pendingRecords()).length ? 'Save pending · retrying' : 'Saved locally'),
      )
      .catch(() => setSaveState('Save pending · retrying. Keep a backup if closing this browser.'));
  }, [
    sessionId,
    messages,
    plan,
    stage,
    restored,
    sessionLoaded,
    execution,
    labProposal,
    selectedJob,
    computeId,
    result?.id,
    discoveryMode,
    discoveryConfig,
    discoveryId,
    discoveryReady,
  ]);
  useEffect(() => {
    const retry = () =>
      flushRecords()
        .then(async () => {
          if (!(await pendingRecords()).length) setSaveState('Saved locally');
        })
        .catch(() => {});
    const t = setInterval(retry, 10000);
    window.addEventListener('online', retry);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', retry);
    };
  }, []);
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, mode]);
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
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => setCatalog(d as any[]))
      .catch(() => setError('Neuron search could not load.'));
  }, [dialog, catalog.length]);
  useEffect(() => {
    if (!running) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [running]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now() - time * 5500;
    const update = () => {
      const t = Math.min(1, (performance.now() - start) / 5500);
      setTime(t);
      if (t < 1) frame = requestAnimationFrame(update);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    return catalog
      .filter((a) =>
        q
          ? `${a[0]} ${a[1]} ${a[2]}`.toLowerCase().includes(q)
          : ['MBON11', 'DNa02', 'DNp01'].includes(a[1]),
      )
      .slice(0, 30);
  }, [catalog, query]);
  function navigate(v: string) {
    if (v === 'experiment') showChat();
    else setMode(v);
    setDrawer('');
  }
  function selectRegion(r: any) {
    setSelected({ kind: 'region', ...r });
    change({ selectedRegion: r.id, selectedBody: null, selectedPoint: null, isolate: false });
    setDrawer('');
  }
  function selectNeuron(a: any) {
    setSelected({ kind: 'neuron', data: a });
    change({
      selectedRegion: null,
      selectedBody: String(a[0]),
      selectedPoint: a.slice(7, 10),
      group: -1,
      isolate: false,
      inventory: false,
      explode: 0,
      scope: a[6] === 3 ? 'cns' : 'brain',
    });
    setDialog('');
    setMode('atlas');
  }
  async function send(text = draft) {
    if (!text.trim() || running || thinking) return;
    if (!modelReady) {
      setDraft(text);
      pendingSuggestion.current = text;
      setModelMenuRequest((v) => v + 1);
      return;
    }
    const content = text.trim(),
      sent: Message = { role: 'user', text: text.trim() };
    setDraft('');
    setError('');
    setReviewRuns(false);
    showChat();
    setThinking(true);
    setMessages((m) => [...m, sent]);
    try {
      if (discoveryMode) {
        const response = await fetch('/api/discovery/guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: content,
            config: discoveryConfig,
            campaignId: discoveryId,
            sessionId,
            provider: modelSelection.provider,
            model: modelSelection.model,
            messages: messages.slice(-40).map((m) => ({ role: m.role, text: m.text })),
          }),
        });
        const reply: any = await response.json();
        if (!response.ok) throw Error(reply.error || 'Discovery guide unavailable');
        setDiscoveryReady(reply.ready === true);
        setDiscoveryConfig(discoverySchema.parse(reply.config));
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            text: reply.text,
            provider: reply.provider,
            model: reply.model,
            cost: reply.cost ? (reply.cost.recorded ? reply.cost.usd : 'unrecorded') : undefined,
          },
        ]);
        if (reply.cost) {
          spendAlerts.push(reply.cost.alerts);
          setSpendVersion((v) => v + 1);
        }
        return;
      }
      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          stage,
          plan,
          execution,
          labConfig: labProposal,
          jobContext: labJob,
          sessionId,
          provider: modelSelection.provider,
          model: modelSelection.model,
          messages: messages.slice(-60),
          evidence:
            execution === 'lab'
              ? labEvidence
              : result
                ? {
                    delta: result.delta,
                    speedup: result.speedup,
                    interval: result.interval,
                    originalAccuracy: result.models[0].accuracy,
                    candidateAccuracy: result.models[1].accuracy,
                    ablationAccuracy: result.models[1].ablationAccuracy,
                  }
                : null,
        }),
      });
      const reply: any = await response.json();
      if (!response.ok) throw Error(reply.error || 'The guide could not respond.');
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: reply.text,
          provider: reply.provider,
          model: reply.model,
          cost: reply.cost ? (reply.cost.recorded ? reply.cost.usd : 'unrecorded') : undefined,
        },
      ]);
      if (reply.cost) {
        spendAlerts.push(reply.cost.alerts);
        setSpendVersion((v) => v + 1);
      }
      setPlan(reply.plan);
      setStage(reply.stage);
      setGuideMode(reply.mode);
      if (execution === 'lab' && reply.labConfig) {
        setLabProposal(labConfigSchema.parse(reply.labConfig));
        if (reply.action && reply.action !== 'none') {
          const outcome = await labRef.current?.execute(reply.action, reply.labConfig, reply.stage);
          if (outcome) setMessages((m) => [...m, { role: 'assistant', text: outcome }]);
        }
      }
    } catch (e: any) {
      setMessages((m) => m.filter((x) => x !== sent));
      setError(e.message);
      setDraft(content);
    } finally {
      setThinking(false);
    }
  }
  useEffect(() => {
    if (modelReady && pendingSuggestion.current && !thinking) {
      const text = pendingSuggestion.current;
      pendingSuggestion.current = null;
      send(text);
    }
  }, [modelReady, modelSelection]);
  function switchExecution(next: 'lab' | 'browser') {
    if (next === execution) return;
    setVariantSource('draft');
    setVisualMode('original');
    setExecution(next);
    setStage(0);
    setPlan(defaultPlan);
    if (hasConversation)
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text:
            next === 'lab'
              ? 'Full-network training selected. We can train internal connections on your compute. Which task should we test?'
              : 'Browser readout training selected. Internal connections stay fixed; only the decision readout trains. Which task should we test?',
        },
      ]);
  }
  async function persist(r: any) {
    setHistory((h) => [
      { id: r.id, name: tasks[r.config.task].name, data: r },
      ...h.filter((x) => x.id !== r.id),
    ]);
    try {
      await queueRecord({
        id: r.id,
        kind: 'browser-run',
        name: tasks[r.config.task].name + ' · ' + new Date(r.createdAt).toLocaleDateString(),
        data: { ...r, sessionId },
      });
      await flushRecords();
      setSaveState('Result and checkpoints saved locally');
    } catch {
      setSaveState('Result save pending · retrying. Export a backup before leaving.');
    }
  }
  function start() {
    if (worker.current || stage !== 4 || thinking) return;
    const config = { ...plan };
    setPlan(config);
    setRunning(true);
    setResult(null);
    setProgress(null);
    setError('');
    setTime(0);
    setTrialIndex(0);
    setSeedIndex(0);
    setPlaying(false);
    showEvidence();
    runId.current = crypto.randomUUID();
    const id = runId.current;
    try {
      const w = takeBrowserWorker();
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (id !== runId.current) return;
        if (data.type === 'progress') setProgress(data.data);
        if (data.type === 'error') {
          setError(data.message);
          setRunning(false);
          worker.current?.terminate();
          worker.current = null;
        }
        if (data.type === 'complete') {
          const r = {
            ...data.data,
            environment: {
              userAgent: navigator.userAgent,
              logicalCores: navigator.hardwareConcurrency || null,
            },
            conversation: messages,
          };
          setResult(r);
          setVariantSource('run');
          setRunning(false);
          setProgress(null);
          worker.current?.terminate();
          worker.current = null;
          persist(r);
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              text: `The comparison is complete. ${r.delta > 0 ? 'The candidate scored ' + (r.delta * 100).toFixed(1) + ' percentage points higher' : r.delta < 0 ? 'The candidate scored ' + Math.abs(r.delta * 100).toFixed(1) + ' percentage points lower' : 'The models had the same test accuracy'}. Decision speed was ${r.speedup.toFixed(2)}× the original. ${r.interval ? 'The paired-seed interval is ' + (r.interval[0] * 100).toFixed(1) + ' to ' + (r.interval[1] * 100).toFixed(1) + ' points.' : 'With one seed, we cannot estimate reliability.'} Inspect the paired trials and ablation before deciding on another change.`,
            },
          ]);
        }
      };
      w.onerror = () => {
        setError('The worker stopped. Your plan is intact; try a quick check on this device.');
        setRunning(false);
        w.terminate();
        worker.current = null;
      };
      w.postMessage({ config });
    } catch {
      setRunning(false);
      setError('This browser could not start an experiment worker.');
    }
  }
  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    runId.current = '';
    setRunning(false);
    setProgress(null);
    setError('Experiment stopped. Incomplete work is not reported as a result.');
  }
  function reset() {
    if (running) return;
    setDiscoveryReady(true);
    setDiscoveryId(null);
    setDiscoveryVariant(null);
    setSelectedJob(null);
    setLabJob(null);
    setResult(null);
    setEvidenceOpen(false);
    setVisualMode('original');
    setVariantSource('draft');
    setReviewRuns(false);
    pendingSuggestion.current = null;
    setPlan(defaultPlan);
    setLabProposal(defaultLabConfig);
    setLabEvidence(null);
    setStage(0);
    setMessages([{ role: 'assistant', text: greeting }]);
    setDraft('');
    setSaveState('');
    setMode('experiment');
    setSessionId(crypto.randomUUID());
  }
  const selectedTitle =
    selected?.kind === 'neuron' ? selected.data[1] || String(selected.data[0]) : selected?.label;
  const activeTrials = result?.models.map((m: any) => m.runs[seedIndex]?.trials[trialIndex]);
  const curveData = useMemo(() => {
    if (result)
      return result.models[0].runs[0].curve.map((p: any, i: number) => ({
        epoch: p.epoch,
        original:
          result.models[0].runs.reduce((s: number, r: any) => s + r.curve[i][metric], 0) /
          result.models[0].runs.length,
        candidate:
          result.models[1].runs.reduce((s: number, r: any) => s + r.curve[i][metric], 0) /
          result.models[1].runs.length,
      }));
    if (progress?.curve)
      return progress.curve.map((p: any) => ({
        epoch: p.epoch,
        [progress.model === 0 ? 'original' : 'candidate']: p[metric],
      }));
    return [];
  }, [result, progress, metric]);
  const workspaceIdentity = (
    <div className="uw-workspace-identity">
      <BrandLogo size={31} />
      <div className="uw-workspace-name">
        <Link href="/" aria-label="Drosophila workspace">
          Drosophila
        </Link>
        <button
          className="uw-source-label"
          aria-label="About the source and method"
          title="About the MaleCNS dataset"
          onClick={() => setDialog('about')}
        >
          <span>MaleCNS · Adult male</span>
          <Info size={12} />
        </button>
      </div>
    </div>
  );
  return (
    <div
      className={
        'da-studio uw-studio uw-focus-' +
        mode +
        (chatOpen ? ' uw-chat-open' : '') +
        (evidenceOpen ? ' uw-evidence-open' : '')
      }
    >
      <CostDashboard
        open={spendOpen}
        onClose={() => setSpendOpen(false)}
        experimentId={hasConversation ? sessionId : null}
        alerts={spendAlerts.alerts}
        onAcknowledge={spendAlerts.acknowledge}
      />
      <SessionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpen={restoreConversation}
        onDelete={(id) => {
          if (id === sessionId) reset();
        }}
      />
      {narrow && mode !== 'experiment' && (
        <header className="uw-header uw-mobile-brand">
          <button
            className="uw-rail-logo"
            aria-label="Open Drosophila conversation"
            title="Drosophila · Open conversation"
            onClick={showChat}
          >
            <BrandLogo size={32} />
          </button>
        </header>
      )}
      {error && (
        <div className="da-alert" role="alert">
          {error}
          <button className="da-icon" aria-label="Dismiss message" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <main className="uw-workspace">
        <ResizablePanelGroup
          className="uw-resize-group"
          orientation="horizontal"
          disabled={narrow}
          id="research-workspace"
        >
          <ResizablePanel
            id="conversation"
            className="uw-chat-panel"
            panelRef={sidebarRef}
            defaultSize={430}
            minSize={narrow ? 0 : 330}
            maxSize={narrow ? '100%' : '55%'}
            collapsible
            collapsedSize={narrow ? 0 : 64}
            groupResizeBehavior="preserve-pixel-size"
            onResize={(size) => {
              if (!narrow) {
                setChatOpen(size.inPixels > 65);
                if (size.inPixels > 65) sidebarWidth.current = size.inPixels;
              }
            }}
          >
            {!chatOpen && !narrow && (
              <div className="uw-logo-rail">
                <button
                  className="uw-rail-logo"
                  aria-label="Open Drosophila conversation"
                  title="Drosophila · Open conversation"
                  onClick={showChat}
                >
                  <BrandLogo size={32} />
                </button>
              </div>
            )}
            <aside
              className={
                'da-conversation de-experiment ' +
                (welcome && !discoveryMode ? 'de-welcome' : 'de-active')
              }
              aria-label="Research conversation"
            >
              <header className="uw-conversation-header">
                {workspaceIdentity}
                <div className="uw-conversation-actions">
                  {!welcome && (
                    <button
                      className="uw-header-button"
                      disabled={running || thinking}
                      aria-label="New experiment"
                      title="New experiment"
                      onClick={reset}
                    >
                      <Plus size={18} />
                    </button>
                  )}
                  <button
                    className="uw-header-button"
                    aria-pressed={reviewRuns}
                    aria-label={reviewRuns ? 'Back to conversation' : 'Past runs'}
                    title={reviewRuns ? 'Back to conversation' : 'Past runs'}
                    onClick={() => setReviewRuns((v) => !v)}
                  >
                    <History size={18} />
                  </button>
                  <button
                    className="uw-header-button"
                    aria-label="Saved conversations"
                    title="Saved conversations"
                    disabled={running || thinking}
                    onClick={() => setHistoryOpen(true)}
                  >
                    <MessageCircle size={18} />
                  </button>
                  <button
                    className={'uw-spend-badge' + (spendAlerts.alerts.length ? ' alerting' : '')}
                    aria-label={
                      sessionSpend == null
                        ? 'Spending and pricing'
                        : 'Spending and pricing. This experiment has cost ' +
                          formatUsd(sessionSpend, true) +
                          ' so far'
                    }
                    title={
                      sessionSpend == null
                        ? 'Spending and pricing'
                        : 'This experiment has cost ' + formatUsd(sessionSpend, true) + ' so far'
                    }
                    onClick={() => setSpendOpen(true)}
                  >
                    <Wallet size={18} />
                    {sessionSpend != null && <span>{formatUsd(sessionSpend)}</span>}
                  </button>
                  <button
                    className="uw-header-button uw-collapse-chat"
                    aria-label="Hide conversation"
                    title="Hide conversation"
                    onClick={collapseChat}
                  >
                    <PanelLeftClose size={18} />
                  </button>
                </div>
              </header>
              <div className="de-conversation-content" hidden={welcome && !discoveryMode}>
                {spendAlerts.alerts.length > 0 && (
                  <div className="cd-banner" role="alert">
                    <Wallet size={16} />
                    <span>
                      <strong>
                        Spending passed {formatUsd(spendAlerts.alerts[0].thresholdUsd)}.
                      </strong>{' '}
                      Lifetime model spend is {formatUsd(spendAlerts.alerts[0].totalUsd)}.
                    </span>
                    <button
                      type="button"
                      onClick={() => spendAlerts.acknowledge(spendAlerts.alerts[0].id)}
                    >
                      Acknowledge
                    </button>
                  </div>
                )}
                <div className="da-chat-thread" hidden={reviewRuns}>
                  {messages
                    .filter((m, i) => i !== 0 || m.role !== 'assistant')
                    .map((m, i) => (
                      <div className={'da-message ' + m.role} key={i}>
                        {m.role === 'assistant' && (
                          <span className="da-agent-mark">
                            <ProviderIcon provider={m.provider || 'guided'} />
                          </span>
                        )}
                        <div>
                          {m.role === 'assistant' && (
                            <span className="da-message-author">
                              {m.provider === 'openai'
                                ? 'OpenAI'
                                : m.provider === 'anthropic'
                                  ? 'Claude'
                                  : 'Studio guide'}
                              {m.model && m.provider !== 'guided' && (
                                <small className="da-message-model">{m.model}</small>
                              )}
                              {m.cost !== undefined && m.provider !== 'guided' && (
                                <small
                                  className="da-message-cost"
                                  title={
                                    m.cost === 'unrecorded'
                                      ? 'This call was billed but could not be saved to the local ledger.'
                                      : m.cost == null
                                        ? 'No stored rate for this model. Refresh pricing in Spending.'
                                        : 'Estimated cost of this reply'
                                  }
                                >
                                  {m.cost === 'unrecorded'
                                    ? 'not recorded'
                                    : m.cost == null
                                      ? 'unpriced'
                                      : formatUsd(m.cost, true)}
                                </small>
                              )}
                            </span>
                          )}
                          {m.role === 'user' && suggestionForPrompt(m.text) ? (
                            <details className="de-brief">
                              <summary>
                                {suggestionForPrompt(m.text)?.title}
                                <small>Experiment brief</small>
                                <ChevronDown size={14} />
                              </summary>
                              <div>
                                {m.text
                                  .split('\n\n')
                                  .slice(1)
                                  .map((part, j) => (
                                    <p key={j}>
                                      <strong>{part.split(':')[0]}:</strong>
                                      {part.slice(part.indexOf(':') + 1)}
                                    </p>
                                  ))}
                              </div>
                            </details>
                          ) : (
                            <p>{m.text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  {thinking && (
                    <div className="de-thinking" role="status">
                      <span />
                      <span />
                      <span />
                      <p>Preparing your experiment…</p>
                    </div>
                  )}
                  <div ref={conversationEnd} />
                </div>
                <div hidden={execution !== 'lab' || discoveryMode}>
                  <LabPanel
                    key={computeId || 'site'}
                    computeId={computeId}
                    onBusy={setComputeBusy}
                    onHealth={setComputeHealth}
                    ref={labRef}
                    evidenceHost={discoveryMode ? null : evidenceHost}
                    onVisual={setLabVisual}
                    onInspect={inspectChange}
                    config={labProposal}
                    onConfig={(c) => {
                      setLabProposal(c);
                      setStage(4);
                    }}
                    ready={stage === 4 && !reviewRuns}
                    browsing={reviewRuns}
                    locked={thinking}
                    selectedId={selectedJob}
                    onSelect={(id) => {
                      setSelectedJob(id);
                      if (id) {
                        setReviewRuns(false);
                        setVariantSource('run');
                        showEvidence();
                      }
                    }}
                    onContext={(j, e) => {
                      setLabJob(j);
                      setLabEvidence(e);
                    }}
                    onMessage={(text) => setMessages((m) => [...m, { role: 'assistant', text }])}
                    onDiscuss={() => {
                      setReviewRuns(false);
                      showChat();
                      setDraft('What does this result tell us, and what should we test next?');
                      document.getElementById('experiment-composer')?.focus();
                    }}
                  />
                </div>
                {stage === 4 && !reviewRuns && !discoveryMode && execution === 'browser' && (
                  <section className="da-plan">
                    <div className="da-plan-title">
                      <span className="da-kicker">YOUR EXPERIMENT</span>
                      <span>Ready to review</span>
                    </div>
                    <h2>{tasks[plan.task]?.name}</h2>
                    <div className="da-plan-change">
                      <div>
                        <span>Original</span>
                        <b>165,122</b>
                        <small>source neurons</small>
                      </div>
                      <ArrowRight size={22} />
                      <div>
                        <span>Candidate</span>
                        <b>{n(165122 + plan.duplicates)}</b>
                        <small>
                          {plan.duplicates
                            ? `+${plan.duplicates} inherited copies`
                            : 'all original neurons'}
                        </small>
                      </div>
                    </div>
                    <p>
                      {plan.prune
                        ? `Remove up to ${Math.round(plan.prune * 100)}% of low-count edges. `
                        : 'Preserve all measured edges. '}
                      {plan.duplicates && plan.memory
                        ? 'Give copies slower decay to test longer memory. '
                        : ''}
                      The change is a hypothesis; accuracy and speed can worsen.
                    </p>
                    <div className="da-plan-facts">
                      <span>
                        <b>{plan.seeds}</b> paired {plan.seeds === 1 ? 'seed' : 'seeds'}
                      </span>
                      <span>
                        <b>{plan.budget === 'quick' ? '24 / 12 / 24' : '64 / 32 / 64'}</b> train /
                        validation / test per seed
                      </span>
                      <span>
                        <b>55</b> readout parameters per model
                      </span>
                    </div>
                    <details>
                      <summary>
                        What will run <ChevronDown size={15} />
                      </summary>
                      <p>
                        The complete retained MaleCNS graph runs on this device in a background
                        worker. About 53 MB of source data is verified before use. Fixed neuronal
                        dynamics produce features; only the decision readout is trained. Copies
                        inherit real source adjacency and body ancestry. Keep this tab open; closing
                        it stops training. Full studies may take several minutes, depending on your
                        device.
                      </p>
                      <p>
                        Both models receive identical split data, optimizer, and update counts.
                        Validation selects checkpoints. Held-out test decisions, warmed latency and
                        recurrent-edge ablation are measured afterwards. This is a synthetic
                        decision benchmark, not a physiological fly simulation.
                      </p>
                    </details>
                    <div className="da-plan-actions">
                      <button className="da-text-button" onClick={inspectChange}>
                        <Focus size={16} />
                        Inspect change
                      </button>
                      <button
                        className="da-text-button"
                        onClick={() => exportJSON('experiment-plan.json', plan)}
                      >
                        <Download size={16} />
                        Plan
                      </button>
                      <button className="da-primary" disabled={running || thinking} onClick={start}>
                        <Play size={15} />
                        {running ? 'Experiment running' : 'Run this experiment'}
                      </button>
                    </div>
                  </section>
                )}
                {discoveryMode && (
                  <DiscoveryPanel
                    config={discoveryConfig}
                    onConfig={(c) => {
                      setDiscoveryConfig(c);
                      setDiscoveryReady(true);
                    }}
                    selected={discoveryId}
                    onSelect={setDiscoveryId}
                    onStatus={setDiscoveryStatus}
                    locked={thinking || running || !discoveryReady}
                    evidenceHost={evidenceHost}
                    onEvidence={showEvidence}
                    onInspect={(meta) => {
                      setDiscoveryVariant(meta);
                      setVisualMode('candidate');
                      setVariantSource('run');
                      setMode('atlas');
                    }}
                  />
                )}
                {!discoveryReady && discoveryMode && (
                  <p className="discovery-clarification">
                    Answer the guide’s question before starting, or apply a supported configuration.
                  </p>
                )}
              </div>
              <div className="de-input-area">
                <form
                  className="da-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <textarea
                    id="experiment-composer"
                    aria-label="Tell the research guide what you want to test"
                    placeholder={
                      running
                        ? 'An experiment is running…'
                        : thinking
                          ? 'You can review the brief above while I work…'
                          : welcome
                            ? 'What could this brain become?\nHow do you want it to improve?'
                            : 'Ask a question or refine your experiment…'
                    }
                    value={draft}
                    disabled={running || thinking}
                    onChange={(e) => {
                      pendingSuggestion.current = null;
                      setDraft(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={2}
                    maxLength={2000}
                  />
                  <div className="da-composer-toolbar">
                    <div className="da-composer-pickers">
                      <ModelPicker
                        closeSignal={computeOpen}
                        onMenuOpen={() => setComputeOpen(false)}
                        requestOpen={modelMenuRequest}
                        selection={modelSelection}
                        onSelect={selectModel}
                        onStatus={setProviderStatuses}
                        disabled={running || thinking}
                      />
                      <button
                        type="button"
                        className="discovery-mode-button"
                        aria-label="Architecture discovery mode"
                        title="Architecture discovery mode"
                        aria-pressed={discoveryMode}
                        disabled={running || thinking}
                        onClick={() => {
                          setDiscoveryMode((v) => !v);
                          setExecution('lab');
                          setReviewRuns(false);
                          setVisualMode('original');
                        }}
                      >
                        <GitCompareArrows size={17} />
                      </button>
                      <ComputePicker
                        execution={execution}
                        onExecution={switchExecution}
                        health={computeHealth}
                        selected={computeId}
                        onSelect={(id) => {
                          setSelectedJob(null);
                          setLabJob(null);
                          setLabEvidence(null);
                          setComputeId(id);
                        }}
                        open={computeOpen}
                        onOpenChange={setComputeOpen}
                        disabled={running || thinking || computeBusy || discoveryMode}
                      />
                    </div>
                    <button
                      type="submit"
                      className="da-send"
                      disabled={!draft.trim() || running || thinking || !modelReady}
                      aria-label="Send message"
                    >
                      <ArrowUp size={20} />
                    </button>
                  </div>
                </form>
                {discoveryMode ? (
                  <div className="da-suggestions">
                    {[
                      ['cue-memory', 'Discover better memory'],
                      ['sequence-recall', 'Discover sequence recall'],
                      ['noisy-evidence', 'Discover better noisy decisions'],
                    ].map(([task, title]) => (
                      <button
                        key={task}
                        disabled={thinking || running}
                        onClick={() => {
                          setDiscoveryReady(true);
                          setDiscoveryConfig((c) => ({
                            ...c,
                            task: task as DiscoveryConfig['task'],
                            taskParameters: '{}',
                          }));
                          setDraft(
                            'Design an architecture discovery campaign for ' +
                              title.toLowerCase() +
                              '. Prioritize accuracy while allowing up to 3× slower decisions. Keep the source MaleCNS graph, search meaningful neuron and connection changes, and confirm the best candidate on fresh tests. Explain the settings before I start.',
                          );
                        }}
                      >
                        {title}
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                ) : welcome ? (
                  <div className="de-starters" aria-label="Suggested experiments">
                    {experimentSuggestions.map((suggestion, i) => (
                      <button
                        key={suggestion.id}
                        disabled={thinking || running}
                        onClick={() => send(suggestionPrompt(suggestion, execution))}
                      >
                        <span className="de-starter-icon">
                          {i === 0 ? <Clock3 size={20} /> : <Waves size={20} />}
                        </span>
                        <span>
                          <b>{suggestion.title}</b>
                          <small>{suggestion.description}</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  !running &&
                  !thinking && (
                    <div className="da-suggestions">
                      {(execution === 'lab' ? labOptions(stage) : options(stage)).map((o) => (
                        <button key={o} onClick={() => send(o)}>
                          {o}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  )
                )}
                <div className="da-conversation-foot">
                  <span>
                    {thinking
                      ? modelSelection.name + ' is responding…'
                      : modelSelection.provider === 'guided'
                        ? 'Offline guide · fixed workflow'
                        : modelReady
                          ? 'Connected to ' +
                            (modelSelection.provider === 'openai' ? 'OpenAI' : 'Claude')
                          : 'Choose a model to begin'}
                  </span>
                  <span>{saveState}</span>
                </div>
                {execution === 'browser' && (
                  <p className="de-engine-note">
                    Browser mode · decision readout only. Keep this tab open during training.
                  </p>
                )}
              </div>
            </aside>
          </ResizablePanel>
          <ResizableHandle
            className="uw-sidebar-divider"
            withHandle
            aria-label="Resize conversation panel"
            disabled={narrow || !chatOpen}
          />
          <ResizablePanel id="anatomy" minSize={narrow ? 0 : 320} className="uw-atlas-panel">
            <div className="uw-visual">
              <section className="da-atlas uw-atlas" aria-label="Atlas workspace">
                <AtlasView
                  settings={atlasSettings}
                  onPick={selectRegion}
                  onReady={setReady}
                  onRenderer={setRenderer}
                />
                <div className="uw-variant-switch">
                  <Tabs
                    value={visualMode}
                    onValueChange={(v) => setVisualMode(v as typeof visualMode)}
                  >
                    <TabsList aria-label="Brain comparison view">
                      <TabsTrigger value="original">Original</TabsTrigger>
                      <TabsTrigger value="candidate" disabled={!variant.available}>
                        Candidate
                      </TabsTrigger>
                      <TabsTrigger value="compare" disabled={!variant.available}>
                        <GitCompareArrows size={15} />
                        Compare
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {visualMode !== 'original' && (
                  <div className="uw-change-context">
                    <div>
                      <span>{variantSource === 'run' ? 'RECORDED RUN' : 'DRAFT PREVIEW'}</span>
                      {runConfig && (
                        <button
                          onClick={() => setVariantSource((v) => (v === 'draft' ? 'run' : 'draft'))}
                        >
                          {variantSource === 'draft' ? 'Show recorded run' : 'Show draft'}
                        </button>
                      )}
                    </div>
                    <b>+{visualConfig.duplicates} inherited copies</b>
                    <p>
                      {variant.loading
                        ? 'Resolving source ancestry…'
                        : variant.error ||
                          `${variant.positions.length} of ${visualConfig.duplicates} source positions located. Copies inherit wiring; they do not have biological coordinates.`}
                    </p>
                    {execution === 'browser' && !!visualConfig.prune && (
                      <p>
                        Pruning: {Math.round(visualConfig.prune * 100)}% requested. Removed edges
                        are not mapped on this anatomy view.
                      </p>
                    )}
                  </div>
                )}
                {visualMode === 'compare' && (
                  <div className="uw-comparison-labels">
                    <span>
                      Original <small>Source anatomy</small>
                    </span>
                    <span>
                      Candidate <small>Source-copy locations</small>
                    </span>
                  </div>
                )}
                <div className="da-atlas-actions">
                  <button
                    className="da-glass-button"
                    aria-label="Find a neuron"
                    title="Find a neuron"
                    onClick={() => setDialog('search')}
                  >
                    <Search size={17} />
                    <span>Find a neuron</span>
                    <kbd>⌘ K</kbd>
                  </button>
                  <button
                    className="da-glass-button"
                    aria-label="Anatomical structures"
                    title="Anatomical structures"
                    onClick={() => setDrawer('structures')}
                  >
                    <Layers3 size={17} />
                    <span>Structures</span>
                  </button>
                </div>
                <div className="da-camera">
                  <button
                    className="da-icon"
                    title="Reset view"
                    aria-label="Reset view"
                    onClick={() => {
                      setSettings(initialSettings);
                      setSelected(null);
                    }}
                  >
                    <Focus size={19} />
                  </button>
                  {['front', 'side', 'top'].map((v) => (
                    <button
                      key={v}
                      aria-label={v + ' view'}
                      aria-pressed={settings.view === v}
                      onClick={() => change({ view: v })}
                    >
                      {v[0].toUpperCase()}
                    </button>
                  ))}
                  <span />
                  <button
                    className="da-icon"
                    aria-label="Display settings"
                    onClick={() => setDrawer('display')}
                  >
                    <Settings2 size={19} />
                  </button>
                </div>
                {selected && (
                  <section className="da-inspect">
                    <button
                      className="da-icon da-inspect-close"
                      aria-label="Clear selection"
                      onClick={() => {
                        setSelected(null);
                        change({
                          selectedRegion: null,
                          selectedBody: null,
                          selectedPoint: null,
                          isolate: false,
                        });
                      }}
                    >
                      <X size={17} />
                    </button>
                    <span className="da-kicker">
                      {selected.kind === 'neuron' ? 'SOURCE NEURON' : 'ANATOMICAL STRUCTURE'}
                    </span>
                    <h2>{selectedTitle}</h2>
                    <p>
                      {selected.kind === 'neuron'
                        ? `Body ${selected.data[0]} · ${selected.data[2] || 'Unclassified'}`
                        : groups[selected.group]}
                    </p>
                    {selected.kind === 'region' && (
                      <div className="da-inspect-actions">
                        <button
                          disabled={renderer === '2d'}
                          onClick={() =>
                            change({
                              isolate: !settings.isolate,
                              inventory: false,
                              explode: 0,
                              surfaces: true,
                              opacity: settings.opacity || 64,
                            })
                          }
                        >
                          <Focus size={15} />
                          {settings.isolate ? 'Show context' : 'Isolate'}
                        </button>
                        <button
                          disabled={renderer === '2d'}
                          onClick={() => {
                            change({
                              hidden: [...(settings.hidden || []), selected.id],
                              isolate: false,
                              selectedRegion: null,
                            });
                            setSelected(null);
                          }}
                        >
                          <EyeOff size={15} />
                          Hide
                        </button>
                      </div>
                    )}
                    <button className="uw-selection-chat" onClick={discussSelection}>
                      <MessageCircle size={15} />
                      Discuss this selection
                    </button>
                    {selected.kind === 'neuron' && (
                      <a
                        href={'/api/morphology?id=' + selected.data[0]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open source morphology <ArrowUpRight size={14} />
                      </a>
                    )}
                  </section>
                )}
                <div className="da-atlas-caption">
                  <span>{graph ? n(graph.neurons) : '165,122'} neurons</span>
                  <span>{ready || regions.length || 83} structures</span>
                  <button onClick={() => setDialog('about')}>
                    Source & method <ArrowUpRight size={12} />
                  </button>
                </div>
                <div className="da-atlas-dock">
                  <div className="da-assembly">
                    <button
                      aria-pressed={!settings.inventory}
                      onClick={() => change({ inventory: false, explode: 0 })}
                    >
                      Assembled
                    </button>
                    <Slider
                      aria-label="Separate structures"
                      disabled={renderer === '2d'}
                      value={[settings.explode]}
                      onValueChange={(v) =>
                        change({
                          inventory: true,
                          explode: v[0],
                          surfaces: true,
                          opacity: settings.opacity || 64,
                        })
                      }
                      min={0}
                      max={100}
                      step={1}
                    />
                    <button
                      disabled={renderer === '2d'}
                      aria-pressed={!!settings.inventory}
                      onClick={() =>
                        change({
                          inventory: true,
                          explode: 100,
                          surfaces: true,
                          opacity: settings.opacity || 64,
                        })
                      }
                    >
                      Inventory
                    </button>
                  </div>
                </div>
              </section>
              <div className="uw-evidence-bar">
                <button
                  onClick={() => {
                    if (evidenceOpen) {
                      setEvidenceOpen(false);
                      setMode('atlas');
                    } else showEvidence();
                  }}
                  aria-expanded={evidenceOpen}
                >
                  <ChartNoAxesCombined size={17} />
                  <span>
                    {discoveryMode
                      ? 'Discovery evidence'
                      : running ||
                          (labJob &&
                            ['queued', 'running', 'pausing', 'paused'].includes(labJob.status))
                        ? 'Experiment progress'
                        : measuredResult
                          ? 'Measured evidence'
                          : 'Evidence'}
                  </span>
                  <ChevronDown size={15} />
                </button>
                <span>
                  {discoveryMode
                    ? discoveryStatus
                    : measuredResult
                      ? `${(measuredResult.delta * 100).toFixed(1)} pp accuracy change`
                      : running
                        ? 'Running in this browser'
                        : labJob
                          ? labJob.status
                          : stage === 4
                            ? 'Plan ready for review'
                            : 'No experiment running'}
                </span>
              </div>
              <section
                className="uw-evidence-drawer"
                aria-label="Experiment evidence"
                hidden={!evidenceOpen}
              >
                <div className="uw-evidence-heading">
                  <h2>Experiment evidence</h2>
                  <button
                    className="da-icon"
                    aria-label="Close evidence"
                    onClick={() => {
                      setEvidenceOpen(false);
                      setMode('atlas');
                    }}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div
                  className="uw-evidence-body"
                  ref={setEvidenceHost}
                  hidden={execution !== 'lab'}
                />
                <div
                  className="uw-evidence-body"
                  ref={setBrowserHost}
                  hidden={execution !== 'browser'}
                />
                {execution === 'lab' && !labVisual && !discoveryMode && (
                  <div className="uw-evidence-empty">
                    <ChartNoAxesCombined size={26} />
                    <h3>Your evidence starts with a question.</h3>
                    <p>
                      Design a comparison in the conversation. Training curves and measured outcomes
                      will appear here.
                    </p>
                    <button
                      className="da-text-button"
                      onClick={() => {
                        setReviewRuns(true);
                        showChat();
                      }}
                    >
                      Browse past runs <History size={15} />
                    </button>
                  </div>
                )}
              </section>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      {execution === 'browser' &&
        browserHost &&
        createPortal(
          <section className="da-evidence uw-browser-evidence">
            <div className="da-evidence-top">
              {result && (
                <button
                  className="da-text-button"
                  onClick={() => exportJSON('malecns-experiment-' + result.id + '.json', result)}
                >
                  <Download size={16} />
                  Report & checkpoints
                </button>
              )}
            </div>
            {!running && !result && (
              <section className="da-evidence-empty">
                <BrandLogo size={52} />
                <h2>No result selected.</h2>
                <p>Design an experiment, run both networks, and inspect what actually changed.</p>
                <button className="da-primary" onClick={() => navigate('experiment')}>
                  Design an experiment <ArrowRight size={16} />
                </button>
                <button
                  className="da-text-button"
                  onClick={async () => {
                    try {
                      const r = await fetch('/research/example-browser-run.json');
                      if (!r.ok) throw Error();
                      const d: any = await r.json();
                      setResult(d);
                      setVariantSource('run');
                      setTrialIndex(0);
                      setSeedIndex(0);
                      setTime(0);
                      setSaveState('Bundled measurement · development CPU');
                    } catch {
                      setError('The example measurement could not load.');
                    }
                  }}
                >
                  Inspect a measured three-seed example <ArrowUpRight size={15} />
                </button>
              </section>
            )}
            {running && (
              <section className="da-live">
                <div className="da-live-top">
                  <span>{progress?.phase || 'Starting experiment worker'}</span>
                  <button className="da-text-button" onClick={cancel}>
                    <Square size={13} />
                    Stop
                  </button>
                </div>
                <div className="da-progress-track">
                  <div
                    style={{ width: (progress?.download ?? progress?.fraction ?? 0) * 100 + '%' }}
                  />
                </div>
                <p>
                  {progress?.download !== undefined
                    ? `${Math.round(progress.download * 100)}% of source data verified`
                    : `${progress?.name || 'Whole MaleCNS'} · paired seed ${progress?.seed || 1} of ${plan.seeds}`}
                </p>
                <div className="da-live-method">
                  <span>
                    01 <b>Train</b>
                  </span>
                  <span>
                    02 <b>Validate</b>
                  </span>
                  <span>
                    03 <b>Test</b>
                  </span>
                  <span>
                    04 <b>Ablate</b>
                  </span>
                </div>
                <small>Progress comes from the running worker. Keep this tab open.</small>
              </section>
            )}
            {result && (
              <>
                <section className="da-outcome">
                  <div>
                    <span className="da-kicker">
                      HELD-OUT ACCURACY CHANGE /{' '}
                      {result.environment?.source ? 'VERIFICATION CPU' : 'THIS DEVICE'}
                    </span>
                    <strong
                      className={result.delta > 0 ? 'positive' : result.delta < 0 ? 'negative' : ''}
                    >
                      {result.delta > 0 ? '+' : ''}
                      {(result.delta * 100).toFixed(1)}
                      <small>pp</small>
                    </strong>
                    <p>
                      {result.interval
                        ? result.interval[0] > 0
                          ? 'The paired interval is above zero on this small benchmark.'
                          : result.interval[1] < 0
                            ? 'The candidate underperformed on this benchmark.'
                            : 'The paired interval includes zero. A reliable gain is not established.'
                        : 'One seed: an execution check, not a reliable improvement claim.'}
                    </p>
                  </div>
                  <div className="da-outcome-pair">
                    {result.models.map((m: any, i: number) => (
                      <div key={i}>
                        <span>
                          <i style={{ background: i ? '#9ac6ff' : '#a2adbe' }} />
                          {m.name}
                        </span>
                        <b>{pc(m.accuracy)}</b>
                        <small>{m.latencyMs.toFixed(1)} ms / decision</small>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="da-arena-section">
                  <div className="da-section-heading">
                    <div>
                      <h2>The same trial. Two decisions.</h2>
                      <p>{tasks[result.config.task].description}</p>
                    </div>
                    <div className="da-trial-picker">
                      <label>
                        Seed
                        <select
                          aria-label="Replay seed"
                          value={seedIndex}
                          onChange={(e) => {
                            setSeedIndex(Number(e.target.value));
                            setTime(0);
                            setPlaying(false);
                          }}
                        >
                          {result.models[0].runs.map((r: any, i: number) => (
                            <option key={r.seed} value={i}>
                              {i + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Trial
                        <select
                          aria-label="Replay trial"
                          value={trialIndex}
                          onChange={(e) => {
                            setTrialIndex(Number(e.target.value));
                            setTime(0);
                            setPlaying(false);
                          }}
                        >
                          {result.models[0].runs[seedIndex].trials.map((_: any, i: number) => (
                            <option key={i} value={i}>
                              {i + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="da-twin-worlds">
                    {activeTrials?.map((t: any, i: number) => (
                      <DecisionArena
                        key={i}
                        trial={t}
                        time={time}
                        color={i ? '#9ac6ff' : '#a2adbe'}
                        label={i ? 'Candidate' : 'Original'}
                      />
                    ))}
                  </div>
                  <div className="da-replay-bar">
                    <button
                      className="da-icon"
                      aria-label={playing ? 'Pause replay' : 'Play replay'}
                      onClick={() => {
                        if (time >= 1) setTime(0);
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? <Pause size={17} /> : <Play size={17} />}
                    </button>
                    <Slider
                      aria-label="Shared trial playback"
                      value={[time * 100]}
                      onValueChange={(v) => {
                        setPlaying(false);
                        setTime(v[0] / 100);
                      }}
                      min={0}
                      max={100}
                      step={1}
                    />
                    <span>{Math.min(6, Math.floor(time * 6) + 1)} / 6</span>
                    <button
                      className="da-text-button"
                      onClick={() => {
                        setTrialIndex((trialIndex + 1) % result.protocol.sizes[2]);
                        setTime(0);
                        setPlaying(false);
                      }}
                    >
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                  <p className="da-caption">
                    Final decisions come from saved checkpoints on held-out inputs. Arena motion is
                    a schematic playback, not a learned navigation trajectory or physics simulation.
                  </p>
                </section>
              </>
            )}
            {(result || running) && (
              <section className="da-learning">
                <div className="da-section-heading">
                  <div>
                    <h2>Learning curves.</h2>
                    <p>
                      {result
                        ? 'Mean across paired seeds. Checkpoints selected by validation loss.'
                        : 'Live curve from the active model and seed.'}
                    </p>
                  </div>
                  <Tabs value={metric} onValueChange={setMetric}>
                    <TabsList className="da-chart-tabs">
                      <TabsTrigger value="trainLoss">Train</TabsTrigger>
                      <TabsTrigger value="validationLoss">Validation</TabsTrigger>
                      <TabsTrigger value="validationAccuracy">Accuracy</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="da-chart">
                  {curveData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={curveData}
                        margin={{ top: 14, right: 12, bottom: 10, left: 0 }}
                      >
                        <CartesianGrid vertical={false} stroke="#25303b" strokeDasharray="2 5" />
                        <XAxis
                          dataKey="epoch"
                          stroke="#8a99a8"
                          tickLine={false}
                          axisLine={false}
                          minTickGap={40}
                          fontSize={12}
                        />
                        <YAxis
                          width={44}
                          stroke="#8a99a8"
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          tickFormatter={(v) =>
                            metric === 'validationAccuracy'
                              ? Math.round(v * 100) + '%'
                              : v.toFixed(1)
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#16202a',
                            border: '1px solid #344250',
                            borderRadius: 12,
                            color: '#f4f7fa',
                          }}
                          formatter={(v: any) => Number(v).toFixed(3)}
                          labelFormatter={(v) => 'Epoch ' + v}
                        />
                        <Line
                          type="monotone"
                          dataKey="original"
                          name="Original"
                          dot={false}
                          stroke="#a2adbe"
                          strokeWidth={2.5}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="candidate"
                          name="Candidate"
                          dot={false}
                          stroke="#9ac6ff"
                          strokeWidth={2.5}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="da-chart-empty">
                      Learning curves appear after source features are computed.
                    </div>
                  )}
                </div>
                <div className="da-chart-legend">
                  <span>
                    <i style={{ background: '#a2adbe' }} />
                    Original
                  </span>
                  <span>
                    <i style={{ background: '#9ac6ff' }} />
                    Candidate
                  </span>
                  <span>Training epoch →</span>
                </div>
              </section>
            )}
            {result && (
              <>
                <section className="da-proof">
                  <div>
                    <span className="da-kicker">RELIABILITY</span>
                    <h2>
                      {result.interval
                        ? `${(result.interval[0] * 100).toFixed(1)} to ${(result.interval[1] * 100).toFixed(1)} pp`
                        : 'Not estimated'}
                    </h2>
                    <p>
                      {result.interval
                        ? 'Exploratory 95% paired-seed bootstrap interval. Few seeds and a small task limit the conclusion.'
                        : 'A paired interval needs at least three seeds. Repeat with more seeds before interpreting a gain.'}
                    </p>
                  </div>
                  <div>
                    <span className="da-kicker">DECISION SPEED</span>
                    <h2>{result.speedup.toFixed(2)}×</h2>
                    <p>
                      {result.speedup >= 1
                        ? 'Candidate decisions were faster'
                        : 'Candidate decisions were slower'}{' '}
                      on {result.environment?.source ? 'the verification CPU' : 'this device'}.
                      Median of seven warmed sequence executions per seed; rendering excluded.
                    </p>
                  </div>
                  <div>
                    <span className="da-kicker">DOES THE WIRING MATTER?</span>
                    <h2>{pc(result.models[1].ablationAccuracy)}</h2>
                    <p>
                      Candidate accuracy with recurrent edges removed, versus{' '}
                      {pc(result.models[1].accuracy)} intact. If the score survives, the gain does
                      not establish a benefit from fruit-fly wiring.
                    </p>
                  </div>
                </section>
                <section className="da-trial-matrix">
                  <div className="da-section-heading">
                    <div>
                      <h2>Every held-out decision.</h2>
                      <p>
                        Choose a trial to inspect its paired replay. Filled = correct; outlined =
                        incorrect.
                      </p>
                    </div>
                  </div>
                  {result.models.map((m: any, i: number) => (
                    <div className="da-trial-row" key={i}>
                      <span>{i ? 'Candidate' : 'Original'}</span>
                      <div>
                        {m.runs[seedIndex].trials.map((t: any, j: number) => (
                          <button
                            key={j}
                            aria-label={`${m.name}, trial ${j + 1}, ${t.correct ? 'correct' : 'incorrect'}`}
                            className={
                              (t.correct ? 'correct ' : '') + (trialIndex === j ? 'chosen' : '')
                            }
                            style={
                              { '--trial-color': i ? '#9ac6ff' : '#a2adbe' } as React.CSSProperties
                            }
                            onClick={() => {
                              setTrialIndex(j);
                              setTime(1);
                              setPlaying(false);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
                <details className="da-method-details">
                  <summary>
                    Protocol, source ancestry & checkpoint details <ChevronDown size={17} />
                  </summary>
                  <p>{result.protocol.trained}</p>
                  <p>{result.protocol.scope}</p>
                  <p>{result.protocol.normalization}</p>
                  <p>
                    Source graph: <code>{result.graphSha256}</code>
                  </p>
                  <p>
                    Candidate: {n(result.models[1].neurons)} computational neurons and{' '}
                    {n(result.models[1].edges)} directed edges. Actual pruning removes all observed
                    counts at or below {result.models[1].threshold}; ties may make the fraction
                    smaller than requested.
                  </p>
                  <p>
                    Validation selected{' '}
                    {result.selectedByValidation ? 'the candidate' : 'the original'} as the
                    lower-loss architecture. Both test scores are displayed descriptively; avoid
                    selecting further changes against these same test trials.
                  </p>
                  <button
                    className="da-text-button"
                    onClick={() => exportJSON('source-ancestry.json', result.models[1].ancestors)}
                  >
                    Download copy-to-source body IDs <Download size={15} />
                  </button>
                </details>
                <div className="da-result-foot">
                  <span>{saveState}</span>
                  <button className="da-primary" onClick={() => navigate('experiment')}>
                    Discuss the next experiment <MessageCircle size={16} />
                  </button>
                </div>
              </>
            )}
            {history.length > 0 && !running && (
              <section className="da-history">
                <h2>Saved experiments</h2>
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setResult(h.data);
                      setVariantSource('run');
                      setTrialIndex(0);
                      setSeedIndex(0);
                      setTime(0);
                      setPlaying(false);
                    }}
                  >
                    <span>{h.name}</span>
                    <span>
                      {h.data.delta > 0 ? '+' : ''}
                      {(h.data.delta * 100).toFixed(1)} pp <ChevronRight size={16} />
                    </span>
                  </button>
                ))}
              </section>
            )}
          </section>,
          browserHost,
        )}
      <nav className="uw-mobile-nav" aria-label="Workspace panels">
        <button aria-pressed={mode === 'atlas'} onClick={() => setMode('atlas')}>
          <BrandLogo size={24} />
          Atlas
        </button>
        <button aria-pressed={mode === 'experiment'} onClick={showChat}>
          <MessageCircle size={18} />
          Conversation
        </button>
        <button aria-pressed={mode === 'evidence'} onClick={showEvidence}>
          <ChartNoAxesCombined size={18} />
          Evidence
        </button>
      </nav>
      <Sheet open={!!drawer} onOpenChange={(v) => !v && setDrawer('')}>
        <SheetContent className="da-sheet" side="right">
          <SheetTitle>{drawer === 'structures' ? 'Anatomical structures' : 'Display'}</SheetTitle>
          <SheetDescription>
            {drawer === 'structures'
              ? 'Measured MaleCNS surfaces. Select to inspect.'
              : 'Choose the detail you want to explore.'}
          </SheetDescription>
          {drawer === 'structures' ? (
            <>
              <button
                className="da-text-button"
                onClick={() => change({ hidden: [], isolate: false, group: -1, scope: 'cns' })}
              >
                <Undo2 size={16} />
                Show every structure
              </button>
              <div className="da-structure-list">
                {groups.map((g, i) => (
                  <details key={g} open={settings.group === i || i === 2}>
                    <summary>
                      <i style={{ background: colors[i] }} />
                      {g}
                      <span>{regions.filter((r) => r.group === i).length}</span>
                    </summary>
                    {regions
                      .filter((r) => r.group === i)
                      .map((r) => (
                        <div key={r.id}>
                          <button
                            onClick={() => {
                              change({ scope: i === 3 ? 'cns' : 'brain', group: -1 });
                              selectRegion(r);
                            }}
                          >
                            {r.label}
                          </button>
                          <button
                            className="da-icon"
                            aria-label={
                              (settings.hidden?.includes(r.id) ? 'Show ' : 'Hide ') + r.label
                            }
                            disabled={renderer === '2d'}
                            onClick={() =>
                              change({
                                hidden: settings.hidden?.includes(r.id)
                                  ? settings.hidden.filter((id) => id !== r.id)
                                  : [...(settings.hidden || []), r.id],
                              })
                            }
                          >
                            {settings.hidden?.includes(r.id) ? (
                              <EyeOff size={15} />
                            ) : (
                              <Eye size={15} />
                            )}
                          </button>
                        </div>
                      ))}
                  </details>
                ))}
              </div>
            </>
          ) : (
            <div className="da-display">
              <label>
                Whole central nervous system
                <Switch
                  checked={settings.scope === 'cns'}
                  onCheckedChange={(v) => change({ scope: v ? 'cns' : 'brain' })}
                />
              </label>
              {[
                ['surfaces', 'Neuropil surfaces'],
                ['fibers', 'Source skeletons'],
                ['somas', 'Neuron positions'],
                ['labels', 'Inventory labels'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <Switch
                    disabled={renderer === '2d'}
                    checked={!!settings[key as keyof AtlasSettings]}
                    onCheckedChange={(v) => change({ [key]: v })}
                  />
                </label>
              ))}
              <label>
                Surface opacity <span>{settings.opacity}%</span>
              </label>
              <Slider
                aria-label="Surface opacity"
                disabled={renderer === '2d'}
                value={[settings.opacity]}
                min={0}
                max={100}
                onValueChange={(v) => change({ opacity: v[0] })}
              />
              <label>
                Cutaway <span>{settings.slice}%</span>
              </label>
              <Slider
                aria-label="Cutaway"
                disabled={renderer === '2d'}
                value={[settings.slice || 0]}
                min={0}
                max={100}
                onValueChange={(v) => change({ slice: v[0] })}
              />
              <p>
                {renderer === '2d'
                  ? 'This device is showing a 2D projection of measured source positions. Surface controls require WebGL.'
                  : 'Drag to rotate, scroll or pinch to zoom. The inventory separates region surfaces; it does not move biological coordinates.'}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog('')}>
        <DialogContent className="da-dialog">
          <DialogTitle>
            {dialog === 'search' ? 'Find a neuron' : 'Grounded in a real connectome.'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'search'
              ? 'Search a type, class, or source body ID.'
              : 'MaleCNS v1.0 · source anatomy and measured computation.'}
          </DialogDescription>
          {dialog === 'search' ? (
            <>
              <div className="da-search-input">
                <Search size={19} />
                <input
                  autoFocus
                  aria-label="Search neurons"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="MBON11, DNa02, body ID…"
                />
              </div>
              <div className="da-search-results">
                {matches.map((a) => (
                  <button key={a[0]} onClick={() => selectNeuron(a)}>
                    <span>
                      {a[1] || 'Unclassified neuron'}
                      <small>{a[2]}</small>
                    </span>
                    <code>{a[0]}</code>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
                {!matches.length && (
                  <p>
                    {catalog.length
                      ? 'No matching source neuron.'
                      : 'Loading the neuron catalogue…'}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="da-about">
              <p>
                The atlas shows 83 source region surfaces, 140,628 measured soma/root positions, and
                137 overview skeletons. Search loads individual original morphology.
              </p>
              <p>
                The experiment engine retains all 165,122 Traced neurons and 6,235,682 observed
                directed connections with at least five synapses. The browser engine trains a
                decision readout; the persistent lab trains individual connection multipliers and
                neuron-class dynamics on a separate training machine. Anatomical detail does not
                imply a physiologically validated brain simulation.
              </p>
              <p>
                Choose an OpenAI or Claude model in the chat composer. The selected provider
                receives the conversation, current plan and measured evidence summary. Keys are
                verified against the provider, encrypted on the server and scoped to your account.
                Switching models preserves the conversation. Training starts only after your review.
              </p>
              <p>
                Data: FlyEM / HHMI Janelia, University of Cambridge, MRC LMB, Google Research. CC BY
                4.0.
              </p>
              <a href="https://male-cns.janelia.org/download/" target="_blank" rel="noreferrer">
                Original dataset <ArrowUpRight size={15} />
              </a>
              <a href="/research/browser/manifest.json" download>
                Graph provenance & checksums <Download size={15} />
              </a>
              <a href="/archive">
                Advanced Python jobs & earlier results <ArrowUpRight size={15} />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
