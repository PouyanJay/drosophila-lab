import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Depth-derived AO respects custom tube geometry without a second mesh pass. */
export class AtlasEffects {
  private readonly color = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
  });
  private readonly shaded = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });
  private readonly ao: GTAOPass;
  private readonly output = new OutputPass();
  private width = 0;
  private height = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.color.samples = Math.min(4, renderer.capabilities.maxSamples);
    // Allocate the library's normal target before switching to external depth.
    this.ao = new GTAOPass(scene, camera, 1, 1);
    this.ao.setGBuffer(this.color.depthTexture!);
    this.ao.blendIntensity = 0.75;
    this.ao.updateGtaoMaterial({
      radius: 5,
      samples: 8,
      thickness: 2,
      distanceFallOff: 1,
      scale: 1,
      screenSpaceRadius: false,
    });
    this.ao.updatePdMaterial({ radius: 3, samples: 8, rings: 2 });
    this.output.renderToScreen = true;
  }

  render(x: number, y: number, width: number, height: number, occlusion: boolean) {
    const ratio = Math.min(this.renderer.getPixelRatio(), 1.5);
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.color.setSize(w, h);
      this.shaded.setSize(w, h);
      this.ao.setSize(w, h);
    }
    this.renderer.setScissorTest(false);
    this.renderer.setRenderTarget(this.color);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (occlusion) this.ao.render(this.renderer, this.shaded, this.color, 0, false);
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setScissorTest(true);
    this.output.render(this.renderer, this.color, occlusion ? this.shaded : this.color, 0, false);
    this.renderer.setScissorTest(false);
  }

  dispose() {
    this.ao.dispose();
    // These library materials are not released by GTAOPass.dispose in r185.
    this.ao.gtaoMaterial.dispose();
    this.ao.blendMaterial.dispose();
    this.color.dispose();
    this.shaded.dispose();
    this.output.dispose();
  }
}
