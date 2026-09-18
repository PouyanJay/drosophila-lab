'use client';
import { useState } from 'react';
import { Check, ChevronDown, Cpu, LoaderCircle, Server } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import './composer-menu.css';
import { prepareBrowserCompute } from '@/lib/client/browser-compute';
import './compute.css';
export default function ComputePicker({
  execution,
  onExecution,
  health,
  onSelect,
  open,
  onOpenChange,
  disabled,
}: {
  execution: 'lab' | 'browser';
  onExecution: (v: 'lab' | 'browser') => void;
  health: any;
  selected: string | null;
  onSelect: (id: string | null) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [checked, setChecked] = useState<any>(null);
  async function choose(mode: 'lab' | 'browser') {
    setBusy(true);
    setError('');
    try {
      if (mode === 'browser') await prepareBrowserCompute(setStatus);
      else {
        const r = await fetch('/api/lab/health');
        const d: any = await r.json();
        setChecked(d);
        if (!r.ok || !d.connected)
          throw Error('The local trainer is unavailable. Restart your workspace launcher.');
      }
      onExecution(mode);
      onSelect(null);
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const connected = (checked || health)?.connected;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="da-compute-trigger"
          disabled={disabled || busy}
          aria-label="Choose local compute"
          title="Choose local compute"
        >
          <Cpu size={18} />
          <span>{execution === 'browser' ? 'This browser' : 'Local trainer'}</span>
          <ChevronDown size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="da-model-popover dc-popover dc-composer-menu"
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
      >
        <div className="da-model-menu-top">
          <span>Local compute</span>
          {busy && <LoaderCircle className="da-spinning" size={16} />}
        </div>
        <button type="button" className="dc-instant" disabled={busy} onClick={() => choose('lab')}>
          <Server size={22} />
          <span>
            <strong>Full-network training</strong>
            <small>{connected ? 'Connected on this computer' : 'Check local trainer'}</small>
          </span>
          {execution === 'lab' && <Check size={17} />}
        </button>
        <p className="dc-muted">
          Trains internal connections. Saves checkpoints and continues after closing the browser.
        </p>
        <button
          type="button"
          className="dc-instant"
          disabled={busy}
          onClick={() => choose('browser')}
        >
          <Cpu size={22} />
          <span>
            <strong>Browser readout training</strong>
            <small>WebGPU when available · CPU fallback</small>
          </span>
          {execution === 'browser' && <Check size={17} />}
        </button>
        <p className="dc-muted">
          Uses the measured fly graph with fixed internal connections. Keep this tab open while it
          trains.
        </p>
        {busy && status && <p role="status">{status}</p>}
        {error && (
          <p role="alert" className="da-provider-error">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
