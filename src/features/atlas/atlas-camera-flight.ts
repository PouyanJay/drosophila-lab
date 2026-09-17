import * as THREE from 'three';

/** Duration-based orbit flight: interpolate direction around the subject, not through it. */
export class AtlasCameraFlight {
  private startTime = 0;
  private readonly fromTarget = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly fromDirection = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private fromDistance = 1;
  private toDistance = 1;
  private duration = 1100;
  active = false;

  start(
    position: THREE.Vector3,
    target: THREE.Vector3,
    endPosition: THREE.Vector3,
    endTarget: THREE.Vector3,
    now: number,
  ) {
    this.fromTarget.copy(target);
    this.toTarget.copy(endTarget);
    this.fromDirection.copy(position).sub(target);
    this.fromDistance = this.fromDirection.length();
    this.toDistance = endPosition.distanceTo(endTarget);
    this.fromDirection.normalize();
    this.rotation.setFromUnitVectors(
      this.fromDirection,
      endPosition.clone().sub(endTarget).normalize(),
    );
    this.startTime = now;
    this.active = true;
  }

  update(now: number, position: THREE.Vector3, target: THREE.Vector3, immediate = false) {
    if (!this.active) return;
    const t = immediate ? 1 : THREE.MathUtils.clamp((now - this.startTime) / this.duration, 0, 1);
    const eased = t * t * t * (t * (t * 6 - 15) + 10);
    target.lerpVectors(this.fromTarget, this.toTarget, eased);
    position
      .copy(this.fromDirection)
      .applyQuaternion(new THREE.Quaternion().slerp(this.rotation, eased))
      .multiplyScalar(THREE.MathUtils.lerp(this.fromDistance, this.toDistance, eased))
      .add(target);
    if (t === 1) this.active = false;
  }

  cancel() {
    this.active = false;
  }
}
