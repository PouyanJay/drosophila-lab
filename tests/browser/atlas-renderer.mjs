// Optional real-WebGL regression check. See docs/design/atlas-visual-quality.md.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const data = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, -20, 1]).buffer);
const zipped = zlib.gzipSync(data);
const chunk = {
  file: 'group-2-0-000000000000.bin.gz',
  group: 2,
  segments: 1,
  decodedByteLength: 32,
  sha256: crypto.createHash('sha256').update(zipped).digest('hex'),
  cells: [
    {
      bodyId: '123',
      type: 'Fixture',
      group: 2,
      offset: 0,
      segments: 1,
      bounds: [
        [0, 0, -20],
        [0, 0, 0],
      ],
    },
  ],
};
const html = `<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","zod":"/node_modules/zod/index.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';import {AtlasEffects} from '/src/features/atlas/atlas-effects.ts';import {createTubeChunk} from '/src/features/atlas/atlas-tubes.ts';import {MorphologyLayer} from '/src/features/atlas/atlas-morphology-layer.ts';
try {
const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(160,160);document.body.appendChild(renderer.domElement);const scene=new THREE.Scene();const root=new THREE.Group();scene.add(root);const camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,0,20);camera.lookAt(0,0,-10);camera.updateMatrixWorld();const layer=new MorphologyLayer(root);await layer.load(new AbortController().signal,()=>{});layer.update({fibers:true,scope:'cns',group:-1,explode:0});renderer.render(scene,camera);
const front=layer.pick(renderer,camera,80,80,160,160)?.bodyId;
const sidePixel=layer.pick(renderer,camera,85,80,160,160)?.bodyId;
if(front!=='123'||sidePixel!=='123')throw Error('End-on cap missing: '+front+'/'+sidePixel);
camera.position.set(20,0,-10);camera.lookAt(0,0,-10);camera.updateMatrixWorld();renderer.render(scene,camera);if(layer.pick(renderer,camera,80,80,160,160)?.bodyId!=='123')throw Error('Side picking failed');
camera.position.set(0,0,20);camera.lookAt(0,0,-10);camera.updateMatrixWorld();const blocker=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshPhysicalMaterial({color:'white',opacity:1}));blocker.position.z=3;root.add(blocker);renderer.render(scene,camera);if(layer.pick(renderer,camera,80,80,160,160))throw Error('Picked hidden neuron through opaque surface');blocker.visible=false;renderer.render(scene,camera);if(layer.pick(renderer,camera,80,80,160,160)?.bodyId!=='123')throw Error('Hidden surface still blocks selection');
layer.dispose();root.remove(blocker);blocker.geometry.dispose();blocker.material.dispose();
const tapered=createTubeChunk(${JSON.stringify(chunk)},new Float32Array([0,0,0,1,1,0,-20,4]),1);scene.add(tapered);const target=new THREE.WebGLRenderTarget(160,160);renderer.setRenderTarget(target);renderer.render(scene,camera);const left=new Uint8Array(4),right=new Uint8Array(4);renderer.readRenderTargetPixels(target,65,80,1,1,left);renderer.readRenderTargetPixels(target,95,80,1,1,right);if(left[0]+left[1]+left[2]===0||right[0]+right[1]+right[2]===0)throw Error('Tapered end-on cap lost half its coverage');scene.remove(tapered);tapered.geometry.dispose();tapered.material.dispose();target.dispose();renderer.setRenderTarget(null);
const ball=new THREE.Mesh(new THREE.SphereGeometry(5,16,16),new THREE.MeshBasicMaterial({color:0xff0000}));ball.position.z=-10;scene.add(ball);camera.aspect=.5;camera.updateProjectionMatrix();const effects=new AtlasEffects(renderer,scene,camera);effects.render(0,0,80,160,true);ball.material.color.set(0x0000ff);effects.render(80,0,80,160,true);const gl=renderer.getContext();gl.readPixels(40,80,1,1,gl.RGBA,gl.UNSIGNED_BYTE,left);gl.readPixels(120,80,1,1,gl.RGBA,gl.UNSIGNED_BYTE,right);if(left[0]<=left[2]||right[2]<=right[0])throw Error('Comparison viewport output overwritten or misplaced: '+left+'/'+right);effects.dispose();scene.remove(ball);ball.geometry.dispose();ball.material.dispose();renderer.dispose();window.result='PASS: end-on and tapered cap area, side selection, opaque surface occlusion, hidden surface restoration, comparison viewports, disposal';
}catch(e){window.result='FAIL: '+e.stack}
</script>`;
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
      return;
    }
    if (url.pathname.endsWith('/manifest.json')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          schema: 'malecns-atlas/1',
          neuronCount: 1,
          segmentCount: 1,
          chunks: [chunk],
        }),
      );
      return;
    }
    if (url.pathname.endsWith('.bin.gz')) {
      res.end(zipped);
      return;
    }
    if (
      !['/src/features/atlas/', '/node_modules/three/', '/node_modules/zod/'].some((prefix) =>
        url.pathname.startsWith(prefix),
      )
    )
      throw Error('Asset outside fixture allowlist');
    let file = path.join(process.cwd(), url.pathname);
    if (!path.extname(file)) file += '.ts';
    if (!file.startsWith(process.cwd() + path.sep)) throw Error('Invalid path');
    let code = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.ts'))
      code = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText;
    res.setHeader('Content-Type', 'text/javascript');
    res.end(code);
  } catch (e) {
    res.statusCode = 404;
    res.end(String(e));
  }
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({
    args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
  });
  try {
    const p = await b.newPage();
    p.on('console', (m) => {
      if (m.type() === 'error') console.log(m.text());
    });
    await p.goto('http://127.0.0.1:' + server.address().port);
    await p.waitForFunction(() => window.result, {}, { timeout: 30000 });
    const result = await p.evaluate(() => window.result);
    console.log(result);
    if (!result.startsWith('PASS')) process.exitCode = 1;
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
