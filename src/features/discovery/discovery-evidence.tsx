'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useCandidateCurves } from './use-candidate-curves';
import { ArrowUpRight, ChartNoAxesCombined } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './discovery-evidence.css';

type Topology = { neurons: number; edges: number; [key: string]: unknown };
type Candidate = {
  id: string;
  parent?: string;
  promoted?: boolean;
  pilot?: number;
  validationAccuracy?: number;
  topology?: Topology;
};
type CurvePoint = { step: number; trainLoss: number; validationLoss: number };
type Confirmation = {
  delta: number;
  slowdown: number;
  interval: number[];
  caveat?: string;
  scenarios: Record<string, unknown>[];
  runs: { original: { scenarios: number[] }; candidate: { scenarios: number[] } }[];
};
type EvidenceJob = {
  id: string;
  status: string;
  error?: string;
  progress?: {
    candidate?: string;
    seed?: number;
    phase?: string;
    candidates?: Candidate[];
    best?: Candidate;
    trainingCurve?: CurvePoint[];
  };
  result?: {
    improved: boolean;
    outcome: string;
    metricName?: string;
    variantId?: string;
    candidates: Candidate[];
    best?: Candidate;
    confirmation?: Confirmation | null;
  };
};
const percent = (value?: number) =>
  Number.isFinite(value) ? `${(value! * 100).toFixed(1)}%` : '—';
const decimal = (value?: number, digits = 2) =>
  Number.isFinite(value) ? value!.toFixed(digits) : '—';

