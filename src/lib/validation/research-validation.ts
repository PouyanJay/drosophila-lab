const GRAPH = '729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b';
const integer = (x: any, lo: number, hi: number) => Number.isInteger(x) && x >= lo && x <= hi;
const finite = (x: any, lo: number, hi: number) =>
  typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const name = (x: any, n = 100) => typeof x === 'string' && x.length > 0 && x.length <= n;
export function validStudy(d: any): boolean {
  return (
    !!d &&
    d.schema === 'malecns-job/1' &&
    name(d.name) &&
    (!d.graphSha256 || d.graphSha256 === GRAPH) &&
    ['cue-recall', 'temporal-xor', 'evidence-integration'].includes(d.task) &&
    integer(d.steps, 1, 10000) &&
    integer(d.batch, 1, 128) &&
    integer(d.sequenceLength, 3, 128) &&
    integer(d.trainExamples, 8, 100000) &&
    integer(d.validationExamples, 8, 10000) &&
    integer(d.testExamples, 8, 100000) &&
    finite(d.learningRate, 0.00000001, 0.1) &&
    Array.isArray(d.seeds) &&
    d.seeds.length >= 1 &&
    d.seeds.length <= 20 &&
    new Set(d.seeds).size === d.seeds.length &&
    d.seeds.every((x: any) => integer(x, 0, 9999)) &&
    Array.isArray(d.variants) &&
    d.variants.length >= 1 &&
    d.variants.length <= 8 &&
    d.variants.every(
      (v: any) =>
        v &&
        name(v.name) &&
        integer(v.graft ?? 0, 0, 512) &&
        integer(v.duplicates ?? 0, 0, 512) &&
        finite(v.prune ?? 0, 0, 0.949999) &&
        (!v.population ||
          [
            'descending_neuron',
            'ascending_neuron',
            'cb_intrinsic',
            'vnc_intrinsic',
            'visual_projection',
          ].includes(v.population)),
    )
  );
}
export function validStudyResult(d: any): boolean {
  return (
    !!d &&
    d.schema === 'malecns-result/1' &&
    d.status === 'completed' &&
    name(d.id, 150) &&
    name(d.engine) &&
    validStudy(d.config) &&
    d.graph?.graphSha256 === GRAPH &&
    d.graph.neurons === 165122 &&
    finite(d.totalSeconds, 0, 31536000) &&
    d.hardware &&
    name(d.hardware.device, 20) &&
    integer(d.hardware.threads, 1, 4096) &&
    Array.isArray(d.models) &&
    d.models.length >= 2 &&
    d.models.length <= 9 &&
    integer(d.selectedModelIndex, 0, d.models.length - 1) &&
    d.models.every(
      (m: any, i: number) =>
        m &&
        name(m.name) &&
        (i === 0 || (finite(m.accuracyDelta, -1, 1) && finite(m.speedup, 0.00000001, 1e8))) &&
        (m.pairedSeedBootstrap95 == null ||
          (Array.isArray(m.pairedSeedBootstrap95) &&
            m.pairedSeedBootstrap95.length === 2 &&
            m.pairedSeedBootstrap95.every((n: any) => finite(n, -1, 1)))) &&
        finite(m.meanAccuracy, 0, 1) &&
        finite(m.meanLatencyMs, 0.000001, 86400000) &&
        finite(m.meanValidationLoss, 0, 1e8) &&
        Array.isArray(m.seeds) &&
        m.seeds.length === d.config.seeds.length &&
        m.seeds.every(
          (s: any, j: number) =>
            s &&
            s.seed === d.config.seeds[j] &&
            integer(s.seed, 0, 9999) &&
            finite(s.testAccuracy, 0, 1) &&
            finite(s.backboneAblationAccuracy, 0, 1) &&
            finite(s.latencyMsMedian, 0, 86400000) &&
            integer(s.edges, 0, 1000000000) &&
            integer(s.bestStep, 1, d.config.steps) &&
            finite(s.validationLoss, 0, 1e8) &&
            Array.isArray(s.history) &&
            s.history.length > 0 &&
            s.history.length <= 10000 &&
            s.history.length === m.seeds[0].history.length &&
            s.history.every(
              (p: any, k: number) =>
                p &&
                p.step === m.seeds[0].history[k].step &&
                integer(p.step, 1, d.config.steps) &&
                finite(p.validationLoss, 0, 1e8) &&
                finite(p.validationAccuracy, 0, 1),
            ),
        ),
    )
  );
}
