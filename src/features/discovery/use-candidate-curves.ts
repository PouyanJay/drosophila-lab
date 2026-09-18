'use client';
import { useEffect, useState } from 'react';
export type CurvePoint = { step: number; trainLoss: number; validationLoss: number };
export type CandidateCurveRun = {
  phase: 'pilot' | 'full' | 'confirmation';
  seed: number;
  curve: CurvePoint[];
  complete: boolean;
};
export function useCandidateCurves(jobId?: string, candidateId?: string, status?: string) {
  const key = jobId && candidateId ? `${jobId}/${candidateId}` : '';
  const [state, setState] = useState<{
    key: string;
    runs: CandidateCurveRun[];
    error?: string;
    topology?: { neurons: number; edges: number; [key: string]: unknown };
  }>({
    key: '',
    runs: [],
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!key) return;
    const abort = new AbortController();
    fetch(
      `/api/discovery/campaigns/${encodeURIComponent(jobId!)}/candidates/${encodeURIComponent(candidateId!)}/curves`,
      { signal: abort.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw Error('Saved curves could not load.');
        const data = await response.json();
        if (!Array.isArray(data.runs)) throw Error('Saved curves could not load.');
        if (!abort.signal.aborted) setState({ key, runs: data.runs, topology: data.topology });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setState({ key, runs: [], error: 'Saved curves could not load.' });
      });
    return () => abort.abort();
  }, [key, jobId, candidateId, status, retry]);
  return {
    runs: state.key === key ? state.runs : [],
    topology: state.key === key ? state.topology : undefined,
    loading: !!key && state.key !== key,
    error: state.key === key ? state.error : undefined,
    retry: () => {
      setState({ key: '', runs: [] });
      setRetry((value) => value + 1);
    },
  };
}
