import { membraneGallery } from './atlas-membrane-data';
import { cellClasses, themeColor, type ColorMode } from './atlas-appearance';
import type { AtlasSettings } from './atlas-view';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

export function AtlasExploreControls({
  settings,
  change,
  disabled,
  onSelectNeuron,
}: {
  settings: AtlasSettings;
  change: (value: Partial<AtlasSettings>) => void;
  disabled: boolean;
  onSelectNeuron: (bodyId: string) => void;
}) {
  const hidden = settings.hiddenClasses ?? [];
  return (
    <>
      <label>
        Light mode{' '}
        <Switch
          aria-label="Light mode"
          checked={settings.theme === 'light'}
          onCheckedChange={(light) => change({ theme: light ? 'light' : 'dark' })}
        />
      </label>
      <fieldset className="atlas-explore" disabled={disabled}>
        <legend>Explore the anatomy</legend>
        <p>Colors identify source anatomy, not activity or performance.</p>
        <label>
          Quiet anatomical context{' '}
          <Switch
            disabled={disabled}
            checked={!!settings.ghostContext}
            onCheckedChange={(ghostContext) => change({ ghostContext })}
          />
        </label>
        <p>
          Neutral translucent compartments keep the surrounding anatomy visible when inspecting a
          cell.
        </p>
        <h3>Color by</h3>
        <div className="atlas-explore-options">
          {(
            [
              ['class', 'Cell class'],
              ['cell', 'Individual cell'],
              ['anatomy', 'Anatomical group'],
              ['mono', 'Single color'],
            ] as [ColorMode, string][]
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={(settings.colorMode ?? 'class') === value}
              onClick={() => change({ colorMode: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <h3>Cell classes</h3>
        <p>
          Filters apply to the representative neuron layer. Some classes lie outside the current
          view.
        </p>
        <div className="atlas-class-list">
          {cellClasses.map(([id, label, color]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={!hidden.includes(id)}
                onChange={() =>
                  change({
                    hiddenClasses: hidden.includes(id)
                      ? hidden.filter((value) => value !== id)
                      : [...hidden, id],
                  })
                }
              />
              <span
                className="atlas-swatch"
                style={{ background: themeColor(color, settings.theme ?? 'dark') }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {hidden.length > 0 && (
          <button type="button" onClick={() => change({ hiddenClasses: [] })}>
            Show all classes
          </button>
        )}
        {(settings.colorMode ?? 'class') !== 'class' && (
          <p>Class swatches are the legend for “Cell class” mode.</p>
        )}
        {settings.colorMode === 'anatomy' && (
          <p>
            Teal: left optic lobe · Purple: right optic lobe · Amber: central brain · Green: nerve
            cord.
          </p>
        )}
        {settings.colorMode === 'cell' && (
          <p>
            Distinct cell colors repeat across the sample; they do not encode a biological category.
          </p>
        )}
        <button
          type="button"
          onClick={() => change({ snapshotKey: (settings.snapshotKey ?? 0) + 1 })}
        >
          Save atlas image
        </button>
        <h3>Surface close-ups</h3>
        <p>Three source membrane reconstructions. Other cells use radius-estimate skeletons.</p>
        <div className="atlas-explore-options">
          {membraneGallery.map((cell) => (
            <button type="button" key={cell.bodyId} onClick={() => onSelectNeuron(cell.bodyId)}>
              {cell.type} · {cell.bodyId}
            </button>
          ))}
        </div>
        <h3>Vantage points</h3>
        <div className="atlas-explore-options">
          {(
            [
              ['brain', 'Brain'],
              ['cns', 'Whole system'],
              ['cord', 'Nerve cord'],
              ['neck', 'Neck pathways'],
            ] as const
          ).map(([destination, label]) => (
            <button
              type="button"
              key={destination}
              onClick={() =>
                change({
                  destination,
                  scope: destination === 'brain' ? 'brain' : 'cns',
                  view: 'front',
                  inventory: false,
                  explode: 0,
                  isolate: false,
                  isolateNeuron: false,
                  selectedBody: null,
                  selectedRegion: null,
                  group: -1,
                  resetKey: (settings.resetKey ?? 0) + 1,
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Depth contrast{' '}
          <Switch
            disabled={disabled}
            checked={settings.depthCue !== false}
            onCheckedChange={(depthCue) => change({ depthCue })}
          />
        </label>
        <label>
          Compartment outlines{' '}
          <Switch
            disabled={disabled}
            checked={!!settings.outlines}
            onCheckedChange={(outlines) => change({ outlines })}
          />
        </label>
        <label>
          Slow orbit{' '}
          <Switch
            disabled={disabled}
            checked={!!settings.autoRotate}
            onCheckedChange={(autoRotate) => change({ autoRotate })}
          />
        </label>
        <p>
          Orbit pauses when you interact and respects reduced motion. Toggle off and on to restart.
        </p>
        <label>
          Selected neuron context{' '}
          <span>{Math.round((settings.contextBrightness ?? 0.12) * 100)}%</span>
        </label>
        <Slider
          disabled={disabled || !!settings.isolateNeuron}
          aria-label="Selected neuron context"
          min={0}
          max={1}
          step={0.01}
          value={[settings.contextBrightness ?? 0.12]}
          onValueChange={(value) => change({ contextBrightness: value[0] })}
        />
        <p>
          Use “Show context” on the selected neuron to reveal surrounding neurons, then adjust their
          brightness. Anatomical compartments have their own context switch.
        </p>
      </fieldset>
    </>
  );
}
