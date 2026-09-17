import * as THREE from 'three';
import { cellColor, normalizedClass } from './atlas-appearance';
import { decodeMorphology, parseMorphologyManifest, type MorphologyCell } from './atlas-morphology';
import { createTubeChunk, type TubeMesh } from './atlas-tubes';
import { neuralLayerAlpha, neuralLayerVisible } from './atlas-render-state';
import type { AtlasSettings } from './atlas-view';

export type MorphologyProgress = { loaded: number; total: number; failed: number; done: boolean };

export class MorphologyLayer {
  private readonly meshes: TubeMesh[] = [];
  private readonly pickScene = new THREE.Scene();
  private readonly pickTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  private readonly occluderMaterial = new THREE.MeshBasicMaterial({
    color: 0,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private readonly pixels = new Uint8Array(4);
  private readonly identities = new Map<string, number>();
  private readonly cells = new Map<number, MorphologyCell>();
  private readonly loadedIds = new Set<string>();
  private disposed = false;
  private hoverId = 0;

  constructor(private readonly root: THREE.Group) {}

  async load(signal: AbortSignal, progress: (value: MorphologyProgress) => void) {
    const response = await fetch('/malecns/atlas-v1/manifest.json', { signal });
    if (!response.ok) throw Error('Detailed morphology manifest unavailable');
    const manifest = parseMorphologyManifest(await response.json());
    if (signal.aborted || this.disposed) return;
    let identity = 1;
    const starts = manifest.chunks.map((chunk) => {
      const first = identity;
      for (const cell of chunk.cells) {
        this.identities.set(cell.bodyId, identity);
        this.cells.set(identity++, cell);
      }
      return first;
    });
    let next = 0,
      loaded = 0,
      failed = 0;
    progress({ loaded, total: manifest.neuronCount, failed, done: false });
    const worker = async () => {
      while (next < manifest.chunks.length && !signal.aborted && !this.disposed) {
        const index = next++,
          chunk = manifest.chunks[index];
        try {
          const res = await fetch('/malecns/atlas-v1/' + chunk.file, { signal });
          if (!res.ok) throw Error('Geometry unavailable');
          const data = await decodeMorphology(await res.arrayBuffer(), chunk);
          if (signal.aborted || this.disposed) return;
          const mesh = createTubeChunk(chunk, data, starts[index]);
          this.meshes.push(mesh);
          this.root.add(mesh);
          const proxy = new THREE.Mesh(mesh.geometry, mesh.material);
          proxy.frustumCulled = false;
          this.pickScene.add(proxy);
          for (const cell of chunk.cells) this.loadedIds.add(cell.bodyId);
          loaded += chunk.cells.length;
        } catch (error) {
          if (signal.aborted || this.disposed) return;
          failed += chunk.cells.length;
          console.warn('Atlas morphology chunk unavailable:', chunk.file, error);
        }
        progress({ loaded, total: manifest.neuronCount, failed, done: false });
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    if (!signal.aborted && !this.disposed) {
      progress({ loaded, total: manifest.neuronCount, failed, done: true });
      if (!loaded) throw Error('Detailed morphology unavailable');
    }
  }

  has(bodyId: string) {
    return this.loadedIds.has(bodyId);
  }
  cell(bodyId: string) {
    return this.cells.get(this.identities.get(bodyId) ?? 0);
  }
  setHover(bodyId?: string) {
    this.hoverId = bodyId ? (this.identities.get(bodyId) ?? 0) : 0;
  }

  update(settings: AtlasSettings, focusDistance = 1200, membraneBody = '') {
    const alpha = neuralLayerAlpha(settings.inventory, settings.explode);
    for (const [index, mesh] of this.meshes.entries()) {
      mesh.visible =
        !(settings.isolateNeuron && !this.has(settings.selectedBody ?? '')) &&
        (!settings.isolateNeuron ||
          (mesh.userData.cells as MorphologyCell[]).some(
            (cell) => cell.bodyId === settings.selectedBody,
          )) &&
        (!settings.focusType ||
          (mesh.userData.cells as MorphologyCell[]).some(
            (cell) => cell.type === settings.focusType,
          )) &&
        alpha > 0 &&
        neuralLayerVisible(
          settings.fibers,
          settings.isolate,
          settings.scope,
          settings.group,
          mesh.userData.group,
        );
      const appearanceKey = JSON.stringify([
        settings.colorMode,
        settings.theme,
        settings.hiddenClasses,
        settings.focusType,
      ]);
      if (mesh.userData.appearanceKey !== appearanceKey) {
        const colors = mesh.geometry.getAttribute('cellColor') as THREE.InstancedBufferAttribute;
        const visible = mesh.geometry.getAttribute('cellVisible') as THREE.InstancedBufferAttribute;
        for (const cell of mesh.userData.cells as MorphologyCell[]) {
          const color = new THREE.Color(
            cellColor(cell, settings.colorMode ?? 'class', settings.theme ?? 'dark'),
          );
          const show =
            !settings.hiddenClasses?.includes(normalizedClass(cell.cellClass)) &&
            (!settings.focusType || cell.type === settings.focusType);
          for (let j = cell.offset; j < cell.offset + cell.segments; j++) {
            colors.setXYZ(j, color.r, color.g, color.b);
            visible.setX(j, show ? 1 : 0);
          }
        }
        colors.needsUpdate = visible.needsUpdate = true;
        mesh.userData.appearanceKey = appearanceKey;
      }
      mesh.material.uniforms.replacedId.value = this.identities.get(membraneBody) ?? 0;
      mesh.material.uniforms.focusDistance.value = focusDistance;
      mesh.material.uniforms.lightTheme.value = settings.theme === 'light';
      mesh.material.uniforms.depthCue.value = settings.depthCue !== false;
      mesh.material.uniforms.contextBrightness.value = settings.contextBrightness ?? 0.12;
      mesh.material.uniforms.fade.value = alpha;
      mesh.material.uniforms.selectedId.value = settings.focusType
        ? 0
        : (this.identities.get(settings.selectedBody ?? '') ?? 0);
      mesh.material.uniforms.hoveredId.value = this.hoverId;
      mesh.material.uniforms.isolateSelected.value = !!settings.isolateNeuron;
      mesh.material.uniforms.radiusScale.value = settings.branchScale ?? 1;
      this.pickScene.children[index].visible = mesh.visible;
    }
  }

  pick(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    if (this.disposed || !this.meshes.length) return undefined;
    const target = renderer.getRenderTarget();
    const oldViewport = renderer.getViewport(new THREE.Vector4());
    const oldScissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const occluders: THREE.Mesh[] = [];
    for (const object of this.root.children) {
      if (
        object instanceof THREE.Mesh &&
        object.visible &&
        object.material instanceof THREE.MeshPhysicalMaterial &&
        object.material.opacity >= 0.95
      ) {
        const identity = this.identities.get(object.userData.bodyId) ?? 0;
        const material = identity
          ? new THREE.MeshBasicMaterial({
              color: new THREE.Color(
                (identity & 255) / 255,
                ((identity >> 8) & 255) / 255,
                ((identity >> 16) & 255) / 255,
              ),
              side: THREE.DoubleSide,
              toneMapped: false,
            })
          : this.occluderMaterial;
        const occluder = new THREE.Mesh(object.geometry, material);
        occluder.matrixAutoUpdate = false;
        occluder.matrix.copy(object.matrixWorld);
        this.pickScene.add(occluder);
        occluders.push(occluder);
      }
    }
    try {
      camera.setViewOffset(width, height, x, y, 1, 1);
      for (const mesh of this.meshes) mesh.material.uniforms.picking.value = true;
      renderer.setScissorTest(false);
      renderer.setRenderTarget(this.pickTarget);
      renderer.setClearColor(0, 0);
      renderer.clear();
      renderer.render(this.pickScene, camera);
      renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pixels);
      return this.cells.get(this.pixels[0] + this.pixels[1] * 256 + this.pixels[2] * 65536);
    } finally {
      this.pickScene.remove(...occluders);
      for (const occluder of occluders)
        if (occluder.material !== this.occluderMaterial)
          (occluder.material as THREE.Material).dispose();
      camera.clearViewOffset();
      for (const mesh of this.meshes) mesh.material.uniforms.picking.value = false;
      renderer.setRenderTarget(target);
      renderer.setViewport(oldViewport);
      renderer.setScissor(oldScissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  dispose() {
    this.disposed = true;
    for (const mesh of this.meshes) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes.length = 0;
    this.pickScene.clear();
    this.pickTarget.dispose();
    this.occluderMaterial.dispose();
    this.cells.clear();
    this.identities.clear();
    this.loadedIds.clear();
  }
}
