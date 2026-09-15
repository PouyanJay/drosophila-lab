'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import AtlasFallback from '@/features/atlas/atlas-fallback';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  cutawayPlaneConstant,
  neuralLayerAlpha,
  neuralLayerVisible,
} from '@/features/atlas/atlas-render-state';
export type AtlasSettings = {
  surfaces: boolean;
  somas: boolean;
  fibers: boolean;
  opacity: number;
  explode: number;
  view: string;
  scope: string;
  group: number;
  selectedBody: string | null;
  selectedRegion: string | null;
  multi?: boolean;
  slice?: number;
  ancestors?: number[][];
  interactive?: boolean;
  comparison?: boolean;
  selectedPoint?: number[] | null;
  isolate?: boolean;
  hidden?: string[];
  inventory?: boolean;
  labels?: boolean;
};
const GROUP_COLORS = ['#67bce5', '#9b91f5', '#dfb37f', '#84c9b5'];
const REGION_COLORS = [
  '#779acb',
  '#cd9b99',
  '#b3a0d0',
  '#b3bf99',
  '#cfb17c',
  '#80b7c3',
  '#bd92bd',
  '#83a7aa',
];
export default function AtlasView({
  settings,
  onPick,
  onReady,
  onRenderer,
}: {
  settings: AtlasSettings;
  onPick: (r: any) => void;
  onReady: (n: number) => void;
  onRenderer?: (mode: 'webgl' | '2d') => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    state = useRef(settings),
    pick = useRef(onPick),
    ready = useRef(onReady),
    [error, setError] = useState(''),
    [fallback, setFallback] = useState(false),
    [loaded, setLoaded] = useState(0),
    [total, setTotal] = useState(1),
    api = useRef<any>(null);
  state.current = settings;
  pick.current = onPick;
  ready.current = onReady;
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFallback(true);
      onRenderer?.('2d');
      return;
    }
    onRenderer?.('webgl');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 450),
      cut = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 800);
    renderer.clippingPlanes = [clip, cut];
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20000);
    const sideCamera = new THREE.OrthographicCamera(-500, 500, 500, -500, 0.1, 6000),
      topCamera = new THREE.OrthographicCamera(-500, 500, 500, -500, 0.1, 6000);
    camera.position.set(385, -220, 1350);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(385, -210, 185);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 100;
    controls.maxDistance = 12000;
    const ambient = new THREE.HemisphereLight(0xe7edff, 0x22314c, 2.5);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xdbe9ff, 2.1);
    key.position.set(0, 700, 1000);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc0b4ff, 1.4);
    rim.position.set(-400, -100, -700);
    scene.add(rim);
    const root = new THREE.Group();
    scene.add(root);
    const meshes: any[] = [],
      fiberObjects: any[] = [],
      dots: any[] = [],
      labels: any[] = [];
    let stop = false,
      raf = 0,
      loadedCount = 0,
      lastFitDistance = 0;
    const abort = new AbortController();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = [0, 0];
    let highlight: THREE.LineSegments | null = null;
    const ancestry = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0x9ac6ff,
        size: 7,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    ancestry.renderOrder = 5;
    root.add(ancestry);
    api.current = {
      camera,
      controls,
      setAncestors: (positions: number[][]) => {
        ancestry.geometry.dispose();
        ancestry.geometry = new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions.flat(), 3),
        );
      },
      highlightBody: async (id: string) => {
        try {
          const res = await fetch('/api/morphology?id=' + encodeURIComponent(id), {
            signal: abort.signal,
          });
          if (!res.ok) throw Error('Morphology unavailable for this neuron.');
          const d = (await res.json()) as any;
          if (stop || state.current.selectedBody !== id) return;
          if (highlight) {
            root.remove(highlight);
            highlight.geometry.dispose();
            (highlight.material as any).dispose();
          }
          const geom = new THREE.BufferGeometry().setAttribute(
            'position',
            new THREE.Float32BufferAttribute(d.segments, 3),
          );
          highlight = new THREE.LineSegments(
            geom,
            new THREE.LineBasicMaterial({ color: 0xf0dcb7, transparent: true, opacity: 1 }),
          );
          highlight.userData.bodyId = id;
          root.add(highlight);
        } catch (e: any) {
          if (e.name !== 'AbortError') setError(e.message);
        }
      },
      fit: (scope: string, view: string, preserve = false) => {
        const direction = camera.position.clone().sub(controls.target),
          zoom = lastFitDistance ? direction.length() / lastFitDistance : 1;
        const chosenMesh = meshes.find((m) => m.userData.id === state.current.selectedRegion);
        const target = preserve
          ? controls.target.clone()
          : state.current.isolate && chosenMesh
            ? chosenMesh.userData.center.clone()
            : state.current.inventory
              ? new THREE.Vector3(385, -210, 185)
              : scope === 'cns'
                ? new THREE.Vector3(385, -470, 210)
                : new THREE.Vector3(385, -210, 185);
        controls.target.copy(target);
        const count = new Set(
          meshes
            .filter(
              (m) =>
                (scope === 'cns' || m.userData.group !== 3) &&
                (state.current.group < 0 || state.current.group === m.userData.group) &&
                !(state.current.hidden || []).includes(m.userData.id),
            )
            .map((m) => m.userData.id),
        ).size;
        const cols = Math.max(
            3,
            Math.round(Math.sqrt(Math.max(1, count) * Math.max(0.5, camera.aspect))),
          ),
          rows = Math.ceil(count / cols);
        const isolatedSize = chosenMesh?.userData.size || 300;
        const height = state.current.isolate
            ? isolatedSize
            : state.current.inventory
              ? rows * 140 + 150
              : scope === 'cns'
                ? 1000
                : 420,
          width = state.current.isolate
            ? isolatedSize
            : state.current.inventory
              ? cols * 150 + 100
              : 740;
        const framing = state.current.inventory || state.current.isolate ? 0.84 : 0.64;
        const distance =
          Math.max(height, width / camera.aspect) / (2 * Math.tan((16 * Math.PI) / 180) * framing);
        const offsets: any = {
          front: [0, 0, distance],
          side: [distance, 0, 0],
          top: [0, distance, 0],
        };
        camera.position
          .copy(target)
          .add(
            preserve
              ? direction.normalize().multiplyScalar(distance * zoom)
              : new THREE.Vector3(
                  ...((offsets[view] || offsets.front) as [number, number, number]),
                ),
          );
        lastFitDistance = distance;
        camera.up.set(0, 1, 0);
        controls.update();
      },
      reset: () => {},
    };
    const resize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / (state.current.comparison ? 2 : 1) / el.clientHeight;
      camera.updateProjectionMatrix();
      api.current?.fit(state.current.scope, state.current.view, true);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const load = async () => {
      try {
        const [regions, skels] = (await Promise.all([
          fetch('/malecns/meshes.json').then((r) => r.json()),
          fetch('/malecns/skeletons.json').then((r) => r.json()),
        ])) as any[];
        setTotal(regions.length);
        let index = 0;
        async function batch() {
          while (index < regions.length) {
            const region = regions[index++];
            for (const frag of region.fragments) {
              const buf = await fetch('/malecns/meshes/' + frag.file, {
                signal: abort.signal,
              }).then((r) => r.arrayBuffer());
              if (stop) return;
              const n = new DataView(buf).getUint32(0, true),
                verts = new Float32Array(buf, 4, n * 3),
                positions = new Float32Array(n * 3);
              for (let i = 0; i < n; i++) {
                positions[i * 3] = verts[i * 3] * 0.001;
                positions[i * 3 + 1] = -verts[i * 3 + 2] * 0.001;
                positions[i * 3 + 2] = verts[i * 3 + 1] * 0.001;
              }
              const indices = new Uint32Array(buf, 4 + n * 12);
              const geometry = new THREE.BufferGeometry().setAttribute(
                'position',
                new THREE.BufferAttribute(positions, 3),
              );
              geometry.setIndex(new THREE.BufferAttribute(indices, 1));
              geometry.computeVertexNormals();
              geometry.computeBoundingBox();
              const material = new THREE.MeshPhysicalMaterial({
                color:
                  region.group < 2
                    ? GROUP_COLORS[region.group]
                    : REGION_COLORS[Number(region.id.split('-')[1]) % REGION_COLORS.length],
                metalness: 0.24,
                roughness: 0.3,
                transparent: true,
                opacity: 0.38,
                side: THREE.DoubleSide,
                depthWrite: false,
                clearcoat: 0.3,
              });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.userData = {
                ...region,
                baseColor: material.color.clone(),
                center: geometry.boundingBox!.getCenter(new THREE.Vector3()),
              };
              root.add(mesh);
              meshes.push(mesh);
            }
            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = 256;
            labelCanvas.height = 48;
            const ctx = labelCanvas.getContext('2d');
            if (ctx) {
              ctx.font = '24px Arial';
              ctx.fillStyle = '#d8e3ed';
              ctx.textAlign = 'center';
              ctx.fillText(region.label, 128, 32);
              const texture = new THREE.CanvasTexture(labelCanvas);
              const label = new THREE.Sprite(
                new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
              );
              label.userData = region;
              label.scale.set(115, 22, 1);
              root.add(label);
              labels.push(label);
            }
            loadedCount++;
            setLoaded(loadedCount);
            ready.current(loadedCount);
          }
        }
        await Promise.all(Array.from({ length: 6 }, () => batch()));
        for (const region of regions) {
          const pieces = meshes.filter((m) => m.userData.id === region.id),
            bounds = new THREE.Box3();
          for (const piece of pieces) bounds.union(piece.geometry.boundingBox);
          const center = bounds.getCenter(new THREE.Vector3()),
            extent = bounds.getSize(new THREE.Vector3()),
            size = Math.max(extent.x, extent.y, extent.z);
          for (const piece of pieces) {
            piece.userData.center = center;
            piece.userData.size = size;
          }
        }
        api.current?.fit(state.current.scope, state.current.view);
        const somaBuffer = await fetch('/malecns/somas.bin', { signal: abort.signal }).then((r) =>
          r.arrayBuffer(),
        );
        if (stop) return;
        const raw = new Float32Array(somaBuffer);
        for (let g = 0; g < 4; g++) {
          const p = [];
          for (let i = 0; i < raw.length; i += 4)
            if (raw[i + 3] === g) p.push(raw[i], raw[i + 1], raw[i + 2]);
          const geom = new THREE.BufferGeometry().setAttribute(
            'position',
            new THREE.Float32BufferAttribute(p, 3),
          );
          const points = new THREE.Points(
            geom,
            new THREE.PointsMaterial({
              color: GROUP_COLORS[g],
              size: 1.4,
              sizeAttenuation: true,
              transparent: true,
              opacity: 0.3,
              depthWrite: false,
            }),
          );
          points.userData.group = g;
          root.add(points);
          dots.push(points);
        }
        let si = 0;
        async function fibers() {
          while (si < skels.length) {
            const sk = skels[si++];
            if (sk.error) continue;
            try {
              const b = await fetch('/malecns/skeletons/' + sk.bodyId + '.bin', {
                signal: abort.signal,
              }).then((r) => r.arrayBuffer());
              if (stop) return;
              const geo = new THREE.BufferGeometry().setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(b), 3),
              );
              const line = new THREE.LineSegments(
                geo,
                new THREE.LineBasicMaterial({
                  color: GROUP_COLORS[sk.group],
                  transparent: true,
                  opacity: 0.4,
                  depthWrite: false,
                }),
              );
              line.userData = sk;
              root.add(line);
              fiberObjects.push(line);
            } catch {}
          }
        }
        await Promise.all(Array.from({ length: 6 }, () => fibers()));
      } catch (e: any) {
        if (e.name !== 'AbortError') setError('Anatomy could not finish loading. Reload to retry.');
      }
    };
    load();
    const draw = () => {
      if (!el.clientWidth || !el.clientHeight) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const s = state.current;
      controls.enabled = s.interactive !== false;
      renderer.domElement.style.touchAction = controls.enabled ? 'none' : 'pan-y';
      clip.constant = s.inventory ? 20000 : s.scope === 'brain' ? 450 : 2000;
      cut.constant = cutawayPlaneConstant(s.slice);
      const visibleRegions = [
        ...new Set(
          meshes
            .filter(
              (m) =>
                (s.scope === 'cns' || m.userData.group !== 3) &&
                (s.group < 0 || m.userData.group === s.group) &&
                !(s.hidden || []).includes(m.userData.id),
            )
            .map((m) => m.userData.id),
        ),
      ].sort();
      const columns = Math.max(
          3,
          Math.round(Math.sqrt(visibleRegions.length * Math.max(0.5, camera.aspect))),
        ),
        rows = Math.ceil(visibleRegions.length / columns);
      for (const mesh of meshes) {
        const g = mesh.userData.group,
          selected = s.selectedRegion === mesh.userData.id;
        mesh.visible =
          s.surfaces &&
          s.opacity > 0 &&
          (s.scope === 'cns' || g !== 3) &&
          (s.group < 0 || g === s.group) &&
          !(s.hidden || []).includes(mesh.userData.id) &&
          (!s.isolate || selected);
        mesh.material.opacity = s.opacity / 100;
        mesh.material.emissive.set(selected ? 0x394a60 : 0x000000);
        const e = s.explode / 100;
        if (s.inventory) {
          const index = visibleRegions.indexOf(mesh.userData.id),
            center = mesh.userData.center,
            target = new THREE.Vector3(
              385 + ((index % columns) - (columns - 1) / 2) * 150,
              -210 + (Math.floor(index / columns) - (rows - 1) / 2) * 140,
              185,
            );
          const scale = 1 + e * (Math.min(1, 110 / (mesh.userData.size || 110)) - 1);
          mesh.scale.setScalar(scale);
          mesh.position
            .copy(target.clone().sub(center).multiplyScalar(e))
            .add(center.clone().multiplyScalar(1 - scale));
        } else {
          mesh.scale.setScalar(1);
          mesh.position.set(g === 0 ? -e * 160 : g === 1 ? e * 160 : 0, g === 3 ? -e * 160 : 0, 0);
        }
      }
      for (const label of labels) {
        const mesh = meshes.find((m) => m.userData.id === label.userData.id);
        label.visible = !!(mesh?.visible && s.inventory && s.explode > 65 && s.labels);
        if (mesh)
          label.position
            .copy(mesh.userData.center)
            .multiplyScalar(mesh.scale.x)
            .add(mesh.position)
            .add(new THREE.Vector3(0, -55, 0));
      }
      const neuralAlpha = neuralLayerAlpha(s.inventory, s.explode);
      for (const p of dots) {
        const g = p.userData.group;
        p.visible = neuralAlpha > 0 && neuralLayerVisible(s.somas, s.isolate, s.scope, s.group, g);
        p.material.opacity = 0.3 * neuralAlpha;
        p.position.set(0, 0, 0);
      }
      for (const f of fiberObjects) {
        const g = f.userData.group;
        f.visible = neuralAlpha > 0 && neuralLayerVisible(s.fibers, s.isolate, s.scope, s.group, g);
        f.material.opacity = 0.4 * neuralAlpha;
        f.position.set(0, 0, 0);
      }
      if (highlight) {
        highlight.visible = neuralAlpha > 0 && highlight.userData.bodyId === s.selectedBody;
        (highlight.material as THREE.LineBasicMaterial).opacity = neuralAlpha;
      }
      controls.update();
      if (el.clientWidth && el.clientHeight) {
        const w = el.clientWidth,
          h = el.clientHeight;
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, w, h);
        if (s.comparison) {
          const half = Math.floor(w / 2);
          renderer.clear();
          renderer.setScissorTest(true);
          ancestry.visible = false;
          renderer.setScissor(0, 0, half, h);
          renderer.setViewport(0, 0, half, h);
          renderer.render(scene, camera);
          ancestry.visible = !s.inventory;
          renderer.setScissor(half, 0, w - half, h);
          renderer.setViewport(half, 0, w - half, h);
          renderer.render(scene, camera);
          renderer.setScissorTest(false);
        } else {
          ancestry.visible = !s.inventory;
          renderer.render(scene, camera);
        }
        if (s.multi && !s.comparison) {
          const sw = Math.round(w * 0.26),
            sh = Math.round(h * 0.32),
            target = controls.target;
          for (const [j, cam] of [sideCamera, topCamera].entries()) {
            cam.left = -460;
            cam.right = 460;
            cam.top = (460 * sh) / sw;
            cam.bottom = (-460 * sh) / sw;
            cam.position
              .copy(target)
              .add(j === 0 ? new THREE.Vector3(1500, 0, 0) : new THREE.Vector3(0, 1500, 0));
            cam.up.set(0, 0, j === 0 ? 1 : -1);
            cam.lookAt(target);
            cam.updateProjectionMatrix();
            renderer.setScissorTest(true);
            renderer.setScissor(w - sw - 16, 16 + j * (sh + 12), sw, sh);
            renderer.setViewport(w - sw - 16, 16 + j * (sh + 12), sw, sh);
            renderer.setClearColor(0x000000, 1);
            renderer.clear();
            renderer.render(scene, cam);
          }
          renderer.setScissorTest(false);
          renderer.setClearColor(0x000000, 0);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const pd = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pu = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && state.current.interactive === false) return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const b = renderer.domElement.getBoundingClientRect();
      if (
        state.current.multi &&
        e.clientX - b.left > b.width * 0.74 - 16 &&
        e.clientY - b.top > b.height * 0.36 - 28
      )
        return;
      pointer.set(
        state.current.comparison
          ? (((e.clientX - b.left) % (b.width / 2)) / (b.width / 2)) * 2 - 1
          : ((e.clientX - b.left) / b.width) * 2 - 1,
        (-(e.clientY - b.top) / b.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes.filter((m) => m.visible))[0];
      if (hit) pick.current(hit.object.userData);
    };
    renderer.domElement.addEventListener('pointerdown', pd);
    renderer.domElement.addEventListener('pointerup', pu);
    return () => {
      stop = true;
      abort.abort();
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      root.traverse((o: any) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        if (Array.isArray(o.material)) {
          o.material.forEach((m: THREE.Material) => m.dispose());
        } else {
          o.material?.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    const el = container.current;
    if (el && api.current) {
      api.current.camera.aspect = el.clientWidth / (settings.comparison ? 2 : 1) / el.clientHeight;
      api.current.camera.updateProjectionMatrix();
      api.current.fit(settings.scope, settings.view, true);
    }
  }, [settings.comparison]);
  useEffect(() => {
    api.current?.setAncestors(settings.ancestors || []);
  }, [settings.ancestors]);
  useEffect(() => {
    api.current?.fit(settings.scope, settings.view);
  }, [
    settings.scope,
    settings.view,
    settings.inventory,
    settings.group,
    settings.hidden,
    settings.isolate,
  ]);
  useEffect(() => {
    if (settings.selectedBody) api.current?.highlightBody(settings.selectedBody);
  }, [settings.selectedBody]);
  return (
    <div
      className="atlas-canvas"
      ref={container}
      aria-label={
        fallback
          ? 'MaleCNS source-position atlas'
          : 'Three-dimensional anatomical MaleCNS atlas with original neuropil surfaces and neuron skeletons'
      }
    >
      {fallback && <AtlasFallback settings={settings} />}{' '}
      {!fallback && !error && loaded < total && (
        <div className="atlas-loading">
          <span className="loading-ring" />
          Loading anatomical regions{' '}
          <b>
            {loaded}/{total}
          </b>
        </div>
      )}
      {error && (
        <div className="atlas-error" role="alert">
          {error}
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
