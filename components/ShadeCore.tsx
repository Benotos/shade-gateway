'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// The SHADE mark in 3D: a black glass core inside the two crossed orbit rings.
// Glowing particles (requests) stream in from the dark and vanish into the core.
// Follows the pointer on desktop and the scroll on mobile. Static frame when reduced motion is on.

const BG = 0x07110d;
const MINT = new THREE.Color('#b8e4c9');
const MINT_HOT = new THREE.Color('#d9fbe5');
const DEEP = new THREE.Color('#153e2f');

const pointVert = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  uniform float uPixel;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixel * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const pointFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha);
  }
`;

const coreVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
    vP = position;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const coreFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uRim;
  uniform vec3 uDeep;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  // cheap swirl so the core reads as liquid glass, not a flat ball
  float bands(vec3 p) {
    float a = atan(p.z, p.x) + uTime * 0.25 + p.y * 2.2;
    return 0.5 + 0.5 * sin(a * 3.0 + sin(p.y * 4.0 - uTime * 0.6) * 1.5);
  }
  void main() {
    float f = pow(1.0 - max(dot(vN, vV), 0.0), 4.0);
    float b = bands(normalize(vP));
    vec3 col = mix(vec3(0.0), uDeep * 0.9, b * 0.55);
    col += uRim * f * 0.75;
    col += uRim * pow(f, 10.0) * 0.9;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function pointsMaterial(color: THREE.Color, pixel: number) {
  return new THREE.ShaderMaterial({
    vertexShader: pointVert,
    fragmentShader: pointFrag,
    uniforms: { uColor: { value: color }, uPixel: { value: pixel } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function ShadeCore({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!webglAvailable()) { setFallback(true); return; }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(BG, 1);
    renderer.toneMapping = THREE.NoToneMapping;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG, 0.06);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 8.2);

    const world = new THREE.Group();
    scene.add(world);

    // Core
    const coreMat = new THREE.ShaderMaterial({
      vertexShader: coreVert, fragmentShader: coreFrag,
      uniforms: { uTime: { value: 0 }, uRim: { value: MINT.clone() }, uDeep: { value: DEEP.clone() } },
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), coreMat);
    world.add(core);

    // Rings: the two crossed ellipses of the logo, given depth
    const ringR = 2.35;
    const rings: { pivot: THREE.Group; orbit: THREE.Points; speed: number }[] = [];
    [38, -38].forEach((deg, i) => {
      const pivot = new THREE.Group();
      // tilt each ring away from the viewer, then roll it ±38° like the two ellipses in the logo
      pivot.rotation.order = 'ZYX';
      pivot.rotation.set(THREE.MathUtils.degToRad(68), 0, THREE.MathUtils.degToRad(deg));
      world.add(pivot);

      const line = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, 0.012, 12, 320),
        new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.7 }),
      );
      pivot.add(line);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, 0.06, 12, 320),
        new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      pivot.add(halo);

      // Particles riding the ring
      const n = 140;
      const pos = new Float32Array(n * 3), alpha = new Float32Array(n), size = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2 + Math.random() * 0.04;
        const r = ringR + (Math.random() - 0.5) * 0.08;
        pos[k * 3] = Math.cos(t) * r; pos[k * 3 + 1] = Math.sin(t) * r; pos[k * 3 + 2] = (Math.random() - 0.5) * 0.06;
        const lead = Math.pow(((k / n) * 3) % 1, 3); // three bright comets per ring with fading tails
        alpha[k] = 0.15 + lead * 0.85;
        size[k] = 1.2 + lead * 3.2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      const orbit = new THREE.Points(g, pointsMaterial(MINT_HOT, dpr));
      pivot.add(orbit);
      rings.push({ pivot, orbit, speed: i === 0 ? 0.32 : -0.26 });
    });

    // Incoming requests: drift in from the dark, spiral, vanish into the core
    const inN = coarse ? 70 : 130;
    const inPos = new Float32Array(inN * 3), inAlpha = new Float32Array(inN), inSize = new Float32Array(inN);
    const start: THREE.Vector3[] = [], prog = new Float32Array(inN), spd = new Float32Array(inN), twist = new Float32Array(inN);
    const spawn = (i: number, initial = false) => {
      const dir = new THREE.Vector3().randomDirection();
      start[i] = dir.multiplyScalar(5.5 + Math.random() * 3.5);
      prog[i] = initial ? Math.random() : 0;
      spd[i] = 0.07 + Math.random() * 0.09;
      twist[i] = (Math.random() - 0.5) * 2.4;
      inSize[i] = 2.2 + Math.random() * 3.2;
    };
    for (let i = 0; i < inN; i++) spawn(i, true);
    const inGeo = new THREE.BufferGeometry();
    inGeo.setAttribute('position', new THREE.BufferAttribute(inPos, 3));
    inGeo.setAttribute('aAlpha', new THREE.BufferAttribute(inAlpha, 1));
    inGeo.setAttribute('aSize', new THREE.BufferAttribute(inSize, 1));
    const incoming = new THREE.Points(inGeo, pointsMaterial(MINT, dpr));
    world.add(incoming);
    const tmp = new THREE.Vector3(), axisY = new THREE.Vector3(0, 1, 0);
    const updateIncoming = (dt: number) => {
      for (let i = 0; i < inN; i++) {
        prog[i] += spd[i] * dt;
        if (prog[i] >= 1) spawn(i);
        const p = prog[i];
        const e = 1 - Math.pow(1 - p, 2.2);
        tmp.copy(start[i]).multiplyScalar(1 - e);
        tmp.applyAxisAngle(axisY, twist[i] * e);
        const r = tmp.length();
        inPos[i * 3] = tmp.x; inPos[i * 3 + 1] = tmp.y; inPos[i * 3 + 2] = tmp.z;
        const fadeIn = Math.min(p * 5, 1);
        const swallow = THREE.MathUtils.smoothstep(r, 1.0, 1.9);
        inAlpha[i] = fadeIn * swallow;
      }
      inGeo.attributes.position.needsUpdate = true;
      inGeo.attributes.aAlpha.needsUpdate = true;
    };
    updateIncoming(0);

    // Far dust for depth
    const dustN = 380;
    const dPos = new Float32Array(dustN * 3), dAlpha = new Float32Array(dustN), dSize = new Float32Array(dustN);
    for (let i = 0; i < dustN; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(7 + Math.random() * 12);
      dPos.set([v.x, v.y, v.z - 4], i * 3);
      dAlpha[i] = 0.1 + Math.random() * 0.35; dSize[i] = 0.8 + Math.random() * 1.2;
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dAlpha, 1));
    dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    const dust = new THREE.Points(dGeo, pointsMaterial(MINT, dpr));
    scene.add(dust);

    // Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.42);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      // keep the whole object in frame on narrow screens
      camera.position.z = w / h < 0.9 ? 9.6 : 8.2;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Input
    const target = { x: 0, y: 0 }, current = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onScroll = () => { if (coarse) target.x = Math.sin(window.scrollY / 400) * 0.6; };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    // Only animate while visible
    let visible = true, raf = 0, last = performance.now(), t = 0;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !reduce) loop(); }, { threshold: 0 });
    io.observe(host);
    const onVis = () => { if (!document.hidden && visible && !reduce) loop(); };
    document.addEventListener('visibilitychange', onVis);

    const frame = (dt: number) => {
      t += dt;
      coreMat.uniforms.uTime.value = t;
      rings.forEach((r) => { r.orbit.rotation.z += r.speed * dt; });
      updateIncoming(dt);
      current.x += (target.x - current.x) * Math.min(dt * 2.5, 1);
      current.y += (target.y - current.y) * Math.min(dt * 2.5, 1);
      world.rotation.y = t * 0.08 + current.x * 0.45;
      world.rotation.x = current.y * 0.3;
      dust.rotation.y = t * 0.01 + current.x * 0.08;
      const pulse = 1 + Math.sin(t * 1.3) * 0.012;
      core.scale.setScalar(pulse);
      composer.render();
    };

    function loop() {
      cancelAnimationFrame(raf);
      last = performance.now();
      const tick = (now: number) => {
        if (!visible || document.hidden) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        frame(dt);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    if (reduce) { world.rotation.set(0.15, 0.5, 0); frame(0); } else loop();
    host.dataset.ready = 'true';

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={hostRef} className={className} aria-hidden="true">
      {fallback && <img src="/shade-mark.svg" alt="" style={{ width: '46%', margin: 'auto', display: 'block', paddingTop: '18%' }} />}
    </div>
  );
}