export default function DiscoveryEvidence({
  job,
  onInspect,
}: {
  job: EvidenceJob | null;
  onInspect: (meta: Topology) => void;
}) {
  const [selection, setSelection] = useState<{ job: string; id: string } | null>(null);
  const [runChoice, setRunChoice] = useState('');
  const requestedCandidate = selection?.job === job?.id ? selection?.id : job?.progress?.candidate;
  const saved = useCandidateCurves(
    job?.id,
    requestedCandidate,
    `${job?.status}/${job?.progress?.phase}/${job?.progress?.seed}`,
  );
  const deliveredTopology = useRef('');
  useEffect(() => {
    if (!job || selection?.job !== job.id || !saved.topology) return;
    const candidate = (job.result?.candidates ?? job.progress?.candidates ?? []).find(
      (item) => item.id === selection.id,
    );
    const key = `${job.id}/${selection.id}`;
    if (!candidate || candidate.topology || deliveredTopology.current === key) return;
    deliveredTopology.current = key;
    onInspect({ ...saved.topology, candidateId: selection.id });
  }, [job, selection, saved.topology, onInspect]);
  if (!job)
    return (
      <section className="de-evidence de-evidence-empty" aria-label="Discovery evidence">
        <ChartNoAxesCombined size={24} />
        <h3>No discovery selected</h3>
        <p>Select a saved run or start a discovery to see its evidence.</p>
      </section>
    );
  const result = job.result;
  const progress = job.progress;
  const candidates = result?.candidates ?? progress?.candidates ?? [];
  const best = result?.best ?? progress?.best;
  const confirmation = result?.confirmation;
  const inspected =
    selection?.job === job.id ? candidates.find((c) => c.id === selection.id) : undefined;
  const curveCandidate = inspected?.id ?? progress?.candidate;
  const runKey = (phase: string, seed: number) => `${job.id}/${curveCandidate}/${phase}/${seed}`;
  const liveCurve = curveCandidate === progress?.candidate ? (progress?.trainingCurve ?? []) : [];
  const runs = [...saved.runs];
  if (
    liveCurve.length &&
    progress?.seed != null &&
    ['pilot', 'full', 'confirmation'].includes(progress.phase || '')
  ) {
    const live = {
      phase: progress.phase as 'pilot' | 'full' | 'confirmation',
      seed: progress.seed,
      curve: liveCurve,
      complete: job.status === 'completed',
    };
    const index = runs.findIndex((run) => run.phase === live.phase && run.seed === live.seed);
    if (index < 0) runs.push(live);
    else runs[index] = live;
  }
  const chosenRun =
    runs.find((run) => runKey(run.phase, run.seed) === runChoice) ??
    runs.find((run) => run.phase === 'full') ??
    runs[0];
  const curve =
    chosenRun &&
    chosenRun.seed === progress?.seed &&
    chosenRun.phase === progress?.phase &&
    liveCurve.length
      ? liveCurve
      : (chosenRun?.curve ?? liveCurve);
  function selectCandidate(candidate: Candidate) {
    deliveredTopology.current = '';
    setSelection({ job: job!.id, id: candidate.id });
    onInspect({ ...(candidate.topology ?? { neurons: 0, edges: 0 }), candidateId: candidate.id });
  }
  const active = ['queued', 'running', 'pausing', 'paused', 'cancelling'].includes(job.status);
  const heading = result
    ? result.improved
      ? 'Improvement confirmed'
      : 'No confirmed improvement'
    : job.status === 'failed'
      ? 'Discovery failed'
      : job.status === 'cancelled'
        ? 'Discovery cancelled'
        : job.status === 'paused'
          ? 'Discovery paused'
          : active
            ? 'Discovery in progress'
            : 'Results unavailable';
  return (
    <section className="de-evidence" aria-label="Discovery evidence">
      <header className="de-evidence-outcome">
        <div>
          <h3>{heading}</h3>
          <p>
            {result
              ? result.improved
                ? 'Passed the predefined confirmation criteria.'
                : 'This run does not establish an improved brain.'
              : 'Search scores are provisional until fresh confirmation tests.'}
          </p>
        </div>
        <span className="de-evidence-state" data-confirmed={!!result?.improved}>
          {job.status}
        </span>
      </header>
      {job.error && (
        <p role="alert" className="de-evidence-error">
          {job.error}
        </p>
      )}
      <dl className="de-evidence-metrics">
        <div>
          <dt>Evaluated</dt>
          <dd>
            {candidates.length}
            <small>candidates</small>
          </dd>
        </div>
        <div>
          <dt>{result ? 'Finalist' : 'Current best'}</dt>
          <dd>
            {best?.id || '—'}
            <small>{best ? 'Validation-selected' : 'None selected'}</small>
          </dd>
        </div>
        <div>
          <dt>Held-out gain</dt>
          <dd>
            {confirmation ? `${decimal(confirmation.delta * 100, 1)} pp` : '—'}
            <small>{confirmation ? result?.metricName || 'Accuracy' : 'Not tested'}</small>
          </dd>
        </div>
        <div>
          <dt>Decision time</dt>
          <dd>
            {confirmation ? `${decimal(confirmation.slowdown)}×` : '—'}
            <small>{confirmation ? 'Relative to original' : 'Not tested'}</small>
          </dd>
        </div>
      </dl>
      <div className="de-evidence-grid">
        <section className="de-evidence-panel" aria-label="Training loss">
          <header>
            <h4>Training loss</h4>
            <span>
              {curveCandidate || 'Latest training'}
              {chosenRun
                ? ` · ${chosenRun.phase} · seed ${chosenRun.seed}`
                : curveCandidate === progress?.candidate && progress?.seed != null
                  ? ` · ${progress.phase || 'training'} · seed ${progress.seed}`
                  : ''}
            </span>
          </header>
          {runs.length > 0 && (
            <label className="de-curve-select">
              Training run
              <Select
                value={chosenRun ? runKey(chosenRun.phase, chosenRun.seed) : ''}
                onValueChange={setRunChoice}
              >
                <SelectTrigger
                  className="discovery-picker-trigger"
                  size="sm"
                  aria-label="Training phase and seed"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className="discovery-picker-menu"
                  position="popper"
                  align="start"
                  sideOffset={4}
                  collisionPadding={12}
                >
                  {runs.map((run) => (
                    <SelectItem
                      key={runKey(run.phase, run.seed)}
                      value={runKey(run.phase, run.seed)}
                    >
                      {run.phase === 'full'
                        ? 'Full training'
                        : run.phase === 'pilot'
                          ? 'Pilot'
                          : 'Confirmation training'}{' '}
                      · seed {run.seed}
                      {run.complete ? '' : ' · in progress'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {saved.error && (
            <p className="de-curve-error" role="status">
              {saved.error}{' '}
              <button type="button" onClick={saved.retry}>
                Retry
              </button>
            </p>
          )}
          {curve.length ? (
            <>
              <div className="de-evidence-legend">
                <span>
                  <i />
                  Train
                </span>
                <span>
                  <i />
                  Validation
                </span>
              </div>
              <div
                className="de-evidence-chart"
                role="img"
                aria-label="Training and validation loss by update; lower is better"
              >
                <ResponsiveContainer>
                  <LineChart data={curve} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                    <XAxis
                      dataKey="step"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={30}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                      label={{
                        value: 'Update',
                        position: 'insideBottom',
                        offset: -12,
                        fill: 'var(--muted-foreground)',
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      width={42}
                      tickLine={false}
                      axisLine={false}
                      tickCount={4}
                      tickFormatter={(v) => decimal(Number(v), 1)}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    />
                    <Tooltip
                      labelFormatter={(v) => 'Update ' + v}
                      formatter={(v) => decimal(Number(v), 3)}
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        color: 'var(--foreground)',
                        fontSize: 12,
                      }}
                    />
                    <Line
                      dataKey="trainLoss"
                      name="Train loss"
                      stroke="var(--evidence-train)"
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="validationLoss"
                      name="Validation loss"
                      stroke="var(--evidence-validation)"
                      strokeWidth={1.8}
                      strokeDasharray="5 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <details className="de-evidence-details">
                <summary>Training values</summary>
                <div className="de-evidence-table-wrap">
                  <table>
                    <caption className="sr-only">Training loss values</caption>
                    <thead>
                      <tr>
                        <th>Update</th>
                        <th>Train</th>
                        <th>Validation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curve.map((point) => (
                        <tr key={point.step}>
                          <td>{point.step}</td>
                          <td>{decimal(point.trainLoss, 3)}</td>
                          <td>{decimal(point.validationLoss, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <div className="de-evidence-placeholder">
              <ChartNoAxesCombined size={22} />
              <p>
                {saved.loading
                  ? 'Loading saved training curves…'
                  : inspected && inspected.id !== progress?.candidate
                    ? 'No saved curve available for this candidate'
                    : active
                      ? 'Waiting for training measurements'
                      : 'No training curve recorded'}
              </p>
            </div>
          )}
        </section>
        <section className="de-evidence-panel" aria-label="Candidate comparison">
          <header>
            <h4>Candidates</h4>
            <span>Search scores · not final tests</span>
          </header>
          {candidates.length ? (
            <div className="de-evidence-table-wrap de-candidate-table">
              <table>
                <caption className="sr-only">
                  Candidate search scores; pilot and validation are separate stages
                </caption>
                <thead>
                  <tr>
                    <th>Candidate / parent</th>
                    <th>Pilot</th>
                    <th>Validation</th>
                    <th>
                      <span className="sr-only">Inspect</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr
                      key={candidate.id}
                      data-selected={candidate.id === inspected?.id}
                      tabIndex={0}
                      aria-label={'Select ' + candidate.id}
                      onClick={() => selectCandidate(candidate)}
                      onKeyDown={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === 'Enter' || event.key === ' ')
                        ) {
                          event.preventDefault();
                          selectCandidate(candidate);
                        }
                      }}
                    >
                      <td>
                        <strong>{candidate.id}</strong>
                        {candidate.id === best?.id && (
                          <span className="de-finalist">{result ? 'Finalist' : 'Best'}</span>
                        )}
                        <small>from {candidate.parent || 'source'}</small>
                      </td>
                      <td>{percent(candidate.pilot)}</td>
                      <td>
                        {percent(candidate.validationAccuracy)}
                        <small>{candidate.promoted ? 'Full evaluation' : 'Pilot only'}</small>
                      </td>
                      <td>
                        {candidate.topology && (
                          <button
                            type="button"
                            className="de-evidence-inspect"
                            aria-label={'Inspect ' + candidate.id}
                            title={'Inspect ' + candidate.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              selectCandidate(candidate);
                            }}
                          >
                            <ArrowUpRight size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="de-evidence-placeholder">
              <p>No candidates evaluated yet</p>
            </div>
          )}
        </section>
      </div>
      {confirmation && (
        <details className="de-evidence-details de-confirmation">
          <summary>
            Confirmation details <span>{confirmation.scenarios.length} scenarios</span>
          </summary>
          <p>
            Paired seed interval:{' '}
            {confirmation.interval.map((v) => decimal(v * 100, 1)).join(' to ')} pp.
          </p>
          <div className="de-evidence-table-wrap">
            <table>
              <caption className="sr-only">Fresh confirmation scenario accuracy</caption>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Original</th>
                  <th>Candidate</th>
                </tr>
              </thead>
              <tbody>
                {confirmation.scenarios.map((scenario, i) => {
                  const mean = (name: 'original' | 'candidate') => {
                    const values = confirmation.runs.map((run) => run[name].scenarios[i]);
                    return values.length && values.every(Number.isFinite)
                      ? values.reduce((sum, v) => sum + v, 0) / values.length
                      : undefined;
                  };
                  return (
                    <tr key={i}>
                      <td>
                        {Object.entries(scenario)
                          .map(([key, value]) => key + ' ' + String(value))
                          .join(' · ')}
                      </td>
                      <td>{percent(mean('original'))}</td>
                      <td>{percent(mean('candidate'))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {confirmation.caveat && <p>{confirmation.caveat}</p>}
        </details>
      )}
      <footer className="de-evidence-footer">
        {best?.topology && (
          <button type="button" onClick={() => selectCandidate(best)}>
            <ArrowUpRight size={14} />
            {result ? 'Inspect finalist' : 'Inspect current best'}{' '}
            <span>
              {best.topology.neurons.toLocaleString()} neurons ·{' '}
              {best.topology.edges.toLocaleString()} edges
            </span>
          </button>
        )}
        <details className="de-evidence-details">
          <summary>Source & provenance</summary>
          <p>Campaign: {job.id}</p>
          {result && (
            <p>
              Variant: {result.variantId || 'No finalist'} · Outcome:{' '}
              {result.outcome.replaceAll('_', ' ')}
            </p>
          )}
          <p>
            Validation selects the finalist. Fresh tests determine confirmation. Atlas markers show
            source locations, not reconstructed fibers.
          </p>
        </details>
      </footer>
    </section>
  );
}
