// The laser pointer: a tiny over-bright dot that sits on whatever surface you point at (floor,
// rug, sofa, wall), a soft glow and a faint red spill of light around it, a hand tremor, and
// a thin beam that shows up in dim rooms.
import * as THREE from 'three';
import { glowSprite } from './textures.js';

export const LASER_COLORS = { red: 0xff2020, green: 0x30ff40, violet: 0x9a40ff };

export function createLaser(scene) {
  const g = new THREE.Group(); scene.add(g);
  const color = new THREE.Color(LASER_COLORS.red);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.009, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.02, 24), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(6), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: color.clone().multiplyScalar(2.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6, toneMapped: false }));
  glow.scale.setScalar(0.12);
  const spill = new THREE.PointLight(color, 0.12, 0.7, 2);
  g.add(halo, core, glow, spill);
  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.frustumCulled = false; scene.add(beam);
  for (const o of [core, halo, glow, beam]) { o.userData.laser = false; o.userData.noAO = true; }

  const L = {
    on: true, pos: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 1, 0), steady: 0.5,
    setColor(name) {
      color.setHex(LASER_COLORS[name] || LASER_COLORS.red);
      halo.material.color.copy(color).multiplyScalar(6); glow.material.color.copy(color).multiplyScalar(2.5);
      spill.color.copy(color); beam.material.color.copy(color);
    },
    // hit: {point, normal} on a surface; origin: where the pointer is held; dim: 0..1 how dark the room is
    update(dt, t, hit, origin, dim) {
      if (hit) { L.pos.copy(hit.point); L.normal.copy(hit.normal); }
      // hand tremor: two slow sines and a little noise, smaller with a steadier hand
      const a = (1 - L.steady) * 0.012 + 0.0015;
      const jx = a * (Math.sin(t * 6.3) * 0.6 + Math.sin(t * 17.1) * 0.3 + (Math.random() - 0.5) * 0.25);
      const jz = a * (Math.cos(t * 5.1) * 0.6 + Math.sin(t * 13.7 + 1) * 0.3 + (Math.random() - 0.5) * 0.25);
      const tangent = new THREE.Vector3().crossVectors(L.normal, Math.abs(L.normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const bit = new THREE.Vector3().crossVectors(L.normal, tangent);
      g.position.copy(L.pos).addScaledVector(L.normal, 0.003).addScaledVector(tangent, jx).addScaledVector(bit, jz);
      g.lookAt(g.position.clone().add(L.normal));
      glow.position.set(0, 0, 0.01);
      spill.position.set(0, 0, 0.05);
      const flick = 0.92 + 0.08 * Math.sin(t * 60);
      g.visible = L.on;
      glow.material.opacity = 0.45 + 0.25 * flick;
      beam.visible = L.on && dim > 0.35 && !!origin;
      if (beam.visible) {
        const p = beamGeo.attributes.position;
        p.setXYZ(0, origin.x, origin.y, origin.z); p.setXYZ(1, g.position.x, g.position.y, g.position.z); p.needsUpdate = true;
        beam.material.opacity = 0.03 + 0.06 * (dim - 0.35);
      }
    },
    get worldPos() { return g.position; },
  };
  return L;
}
