'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
export type SourceChange = {
  bodyId: string;
  copies: number;
  nodes: { index?: number; operator?: string }[];
};
/** A wiring explanation, never a reconstruction of engineered anatomy. */
export default function AtlasChangeDiagram({
  change,
  onClose,
}: {
  change: SourceChange;
  onClose: () => void;
}) {
  const [after, setAfter] = useState(true);
  const loopCopies = change.nodes.filter((node) => node.operator === 'recurrent-loop').length;
  const recurrent = loopCopies > 0;
  return (
    <section
      className="atlas-change-diagram"
      aria-label={`Change at source ${change.bodyId}`}
      data-after={after}
    >
      <header>
        <strong>What changed here</strong>
        <span>Wiring diagram</span>
        <button type="button" aria-label="Close change diagram" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="atlas-change-toggle" role="group" aria-label="Show before or after the edit">
        <button type="button" aria-pressed={!after} onClick={() => setAfter(false)}>
          Before
        </button>
        <button type="button" aria-pressed={after} onClick={() => setAfter(true)}>
          After · +{change.copies}
        </button>
      </div>
      <svg
        viewBox="0 0 280 150"
        role="img"
        aria-label={
          after
            ? `Original neuron remains; ${change.copies} added ${change.copies === 1 ? 'copy inherits' : 'copies inherit'} its connection pattern${recurrent ? `; ${loopCopies} of ${change.copies} copies have an added self-loop` : ''}. Connection strengths change.`
            : 'Original neuron connected to input and output partners.'
        }
      >
        <g className="change-existing-wires">
          <path d="M30 65 H110 M140 65 H250" />
        </g>
        <g className="change-partners">
          <circle cx="24" cy="65" r="10" />
          <circle cx="256" cy="65" r="10" />
        </g>
        <text x="24" y="35" textAnchor="middle">
          Inputs
        </text>
        <text x="250" y="35" textAnchor="middle">
          Outputs
        </text>
        <circle className="change-source" cx="125" cy="65" r="17" />
        <text x="125" y="35" textAnchor="middle">
          Original
        </text>
        <g className="change-added" aria-hidden={!after}>
          <path
            className="change-added-wires"
            d="M34 69 Q65 117 110 115 M141 115 Q208 117 246 69"
          />
          {recurrent && (
            <path className="change-added-wires" d="M137 128 C170 150 170 95 140 105" />
          )}
          <circle className="change-copy" cx="125" cy="115" r="17" />
          <text className="change-copy-label" x="125" y="119" textAnchor="middle">
            +{change.copies}
          </text>
          <text x="63" y="143" textAnchor="middle">
            {recurrent
              ? `${loopCopies}/${change.copies} with self-loop`
              : 'Added copy' + (change.copies > 1 ? ' group' : '')}
          </text>
        </g>
      </svg>
      <p>
        {after
          ? recurrent
            ? `${loopCopies} of ${change.copies} added copies also feed back into themselves. All inherit wiring with changed strengths.`
            : 'The original stays. Added copies inherit its wiring with different connection strengths.'
          : 'The original neuron and its connections before these copies were added.'}
      </p>
      <small>Illustrative connections · copy placement is not anatomical</small>
    </section>
  );
}
