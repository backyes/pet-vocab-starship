import * as THREE from "../vendor/three.module.min.js";

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function disposeMaterial(material) {
  if (!material) return;
  for (const key of ["map", "emissiveMap", "alphaMap", "roughnessMap"]) {
    const texture = material[key];
    if (texture && texture.dispose && !texture.userData?.shared) texture.dispose();
  }
  if (material.dispose) material.dispose();
}

function disposeGroup(group) {
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
      else disposeMaterial(child.material);
    }
  });
  group.clear();
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    this.scene.fog = new THREE.FogExp2(0x04101a, 0.018);

    this.clockTime = 0;
    this.theme = null;
    this.portrait = false;
    this.orbit = 0;
    this.orbitTarget = 0;
    this.shakeAmount = 0;
    this.hovered = -1;
    this.interactive = false;
    this.bossAlive = false;
    this.rays = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.floaters = [];
    this.spinners = [];
    this.aurora = [];
    this.beams = [];
    this.ambient = null;
    this.stars = null;
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.buildStars();

    this.particleData = this.createParticles();
    this.glowTexture = this.makeGlowTexture();
    this.targets = this.createTargets();
    this.boss = this.createBoss();
    this.cockpit = this.createCockpit();
    this.resize();
  }

  /* ------------------------------------------------------------------ scene */
  setTheme(theme, { animate = true } = {}) {
    this.theme = theme;
    document.documentElement.style.setProperty("--c1", theme.color);
    document.documentElement.style.setProperty("--c2", theme.color2);
    document.documentElement.style.setProperty("--bg1", theme.bg[0]);
    document.documentElement.style.setProperty("--bg2", theme.bg[1]);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.bg[0]);

    if (this.propsGroup) {
      this.worldGroup.remove(this.propsGroup);
      disposeGroup(this.propsGroup);
    }
    this.propsGroup = new THREE.Group();
    this.worldGroup.add(this.propsGroup);
    this.floaters = [];
    this.spinners = [];
    this.aurora = [];
    this.beams.forEach((beam) => {
      beam.group.parent?.remove(beam.group);
      disposeGroup(beam.group);
    });
    this.beams = [];

    this.scene.fog = new THREE.FogExp2(new THREE.Color(theme.bg[0]), 0.0175);

    this.buildLights();
    this.buildFloor();
    this.buildAmbient();
    this.buildProps(theme);
    this.setStarColor(theme.color);
    this.updateCockpit();
    this.hideTargets();
    this.hideBoss();
    if (this.ambient?.material) this.ambient.material.color.set(theme.color);

    if (animate) {
      this.shake(0.03);
    }
    this.resize();
  }

  buildLights() {
    const theme = this.theme;
    const hemi = new THREE.HemisphereLight(new THREE.Color(theme.color), new THREE.Color(theme.bg[0]), 1.05);
    this.propsGroup.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(4, 9, 8);
    this.propsGroup.add(key);
    const rim = new THREE.PointLight(new THREE.Color(theme.color), 42, 38, 2);
    rim.position.set(-7, 4, 2);
    this.propsGroup.add(rim);
    const rim2 = new THREE.PointLight(new THREE.Color(theme.color2), 34, 34, 2);
    rim2.position.set(7, 3, -1);
    this.propsGroup.add(rim2);
    const back = new THREE.PointLight(new THREE.Color(theme.color), 30, 44, 2);
    back.position.set(0, 6, -10);
    this.propsGroup.add(back);
  }

  buildStars() {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const r = 28 + Math.random() * 34;
      const theta = Math.random() * TAU;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.8 + 4;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      color.setHSL(0.52 + Math.random() * 0.12, 0.3, 0.7 + Math.random() * 0.3);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.stars = new THREE.Points(geometry, material);
    this.starGroup.add(this.stars);
  }

  setStarColor(color) {
    if (!this.stars) return;
    const base = new THREE.Color(color);
    const colors = this.stars.geometry.attributes.color;
    for (let i = 0; i < colors.count; i += 1) {
      const mix = Math.random();
      const c = base.clone().lerp(new THREE.Color(0xffffff), 0.35 + mix * 0.5);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }

  buildFloor() {
    const theme = this.theme;
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(23, 72),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(theme.bg[1]).multiplyScalar(0.8),
        metalness: 0.55,
        roughness: 0.42,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.82;
    this.propsGroup.add(floor);

    const grid = new THREE.GridHelper(46, 46, new THREE.Color(theme.color), new THREE.Color(theme.color2));
    grid.position.y = -0.8;
    grid.material.transparent = true;
    grid.material.opacity = 0.2;
    grid.material.depthWrite = false;
    this.propsGroup.add(grid);

    [5, 9.5, 14].forEach((radius, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, index === 0 ? 0.035 : 0.02, 6, 100),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(theme.color),
          transparent: true,
          opacity: 0.36 - index * 0.07,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.79;
      this.propsGroup.add(ring);
    });
  }

  buildAmbient() {
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = Math.random() * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 28 - 4;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: new THREE.Color(this.theme.color),
      size: 0.09,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ambient = new THREE.Points(geometry, material);
    this.ambient.userData.positions = positions;
    this.propsGroup.add(this.ambient);
  }

  /* ---------------------------------------------------------------- targets */
  makeGlowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.15, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.25)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.shared = true;
    return texture;
  }

  createTargets() {
    const targets = [];
    const geometry = new THREE.IcosahedronGeometry(0.62, 0);
    const wireGeometry = new THREE.IcosahedronGeometry(0.84, 0);
    const ringGeometry = new THREE.TorusGeometry(1.02, 0.014, 6, 48);
    const hitGeometry = new THREE.SphereGeometry(1.75, 12, 10);
    for (let index = 0; index < 4; index += 1) {
      const group = new THREE.Group();
      const crystal = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0x3df0ff,
        emissive: 0x3df0ff,
        emissiveIntensity: 0.55,
        metalness: 0.35,
        roughness: 0.22,
        flatShading: true,
      }));
      const wire = new THREE.Mesh(wireGeometry, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }));
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
        color: 0x3df0ff,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.55;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0x3df0ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      glow.scale.set(3.4, 3.4, 1);
      glow.position.y = 0.05;
      const canvas = document.createElement("canvas");
      canvas.width = 768;
      canvas.height = 160;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }));
      label.scale.set(4.0, 0.833, 1);
      label.position.y = 1.42;
      label.userData.index = index;

      const hit = new THREE.Mesh(hitGeometry, new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }));
      hit.position.y = 0.55;
      hit.userData.index = index;

      group.add(crystal, wire, ring, glow, label, hit);
      group.visible = false;
      group.userData = { index, crystal, wire, ring, glow, label, hit, canvas, texture };
      this.worldGroup.add(group);
      targets.push({
        index,
        group,
        crystal,
        wire,
        ring,
        glow,
        label,
        hit,
        canvas,
        texture,
        base: new THREE.Vector3(),
        phase: Math.random() * TAU,
        hover: 0,
        shake: 0,
        flash: 0,
        alive: false,
        word: null,
      });
    }
    return targets;
  }

  drawLabel(target, index, word, color, highlight = false) {
    const canvas = target.canvas;
    const ctx = canvas.getContext("2d");
    const c = new THREE.Color(color);
    const css = `#${c.getHexString()}`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundedRect(ctx, 8, 12, canvas.width - 16, canvas.height - 24, 22);
    ctx.fillStyle = "rgba(2, 9, 16, 0.82)";
    ctx.fill();
    ctx.lineWidth = highlight ? 4 : 2.5;
    ctx.strokeStyle = highlight ? "rgba(255,255,255,0.95)" : `${css}cc`;
    ctx.stroke();

    ctx.fillStyle = css;
    ctx.fillRect(28, 38, 5, 84);

    ctx.textBaseline = "middle";
    ctx.fillStyle = css;
    ctx.font = '700 34px "Avenir Next", "Arial", sans-serif';
    ctx.fillText(String(index + 1).padStart(2, "0"), 50, 80);

    const maxWidth = canvas.width - 150;
    let fontSize = 58;
    ctx.font = `700 ${fontSize}px "Avenir Next", "Arial", sans-serif`;
    while (ctx.measureText(word).width > maxWidth && fontSize > 30) {
      fontSize -= 2;
      ctx.font = `700 ${fontSize}px "Avenir Next", "Arial", sans-serif`;
    }
    ctx.fillStyle = "#f2fbff";
    ctx.shadowColor = css;
    ctx.shadowBlur = 18;
    ctx.fillText(word, 104, 82);
    ctx.shadowBlur = 0;
    target.texture.needsUpdate = true;
  }

  showTargets(options) {
    this.hideTargets();
    const colors = this.optionColors(options.length);
    const layout = this.targetLayout();
    options.forEach((word, index) => {
      const target = this.targets[index];
      if (!target) return;
      target.word = word;
      target.alive = true;
      target.base.set(layout[index][0], layout[index][1], layout[index][2]);
      target.group.position.copy(target.base);
      target.group.scale.setScalar(0.2);
      target.group.visible = true;
      target.crystal.material.color.set(colors[index]);
      target.crystal.material.emissive.set(colors[index]);
      target.crystal.material.emissiveIntensity = 0.6;
      target.ring.material.color.set(colors[index]);
      target.ring.material.opacity = 0.35;
      target.glow.material.color.set(colors[index]);
      target.wire.material.color.set(colors[index]);
      target.label.material.color.set(0xffffff);
      target.label.material.opacity = 1;
      target.label.scale.set(this.compact ? 3.35 : 4.0, this.compact ? 0.7 : 0.833, 1);
      target.hover = 0;
      target.shake = 0;
      target.flash = 0;
      this.drawLabel(target, index, word.w, colors[index]);
    });
    for (let i = options.length; i < 4; i += 1) {
      this.targets[i].group.visible = false;
      this.targets[i].alive = false;
    }
  }

  optionColors(count) {
    const base = new THREE.Color(this.theme.color);
    const second = new THREE.Color(this.theme.color2);
    const palette = [base, second, new THREE.Color("#ffd45e"), new THREE.Color("#68ffc4"), new THREE.Color("#ff8fb8")];
    return palette.slice(0, count).map((color) => color.clone());
  }

  targetLayout() {
    if (this.compact) {
      return [
        [-2.35, 3.6, 0.5],
        [2.35, 3.6, 0.5],
        [-2.35, 1.35, 0.5],
        [2.35, 1.35, 0.5],
      ];
    }
    const halfWidth = Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.aspect * this.camera.position.z;
    const spread = Math.max(4.5, Math.min(7.2, halfWidth - 2.5));
    return [
      [-spread, 2.7, 0.6],
      [-spread * 0.34, 2.05, 0],
      [spread * 0.34, 2.05, 0],
      [spread, 2.7, 0.6],
    ];
  }

  hideTargets() {
    this.targets.forEach((target) => {
      target.alive = false;
      target.group.visible = false;
    });
    this.hovered = -1;
  }

  setInteractive(value) {
    this.interactive = !!value;
    this.canvas.style.cursor = value ? "crosshair" : "default";
  }

  disableTarget(index) {
    const target = this.targets[index];
    if (!target) return;
    target.alive = false;
    target.group.visible = false;
    this.hovered = -1;
  }

  pick(clientX, clientY) {
    if (!this.interactive) return -1;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.rays.setFromCamera(this.pointer, this.camera);
    const objects = [];
    this.targets.forEach((target) => {
      if (target.group.visible && target.alive) objects.push(target.hit, target.label);
    });
    const hits = this.rays.intersectObjects(objects, false);
    if (hits.length) {
      const hit = hits[0].object;
      return hit.userData.index ?? -1;
    }
    return -1;
  }

  setHover(index) {
    if (this.hovered === index) return;
    this.hovered = index;
    this.canvas.style.cursor = index >= 0 && this.interactive ? "pointer" : this.interactive ? "crosshair" : "default";
  }

  pulseCorrect(index) {
    const target = this.targets[index];
    if (!target) return;
    target.flash = 1;
    target.ring.material.color.set("#68ffc4");
    target.ring.material.opacity = 1;
    target.crystal.material.emissive.set("#68ffc4");
    this.drawLabel(target, index, target.word?.w || "", "#68ffc4", true);
  }

  pulseWrong(index) {
    const target = this.targets[index];
    if (!target) return;
    target.flash = 1;
    target.shake = 0.6;
    target.crystal.material.emissive.set("#ff5e8a");
    target.ring.material.color.set("#ff5e8a");
    this.drawLabel(target, index, target.word?.w || "", "#ff5e8a", true);
  }

  explode(index, color = null) {
    const target = this.targets[index];
    if (!target) return;
    const pos = target.group.position.clone();
    pos.y += 0.2;
    this.burst(pos, color || target.crystal.material.color.getHex(), 52);
    target.group.visible = false;
    target.alive = false;
    this.shake(0.075);
  }

  burst(position, color = 0xffffff, count = 40, speed = 3.2) {
    const data = this.particleData;
    let spawned = 0;
    for (let i = 0; i < data.count && spawned < count; i += 1) {
      if (data.life[i] > 0) continue;
      const idx = i * 3;
      data.positions[idx] = position.x;
      data.positions[idx + 1] = position.y;
      data.positions[idx + 2] = position.z;
      const theta = Math.random() * TAU;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.85);
      data.velocities[idx] = Math.sin(phi) * Math.cos(theta) * s;
      data.velocities[idx + 1] = Math.cos(phi) * s + 1.2;
      data.velocities[idx + 2] = Math.sin(phi) * Math.sin(theta) * s;
      const c = new THREE.Color(color).lerp(new THREE.Color(0xffffff), Math.random() * 0.55);
      data.colors[idx] = c.r;
      data.colors[idx + 1] = c.g;
      data.colors[idx + 2] = c.b;
      data.life[i] = 0.45 + Math.random() * 0.8;
      spawned += 1;
    }
    data.geometry.attributes.position.needsUpdate = true;
    data.geometry.attributes.color.needsUpdate = true;
  }

  createParticles() {
    const count = 520;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const life = new Float32Array(count);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3 + 1] = -999;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.13,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);
    return { count, positions, colors, life, velocities, geometry, points };
  }

  shoot(index, color = null) {
    const target = this.targets[index];
    if (!target) return;
    const end = target.group.position.clone();
    end.y += 0.15;
    this.beam(end, color || target.crystal.material.color.getHex());
    this.shake(0.035);
  }

  beam(end, color = 0xffffff) {
    const start = new THREE.Vector3(0, 0.18, 4.55);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const group = new THREE.Group();
    const geometry = new THREE.CylinderGeometry(0.035, 0.035, length, 6, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(geometry, material);
    beam.position.copy(start).add(direction.clone().multiplyScalar(0.5));
    _q.setFromUnitVectors(_up, direction.clone().normalize());
    beam.quaternion.copy(_q);
    group.add(beam);

    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, length, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.copy(beam.position);
    glow.quaternion.copy(beam.quaternion);
    group.add(glow);
    this.worldGroup.add(group);
    this.beams.push({ group, material, glow: glow.material, life: 0.24, maxLife: 0.24 });
    this.burst(start, color, 10, 1.4);
  }

  /* --------------------------------------------------------------- cockpit */
  createCockpit() {
    const group = new THREE.Group();
    group.visible = false;
    const body = new THREE.MeshStandardMaterial({
      color: 0x07131f,
      metalness: 0.8,
      roughness: 0.32,
      emissive: 0x3df0ff,
      emissiveIntensity: 0.08,
    });
    const strip = new THREE.MeshBasicMaterial({
      color: 0x3df0ff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 3.8), body);
    left.position.set(-1.55, 0.12, 6.2);
    left.rotation.y = -0.3;
    const right = left.clone();
    right.position.x = 1.55;
    right.rotation.y = 0.3;
    const leftStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 3.5), strip);
    leftStrip.position.set(-1.55, 0.2, 6.2);
    leftStrip.rotation.y = -0.3;
    const rightStrip = leftStrip.clone();
    rightStrip.position.x = 1.55;
    rightStrip.rotation.y = 0.3;
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.16), body);
    crossbar.position.set(0, -0.05, 4.8);
    const emitter = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    emitter.position.set(0, 0.18, 4.55);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: 0x3df0ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.set(1.1, 1.1, 1);
    glow.position.copy(emitter.position);
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.016, 6, 64, Math.PI),
      new THREE.MeshBasicMaterial({
        color: 0x3df0ff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    frame.position.set(0, 0.05, 5.2);
    frame.rotation.z = Math.PI;
    const dashboard = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.45), body);
    dashboard.position.set(0, -0.42, 6.9);
    group.add(left, right, leftStrip, rightStrip, crossbar, emitter, glow, frame, dashboard);
    this.worldGroup.add(group);
    return { group, body, strip, emitter, glow, frame };
  }

  updateCockpit() {
    if (!this.cockpit || !this.theme) return;
    const color = new THREE.Color(this.theme.color);
    this.cockpit.body.emissive.copy(color);
    this.cockpit.strip.color.copy(color);
    this.cockpit.emitter.material.color.copy(color).lerp(new THREE.Color(0xffffff), 0.6);
    this.cockpit.glow.material.color.copy(color);
    this.cockpit.frame.material.color.copy(color);
  }

  showCockpit(visible) {
    if (this.cockpit) this.cockpit.group.visible = !!visible;
  }

  /* ------------------------------------------------------------------ boss */
  createBoss() {
    const group = new THREE.Group();
    group.position.set(0, 4.0, -4.2);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.55, 1),
      new THREE.MeshStandardMaterial({
        color: 0xff5e8a,
        emissive: 0xff315f,
        emissiveIntensity: 0.9,
        metalness: 0.5,
        roughness: 0.22,
        flatShading: true,
      }),
    );
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.05, 1),
      new THREE.MeshBasicMaterial({
        color: 0xff8fb8,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      }),
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: 0xff315f,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.set(8, 8, 1);
    const rings = [];
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.5 + i * 0.5, 0.018, 6, 96),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xffd45e : 0xff5e8a,
          transparent: true,
          opacity: 0.45 - i * 0.1,
          depthWrite: false,
        }),
      );
      ring.rotation.set(Math.PI / 2 + i * 0.6, i * 0.9, i * 0.4);
      rings.push(ring);
      group.add(ring);
    }
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 96;
    const ctx = labelCanvas.getContext("2d");
    ctx.fillStyle = "rgba(2,9,16,0.82)";
    roundedRect(ctx, 4, 4, 504, 88, 16);
    ctx.fill();
    ctx.strokeStyle = "#ff5e8a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ff8fb8";
    ctx.font = '700 34px "Avenir Next", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("W O R D E N", 256, 50);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }));
    label.scale.set(4.6, 0.86, 1);
    label.position.y = 2.9;
    group.add(core, shell, glow, label);
    group.visible = false;
    this.worldGroup.add(group);
    return { group, core, shell, glow, rings, label, alive: false };
  }

  showBoss() {
    this.bossAlive = true;
    this.boss.alive = true;
    this.boss.group.visible = true;
    this.boss.group.scale.setScalar(0.4);
    this.boss.core.material.emissiveIntensity = 1.2;
    this.shake(0.08);
  }

  damageBoss() {
    if (!this.boss.alive) return;
    this.boss.group.scale.setScalar(0.82);
    this.boss.core.material.emissiveIntensity = 2.2;
    this.burst(this.boss.group.position.clone(), 0xff5e8a, 36, 4);
    this.shake(0.1);
  }

  defeatBoss() {
    if (!this.boss.alive) return;
    this.burst(this.boss.group.position.clone(), 0xff5e8a, 120, 6);
    this.burst(this.boss.group.position.clone(), 0xffd45e, 60, 4.5);
    this.boss.alive = false;
    this.bossAlive = false;
    this.boss.group.visible = false;
    this.shake(0.22);
  }

  hideBoss() {
    this.bossAlive = false;
    this.boss.alive = false;
    this.boss.group.visible = false;
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /* --------------------------------------------------------------- scenery */
  addBox(w, h, d, color, x, y, z, opts = {}) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(opts.emissive || color),
      emissiveIntensity: opts.emissiveIntensity ?? 0.3,
      metalness: opts.metalness ?? 0.35,
      roughness: opts.roughness ?? 0.55,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    (opts.parent || this.propsGroup).add(mesh);
    if (opts.float) this.floaters.push({ mesh, baseY: y, speed: opts.float, phase: Math.random() * TAU });
    if (opts.spin) this.spinners.push({ mesh, speed: opts.spin });
    return mesh;
  }

  addCylinder(rTop, rBottom, h, segments, color, x, y, z, opts = {}) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(opts.emissive || color),
      emissiveIntensity: opts.emissiveIntensity ?? 0.3,
      metalness: opts.metalness ?? 0.4,
      roughness: opts.roughness ?? 0.45,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    mesh.position.set(x, y, z);
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    (opts.parent || this.propsGroup).add(mesh);
    if (opts.float) this.floaters.push({ mesh, baseY: y, speed: opts.float, phase: Math.random() * TAU });
    return mesh;
  }

  addTorus(radius, tube, color, x, y, z, opts = {}) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: opts.opacity ?? 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 96), material);
    mesh.position.set(x, y, z);
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    (opts.parent || this.propsGroup).add(mesh);
    if (opts.spin) this.spinners.push({ mesh, speed: opts.spin });
    return mesh;
  }

  addPlane(w, h, color, x, y, z, opts = {}) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: opts.opacity ?? 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    (opts.parent || this.propsGroup).add(mesh);
    if (opts.float) this.floaters.push({ mesh, baseY: y, speed: opts.float, phase: Math.random() * TAU });
    return mesh;
  }

  addGlow(color, size, x, y, z, opacity = 0.6) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture,
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    sprite.scale.set(size, size, 1);
    sprite.position.set(x, y, z);
    this.propsGroup.add(sprite);
    return sprite;
  }

  addSign(text, color, x, y, z, width = 5, height = 1.1, opts = {}) {
    if (this.compact) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(2,9,16,0.72)";
    roundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 22);
    ctx.fill();
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontSize = 74;
    ctx.font = `700 ${fontSize}px "Avenir Next", Arial, sans-serif`;
    while (ctx.measureText(text).width > canvas.width - 80 && fontSize > 30) {
      fontSize -= 2;
      ctx.font = `700 ${fontSize}px "Avenir Next", Arial, sans-serif`;
    }
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: opts.opacity ?? 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    this.propsGroup.add(mesh);
    return mesh;
  }

  windowTexture(color) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(4,10,20,0.96)";
    ctx.fillRect(0, 0, 128, 256);
    const tint = new THREE.Color(color);
    for (let row = 0; row < 18; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        if (Math.random() > 0.54) {
          ctx.fillStyle = Math.random() > 0.35
            ? `rgba(${Math.floor(tint.r * 255)},${Math.floor(tint.g * 255)},${Math.floor(tint.b * 255)},${0.45 + Math.random() * 0.5})`
            : "rgba(255, 214, 120, 0.55)";
          ctx.fillRect(10 + col * 16, 10 + row * 13, 8, 6);
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  addBuilding(x, z, w, h, d, color) {
    const texture = this.windowTexture(color);
    texture.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
    const material = new THREE.MeshStandardMaterial({
      color: 0x07111d,
      metalness: 0.55,
      roughness: 0.5,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.05,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, h / 2 - 0.8, z);
    this.propsGroup.add(mesh);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, h * 0.92),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    face.position.set(x, h / 2 - 0.8, z + d / 2 + 0.02);
    this.propsGroup.add(face);
    if (Math.random() > 0.5) {
      this.addGlow(color, 0.5, x, h + 0.2, z, 0.5);
    }
    return mesh;
  }

  buildProps(theme) {
    const scene = theme.scene;
    const c = theme.color;
    const c2 = theme.color2;
    const back = theme.bg[0];

    // Common distant horizon ring
    this.addTorus(16, 0.03, c, 0, 5, -15, { opacity: 0.13 });

    switch (scene) {
      case "station": {
        this.addSign("HABITAT RING // 07", c, 0, 7.6, -13, 8, 1.5);
        for (const x of [-10, -7, 7, 10]) {
          this.addCylinder(2.1, 2.1, 4.4, 20, c2, x, 2.6, -8, {
            rotation: [0, 0, Math.PI / 2], opacity: 0.55, metalness: 0.6,
          });
          this.addTorus(2.2, 0.04, c, x, 2.6, -8, { rotation: [0, Math.PI / 2, 0], opacity: 0.4 });
          for (let i = 0; i < 3; i += 1) {
            this.addBox(0.16, 0.4, 0.16, c, x - 1.2 + i * 1.2, 2.6, -5.85, { emissiveIntensity: 1.4 });
          }
        }
        for (const x of [-10, -7, 7, 10]) {
          for (let row = 0; row < 4; row += 1) {
            this.addBox(0.42, 0.18, 0.08, c, x - 1.3 + (row % 2) * 2.6, 1.3 + row * 0.65, -5.82, {
              emissiveIntensity: 1.5, opacity: 0.9,
            });
          }
          this.addBox(0.06, 4.1, 0.06, c2, x - 2.25, 2.6, -6.2, { emissiveIntensity: 1.4, opacity: 0.8 });
          this.addBox(0.06, 4.1, 0.06, c2, x + 2.25, 2.6, -6.2, { emissiveIntensity: 1.4, opacity: 0.8 });
        }
        for (let i = 0; i < 7; i += 1) {
          this.addBox(1.4 + Math.random(), 0.6, 1.4, c2, -8 + Math.random() * 16, 0.6 + Math.random() * 3, -4 - Math.random() * 5, {
            float: 0.2 + Math.random() * 0.2, opacity: 0.8, emissiveIntensity: 0.55,
          });
        }
        for (const x of [-14, 14]) {
          this.addBox(0.35, 9, 0.35, c2, x, 3.6, -9, { emissiveIntensity: 1.1, opacity: 0.7 });
          this.addGlow(c2, 1.4, x, 8.2, -9, 0.55);
        }
        this.addTorus(4.6, 0.02, c, 0, 4.4, -8.5, { opacity: 0.18, rotation: [0.1, 0, 0] });
        this.addGlow(c, 4.2, 0, 3.2, -10, 0.42);
        break;
      }
      case "market": {
        this.addSign("NEON NIGHT MARKET", c, 0, 7.2, -12, 9, 1.6);
        for (let i = 0; i < 4; i += 1) {
          const x = -10 + i * 6.7;
          this.addBox(4.4, 0.35, 2.4, c2, x, 2.1, -5.5, { emissiveIntensity: 0.35 });
          this.addBox(3.8, 1.4, 2.0, c, x, 0.7, -5.6, { opacity: 0.55 });
          this.addBox(4.8, 0.14, 2.7, i % 2 ? c : c2, x, 2.55, -5.5, { emissiveIntensity: 0.9 });
          for (let j = 0; j < 3; j += 1) {
            const gx = x - 1.4 + j * 1.4;
            this.addGlow(i % 2 ? "#ffd45e" : c, 0.9, gx, 3.5 + (j % 2) * 0.5, -5.2, 0.72);
            this.addCylinder(0.2, 0.2, 0.25, 8, "#ffd45e", gx, 3.25 + (j % 2) * 0.5, -5.2, { emissiveIntensity: 1.2 });
          }
          this.addBox(1.0, 0.6, 1.0, c2, x - 1.2, 1.2, -4.9, { opacity: 0.8 });
          this.addBox(0.8, 0.5, 0.8, c, x + 1.0, 1.15, -4.8, { opacity: 0.8 });
        }
        for (let i = 0; i < 8; i += 1) {
          this.addGlow(c, 0.28, -12 + Math.random() * 24, 4 + Math.random() * 3, -8 - Math.random() * 3, 0.35);
        }
        break;
      }
      case "warp": {
        this.addSign("WARP HARBOUR // GATE 03", c, 0, 8.1, -14, 9, 1.5);
        for (let i = 0; i < 3; i += 1) {
          this.addTorus(3.4 + i * 0.55, 0.06 + i * 0.01, i === 0 ? c : c2, 0, 4.5, -11 - i * 0.8, {
            opacity: 0.55 - i * 0.1, spin: (i % 2 ? -1 : 1) * (0.1 + i * 0.03),
          });
        }
        this.addPlane(5.8, 5.8, c, 0, 4.5, -13.2, { opacity: 0.11, rotation: [0, 0, 0] });
        this.addGlow(c, 10, 0, 4.5, -13, 0.18);
        for (let i = 0; i < 6; i += 1) {
          const angle = (i / 6) * TAU;
          this.addCylinder(0.08, 0.08, 8, 5, c, Math.cos(angle) * 14, 2.5, Math.sin(angle) * 7 - 7, {
            rotation: [0.9, angle, 0], emissiveIntensity: 1.2, opacity: 0.55,
          });
        }
        for (let i = 0; i < 5; i += 1) {
          this.addBox(2.2, 0.25, 3.2, c2, -9 + i * 4.5, 0.2 + i * 0.3, -2 - i * 1.3, { opacity: 0.5, emissiveIntensity: 0.5 });
        }
        break;
      }
      case "academy": {
        this.addSign("ORBITAL ACADEMY", c, 0, 7.8, -13, 8.5, 1.5);
        for (const x of [-11, 11]) {
          this.addCylinder(0.35, 0.5, 8, 8, c2, x, 3.4, -7, { opacity: 0.55, emissiveIntensity: 0.4 });
          this.addBox(3.0, 0.25, 1.2, c, x, 7.2, -7, { emissiveIntensity: 0.8 });
        }
        for (let i = 0; i < 4; i += 1) {
          this.addBox(2.3, 0.12, 3.1, c2, -6.5 + i * 4.3, 1.0 + i * 1.5, -6.2, {
            rotation: [0, 0.1 * i, 0], float: 0.25, opacity: 0.7, emissiveIntensity: 0.4,
          });
          this.addBox(1.8, 0.08, 2.4, c, -6.4 + i * 4.3, 1.16 + i * 1.5, -6.1, { opacity: 0.8, emissiveIntensity: 1.0 });
        }
        this.addPlane(7.5, 3.4, c, 0, 5.2, -10.5, { opacity: 0.09 });
        for (let i = 0; i < 10; i += 1) {
          this.addBox(0.05, 2 + Math.random() * 3, 0.05, c, -12 + Math.random() * 24, 3, -8 - Math.random() * 4, { emissiveIntensity: 1.4, opacity: 0.4 });
        }
        break;
      }
      case "medbay": {
        this.addSign("MEDBAY ZERO // CARE UNIT", c, 0, 7.7, -13, 9, 1.5);
        for (const x of [-10, 10]) {
          this.addCylinder(1.7, 1.7, 4.6, 24, c2, x, 2.6, -7, {
            rotation: [0, 0, Math.PI / 2], opacity: 0.32, emissiveIntensity: 0.35,
          });
          this.addTorus(1.75, 0.04, c, x, 2.6, -7, { rotation: [0, Math.PI / 2, 0], opacity: 0.45 });
          this.addBox(0.32, 1.7, 0.32, c, x, 5.2, -7, { emissiveIntensity: 1.6 });
          this.addBox(1.7, 0.32, 0.32, c, x, 5.2, -7, { emissiveIntensity: 1.6 });
        }
        for (let i = 0; i < 6; i += 1) {
          const x = -10 + i * 4;
          this.addGlow(c, 1.2, x, 4.2, -6.5, 0.4);
          this.addCylinder(0.32, 0.32, 1.5, 10, "#ffffff", x, 3.0, -6.5, { opacity: 0.5, emissiveIntensity: 0.4 });
        }
        this.addPlane(10, 3.5, c2, 0, 5.0, -11.5, { opacity: 0.06 });
        break;
      }
      case "biodome": {
        this.addSign("EMERALD DOME // BIOSPHERE", c, 0, 8.2, -14, 9, 1.5);
        for (let i = 0; i < 7; i += 1) {
          const x = -13 + i * 4.3;
          const z = -5 - (i % 3) * 2.2;
          const h = 2.4 + (i % 4) * 0.55;
          this.addCylinder(0.16, 0.24, h * 0.8, 6, "#5d3b25", x, h * 0.4 - 0.2, z, { roughness: 0.9 });
          this.addCylinder(0.05, 1.6, h * 1.4, 7, c2, x, h * 0.8 + 0.9, z, { emissiveIntensity: 0.12, flatShading: true });
          this.addGlow(c, 1.2, x, h * 0.8 + 1.2, z, 0.13);
        }
        for (let i = 0; i < 10; i += 1) {
          this.addBox(0.7 + Math.random() * 1.2, 0.4 + Math.random() * 0.8, 0.6 + Math.random() * 1.2, c2,
            -14 + Math.random() * 28, 0.2, -5 - Math.random() * 8, { opacity: 0.55, roughness: 0.9 });
        }
        this.addTorus(12, 0.04, c, 0, 5.5, -9, { rotation: [0.2, 0, 0], opacity: 0.18 });
        this.addGlow(c2, 5, 0, 5, -13, 0.15);
        break;
      }
      case "aurora": {
        const colors = [c, c2, "#ff7ac7", "#7dffd4"];
        for (let i = 0; i < 4; i += 1) {
          const plane = this.addPlane(22, 5 + i * 1.8, colors[i], -2 + i * 2, 7 + i * 0.7, -14 - i * 0.6, {
            opacity: 0.07 + i * 0.018, rotation: [0, 0, -0.08 + i * 0.03],
          });
          this.aurora.push({ mesh: plane, phase: i * 1.5, baseY: plane.position.y });
        }
        this.addPlane(34, 14, c, 0, -0.78, -2, { rotation: [-Math.PI / 2, 0, 0], opacity: 0.1 });
        for (let i = 0; i < 14; i += 1) {
          this.addGlow(i % 3 ? c : c2, 0.3 + Math.random() * 0.4, -12 + Math.random() * 24, 1 + Math.random() * 6, -6 - Math.random() * 8, 0.45);
        }
        this.addTorus(9, 0.03, c2, 0, 2.2, -8, { opacity: 0.22, rotation: [0.4, 0, 0] });
        break;
      }
      case "matrix": {
        this.addSign("DATA MATRIX // NODE 88", c, 0, 7.9, -13, 8.5, 1.5);
        for (const x of [-11, -7.5, 7.5, 11]) {
          this.addBox(1.6, 5.8, 1.6, c2, x, 2.1, -6.5, { opacity: 0.55, emissiveIntensity: 0.2 });
          for (let j = 0; j < 5; j += 1) {
            this.addBox(1.2, 0.06, 0.06, c, x, 1.0 + j * 0.9, -5.68, { emissiveIntensity: 1.8 });
          }
        }
        for (let i = 0; i < 6; i += 1) {
          this.addTorus(4 + i * 1.3, 0.015, i % 2 ? c2 : c, 0, 3.5, -4 - i * 2.6, { opacity: 0.24 - i * 0.02 });
        }
        for (let i = 0; i < 26; i += 1) {
          this.addBox(0.035, 0.6 + Math.random() * 2.4, 0.035, c, -12 + Math.random() * 24, 3 + Math.random() * 4, -8 - Math.random() * 5, {
            emissiveIntensity: 1.6, opacity: 0.55, float: 0.1 + Math.random() * 0.2,
          });
        }
        break;
      }
      case "arena": {
        this.addSign("ZERO-G ARENA // FINAL", c, 0, 8.0, -13, 8.5, 1.5);
        for (const x of [-9.5, 9.5]) {
          this.addTorus(2.0, 0.08, c, x, 4.0, -6, { opacity: 0.5, rotation: [0, 0.5, 0.2] });
          this.addBox(0.18, 6, 0.18, c2, x, 3, -8, { opacity: 0.45, emissiveIntensity: 0.8 });
          this.addGlow(c, 2.5, x, 4.0, -6, 0.25);
        }
        for (let i = 0; i < 7; i += 1) {
          this.addCylinder(0.6, 0.6, 1.1, 12, c2, -9 + i * 3, 0.2 + (i % 3) * 0.8, -3 - (i % 4) * 1.8, {
            rotation: [0, 0, Math.PI / 2], emissiveIntensity: 0.3, opacity: 0.7, float: 0.15,
          });
        }
        this.addPlane(12, 4, c, 0, 6.2, -11, { opacity: 0.07 });
        this.addGlow(c, 2, 0, 6.2, -10.8, 0.2);
        break;
      }
      case "city": {
        this.addSign("NEON METROPOLIS", c, 0, 8.4, -14, 8.5, 1.5);
        const buildings = [
          [-15, -12, 4.4, 11, 3.8], [-10, -15, 5.2, 14, 4.4], [-4, -13, 3.6, 8, 3.2],
          [2, -16, 5.8, 16, 4.8], [8, -13, 4.2, 10, 3.6], [14, -12, 4.0, 12, 3.4],
          [-13, -8, 3.0, 6, 3.0], [12, -9, 3.2, 7, 3.0],
        ];
        buildings.forEach(([x, z, w, h, d], index) => this.addBuilding(x, z, w, h, d, index % 2 ? c2 : c));
        for (let i = 0; i < 5; i += 1) {
          this.addGlow(i % 2 ? c : c2, 0.9, -12 + i * 6, 6.5 + (i % 3), -7, 0.5);
        }
        for (let i = 0; i < 6; i += 1) {
          this.addBox(1.8, 0.12, 0.8, c, -12 + i * 4.8, 5 + (i % 3), -6, { emissiveIntensity: 1.0, opacity: 0.7, float: 0.2 });
        }
        break;
      }
      case "gallery": {
        this.addSign("HALO GALLERY // COLLECTION", c, 0, 8.0, -13, 9, 1.5);
        for (let i = 0; i < 3; i += 1) {
          const x = -7 + i * 7;
          this.addBox(4.2, 3.2, 0.18, c, x, 3.6, -7.5, { opacity: 0.4, emissiveIntensity: 0.25 });
          this.addBox(3.8, 2.8, 0.08, i === 1 ? c2 : "#071321", x, 3.6, -7.4, { emissiveIntensity: 0.12 });
          this.addPlane(3.2, 2.2, i === 1 ? c2 : c, x, 3.6, -7.32, { opacity: 0.18 });
          this.addGlow(c, 2.2, x, 3.6, -7.2, 0.18);
        }
        for (const x of [-10, 10]) {
          this.addCylinder(0.8, 1.1, 1.6, 8, c2, x, 0.4, -5.5, { opacity: 0.55, roughness: 0.7 });
          this.addCylinder(0.42, 0.42, 2.3, 8, c, x, 2.1, -5.5, { opacity: 0.6, emissiveIntensity: 0.3 });
          this.addGlow(c, 1.4, x, 3.4, -5.5, 0.25);
        }
        this.addTorus(8, 0.04, c, 0, 5.2, -9, { opacity: 0.2, rotation: [0.3, 0, 0] });
        break;
      }
      case "garden": {
        this.addSign("BOND GARDEN // COMMONS", c, 0, 7.4, -13, 8.2, 1.4);
        for (let i = 0; i < 6; i += 1) {
          const x = -11 + i * 4.4;
          const z = -5 - (i % 2) * 2;
          this.addCylinder(0.14, 0.22, 2.2, 6, "#5d3b25", x, 1.0, z, { roughness: 0.9 });
          this.addCylinder(0.05, 1.3, 2.2, 7, c2, x, 2.6, z, { emissiveIntensity: 0.12 });
          this.addGlow(c, 1.1, x, 2.9, z, 0.15);
        }
        for (let i = 0; i < 7; i += 1) {
          const x = -8 + i * 2.8;
          this.addGlow(i % 2 ? c : c2, 0.7, x, 3.2 + (i % 3) * 0.5, -6 + (i % 2), 0.55);
          this.addCylinder(0.16, 0.16, 0.22, 8, c, x, 3.0 + (i % 3) * 0.5, -6 + (i % 2), { emissiveIntensity: 1.2 });
        }
        this.addTorus(5, 0.03, c, 0, 0.05, -4, { rotation: [-Math.PI / 2, 0, 0], opacity: 0.28 });
        this.addBox(5.5, 0.35, 1.1, c2, 0, 0.4, -4, { opacity: 0.55, emissiveIntensity: 0.15 });
        this.addGlow(c2, 4, 0, 4.5, -10, 0.12);
        break;
      }
      default: {
        this.addGlow(c, 4, 0, 4, -10, 0.2);
      }
    }
  }

  /* ------------------------------------------------------------------ frame */
  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.portrait = width / height < 0.92;
    this.compact = width / height < 1.35;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = this.portrait ? 58 : 50;
    this.camera.updateProjectionMatrix();
    const camY = this.portrait ? 4.9 : 4.2;
    const camZ = this.portrait ? 17.2 : this.compact ? 15.0 : 13.8;
    this.baseCam = new THREE.Vector3(0, camY, camZ);
    this.camera.position.copy(this.baseCam);
    this.camera.lookAt(0, this.portrait ? 2.4 : 1.9, 0);
    if (this.targets) {
      const layout = this.targetLayout();
      this.targets.forEach((target, index) => {
        if (!target.alive) return;
        target.base.set(layout[index][0], layout[index][1], layout[index][2]);
      });
    }
  }

  setOrbit(value) {
    this.orbitTarget = THREE.MathUtils.clamp(value, -0.55, 0.55);
  }

  update(dt) {
    const time = (this.clockTime += dt);
    this.orbit += (this.orbitTarget - this.orbit) * Math.min(1, dt * 6);

    // targets
    this.targets.forEach((target) => {
      if (!target.group.visible) return;
      const hoverSpeed = target.hover ? 1 : 0;
      target.hover += (hoverSpeed - target.hover) * Math.min(1, dt * 10);
      const bob = Math.sin(time * 1.5 + target.phase) * 0.09;
      target.group.position.y = target.base.y + bob;
      target.group.position.x = target.base.x;
      target.group.position.z = target.base.z;
      if (target.shake > 0) {
        target.group.position.x += (Math.random() - 0.5) * target.shake;
        target.group.position.y += (Math.random() - 0.5) * target.shake * 0.5;
        target.shake = Math.max(0, target.shake - dt * 2.8);
      }
      const scale = 0.94 + target.hover * 0.1 + Math.sin(time * 1.2 + target.phase) * 0.015;
      target.group.scale.lerp(_v.set(scale, scale, scale), Math.min(1, dt * 8));
      target.crystal.rotation.y += dt * 0.55;
      target.crystal.rotation.x += dt * 0.18;
      target.wire.rotation.y -= dt * 0.32;
      target.wire.rotation.z += dt * 0.12;
      target.ring.rotation.z += dt * 0.35;
      target.ring.material.opacity = 0.28 + target.hover * 0.35;
      if (target.flash > 0) {
        target.flash = Math.max(0, target.flash - dt * 1.8);
        target.glow.material.opacity = 0.55 + target.flash * 0.8;
      } else {
        target.glow.material.opacity = 0.4 + target.hover * 0.3;
      }
    });

    // boss
    if (this.boss.alive) {
      this.boss.group.rotation.y += dt * 0.22;
      this.boss.shell.rotation.y -= dt * 0.4;
      this.boss.shell.rotation.x += dt * 0.15;
      this.boss.rings.forEach((ring, index) => {
        ring.rotation.z += dt * (0.18 + index * 0.08);
        ring.rotation.y += dt * (index % 2 ? -0.12 : 0.12);
      });
      const pulse = 1 + Math.sin(time * 2.2) * 0.025;
      this.boss.group.scale.lerp(_v.set(pulse, pulse, pulse), Math.min(1, dt * 6));
      this.boss.glow.material.opacity = 0.55 + Math.sin(time * 3) * 0.16;
      this.boss.core.material.emissiveIntensity *= 1 - dt * 0.6;
      this.boss.core.material.emissiveIntensity = Math.max(0.8, this.boss.core.material.emissiveIntensity);
    }

    // floating decorations
    this.floaters.forEach((item) => {
      item.mesh.position.y = item.baseY + Math.sin(time * item.speed + item.phase) * 0.25;
      item.mesh.rotation.y += dt * 0.08;
    });
    this.spinners.forEach((item) => {
      item.mesh.rotation.z += dt * item.speed;
    });
    this.aurora.forEach((item) => {
      item.mesh.position.y = item.baseY + Math.sin(time * 0.25 + item.phase) * 0.7;
      item.mesh.material.opacity = 0.075 + Math.sin(time * 0.4 + item.phase) * 0.02;
    });

    // ambient dust
    if (this.ambient) {
      const pos = this.ambient.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < pos.count; i += 1) {
        arr[i * 3 + 1] += dt * 0.12;
        if (arr[i * 3 + 1] > 10) arr[i * 3 + 1] = 0;
      }
      pos.needsUpdate = true;
      this.ambient.rotation.y += dt * 0.004;
    }

    // beams
    for (let i = this.beams.length - 1; i >= 0; i -= 1) {
      const beam = this.beams[i];
      beam.life -= dt;
      const alpha = Math.max(0, beam.life / beam.maxLife);
      beam.material.opacity = alpha * 0.95;
      beam.glow.opacity = alpha * 0.18;
      if (beam.life <= 0) {
        this.worldGroup.remove(beam.group);
        disposeGroup(beam.group);
        this.beams.splice(i, 1);
      }
    }

    // particles
    const pd = this.particleData;
    for (let i = 0; i < pd.count; i += 1) {
      if (pd.life[i] <= 0) continue;
      pd.life[i] -= dt;
      const idx = i * 3;
      pd.velocities[idx + 1] -= dt * 2.4;
      pd.positions[idx] += pd.velocities[idx] * dt;
      pd.positions[idx + 1] += pd.velocities[idx + 1] * dt;
      pd.positions[idx + 2] += pd.velocities[idx + 2] * dt;
      if (pd.life[i] <= 0) pd.positions[idx + 1] = -999;
    }
    pd.geometry.attributes.position.needsUpdate = true;
    pd.geometry.attributes.color.needsUpdate = true;

    // stars
    if (this.stars) this.stars.rotation.y += dt * 0.003;

    // camera
    const shake = this.shakeAmount;
    this.shakeAmount = Math.max(0, shake - dt * 0.35);
    const targetX = this.baseCam.x + this.orbit * 2.4 + Math.sin(time * 0.23) * 0.12;
    const targetY = this.baseCam.y + Math.cos(time * 0.31) * 0.07;
    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, dt * 3.2);
    this.camera.position.y += (targetY - this.camera.position.y) * Math.min(1, dt * 3.2);
    this.camera.position.z = this.baseCam.z;
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    this.camera.lookAt(this.orbit * 0.7, this.portrait ? 2.4 : 1.9, 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
