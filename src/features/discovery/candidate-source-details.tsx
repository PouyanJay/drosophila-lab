'use client';
import AtlasChangeDiagram from './candidate-change-diagram';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
export type SourceMarker = { bodyId: string; position: number[]; copies: number };
type SourceEdit = { kind: string; sourceBody?: string; index?: number; operator?: string };
export default function CandidateSourceDetails({
  sources,
  selected,
  onSelect,
  onClear,
  edits = [],
}: {
  sources: SourceMarker[];
  selected: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  edits?: SourceEdit[];
}) {
  const source = sources.find((item) => item.bodyId === selected);
  const changes = edits.filter(
    (edit) => edit.kind === 'added-neuron' && edit.sourceBody === selected,
  );
  return (
    <div className="candidate-source-details">
      <label>
        Inspect a source
        <Select value={source?.bodyId ?? ''} onValueChange={onSelect}>
          <SelectTrigger
            className="discovery-picker-trigger"
            size="sm"
            aria-label="Inspect a source neuron"
          >
            <SelectValue placeholder="Choose a source" />
          </SelectTrigger>
          <SelectContent
            className="discovery-picker-menu"
            position="popper"
            align="start"
            sideOffset={4}
            collisionPadding={12}
          >
            {sources.map((item, index) => (
              <SelectItem
                key={item.bodyId}
                value={item.bodyId}
                textValue={`Source ${index + 1} · ${item.bodyId}`}
              >
                <span className="discovery-source-option">
                  <span className="discovery-source-number">{index + 1}</span>
                  <span>Body {item.bodyId}</span>
                  <small>
                    {item.copies} {item.copies === 1 ? 'copy' : 'copies'}
                  </small>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {source && (
        <section aria-label="Source modifications" aria-live="polite">
          <AtlasChangeDiagram
            key={`${source.bodyId}/${changes.map((edit) => edit.index).join(',')}`}
            change={{ bodyId: source.bodyId, copies: source.copies, nodes: changes }}
            onClose={onClear}
          />
          <details>
            <summary>Recorded edits</summary>
            {changes.length ? (
              <ul>
                {changes.map((edit, index) => (
                  <li key={`${edit.index}-${index}`}>
                    <strong>Node {edit.index}</strong>
                    <span>
                      {edit.operator === 'recurrent-loop'
                        ? 'Inherited wiring + recurrent self-loop'
                        : 'Inherited wiring with reweighted connections'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Copy ancestry is recorded; individual edit details are unavailable.</p>
            )}
          </details>
          <small>
            Changes include inherited edits. Scores measure the whole candidate, not this source
            alone. Copies have no measured anatomical positions.
          </small>
        </section>
      )}
    </div>
  );
}
