(() => {
  const tau = 2 * Math.PI;

  // PubChem CID 5754, generated 3D conformer. Hydrogens are omitted from the
  // illustration so the four fused rings and the oxygen sites stay legible.
  // https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/5754/record/SDF?record_type=3d
  const atoms = [
    [3.1144, -.2859, -1.9416, "O"],
    [-.2290, 2.1443, 1.2399, "O"],
    [4.3267, 1.6729, .0603, "O"],
    [6.7987, .5839, -.4649, "O"],
    [-6.4227, -.0344, -1.3444, "O"],
    [1.8917, .1629, .1439, "C"],
    [.9976, -1.0770, -.0738, "C"],
    [-.4048, -.9389, .5376, "C"],
    [-1.1203, .2887, -.1144, "C"],
    [3.2007, -.3456, -.5210, "C"],
    [1.2023, 1.3572, -.5469, "C"],
    [-2.6188, .4571, .3689, "C"],
    [-.2481, 1.5819, -.0645, "C"],
    [1.8852, -2.2363, .3713, "C"],
    [3.3025, -1.8232, -.0778, "C"],
    [-1.2196, -2.2201, .2998, "C"],
    [2.1566, .4723, 1.6434, "C"],
    [-3.3459, -.8879, .2342, "C"],
    [-2.6438, -2.0894, .8180, "C"],
    [-3.3005, 1.5233, -.5375, "C"],
    [-2.7469, .8977, 1.8447, "C"],
    [4.4119, .4683, -.1739, "C"],
    [-4.8187, 1.5076, -.4589, "C"],
    [-4.5569, -1.0370, -.3282, "C"],
    [-5.3417, .1333, -.7839, "C"],
    [5.7297, -.2757, -.1305, "C"],
  ];
  const bonds = [
    [0, 9, 1], [1, 12, 1], [2, 21, 2], [3, 25, 1], [4, 24, 2],
    [5, 6, 1], [5, 9, 1], [5, 10, 1], [5, 16, 1], [6, 7, 1],
    [6, 13, 1], [7, 8, 1], [7, 15, 1], [8, 11, 1], [8, 12, 1],
    [9, 14, 1], [9, 21, 1], [10, 12, 1], [11, 17, 1], [11, 19, 1],
    [11, 20, 1], [13, 14, 1], [15, 18, 1], [17, 18, 1], [17, 23, 2],
    [19, 22, 1], [21, 25, 1], [22, 24, 1], [23, 24, 1],
  ];

  function noise(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function normal(v) {
    const length = Math.hypot(...v);
    return v.map((value) => value / length);
  }

  function dottedTube(points, from, to, count, radius, tint, random, offset = 0) {
    const delta = to.map((coord, index) => coord - from[index]);
    const axis = normal(delta);
    const u = normal(cross(axis, Math.abs(axis[2]) > .9 ? [0, 1, 0] : [0, 0, 1]));
    const v = cross(axis, u);
    for (let index = 0; index < count; index++) {
      const along = (index + random()) / count;
      const theta = tau * random();
      const a = radius * Math.cos(theta) + offset;
      const b = radius * Math.sin(theta);
      const [x, y, z] = from.map((start, i) => start + delta[i] * along + u[i] * a + v[i] * b);
      points.push({ x, y, z, tint: tint + random() * .29 + .12 * Math.cos(theta) });
    }
  }

  function cortisol() {
    const points = [];
    const random = noise(5754);
    const centerX = .188;
    const centerY = -.05;
    const angle = 1.28;
    const scale = .149;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const coordinates = atoms.map(([x, y, z]) => [
      ((x - centerX) * c - (y - centerY) * s) * scale,
      -((x - centerX) * s + (y - centerY) * c) * scale,
      z * scale,
    ]);

    for (const [a, b, order] of bonds) {
      const first = coordinates[a];
      const second = coordinates[b];
      if (order === 2) {
        dottedTube(points, first, second, 43, .012, .32, random, -.019);
        dottedTube(points, first, second, 43, .012, .32, random, .019);
      } else {
        dottedTube(points, first, second, 75, .015, .33, random);
      }
    }

    for (const [index, [x, y, z]] of coordinates.entries()) {
      const oxygen = atoms[index][3] === "O";
      const radius = oxygen ? .057 : .045;
      const count = oxygen ? 68 : 48;
      for (let point = 0; point < count; point++) {
        const height = 2 * (point + random()) / count - 1;
        const azimuth = point * 2.399963 + .24 * random();
        const ring = Math.sqrt(1 - height * height);
        points.push({
          x: x + radius * Math.cos(azimuth) * ring,
          y: y + radius * height,
          z: z + radius * Math.sin(azimuth) * ring,
          tint: Math.min(1, (oxygen ? .62 : .43) + .28 * random() + .12 * ring),
        });
      }
    }
    return points;
  }

  window.alyxParticleMolecules = { cortisol: cortisol() };
})();

(() => {
  const cycle = 15000;
  const rotationCycle = 9000;
  const timeline = [
    { name: 'open', end: 4200 },
    { name: 'cortisol', end: 8200 },
    { name: 'saliva', end: 11500 },
    { name: 'blood', end: cycle },
  ];
  const count = 3500;
  const turn = Math.PI * 2;
  let cached;
  const drawFrom = new Float32Array(count * 4);
  const drawTo = new Float32Array(count * 4);

  function sample(source, total) {
    if (!source?.length) return [];
    const ordered = source.slice().sort((a, b) =>
      Math.round(a.y * 19) - Math.round(b.y * 19) || a.x - b.x || a.z - b.z,
    );
    // A shared top-to-bottom order lets the same dots sweep into the next shape.
    return Array.from({ length: total }, (_, index) => ordered[Math.floor(index * ordered.length / total)]);
  }

  function collect(field) {
    const devices = field.devices ?? window.alyxParticleDevices;
    const molecules = window.alyxParticleMolecules;
    if (cached?.shell === field.shell && cached.devices === devices && cached.molecules === molecules) {
      return cached.stages;
    }

    const shell = field.shell.map((point) => ({
      x: point.x, y: point.height, z: point.z, tint: point.tint,
      size: point.size, lid: point.lid, layer: 0,
    }));
    function photo(kind, layer) {
      return devices?.[kind]?.map((point) => ({
        ...point, z: 0, size: .82, layer,
      }));
    }
    const saliva = photo('saliva', 1);
    const blood = photo('blood', 2);
    const opened = sample(shell, 2260).concat(sample(saliva, 620), sample(blood, 620));
    const stages = {
      open: opened,
      saliva: sample(saliva, count),
      blood: sample(blood, count),
      cortisol: sample(molecules.cortisol.map((point) => ({ ...point, size: .92 })), count),
    };
    cached = { shell: field.shell, devices, molecules, stages };
    return stages;
  }

  function project(name, points, local, time, view, ease, output) {
    const phase = time / cycle * turn;
    const mobile = view.small;
    const opening = name === 'open';
    const photoStage = name === 'blood' || name === 'saliva';
    const biomarker = name === 'cortisol';
    const lean = opening ? .34 + Math.sin(phase * 3) * .095 : Math.sin(phase * 3) * .075;
    const tilt = .235 + Math.cos(phase * 3) * .052;
    const rollCos = Math.cos(lean);
    const rollSin = Math.sin(lean);
    const yaw = opening ? 0 : Math.sin(phase * 3) * (photoStage ? .12 : .62);
    const yawCos = Math.cos(yaw);
    const yawSin = Math.sin(yaw);
    const pitch = biomarker ? .21 + Math.cos(phase * 2) * .18 : .04;
    const pitchCos = Math.cos(pitch);
    const pitchSin = Math.sin(pitch);
    const centerX = mobile && !opening ? view.width * .50 : view.centerX;
    const centerY = view.centerY + (opening ? 0 : Math.sin(phase * 2) * view.scale * .045);
    const photoScale = view.scale * 1.83;
    const scale = photoStage && name === 'blood'
      ? Math.min(photoScale, view.width * 1.34)
      : photoStage ? photoScale : view.scale;
    const lid = opening ? ease((local + .09) / .35) : 0;
    const releaseSaliva = opening ? ease((local - .16) / .31) : 0;
    const releaseBlood = opening ? ease((local - .24) / .33) : 0;
    const rimX = centerX + view.scale * .95 * rollSin;
    const rimY = centerY - view.scale * .95 * rollCos;
    const revealedScale = mobile
      ? Math.min(view.scale * .52, view.height * .158)
      : view.scale * .54;
    const revealedY = view.height * .225;

    for (let index = 0, cursor = 0; index < points.length; index++, cursor += 4) {
      const point = points[index];
      let x;
      let y;
      let tint = point.tint;
      let alpha = 1;
      if (opening && point.layer) {
        const saliva = point.layer === 1;
        const lift = saliva ? releaseSaliva : releaseBlood;
        const travel = ease((lift - .17) / .83);
        const targetX = mobile
          ? view.width * (saliva ? .27 : .74)
          : centerX + (saliva ? -.65 : .47) * view.scale;
        const flightY = rimY + revealedScale * (.40 - lift * 1.13);
        const anchorY = flightY + (revealedY - flightY) * travel
          - Math.sin(travel * Math.PI) * revealedScale * .12;
        x = rimX + (targetX - rimX) * travel
          + (point.x + point.y * (saliva ? -.16 : .11) * (1 - travel)) * revealedScale;
        y = anchorY + point.y * revealedScale + Math.sin(phase * 4 + point.layer) * travel * 3.8;
        alpha = Math.min(1, lift * 3.5);
        if (travel < .43 && y > rimY + (x - rimX) * rollSin) alpha = 0;
      } else if (opening) {
        const move = point.lid ? lid : 0;
        const elevation = point.y + point.z * tilt;
        x = centerX + scale * (point.x * rollCos - elevation * rollSin - move * .31);
        y = centerY + scale * (point.x * rollSin + elevation * rollCos - move * (.26 - point.x * .23));
        tint += .11;
      } else {
        const sourceZ = point.z ?? 0;
        const px = point.x * yawCos + sourceZ * yawSin;
        const pz = sourceZ * yawCos - point.x * yawSin;
        const py = point.y * pitchCos - pz * pitchSin;
        const perspective = 1 / (1 - pz * .13);
        x = centerX + (px * rollCos - py * rollSin) * scale * perspective;
        y = centerY + (px * rollSin + py * rollCos) * scale * perspective;
        tint += pz * .1;
        if (!photoStage) tint = Math.min(.99, .17 + tint * .96);
      }
      output[cursor] = x;
      output[cursor + 1] = y;
      output[cursor + 2] = tint;
      output[cursor + 3] = alpha;
    }
  }

  function draw({ time, field, viewport, context, paint, ease }) {
    const available = collect(field);
    const elapsed = ((time % cycle) + cycle) % cycle;
    const currentIndex = timeline.findIndex(({ end }) => elapsed < end);
    const current = timeline[currentIndex];
    const next = timeline[(currentIndex + 1) % timeline.length];
    const start = currentIndex ? timeline[currentIndex - 1].end : 0;
    const local = (elapsed - start) / (current.end - start);
    const mix = ease((elapsed - current.end + 930) / 930);
    const currentName = current.name;
    const nextName = next.name;
    const first = available[currentName];
    const second = available[nextName];
    project(currentName, first, local, elapsed, viewport, ease, drawFrom);
    if (mix > 0) project(nextName, second, 0, elapsed, viewport, ease, drawTo);

    const currentOpacity = viewport.small ? .88 : .92;
    const sweep = Math.sin(mix * Math.PI);
    const accent = mix < .5 ? first : second;
    const foregroundName = mix < .5 ? currentName : nextName;
    const molecularSize = foregroundName === 'cortisol' ? 1.31 : 1;
    let lastAlpha;
    for (let index = 0, cursor = 0; index < count; index++, cursor += 4) {
      const fromX = drawFrom[cursor];
      const fromY = drawFrom[cursor + 1];
      const fromTint = drawFrom[cursor + 2];
      const fromAlpha = drawFrom[cursor + 3];
      const alpha = mix ? fromAlpha + (drawTo[cursor + 3] - fromAlpha) * mix : fromAlpha;
      if (alpha < .035) continue;

      const x = mix ? fromX + (drawTo[cursor] - fromX) * mix : fromX;
      const y = mix ? fromY + (drawTo[cursor + 1] - fromY) * mix : fromY;
      const tint = mix ? fromTint + (drawTo[cursor + 2] - fromTint) * mix : fromTint;
      const opacity = Math.round(alpha * currentOpacity * 20) / 20;
      if (opacity !== lastAlpha) {
        context.globalAlpha = opacity;
        lastAlpha = opacity;
      }
      const drift = ((index * 67) % 83) / 83 - .5;
      const fleck = ((index * 83) % 71) / 71 - .5;
      const { color, size } = accent[index];
      const dot = size * molecularSize * (viewport.small ? .99 : 1.16);
      paint(x + sweep * drift * 64, y + sweep * fleck * 40, dot, tint, sweep < .36 ? color : null);
    }
  }

  function drawCortisol({ time, viewport, context, paint }) {
    const angle = (time % rotationCycle) / rotationCycle * turn;
    const yawCos = Math.cos(angle);
    const yawSin = Math.sin(angle);
    const pitchCos = Math.cos(.19);
    const pitchSin = Math.sin(.19);
    const rollCos = Math.cos(.25);
    const rollSin = Math.sin(.25);
    const scale = viewport.scale * .88;
    const centerX = viewport.width * (viewport.small ? .68 : .73);
    const centerY = viewport.height * .5;
    const size = viewport.small ? 1.15 : 1.35;

    context.globalAlpha = viewport.small ? .22 : .25;
    for (const point of window.alyxParticleMolecules.cortisol) {
      const px = point.x * yawCos + point.z * yawSin;
      const pz = point.z * yawCos - point.x * yawSin;
      const py = point.y * pitchCos - pz * pitchSin;
      const perspectiveScale = scale / (1 - pz * .13);
      const x = centerX + (px * rollCos - py * rollSin) * perspectiveScale;
      const y = centerY + (px * rollSin + py * rollCos) * perspectiveScale;
      paint(x, y, size, .17 + point.tint * .96 + pz * .1);
    }
  }

  window.alyxBiomarkerCycle = cycle;
  window.alyxBiomarkerStill = 2800;
  window.drawAlyxBiomarkerSequence = draw;
  window.alyxCortisolCycle = rotationCycle;
  window.drawAlyxCortisol = drawCortisol;
})();
