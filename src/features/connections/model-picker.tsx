'use client';
import './composer-menu.css';
import BrandLogo from '@/components/brand-logo';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Provider, ProviderStatus } from '@/lib/contracts/providers';
export type ModelSelection = { provider: Provider | 'guided'; model: string; name: string };
export function ProviderIcon({ provider }: { provider: string }) {
  return provider === 'openai' || provider === 'anthropic' ? (
    <img
      className={'da-provider-icon ' + provider}
      src={'/providers/' + (provider === 'anthropic' ? 'claude' : 'openai') + '.svg'}
      width="20"
      height="20"
      alt=""
      aria-hidden="true"
    />
  ) : (
    <BrandLogo size={22} />
  );
}
const empty: ProviderStatus[] = [
  { id: 'openai', name: 'OpenAI', status: 'missing', models: [] },
  { id: 'anthropic', name: 'Claude', status: 'missing', models: [] },
];
export default function ModelPicker({
  requestOpen = 0,
  closeSignal = false,
  onMenuOpen,
  selection,
  onSelect,
  onStatus,
  disabled,
}: {
  requestOpen?: number;
  closeSignal?: boolean;
  onMenuOpen?: () => void;
  selection: ModelSelection;
  onSelect: (s: ModelSelection) => void;
  onStatus: (p: ProviderStatus[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [providers, setProviders] = useState(empty),
    [query, setQuery] = useState(''),
    [loading, setLoading] = useState(true),
    [connection, setConnection] = useState<Provider | null>(null),
    [apiKey, setApiKey] = useState(''),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [connectionError, setConnectionError] = useState('');
  useEffect(() => {
    if (requestOpen) {
      setOpen(true);
      onMenuOpen?.();
    }
  }, [requestOpen]);
  useEffect(() => {
    if (closeSignal) setOpen(false);
  }, [closeSignal]);
  function remember(s: ModelSelection) {
    onSelect(s);
    try {
      localStorage.setItem('atlas-model-preference', JSON.stringify(s));
    } catch {}
  }
  function choose(s: ModelSelection) {
    remember(s);
    setOpen(false);
  }
  function update(items: ProviderStatus[], preferred?: ModelSelection) {
    setProviders(items);
    onStatus(items);
    const choice = preferred || selection;
    const active = items.find((p) => p.id === choice.provider);
    if (choice.provider === 'guided') {
      remember(choice);
      return;
    }
    if (active?.status === 'connected') {
      const m =
        active.models.find((m) => m.id === choice.model) ||
        active.models.find((m) => m.id === 'gpt-5.4-mini') ||
        active.models[0];
      if (m) remember({ provider: active.id, model: m.id, name: m.name });
    } else if (!choice.model) {
      const first = items.find((p) => p.status === 'connected' && p.models.length);
      if (first) {
        const m = first.models.find((m) => m.id === 'gpt-5.4-mini') || first.models[0];
        remember({ provider: first.id, model: m.id, name: m.name });
      } else remember(choice);
    } else remember(choice);
  }
  async function refresh(preferred?: ModelSelection) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/providers');
      const data: any = await response.json();
      if (!response.ok) throw Error(data.error || 'Connections could not load.');
      update(data.providers, preferred);
    } catch (e: any) {
      setError(e.message);
      onStatus([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let pref: ModelSelection | undefined;
    try {
      const p = JSON.parse(localStorage.getItem('atlas-model-preference') || 'null');
      if (
        p &&
        ['openai', 'anthropic', 'guided'].includes(p.provider) &&
        typeof p.model === 'string' &&
        typeof p.name === 'string'
      )
        pref = p;
    } catch {}
    refresh(pref);
  }, []);
  function connect(provider: Provider) {
    setOpen(false);
    setConnection(provider);
    setApiKey('');
    setConnectionError('');
  }
  async function save() {
    if (!connection || !apiKey.trim() || saving) return;
    setSaving(true);
    setConnectionError('');
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: connection, apiKey: apiKey.trim() }),
      });
      const d: any = await response.json();
      if (!response.ok) throw Error(d.error || 'Connection failed.');
      const p = d.provider as ProviderStatus;
      update(
        providers.map((x) => (x.id === p.id ? p : x)),
        { provider: p.id, model: '', name: p.name },
      );
      setApiKey('');
      setConnection(null);
    } catch (e: any) {
      setConnectionError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!connection || saving) return;
    setSaving(true);
    setConnectionError('');
    try {
      const response = await fetch('/api/providers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: connection }),
      });
      if (!response.ok) {
        const d: any = await response.json();
        throw Error(d.error);
      }
      await refresh();
      setApiKey('');
      setConnection(null);
    } catch (e: any) {
      setConnectionError(e.message || 'Could not remove this connection.');
    } finally {
      setSaving(false);
    }
  }
  const current = providers.find((p) => p.id === connection),
    name = connection === 'anthropic' ? 'Claude' : 'OpenAI';
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) onMenuOpen?.();
          if (!v) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="da-model-trigger"
            disabled={disabled}
            aria-label={'Choose AI model, ' + selection.name}
          >
            <ProviderIcon provider={selection.provider} />
            <span>{selection.name}</span>
            <ChevronDown size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="da-model-popover dc-composer-menu"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={14}
        >
          <div className="da-model-menu-top">
            <span>Choose a model</span>
            <button
              className="da-icon"
              type="button"
              aria-label="Refresh available models"
              disabled={loading}
              onClick={() => refresh()}
            >
              <RefreshCw size={15} className={loading ? 'da-spinning' : ''} />
            </button>
          </div>
          <div className="da-model-search">
            <Search size={15} />
            <input
              aria-label="Search available models"
              placeholder="Search models"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {error && (
            <p className="da-provider-error" role="alert">
              {error}
            </p>
          )}
          <div className="da-model-options">
            {providers.map((p) => (
              <section key={p.id}>
                <div className="da-provider-heading">
                  <ProviderIcon provider={p.id} />
                  <span>{p.name}</span>
                  <small>
                    {loading
                      ? 'Checking…'
                      : p.status === 'connected'
                        ? 'Connected'
                        : p.status === 'error'
                          ? 'Check connection'
                          : 'Not connected'}
                  </small>
                  <button
                    type="button"
                    className="da-icon"
                    aria-label={'Manage ' + p.name + ' connection'}
                    onClick={() => connect(p.id)}
                  >
                    <Settings2 size={14} />
                  </button>
                </div>
                {p.status === 'connected' ? (
                  <>
                    {p.models
                      .filter((m) =>
                        (m.name + ' ' + m.id).toLowerCase().includes(query.toLowerCase()),
                      )
                      .map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          className={
                            'da-model-option ' +
                            (selection.provider === p.id && selection.model === m.id
                              ? 'selected'
                              : '')
                          }
                          onClick={() => choose({ provider: p.id, model: m.id, name: m.name })}
                        >
                          <span>
                            {m.name}
                            <small>{m.id}</small>
                          </span>
                          {selection.provider === p.id && selection.model === m.id && (
                            <Check size={16} />
                          )}
                        </button>
                      ))}
                    {!p.models.filter((m) =>
                      (m.name + ' ' + m.id).toLowerCase().includes(query.toLowerCase()),
                    ).length && <p className="da-model-empty">No matching available model.</p>}
                  </>
                ) : (
                  <button
                    className="da-connect-provider"
                    type="button"
                    onClick={() => connect(p.id)}
                  >
                    <KeyRound size={14} />
                    {p.status === 'error' ? 'Reconnect' : 'Connect'} {p.name}
                    <ChevronDown size={13} />
                  </button>
                )}
                {p.message && <p className="da-provider-error">{p.message}</p>}
              </section>
            ))}
          </div>
          <div className="da-model-menu-foot">
            <button
              type="button"
              className="da-offline-option"
              onClick={() =>
                choose({ provider: 'guided', model: 'offline', name: 'Offline guide' })
              }
            >
              <BrandLogo size={22} />
              <span>
                Offline guide<small>Fixed workflow · no AI model</small>
              </span>
              {selection.provider === 'guided' && <Check size={15} />}
            </button>
            <p>Switching keeps your conversation and experiment plan.</p>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog
        open={!!connection}
        onOpenChange={(v) => {
          if (!v && !saving) {
            setConnection(null);
            setApiKey('');
            setConnectionError('');
          }
        }}
      >
        <DialogContent className="da-dialog da-connection-dialog">
          <div className="da-connection-brand">
            <ProviderIcon provider={connection || 'openai'} />
          </div>
          <DialogTitle>
            {current?.status === 'connected' ? 'Manage' : 'Connect'} {name}
          </DialogTitle>
          <DialogDescription>
            Use your API account to chat with {name} models in this studio.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label htmlFor="provider-api-key">
              {name === 'Claude' ? 'Anthropic' : 'OpenAI'} API key
            </label>
            <input
              id="provider-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              placeholder={
                current?.status === 'connected'
                  ? current.hint || 'Enter a replacement key'
                  : name === 'Claude'
                    ? 'sk-ant-…'
                    : 'sk-…'
              }
              onChange={(e) => setApiKey(e.target.value)}
              disabled={saving}
              maxLength={2048}
            />
            <p className="da-key-privacy">
              Encrypted on the server and private to your signed-in account. Your key is never
              included in the conversation or returned to the browser.
            </p>
            {connectionError && (
              <p className="da-provider-error" role="alert">
                {connectionError}
              </p>
            )}
            <button className="da-primary" type="submit" disabled={saving || !apiKey.trim()}>
              {saving ? <LoaderCircle size={16} className="da-spinning" /> : <KeyRound size={16} />}{' '}
              {saving
                ? 'Verifying connection…'
                : current?.status === 'connected'
                  ? 'Verify & replace key'
                  : 'Verify & connect'}
            </button>
          </form>
          <div className="da-connection-links">
            <a
              href={
                connection === 'anthropic'
                  ? 'https://platform.claude.com/settings/keys'
                  : 'https://platform.openai.com/api-keys'
              }
              target="_blank"
              rel="noreferrer"
            >
              Get an API key <ArrowUpRight size={14} />
            </a>
            {current?.source === 'personal' && (
              <button className="da-text-button" type="button" disabled={saving} onClick={remove}>
                Remove my saved key
              </button>
            )}
          </div>
          <p className="da-api-billing">
            API usage is billed by the selected provider. ChatGPT and Claude chat subscriptions do
            not supply an API connection here.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
