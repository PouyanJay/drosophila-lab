import * as THREE from 'three';
import type { MorphologyChunk } from './atlas-morphology';

// Original capsule-impostor implementation: four vertices per source segment.
// The fragment shader reconstructs a rounded surface and its depth; SWC radii
// are estimates, with a small explicit display floor for subpixel readability.
const vertexShader = /* glsl */ `
attribute vec4 branchStart;
attribute vec4 branchEnd;
attribute float cellId;
attribute vec3 cellColor;
uniform float radiusScale;
varying vec2 capsule;
varying float branchLength;
varying float branchRadius;
varying vec3 viewPosition;
varying vec3 lateral;
varying vec3 longitudinal;
varying vec3 tint;
varying float identity;
#include <clipping_planes_pars_vertex>
void main() {
  vec3 a = (modelViewMatrix * vec4(branchStart.xyz, 1.0)).xyz;
  vec3 b = (modelViewMatrix * vec4(branchEnd.xyz, 1.0)).xyz;
  vec3 axis = b - a;
  float len = max(length(axis), 0.0001);
  vec3 direction = axis / len;
  vec3 towardCamera = normalize(-(a + b) * 0.5);
  vec3 across = cross(direction, towardCamera);
  if (length(across) < 0.001) across = cross(direction, vec3(0.0, 1.0, 0.0));
  if (length(across) < 0.001) across = vec3(1.0, 0.0, 0.0);
  across = normalize(across);
  float t = position.y;
  float radius = max(0.12, mix(branchStart.w, branchEnd.w, t)) * radiusScale;
  float along = mix(-radius, len + radius, t);
  vec3 p = a + direction * along + across * position.x * radius;
  // An end-on segment still has a circular cap. Its axis alone cannot span
  // a screen quad, so cover the nearer endpoint with a facing sphere.
  float projectedLength = length(axis - towardCamera * dot(axis, towardCamera));
  float capRadius = max(0.12, max(branchStart.w, branchEnd.w)) * radiusScale;
  if (projectedLength < capRadius * 0.5) {
    vec3 up = normalize(cross(towardCamera, across));
    vec3 nearEnd = a.z > b.z ? a : b;
    radius = capRadius;
    along = (t * 2.0 - 1.0) * radius;
    p = nearEnd + across * position.x * radius + up * along;
    direction = up;
    len = 0.0;
  }
  capsule = vec2(position.x, along);
  branchLength = len;
  branchRadius = radius;
  viewPosition = p;
  lateral = across;
  longitudinal = direction;
  tint = cellColor;
  identity = cellId;
  vec4 mvPosition = vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const fragmentShader = /* glsl */ `
uniform float selectedId;
uniform float hoveredId;
uniform float fade;
uniform bool picking;
uniform bool isolateSelected;
uniform mat4 projectionMatrix;
varying vec2 capsule;
varying float branchLength;
varying float branchRadius;
varying vec3 viewPosition;
varying vec3 lateral;
varying vec3 longitudinal;
varying vec3 tint;
varying float identity;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  if (fade <= 0.0) discard;
  if (isolateSelected && selectedId > 0.0 && abs(identity - selectedId) > 0.5) discard;
  // Ordered coverage keeps depth meaningful while inventory fades the anatomy.
  if (fract(dot(floor(gl_FragCoord.xy), vec2(0.75487766, 0.56984029))) > fade) discard;
  float beyond = capsule.y < 0.0 ? capsule.y : max(0.0, capsule.y - branchLength);
  float cap = beyond / max(branchRadius, 0.0001);
  float rr = capsule.x * capsule.x + cap * cap;
  if (rr > 1.0) discard;
  float bulge = sqrt(max(0.0, 1.0 - rr));
  vec3 eye = normalize(-viewPosition);
  vec3 normal = normalize(lateral * capsule.x + longitudinal * cap + eye * bulge);
  vec3 surface = viewPosition + eye * bulge * branchRadius;
  vec4 projected = projectionMatrix * vec4(surface, 1.0);
  gl_FragDepth = projected.z / projected.w * 0.5 + 0.5;
  if (picking) {
    float id = floor(identity + 0.5);
    gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    return;
  }
  float key = max(0.0, dot(normal, normalize(vec3(-0.45, 0.65, 1.0))));
  float fill = max(0.0, dot(normal, normalize(vec3(0.8, -0.2, 0.5))));
  float edge = pow(1.0 - max(0.0, dot(normal, eye)), 2.0);
  bool selected = abs(identity - selectedId) < 0.5;
  bool hovered = abs(identity - hoveredId) < 0.5;
  vec3 albedo = (selected || hovered) ? mix(tint, vec3(1.0, 0.65, 0.23), selected ? 0.65 : 0.3) : tint;
  vec3 color = albedo * (0.14 + 0.8 * key + 0.18 * fill) + vec3(0.07, 0.1, 0.15) * edge;
  if (selectedId > 0.0 && !selected) color *= 0.20;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const groupColors = ['#67bce5', '#9b91f5', '#dfb37f', '#84c9b5'];
export type TubeMesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

export function createTubeChunk(
  chunk: MorphologyChunk,
  data: Float32Array,
  firstId: number,
): TubeMesh {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const interleaved = new THREE.InstancedInterleavedBuffer(data, 8);
  geometry.setAttribute('branchStart', new THREE.InterleavedBufferAttribute(interleaved, 4, 0));
  geometry.setAttribute('branchEnd', new THREE.InterleavedBufferAttribute(interleaved, 4, 4));
  const ids = new Float32Array(chunk.segments);
  const colors = new Float32Array(chunk.segments * 3);
  const bounds = new THREE.Box3();
  for (const [i, cell] of chunk.cells.entries()) {
    ids.fill(firstId + i, cell.offset, cell.offset + cell.segments);
    const color = new THREE.Color(groupColors[cell.group]);
    const variation = (Number(cell.bodyId) * 0.61803398875) % 1;
    color.offsetHSL((variation - 0.5) * 0.12, -0.04, (variation - 0.5) * 0.18);
    for (let j = cell.offset; j < cell.offset + cell.segments; j++) color.toArray(colors, j * 3);
    bounds.expandByPoint(new THREE.Vector3(...cell.bounds[0]));
    bounds.expandByPoint(new THREE.Vector3(...cell.bounds[1]));
  }
  geometry.setAttribute('cellId', new THREE.InstancedBufferAttribute(ids, 1));
  geometry.setAttribute('cellColor', new THREE.InstancedBufferAttribute(colors, 3));
  geometry.instanceCount = chunk.segments;
  // Source bounds exclude the display radius, so avoid incorrect edge culling.
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    clipping: true,
    side: THREE.DoubleSide,
    uniforms: {
      selectedId: { value: 0 },
      hoveredId: { value: 0 },
      fade: { value: 1 },
      picking: { value: false },
      isolateSelected: { value: false },
      radiusScale: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData = { group: chunk.group, bounds };
  return mesh;
}
