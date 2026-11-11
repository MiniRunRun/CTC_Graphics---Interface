// Cat & Frog: two players on one keyboard. The cat poops from the fence, the frog fetches the poop and spits at the cat.
(() => {
  'use strict';

  // ---- World (logical pixels; the canvas is scaled to fit the page) ----
  const W = 800;
  const H = 450;
  const FENCE_Y = 170;  // the cat walks on top of the fence
  const GROUND_Y = 400; // the frog hops on the grass
  const PX = 3;         // one sprite pixel = 3 logical pixels
  const ROUND_SECONDS = 60;

  // ---- Tuning ----
  const CAT_SPEED = 230;
  const TUMMY_MAX = 3;        // poops the cat can hold
  const TUMMY_REFILL = 1;     // seconds to make one more poop
  const POOP_COOLDOWN = 0.25; // minimum time between two poops
  const POOP_GRAVITY = 900;
  const STINK_TIME = 3;       // seconds a poop can sit on the grass before it stinks (cat scores)
  const FROG_SPEED = 250;
  const FROG_JUMP_V = -720;
  const FROG_GRAVITY = 2000;
  const TONGUE_TIME = 0.4;    // the attack animation: 4 frames of 100 ms
  const GREEN_COOLDOWN = 5;   // seconds between two super stinky green poops
  const GREEN_STINK_POINTS = 2;
  const STUN_TIME = 1;        // seconds a dizzy cat or frog can't do anything
  const SPIT_SPEED = 700;     // the frog's spit ball flies straight up
  const SPIT_COOLDOWN = 1.5;

  // ---- Sprites ----
  // Both sheets are one row of frames, made with tools/export-aseprite.js. Frame numbers match the Aseprite tags.
  const KITTY = {
    img: loadImage('assets/kitty.png'),
    w: 20, h: 18, anchor: 10, // anchor = body center in sprite pixels
    idle: { right: [2, 9], left: [18, 25] },
    walk: { right: [10, 13], left: [26, 29] },
    jumpUp: { right: [14, 15], left: [30, 31] },
  };
  const FROG = {
    img: loadImage('assets/frog.png'),
    w: 59, h: 18, anchor: 12, // the frog's body sits at the left of each frame; the tongue needs the rest
    idle: [1, 4], hop: [5, 11], hurt: [12, 13], attack: [14, 17],
  };
  // Poop, drawn in code in the same style as the sprites: white outer edge, dark outline, highlight.
  const POOP = [
    '.....ww.....',
    '....wddw....',
    '...wdbbdw...',
    '..wdddddw...',
    '..wdblbbdw..',
    '.wdddddddw..',
    '.wdbbbbbbbdw',
    'wdddddddddw.',
    'wwwwwwwwwww.',
  ];
  const POOP_W = 12 * PX, POOP_H = 9 * PX;

  // ---- Palette: DawnBringer 32, the palette the kitty and frog were drawn with ----
  const C = {
    ink: '#222034', plum: '#45283c', woodDark: '#663931', wood: '#8f563b', tan: '#d9a066', peach: '#eec39a',
    orange: '#df7126', yellow: '#fbf236', lime: '#99e550', green: '#6abe30', teal: '#37946e', olive: '#4b692f',
    moss: '#8f974a', sky: '#639bff', cyan: '#5fcde4', pale: '#cbdbfc', white: '#ffffff', pink: '#d77bba', rose: '#d95763',
  };
  const POOP_COLORS = { w: C.white, d: C.plum, b: C.wood, l: C.tan };
  const GREEN_POOP_COLORS = { w: C.white, d: C.olive, b: C.green, l: C.lime };
  // The frog's spit ball.
  const SPIT = [
    '..w..',
    '.wcw.',
    'wcccw',
    'wcpcw',
    'wcccw',
    '.www.',
  ];
  const SPIT_COLORS = { w: C.white, c: C.cyan, p: C.pale };
  const SPIT_W = 5 * PX, SPIT_H = 6 * PX;

  function loadImage(src) { const img = new Image(); img.src = src; return img; }
  const ready = (img) => img.complete && img.naturalWidth > 0;

  // ---- Canvas setup ----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    canvas.style.height = (cssW * H) / W + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(((cssW * H) / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Sound: small generated beeps, no audio files ----
  let audio = null;
  function beep(freq, dur, type = 'square', vol = 0.05, slideTo) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, audio.currentTime + dur);
      gain.gain.value = vol;
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + dur);
    } catch (e) { /* sound is optional */ }
  }
  const sfx = {
    plop: () => beep(300, 0.15, 'sine', 0.08, 120),
    land: () => beep(110, 0.08, 'triangle', 0.08),
    slurp: () => beep(400, 0.15, 'square', 0.04, 900),
    bonus: () => { beep(700, 0.08); setTimeout(() => beep(1050, 0.12), 80); },
    stink: () => beep(90, 0.35, 'sawtooth', 0.05, 60),
    jump: () => beep(480, 0.1, 'square', 0.03, 700),
    bigPlop: () => { beep(200, 0.25, 'sine', 0.09, 70); setTimeout(() => beep(80, 0.3, 'sawtooth', 0.04, 50), 120); },
    dizzy: () => { beep(900, 0.12, 'triangle', 0.05, 300); setTimeout(() => beep(700, 0.12, 'triangle', 0.05, 250), 130); },
    spit: () => beep(250, 0.1, 'square', 0.04, 900),
    hit: () => { beep(160, 0.1, 'square', 0.07); setTimeout(() => beep(1200, 0.1, 'square', 0.04), 90); },
    end: () => { beep(520, 0.15); setTimeout(() => beep(660, 0.15), 160); setTimeout(() => beep(880, 0.3), 320); },
  };

  // ---- Input (both players share one keyboard) ----
  const keys = new Set();
  const GAME_KEYS = ['KeyA', 'KeyD', 'KeyS', 'KeyW', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Slash', 'ShiftRight', 'Space', 'Enter'];
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    onPress(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear()); // avoid stuck keys when the window loses focus

  // ---- Game state ----
  let state; // 'ready' | 'playing' | 'over'
  let cat, frog, poops, spits, puffs, popups, timeLeft, overAt;

  function reset() {
    state = 'ready';
    cat = { x: W * 0.3, facing: 'right', moving: false, anim: 0, tummy: TUMMY_MAX, refill: 0, cooldown: 0, score: 0, squat: 0,
      green: 0, stun: 0 };
    frog = { x: W * 0.7, y: GROUND_Y, vy: 0, facing: 'left', moving: false, anim: 0, tongue: 0, score: 0,
      spit: 0, spitPose: 0, stun: 0 };
    poops = [];
    spits = [];
    puffs = [];
    popups = [];
    timeLeft = ROUND_SECONDS;
  }

  function onPress(code) {
    if (code === 'Space' || code === 'Enter') {
      if (state === 'ready') { state = 'playing'; return; }
      if (state === 'over' && performance.now() - overAt > 600) { reset(); state = 'playing'; return; }
    }
    if (state !== 'playing') return;
    // A dizzy player can't act.
    if (cat.stun <= 0) {
      if (code === 'KeyS') catPoop(false);
      if (code === 'KeyW') catPoop(true);
    }
    if (frog.stun <= 0) {
      if (code === 'ArrowUp' && frog.y >= GROUND_Y && frog.tongue <= 0) { frog.vy = FROG_JUMP_V; sfx.jump(); }
      if (code === 'ArrowDown' && frog.tongue <= 0) { frog.tongue = TONGUE_TIME; sfx.slurp(); }
      if ((code === 'Slash' || code === 'ShiftRight') && frog.spit <= 0 && frog.tongue <= 0) frogSpit();
    }
  }

  // Green = super stinky: makes the frog dizzy if eaten, worth more if it stinks. It has its own cooldown.
  function catPoop(green) {
    if (cat.tummy < 1 || cat.cooldown > 0 || (green && cat.green > 0)) return;
    cat.tummy -= 1;
    cat.cooldown = POOP_COOLDOWN;
    cat.squat = 0.2;
    if (green) cat.green = GREEN_COOLDOWN;
    // The poop comes out of the back of the kitty.
    const back = cat.facing === 'right' ? -1 : 1;
    poops.push({ x: cat.x + back * 6 * PX, y: FENCE_Y - POOP_H, vy: 0, vx: back * 20, landed: false, sit: 0, green });
    green ? sfx.bigPlop() : sfx.plop();
  }

  // The frog spits a ball straight up from its mouth. If it hits the cat, the cat gets dizzy.
  function frogSpit() {
    frog.spit = SPIT_COOLDOWN;
    frog.spitPose = 0.15;
    const mouth = frog.facing === 'right' ? 5 * PX : -5 * PX;
    spits.push({ x: frog.x + mouth, y: frog.y - 14 * PX });
    sfx.spit();
  }

  function stun(who, x, y) {
    who.stun = STUN_TIME;
    sfx.dizzy();
    popups.push({ x, y, text: 'DIZZY!', color: C.yellow, t: 0 });
  }

  // ---- Hitboxes ----
  function frogBody() {
    return { x: frog.x - 9 * PX, y: frog.y - 13 * PX, w: 18 * PX, h: 13 * PX };
  }
  // The tongue only counts while it is stretched out (attack frames 2 and 3).
  function frogTongue() {
    const t = TONGUE_TIME - frog.tongue;
    if (frog.tongue <= 0 || t < 0.08 || t > 0.32) return null;
    const reach = 46 * PX;
    const x = frog.facing === 'right' ? frog.x + 8 * PX : frog.x - 8 * PX - reach;
    return { x, y: frog.y - 13 * PX, w: reach, h: 10 * PX };
  }
  function catBody() {
    return { x: cat.x - 8 * PX, y: FENCE_Y - 15 * PX, w: 16 * PX, h: 15 * PX };
  }
  const poopBox = (p) => ({ x: p.x - POOP_W / 2, y: p.y, w: POOP_W, h: POOP_H });
  const spitBox = (s) => ({ x: s.x - SPIT_W / 2, y: s.y, w: SPIT_W, h: SPIT_H });
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---- Update ----
  function update(dt) {
    // Floating "+1" texts and stink clouds keep moving on every screen.
    popups.forEach((p) => { p.t += dt; p.y -= 30 * dt; });
    popups = popups.filter((p) => p.t < 1);
    puffs.forEach((p) => { p.t += dt; });
    puffs = puffs.filter((p) => p.t < 0.8);
    if (state !== 'playing') { cat.anim += dt * 10; frog.anim += dt * 10; return; }

    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; state = 'over'; overAt = performance.now(); sfx.end(); return; }

    // Cat: walk on the fence, refill the tummy over time.
    cat.stun -= dt;
    cat.green -= dt;
    const catDir = cat.stun > 0 ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    cat.moving = catDir !== 0;
    if (catDir) cat.facing = catDir > 0 ? 'right' : 'left';
    cat.x = Math.max(30, Math.min(W - 30, cat.x + catDir * CAT_SPEED * dt));
    cat.anim += dt * 10;
    cat.cooldown -= dt;
    cat.squat -= dt;
    if (cat.tummy < TUMMY_MAX) {
      cat.refill += dt;
      if (cat.refill >= TUMMY_REFILL) { cat.refill = 0; cat.tummy += 1; }
    } else cat.refill = 0;

    // Frog: hop sideways (not while the tongue is out), jump with gravity.
    frog.stun -= dt;
    frog.spit -= dt;
    frog.spitPose -= dt;
    const frogBusy = frog.tongue > 0 || frog.stun > 0;
    const frogDir = frogBusy ? 0 : (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    frog.moving = frogDir !== 0;
    if (frogDir) frog.facing = frogDir > 0 ? 'right' : 'left';
    frog.x = Math.max(36, Math.min(W - 36, frog.x + frogDir * FROG_SPEED * dt));
    frog.vy += FROG_GRAVITY * dt;
    frog.y += frog.vy * dt;
    if (frog.y >= GROUND_Y) { frog.y = GROUND_Y; frog.vy = 0; }
    frog.anim += dt * 10;
    frog.tongue -= dt;

    // Spit balls fly up; hitting the cat makes it dizzy (no points, the user's choice).
    const catBox = catBody();
    for (const sp of spits) {
      sp.y -= SPIT_SPEED * dt;
      if (sp.y < -SPIT_H) sp.gone = true;
      else if (overlap(spitBox(sp), catBox)) {
        sp.gone = true;
        sfx.hit();
        popups.push({ x: cat.x, y: FENCE_Y - 70, text: 'HIT!', color: C.cyan, t: 0 });
        stun(cat, cat.x, FENCE_Y - 90);
      }
    }
    spits = spits.filter((sp) => !sp.gone);

    // Poop: fall, land, then start to stink. A dizzy frog can't eat.
    const body = frog.stun > 0 ? null : frogBody();
    const tongue = frog.stun > 0 ? null : frogTongue();
    for (const p of poops) {
      if (!p.landed) {
        p.vy += POOP_GRAVITY * dt;
        p.y += p.vy * dt;
        p.x += p.vx * dt;
        if (p.y + POOP_H >= GROUND_Y) { p.y = GROUND_Y - POOP_H; p.landed = true; sfx.land(); }
      } else {
        p.sit += dt;
      }
      const box = poopBox(p);
      if ((body && overlap(box, body)) || (tongue && overlap(box, tongue))) {
        // Fetched! Catching it before it lands is worth double. Green poop still scores, but the frog gets dizzy.
        const pts = p.landed ? 1 : 2;
        frog.score += pts;
        p.gone = true;
        popups.push({ x: p.x, y: p.y, text: '+' + pts, color: C.lime, t: 0 });
        pts > 1 ? sfx.bonus() : sfx.slurp();
        if (p.green) {
          stun(frog, frog.x, frog.y - 80);
          frog.tongue = 0;
          puffs.push({ x: frog.x, y: frog.y - 20, t: 0 });
        }
      } else if (p.sit >= STINK_TIME) {
        const pts = p.green ? GREEN_STINK_POINTS : 1;
        cat.score += pts;
        p.gone = true;
        puffs.push({ x: p.x, y: GROUND_Y - 10, t: 0, big: p.green });
        popups.push({ x: p.x, y: GROUND_Y - 40, text: (p.green ? 'SUPER STINK! +' : 'STINK! +') + pts, color: C.orange, t: 0 });
        sfx.stink();
      }
    }
    poops = poops.filter((p) => !p.gone);
  }

  // ---- Drawing helpers ----
  const pick = ([from, to], t) => from + (Math.floor(t) % (to - from + 1));
  const snap = (v) => Math.round(v / PX) * PX; // keep everything on the sprite pixel grid, like real pixel art

  // Draws one frame so that (x, bottom) is the sprite's anchor point on the ground. Flips for facing left.
  function drawFrame(sheet, frame, x, bottom, flip, scaleY = 1) {
    if (!ready(sheet.img)) return;
    const w = sheet.w * PX, h = Math.round(sheet.h * scaleY) * PX;
    ctx.save();
    ctx.translate(snap(x), snap(bottom) - h);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sheet.img, frame * sheet.w, 0, sheet.w, sheet.h, -sheet.anchor * PX, 0, w, h);
    ctx.restore();
  }

  function drawPixels(rows, x, y, colors, size = PX) {
    x = Math.round(x / size) * size;
    y = Math.round(y / size) * size;
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const col = colors[row[c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + c * size, y + r * size, size, size);
      }
    });
  }

  // ---- Pixel-art backyard ----
  // Painted once at sprite resolution (1 pixel here = PX pixels on screen), then scaled up,
  // so it is exactly as chunky as the kitty and frog. Only DawnBringer 32 colors (see C).
  const BW = Math.ceil(W / PX), BH = Math.ceil(H / PX);
  const FENCE_ROW = Math.round(FENCE_Y / PX);   // top of the rail the cat walks on
  const GROUND_ROW = Math.round(GROUND_Y / PX); // top of the grass

  function makeLayer(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const dot = (x, y, col, dw = 1, dh = 1) => { g.fillStyle = col; g.fillRect(x, y, dw, dh); };
    paint(dot);
    return c;
  }
  // Same "random" on every load, so knots and flowers don't move around.
  function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

  // Fills a blob made of circles: dark edge, main color, light top-left. Used for bushes and clouds.
  function blob(dot, circles, edge, fill, light, shade) {
    const inside = (x, y) => circles.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
    const xs = circles.map(([cx, , r]) => [cx - r, cx + r]).flat(), ys = circles.map(([, cy, r]) => [cy - r, cy + r]).flat();
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        if (!inside(x, y)) continue;
        const isEdge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        let col = fill;
        if (isEdge && edge) col = edge;
        else if (light && !inside(x - 2, y - 2)) col = light;
        else if (shade && !inside(x, y + 2)) col = shade;
        dot(x, y, col);
      }
    }
  }

  const skyLayer = makeLayer(BW, BH, (dot) => {
    // Three bands of blue with a checkerboard dither where they meet.
    dot(0, 0, C.sky, BW, 20);
    dot(0, 20, C.cyan, BW, 20);
    dot(0, 40, C.pale, BW, FENCE_ROW - 39);
    for (const [y, top, bottom] of [[20, C.sky, C.cyan], [40, C.cyan, C.pale]]) {
      for (let x = 0; x < BW; x++) {
        if (x % 2 === 0) dot(x, y - 1, bottom);
        else dot(x, y, top);
      }
    }
    // Sun with a light edge.
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= 49) dot(192 + dx, 15 + dy, d <= 25 ? C.yellow : C.peach);
    }
    dot(189, 12, C.white, 2, 2);
  });

  // Two cloud shapes; they drift across the sky behind the trees.
  const cloudImgs = [
    [[6, 6, 5], [13, 4, 6], [20, 6, 5], [12, 8, 5]],
    [[5, 5, 4], [11, 4, 5], [16, 6, 4]],
  ].map((circles) => makeLayer(28, 14, (dot) => blob(dot, circles, null, C.white, null, C.pale)));
  const clouds = [{ x: 10, y: 6, k: 0, v: 3 }, { x: 110, y: 22, k: 1, v: 5 }, { x: 180, y: 4, k: 0, v: 2 }];

  const frontLayer = makeLayer(BW, BH, (dot) => {
    const rnd = seeded(7);

    // Trees peeking over the fence.
    for (let x = 0; x < BW; x++) {
      const top = Math.round(44 + 3 * Math.sin(x / 7) + 2 * Math.sin(x / 3.1 + 1));
      dot(x, top, C.olive);
      dot(x, top + 1, C.teal, 1, FENCE_ROW - top);
      if ((x * 3 + top) % 7 === 0) dot(x, top + 2, C.green);
    }

    // Fence planks: dark gap, lit left edge, wood, shaded right edge, plus grain and knots.
    const plankTop = FENCE_ROW + 6, plankH = GROUND_ROW - plankTop;
    for (let x0 = 0; x0 < BW; x0 += 11) {
      dot(x0, plankTop, C.ink, 1, plankH);
      dot(x0 + 1, plankTop, C.tan, 1, plankH);
      dot(x0 + 2, plankTop, C.wood, 8, plankH);
      dot(x0 + 10, plankTop, C.woodDark, 1, plankH);
      for (let k = 0; k < 5; k++) {
        dot(x0 + 3 + Math.floor(rnd() * 6), plankTop + 2 + Math.floor(rnd() * (plankH - 10)), C.woodDark, 1, 2 + Math.floor(rnd() * 4));
      }
      if (rnd() < 0.5) {
        const kx = x0 + 4 + Math.floor(rnd() * 4), ky = plankTop + 8 + Math.floor(rnd() * (plankH - 20));
        dot(kx, ky, C.woodDark, 2, 2);
        dot(kx, ky, C.plum);
      }
    }
    // Shadow at the foot of the fence.
    for (let y = GROUND_ROW - 4; y < GROUND_ROW; y++) for (let x = 0; x < BW; x++) {
      if ((x + y) % 2 === 0 || y >= GROUND_ROW - 2) dot(x, y, C.woodDark);
    }
    // Two rails with nail heads. The top one is where the cat walks.
    for (const y of [FENCE_ROW, FENCE_ROW + 38]) {
      dot(0, y, C.ink, BW, 1);
      dot(0, y + 1, C.tan, BW, 1);
      dot(0, y + 2, C.wood, BW, 2);
      dot(0, y + 4, C.woodDark, BW, 1);
      dot(0, y + 5, C.ink, BW, 1);
      for (let x0 = 0; x0 < BW; x0 += 11) dot(x0 + 5, y + 2, C.ink);
    }

    // Bushes at the bottom of the fence.
    for (const cx of [22, 96, 168, 246]) {
      blob(dot, [[cx - 7, GROUND_ROW - 3, 5], [cx, GROUND_ROW - 6, 7], [cx + 7, GROUND_ROW - 3, 5]], C.olive, C.green, C.lime);
    }

    // Grass: bright top edge, blades poking up, then darker toward the bottom.
    dot(0, GROUND_ROW, C.green, BW, BH - GROUND_ROW);
    dot(0, GROUND_ROW, C.lime, BW, 1);
    for (let x = 0; x < BW; x++) {
      const r = rnd();
      if (r < 0.4) dot(x, GROUND_ROW - 1, C.lime);
      if (r < 0.12) dot(x, GROUND_ROW - 2, C.green);
    }
    for (let y = GROUND_ROW + 7; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (y >= GROUND_ROW + 11 ? (x + y) % 2 === 0 : (x + y) % 4 === 0) dot(x, y, C.olive);
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rnd() * BW), y = GROUND_ROW + 2 + Math.floor(rnd() * 5);
      dot(x, y, C.olive);
      dot(x + 1, y - 1, C.olive);
    }
    // A few flowers.
    for (let i = 0; i < 9; i++) {
      const x = 4 + Math.floor(rnd() * (BW - 8)), y = GROUND_ROW + 3 + Math.floor(rnd() * 10);
      const petal = i % 2 ? C.white : C.pink;
      dot(x - 1, y, petal); dot(x + 1, y, petal); dot(x, y - 1, petal); dot(x, y + 1, petal);
      dot(x, y, C.yellow);
    }
  });

  function drawBackground(dt) {
    ctx.drawImage(skyLayer, 0, 0, BW * PX, BH * PX);
    for (const c of clouds) {
      c.x -= c.v * dt;
      if (c.x < -30) c.x = BW + 5;
      ctx.drawImage(cloudImgs[c.k], Math.round(c.x) * PX, c.y * PX, 28 * PX, 14 * PX);
    }
    ctx.drawImage(frontLayer, 0, 0, BW * PX, BH * PX);
  }

  // One square sprite pixel at a logical position, snapped to the grid.
  function pixel(x, y, col) { ctx.fillStyle = col; ctx.fillRect(snap(x), snap(y), PX, PX); }

  function drawPoop(p) {
    drawPixels(POOP, p.x - POOP_W / 2, p.y, p.green ? GREEN_POOP_COLORS : POOP_COLORS);
    // Green poop already stinks while it falls; normal poop only once it sits.
    if (!p.landed && !p.green) return;
    const k = p.landed ? p.sit / STINK_TIME : 0.3;
    // Wiggly stink wisps that get taller as the timer runs out. Green poop gets more and taller ones.
    const steps = 2 + Math.floor(k * 6) + (p.green ? 3 : 0);
    const wisps = p.green ? 2 : 1;
    for (let i = -wisps; i <= wisps; i++) {
      for (let s = 0; s < steps; s++) {
        const xx = p.x + i * 4 * PX + Math.round(Math.sin(s * 1.1 + performance.now() / 160 + i * 2)) * PX;
        pixel(xx, p.y - PX * (2 + s), s % 2 ? C.moss : C.lime);
      }
    }
    if (!p.landed) return;
    // Countdown bar under the poop, so both players can see how close it is to stinking.
    const bw = 10, x0 = snap(p.x) - (bw / 2) * PX, y0 = snap(p.y + POOP_H + 2 * PX);
    ctx.fillStyle = C.ink;
    ctx.fillRect(x0 - PX, y0 - PX, (bw + 2) * PX, 3 * PX);
    ctx.fillStyle = k > 0.7 ? C.rose : C.yellow;
    ctx.fillRect(x0, y0, Math.ceil(bw * (1 - k)) * PX, PX);
  }

  // A stink cloud made of pixels; it grows and breaks up as it fades.
  function drawPuff(p) {
    const r = Math.round((4 + p.t * 8) * (p.big ? 1.6 : 1)) * PX;
    const col = p.t < 0.4 ? C.lime : C.moss;
    for (let dy = -r; dy <= r; dy += PX) for (let dx = -r; dx <= r; dx += PX) {
      if (dx * dx + dy * dy > r * r) continue;
      if (p.t > 0.5 && (dx / PX + dy / PX) % 2 === 0) continue; // checkerboard fade-out
      pixel(p.x + dx, p.y - p.t * 30 + dy * 0.6, col);
    }
  }

  // Three little stars circling above a dizzy head.
  function drawStars(x, y) {
    const t = performance.now() / 180;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 8 * PX, sy = y + Math.sin(a) * 2 * PX;
      pixel(sx, sy, C.yellow);
      pixel(sx - PX, sy, C.yellow); pixel(sx + PX, sy, C.yellow);
      pixel(sx, sy - PX, C.yellow); pixel(sx, sy + PX, C.yellow);
    }
  }

  function drawSpit(sp) { drawPixels(SPIT, sp.x - SPIT_W / 2, sp.y, SPIT_COLORS); }

  function drawCat() {
    let frame;
    if (cat.stun > 0) frame = pick(KITTY.idle[cat.facing], 0);
    else if (cat.squat > 0) frame = pick(KITTY.jumpUp[cat.facing], 0); // a little hop while pooping
    else if (cat.moving && state === 'playing') frame = pick(KITTY.walk[cat.facing], cat.anim);
    else frame = pick(KITTY.idle[cat.facing], cat.anim);
    // A dizzy cat wobbles side to side.
    const wobble = cat.stun > 0 ? Math.round(Math.sin(performance.now() / 60)) * PX : 0;
    drawFrame(KITTY, frame, cat.x + wobble, FENCE_Y + 2, false, cat.squat > 0 ? 0.85 : 1);
    if (cat.stun > 0) drawStars(cat.x, FENCE_Y - 19 * PX);
  }

  function drawFrog() {
    let frame;
    if (frog.stun > 0) frame = pick(FROG.hurt, frog.anim); // dizzy from green poop: red flash
    else if (state === 'over' && frog.score < cat.score) frame = pick(FROG.hurt, frog.anim / 2); // the loser blushes red
    else if (frog.spitPose > 0) frame = FROG.attack[0];
    else if (frog.tongue > 0) frame = FROG.attack[0] + Math.min(3, Math.floor((TONGUE_TIME - frog.tongue) / 0.1));
    else if (frog.y < GROUND_Y) frame = frog.vy < 0 ? 6 : 9; // hop frames for going up / coming down
    else if (frog.moving) frame = pick(FROG.hop, frog.anim);
    else frame = pick(FROG.idle, frog.anim);
    drawFrame(FROG, frame, frog.x, frog.y + PX, frog.facing === 'left');
    if (frog.stun > 0) drawStars(frog.x, frog.y - 16 * PX);
  }

  // ---- Text: pixel font with a dark outline, like the sprites' outlines ----
  const FONT = '"Press Start 2P", ui-monospace, Menlo, monospace';
  try { document.fonts.load(`16px ${FONT}`); } catch (e) { /* falls back to monospace */ }
  function text(str, x, y, size, color, align = 'left') {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillStyle = C.ink;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) ctx.fillText(str, x + dx, y + dy);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawHud() {
    text('CAT ' + cat.score, 16, 30, 16, C.orange);
    // Tummy: one little poop per poop the cat has ready.
    for (let i = 0; i < TUMMY_MAX; i++) {
      ctx.globalAlpha = i < cat.tummy ? 1 : 0.3;
      drawPixels(POOP, 16 + i * 28, 40, POOP_COLORS, 2);
      ctx.globalAlpha = 1;
    }
    // Green poop ready? (faded while it recharges)
    ctx.globalAlpha = cat.green > 0 ? 0.3 : 1;
    drawPixels(POOP, 16 + TUMMY_MAX * 28 + 10, 40, GREEN_POOP_COLORS, 2);
    ctx.globalAlpha = 1;
    text('W', 16 + TUMMY_MAX * 28 + 38, 58, 8, cat.green > 0 ? C.pale : C.lime);
    text(frog.score + ' FROG', W - 16, 30, 16, C.lime, 'right');
    // Spit ready? (faded while it recharges)
    ctx.globalAlpha = frog.spit > 0 ? 0.3 : 1;
    drawPixels(SPIT, W - 30, 40, SPIT_COLORS, 3);
    ctx.globalAlpha = 1;
    text(String(Math.ceil(timeLeft)), W / 2, 30, 16, timeLeft < 10 && state === 'playing' ? C.rose : C.white, 'center');
  }

  // A pixel-art box: dark edge, white border, dark inside.
  function panel(lines) {
    const w = 540, h = 36 + lines.length * 30, x = W / 2 - w / 2, y = 200;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.white;
    ctx.fillRect(x + PX, y + PX, w - 2 * PX, h - 2 * PX);
    ctx.fillStyle = C.ink;
    ctx.fillRect(x + 2 * PX, y + 2 * PX, w - 4 * PX, h - 4 * PX);
    lines.forEach(([str, size, color], i) => text(str, W / 2, y + 40 + i * 30, size, color || C.white, 'center'));
  }

  function draw(dt) {
    drawBackground(dt);
    poops.forEach(drawPoop);
    spits.forEach(drawSpit);
    drawCat();
    drawFrog();
    puffs.forEach(drawPuff);
    popups.forEach((p) => {
      ctx.globalAlpha = Math.max(0, 1 - p.t);
      text(p.text, p.x, p.y, 12, p.color, 'center');
      ctx.globalAlpha = 1;
    });

    drawHud();

    if (state === 'ready') {
      panel([
        ['CAT vs FROG', 20, C.yellow],
        ['Cat: A/D walk, S poop, W green poop', 12, C.orange],
        ['Frog: ←→ hop, ↑ jump, ↓ tongue, / spit', 12, C.lime],
        ['Press SPACE to start', 12],
      ]);
    } else if (state === 'over') {
      const winner = cat.score > frog.score ? ['THE CAT WINS!', C.orange] : frog.score > cat.score ? ['THE FROG WINS!', C.lime] : ["IT'S A TIE!", C.white];
      panel([
        [winner[0], 20, winner[1]],
        [`Cat ${cat.score} - ${frog.score} Frog`, 14],
        ['Press SPACE to play again', 12],
      ]);
    }
  }

  // ---- Main loop ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); // cap the step after a hidden tab
    last = now;
    update(dt);
    draw(dt);
    requestAnimationFrame(frame);
  }
  reset();
  requestAnimationFrame(frame);

  // For automated checks in the browser.
  window.__catFrog = { get state() { return state; }, get cat() { return cat; }, get frog() { return frog; }, get poops() { return poops; }, get spits() { return spits; }, get timeLeft() { return timeLeft; } };
})();
