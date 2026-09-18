'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FlaskConical, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { DiscoveryConfig, discoverySchema } from '@/lib/contracts/discovery-contract';
import DiscoveryEvidence from './discovery-evidence';
import './discovery.css';
export default function DiscoveryPanel({
  config,
  onConfig,
  selected,
  onSelect,
  onInspect,
  evidenceHost,
  actionsHost,
  onEvidence,
  onStatus,
  locked,
}: {
  config: DiscoveryConfig;
  onConfig: (c: DiscoveryConfig) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onInspect: (meta: any) => void;
  evidenceHost: HTMLElement | null;
  actionsHost: HTMLElement | null;
  onEvidence: () => void;
  onStatus: (status: string) => void;
  locked: boolean;
}) {
  const [jobs, setJobs] = useState<any[]>([]),
    [job, setJob] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [advanced, setAdvanced] = useState(JSON.stringify(config, null, 2));
  const submission = useRef<{ key: string; config: string } | null>(null),
    active = useRef(selected);
  active.current = selected;
  async function api(path: string, body?: any) {
    const r = await fetch('/api/discovery/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d: any = await r.json();
    if (!r.ok) throw Error(d.error || 'Discovery unavailable');
    return d;
  }
  async function refresh() {
    try {
      const d = await api('campaigns');
      setJobs(d.jobs);
      const id = active.current;
      if (id) {
        const current = await api('campaigns/' + id);
        if (active.current === id) setJob(current);
      } else setJob(null);
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [selected]);
  useEffect(() => setAdvanced(JSON.stringify(config, null, 2)), [config]);
  useEffect(() => onStatus(job?.status || 'Ready to configure'), [job?.status, onStatus]);
  async function action(name: string) {
    setBusy(true);
    setError('');
    try {
      if (name === 'start') {
        const validated = discoverySchema.parse(config),
          serialized = JSON.stringify(validated);
        if (!submission.current || submission.current.config !== serialized)
          submission.current = { key: crypto.randomUUID(), config: serialized };
        const d = await api('campaigns', { config: validated, requestKey: submission.current.key });
        onSelect(d.id);
        setJob(d);
        submission.current = null;
      } else if (selected) setJob(await api('campaigns/' + selected + '/' + name, {}));
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const p = job?.progress,
    r = job?.result;
  const [names, setNames] = useState<Record<string, string>>({
    'cue-memory': 'Remember a direction',
    'sequence-recall': 'Ordered sequence recall',
    'noisy-evidence': 'Decide under noise',
  });
  useEffect(() => {
    api('tasks')
      .then((d) => setNames(Object.fromEntries(d.tasks.map((t: any) => [t.id, t.name]))))
      .catch(() => {});
  }, []);
  const exportLabel = r
    ? 'Export ' +
      (r.best ? (r.improved ? 'confirmed variant' : 'experimental variant') : 'campaign') +
      ' bundle'
    : '';
  return (
    <section className="discovery-panel">
      <div className="discovery-heading">
        <span>
          <FlaskConical size={16} />
          Discovery
        </span>
        <button className="da-icon" aria-label="Refresh discoveries" onClick={refresh}>
          <RefreshCw size={15} />
        </button>
      </div>
      <div className="discovery-task">
        <small>LOCAL SEARCH</small>
        <h3>{names[config.task] || config.task}</h3>
      </div>
      <dl className="discovery-limits">
        <div>
          <dt>Candidates</dt>
          <dd>{config.candidates}</dd>
        </div>
        <div>
          <dt>Time limit</dt>
          <dd>{Math.round(config.maxSeconds / 60)} min</dd>
        </div>
        <div>
          <dt>Gain target</dt>
          <dd>+{Number((config.minimumGain * 100).toFixed(2))} pp</dd>
        </div>
      </dl>
      <details>
        <summary>Settings & method</summary>
        <p>
          Up to {config.maxCopies} added neurons · up to {config.maxSlowdown}× slower.
        </p>
        <p>Pilot → paired training → fresh confirmation. Improvement is not guaranteed.</p>
        <label htmlFor="discovery-config">Configuration JSON</label>
        <p>Adjust in chat or edit below. Delays use simulation steps.</p>
        <textarea
          id="discovery-config"
          aria-label="Discovery configuration JSON"
          value={advanced}
          onChange={(e) => setAdvanced(e.target.value)}
        />
        <button
          onClick={() => {
            try {
              onConfig(discoverySchema.parse(JSON.parse(advanced)));
              setError('');
            } catch {
              setError('Invalid configuration. Check the supported limits and scenario count.');
            }
          }}
        >
          Apply settings
        </button>
      </details>
      <button className="da-primary" disabled={busy || locked} onClick={() => action('start')}>
        <Play size={15} />
        {busy ? 'Submitting…' : 'Start discovery'}
      </button>
      <details className="discovery-history">
        <summary>
          Saved discoveries <span>{jobs.length}</span>
        </summary>
        {jobs.length === 0 ? (
          <p>No saved discoveries yet.</p>
        ) : (
          <div className="discovery-history-list" aria-label="Saved discoveries">
            {jobs.map((j) => (
              <button
                key={j.id}
                aria-pressed={selected === j.id}
                onClick={() => onSelect(j.id)}
                title={(names[j.config.task] || j.config.task) + ' · ' + j.id}
              >
                <span>{names[j.config.task] || j.config.task}</span>
                <small>
                  {j.status} ·{' '}
                  {new Date(j.created * 1000).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </small>
              </button>
            ))}
          </div>
        )}
      </details>
      {job && (
        <div className="discovery-live">
          <div className="discovery-run-status">
            <strong>{names[job.config?.task] || 'Selected discovery'}</strong>
            <span>{job.status}</span>
          </div>
          {p && ['queued', 'running', 'pausing', 'paused', 'cancelling'].includes(job.status) && (
            <>
              <p>
                {p.phase || 'Waiting'}
                {p.candidate ? ' · ' + p.candidate : ''}
              </p>
              <progress
                aria-label="Discovery time budget"
                value={p.elapsed}
                max={p.budgetSeconds}
              />
            </>
          )}
          <div className="discovery-actions">
            {['queued', 'running', 'pausing'].includes(job.status) && (
              <button disabled={busy} onClick={() => action('pause')}>
                <Pause size={14} />
                Pause
              </button>
            )}
            {['paused', 'failed'].includes(job.status) && (
              <button disabled={busy} onClick={() => action('resume')}>
                <Play size={14} />
                Resume
              </button>
            )}
            {['queued', 'running', 'pausing', 'paused', 'cancelling'].includes(job.status) && (
              <button disabled={busy} onClick={() => action('cancel')}>
                <Square size={14} />
                Cancel
              </button>
            )}
            <button onClick={onEvidence}>View evidence</button>
          </div>
          {job.error && <p role="alert">{job.error}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="da-provider-error">
          {error}
        </p>
      )}
      {evidenceHost
        ? createPortal(<DiscoveryEvidence job={job} onInspect={onInspect} />, evidenceHost)
        : null}
      {r &&
        actionsHost &&
        createPortal(
          <a
            className="discovery-export"
            href={'/api/discovery/campaigns/' + job.id + '/artifacts/variant-bundle.zip'}
            download
            aria-label={exportLabel}
            title={exportLabel}
          >
            <Download size={14} />
            Export
          </a>,
          actionsHost,
        )}
    </section>
  );
}
