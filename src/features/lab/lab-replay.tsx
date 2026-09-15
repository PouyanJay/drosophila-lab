'use client';
import { useEffect, useState } from 'react';
import { ChevronRight, Pause, Play } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import DecisionArena from '@/features/lab/decision-arena';
export default function LabReplay({ result, seed }: { result: any; seed: number }) {
  const [trial, setTrial] = useState(0),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const count = result.models[0].runs[seed].test.targets.length;
  useEffect(() => {
    setTrial(0);
    setTime(0);
    setPlaying(false);
  }, [result, seed]);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - time * 5000;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - started) / 5000);
      setTime(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const index = Math.min(trial, count - 1),
    trials = result.models.map((m: any) => {
      const r = m.runs[seed];
      return {
        xs: r.inputs[index],
        y: r.test.targets[index],
        probability: r.test.probabilities[index],
        correct: r.test.predictions[index] === r.test.targets[index],
      };
    });
  return (
    <section className="uw-lab-replay">
      <div className="uw-replay-heading">
        <div>
          <h3>The same input. Two decisions.</h3>
          <p>
            Recorded test trial {index + 1} of {count}
          </p>
        </div>
        <button
          className="da-text-button"
          onClick={() => {
            setTrial((index + 1) % count);
            setTime(0);
            setPlaying(false);
          }}
        >
          Next trial <ChevronRight size={15} />
        </button>
      </div>
      <div className="da-twin-worlds">
        {trials.map((t: any, i: number) => (
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
          aria-label={playing ? 'Pause trial replay' : 'Play trial replay'}
          onClick={() => {
            if (time >= 1) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <Slider
          aria-label="Recorded trial playback"
          value={[time * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => {
            setPlaying(false);
            setTime(v[0] / 100);
          }}
        />
        <span>
          {Math.min(trials[0].xs.length, Math.floor(time * trials[0].xs.length) + 1)} /{' '}
          {trials[0].xs.length}
        </span>
      </div>
      <p className="fl-caption">
        Inputs and final decisions come from the saved run. Movement illustrates each decision; it
        is not a learned navigation path or a recording of neuron activity.
      </p>
    </section>
  );
}
