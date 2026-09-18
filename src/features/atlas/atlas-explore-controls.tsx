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
      <fieldset className="atlas-explore" disabled={disabled}>
        <legend className="sr-only">Atlas appearance</legend>
        <label>
          Anatomical context{' '}
          <Switch
            disabled={disabled}
            checked={!!settings.ghostContext}
            onCheckedChange={(ghostContext) => change({ ghostContext })}
          />
        </label>
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
        <details className="atlas-control-section">
          <summary>
            Cell classes{' '}
            <span>
              {cellClasses.length - hidden.length}/{cellClasses.length}
            </span>
          </summary>
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
        </details>
        <details className="atlas-control-section">
          <summary>
            Surface close-ups <span>3 cells</span>
          </summary>
          <div className="atlas-explore-options">
            {membraneGallery.map((cell) => (
              <button type="button" key={cell.bodyId} onClick={() => onSelectNeuron(cell.bodyId)}>
                {cell.type} · {cell.bodyId}
              </button>
            ))}
          </div>
        </details>
        <h3>Views</h3>
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
        <details className="atlas-control-section">
          <summary>Depth & motion</summary>
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
          {settings.isolateNeuron && (
            <p className="atlas-control-hint">
              Choose “Show context” on the selected cell to adjust.
            </p>
          )}
        </details>
        <details className="atlas-control-section atlas-control-notes">
          <summary>About this view</summary>
          <p>Drag to rotate; scroll or pinch to zoom.</p>
          <p>
            Thickness scales estimated radii for display. Inventory separates surfaces. Neither
            changes the source brain.
          </p>
          <p>
            Colors show anatomy, not activity or performance. Individual cell colors repeat; class
            swatches apply to Cell class mode.
          </p>
          {settings.colorMode === 'anatomy' && (
            <p>
              Teal: left optic lobe · Purple: right optic lobe · Amber: central brain · Green: nerve
              cord.
            </p>
          )}
          <p>
            Filters affect the representative sample. Three close-ups use source membranes; other
            cells use radius-estimate skeletons.
          </p>
          <p>Orbit pauses on interaction and respects reduced motion. Toggle it to restart.</p>
        </details>
        <button
          type="button"
          onClick={() => change({ snapshotKey: (settings.snapshotKey ?? 0) + 1 })}
        >
          Save atlas image
        </button>
      </fieldset>
    </>
  );
}
