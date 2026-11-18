// Cat & Frog: Bug Hunt. Two players on one keyboard race to catch the most bugs: the cat pounces down from the fence, the frog jumps and licks.
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
  const POUNCE_TIME = 0.6;    // seconds for the cat to dive down and spring back onto the fence
  const POUNCE_DEPTH = 170;   // how far below the fence the cat reaches
  const LEAP_TIME = 0.6;      // seconds for the cat's jump up from the fence and back down
  const LEAP_HEIGHT = 100;    // how far above the fence the cat jumps
  const POUNCE_REST = 0.15;   // short pause on the fence before the next pounce or jump
  const FROG_SPEED = 250;
  const FROG_JUMP_V = -720;
  const FROG_GRAVITY = 2000;
  const TONGUE_TIME = 0.4;    // the attack animation: 4 frames of 100 ms
  const STUN_TIME = 1;        // seconds a bee-stung player can't do anything
  // Special attacks: every few bugs caught fills a meter. Then the cat can drop a stinky poop (E)
  // and the frog can spit straight up (Enter). A hit makes the other player dizzy for a while.
  const SPECIAL_EVERY = 5;    // bugs to catch (bees don't count) for one attack
  const ATTACK_STUN = 3;      // seconds dizzy after a poop or spit hit
  const STINK_TIME = 2.5;     // how long the stink cloud stays on the grass
  const STINK_RADIUS = 70;    // how far left and right of the poop the stink reaches
  const STINK_HEIGHT = 50;    // how high the stink reaches; a jumping frog can get over it
  const SPIT_SPEED = 650;     // the spit flies straight up this fast
  // Bugs fly in two bands: the sky above the fence (only the cat's jump reaches) and the yard below it.
  const BUG_BANDS = { sky: [55, 145], yard: [195, 380] };
  const SKY_SHARE = 0.3;                 // part of the bugs that fly in the sky band
  const BUG_EVERY = [0.5, 0.9];          // seconds between two new bugs (random in this range)
  const MAX_BUGS = 7;

  // ---- Sprites ----
  // Both sheets are one row of frames, made with tools/export-aseprite.js. Frame numbers match the Aseprite tags.
  const KITTY = {
    img: loadImage('assets/kitty.png'),
    w: 20, h: 18, anchor: 10, // anchor = body center in sprite pixels
    idle: { right: [2, 9], left: [18, 25] },
    walk: { right: [10, 13], left: [26, 29] },
    jumpUp: { right: [14, 15], left: [30, 31] },
    fall: { right: [16, 17], left: [32, 33] },
  };
  const FROG = {
    img: loadImage('assets/frog.png'),
    w: 59, h: 18, anchor: 12, // the frog's body sits at the left of each frame; the tongue needs the rest
    idle: [1, 4], hop: [5, 11], hurt: [12, 13], attack: [14, 17],
  };

  // ---- Palette: DawnBringer 32, the palette the kitty and frog were drawn with ----
  const C = {
    ink: '#222034', plum: '#45283c', woodDark: '#663931', wood: '#8f563b', tan: '#d9a066', peach: '#eec39a',
    orange: '#df7126', yellow: '#fbf236', lime: '#99e550', green: '#6abe30', teal: '#37946e', olive: '#4b692f',
    moss: '#8f974a', sky: '#639bff', cyan: '#5fcde4', pale: '#cbdbfc', white: '#ffffff', pink: '#d77bba', rose: '#d95763',
  };

  // ---- Bugs: drawn in code as tiny pixel grids, two wing frames each, facing right ----
  const BUGS = {
    fly: {
      points: 1, speed: [90, 140], wave: 10, waveSpeed: 3, weight: 55,
      colors: { w: C.pale, d: C.ink, r: C.rose },
      frames: [
        ['.w...w.', '.ww.ww.', '..ddd..', '.dddddr', '..ddd..'],
        ['.......', '.......', 'wwdddww', '.dddddr', '..ddd..'],
      ],
    },
    butterfly: {
      points: 2, speed: [55, 80], wave: 30, waveSpeed: 2, weight: 20,
      colors: { p: C.pink, r: C.rose, d: C.ink },
      frames: [
        ['rr...rr', 'rpr.rpr', 'rppdppr', '.rpdpr.', '.rr.rr.'],
        ['.......', '..r.r..', '..rdr..', '..pdp..', '..r.r..'],
      ],
    },
    firefly: {
      points: 3, speed: [210, 260], wave: 15, waveSpeed: 5, weight: 10,
      colors: { w: C.pale, d: C.ink, y: C.yellow },
      frames: [
        ['.w..w.', '..dd..', '.dddd.', 'yyyyd.', '.yy...'],
        ['......', 'wwddww', '.dddd.', 'yyyyd.', '.yy...'],
      ],
    },
    bee: {
      points: 0, speed: [100, 130], wave: 12, waveSpeed: 4, weight: 15, // a bee stings: dizzy, no points
      colors: { w: C.white, d: C.ink, y: C.yellow },
      frames: [
        ['...ww..', '...ww..', '.ydydy.', 'dydydyd', '.ydydy.'],
        ['.......', '..wwww.', '.ydydy.', 'dydydyd', '.ydydy.'],
      ],
    },
  };
  // Mirrored copies for bugs flying left.
  for (const b of Object.values(BUGS)) {
    b.flipped = b.frames.map((rows) => rows.map((r) => [...r].reverse().join('')));
    b.w = b.frames[0][0].length * PX;
    b.h = b.frames[0].length * PX;
    b.edge = Object.fromEntries(Object.keys(b.colors).map((k) => [k, C.white]));
  }

  function loadImage(src) { const img = new Image(); img.src = src; return img; }
  const ready = (img) => img.complete && img.naturalWidth > 0;

  // ---- Canvas setup ----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth; // the CSS sizes the canvas to fill the window at 16:9
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
    pounce: () => beep(600, 0.12, 'square', 0.03, 250),
    slurp: () => beep(400, 0.15, 'square', 0.04, 900),
    catch: () => beep(880, 0.08, 'square', 0.05),
    bonus: () => { beep(700, 0.08); setTimeout(() => beep(1050, 0.12), 80); },
    jump: () => beep(480, 0.1, 'square', 0.03, 700),
    fart: () => { beep(110, 0.3, 'sawtooth', 0.06, 60); setTimeout(() => beep(80, 0.2, 'sawtooth', 0.05, 50), 220); },
    spit: () => beep(300, 0.1, 'triangle', 0.06, 1400),
    ready: () => { beep(660, 0.06); setTimeout(() => beep(990, 0.06), 70); setTimeout(() => beep(1320, 0.1), 140); },
    sting: () => { beep(160, 0.1, 'sawtooth', 0.07); setTimeout(() => beep(900, 0.12, 'triangle', 0.05, 300), 100); },
    end: () => { beep(520, 0.15); setTimeout(() => beep(660, 0.15), 160); setTimeout(() => beep(880, 0.3), 320); },
  };

  // ---- Input (both players share one keyboard) ----
  const keys = new Set();
  const GAME_KEYS = ['KeyA', 'KeyD', 'KeyS', 'KeyW', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter'];
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    onPress(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear()); // avoid stuck keys when the window loses focus

  // F toggles real fullscreen (hides the browser bars too).
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (err) { /* fullscreen not allowed here; the game still fills the window */ }
  });

  // ---- Game state ----
  let state; // 'ready' | 'playing' | 'over'
  let cat, frog, bugs, bursts, popups, poops, spits, timeLeft, overAt, nextBug;
  let rand = Math.random; // swapped for a fixed sequence in tests

  function reset() {
    state = 'ready';
    // dive = how far below the fence the cat is right now (negative = above it).
    // pounce / leap count down while the cat dives down / jumps up and comes back.
    // eaten = bugs caught toward the next special attack (full at SPECIAL_EVERY).
    cat = { x: W * 0.3, facing: 'right', moving: false, anim: 0, score: 0, pounce: 0, leap: 0, rest: 0, dive: 0, stun: 0, eaten: 0 };
    frog = { x: W * 0.7, y: GROUND_Y, vy: 0, facing: 'left', moving: false, anim: 0, tongue: 0, score: 0, stun: 0, eaten: 0 };
    bugs = [];
    poops = [];
    spits = [];
    bursts = [];
    popups = [];
    timeLeft = ROUND_SECONDS;
    nextBug = 0.3;
  }

  function onPress(code) {
    if (code === 'Space' || code === 'Enter') {
      if (state === 'ready') { state = 'playing'; return; }
      if (state === 'over' && performance.now() - overAt > 600) { reset(); state = 'playing'; return; }
    }
    if (state !== 'playing') return;
    // A stung (dizzy) player can't act.
    const catFree = cat.stun <= 0 && cat.pounce <= 0 && cat.leap <= 0 && cat.rest <= 0;
    if (catFree && code === 'KeyS') { cat.pounce = POUNCE_TIME; sfx.pounce(); }
    if (catFree && code === 'KeyW') { cat.leap = LEAP_TIME; sfx.jump(); }
    // Cat special: drop a poop from wherever the cat is. It falls onto the grass and stinks.
    if (code === 'KeyE' && cat.stun <= 0 && cat.eaten >= SPECIAL_EVERY) {
      cat.eaten = 0;
      poops.push({ x: cat.x, y: FENCE_Y + cat.dive, vy: 0, landed: false, t: STINK_TIME, hit: false });
      sfx.fart();
    }
    // Frog special: spit straight up.
    if (code === 'Enter' && frog.stun <= 0 && frog.eaten >= SPECIAL_EVERY) {
      frog.eaten = 0;
      spits.push({ x: frog.x, y: frog.y - 13 * PX });
      sfx.spit();
    }
    if (frog.stun <= 0) {
      if (code === 'ArrowUp' && frog.y >= GROUND_Y && frog.tongue <= 0) { frog.vy = FROG_JUMP_V; sfx.jump(); }
      if (code === 'ArrowDown' && frog.tongue <= 0) { frog.tongue = TONGUE_TIME; sfx.slurp(); }
    }
  }

  // A new bug enters from the left or right edge at a random height. Rarer bugs are worth more.
  function spawnBug() {
    const total = Object.values(BUGS).reduce((s, b) => s + b.weight, 0);
    let roll = rand() * total, kind = 'fly';
    for (const [k, b] of Object.entries(BUGS)) { if ((roll -= b.weight) < 0) { kind = k; break; } }
    const b = BUGS[kind];
    const fromLeft = rand() < 0.5;
    const speed = b.speed[0] + rand() * (b.speed[1] - b.speed[0]);
    const [top, bottom] = rand() < SKY_SHARE ? BUG_BANDS.sky : BUG_BANDS.yard;
    bugs.push({
      kind,
      x: fromLeft ? -b.w : W + b.w,
      top, bottom,
      baseY: top + rand() * (bottom - top - b.h),
      y: 0,
      vx: fromLeft ? speed : -speed,
      t: rand() * 10, // where in its up-and-down wave it starts
    });
  }

  function stun(who, x, y, time = STUN_TIME, word = 'OUCH!') {
    who.stun = Math.max(who.stun, time);
    sfx.sting();
    popups.push({ x, y, text: word, color: C.yellow, t: 0 });
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
  // The cat only catches while it is pouncing (paws out); sitting on the fence it is out of the bugs' reach anyway.
  function catBody() {
    return { x: cat.x - 8 * PX, y: FENCE_Y + cat.dive - 15 * PX, w: 16 * PX, h: 15 * PX };
  }
  const bugBox = (g) => ({ x: g.x - BUGS[g.kind].w / 2, y: g.y, w: BUGS[g.kind].w, h: BUGS[g.kind].h });
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ---- Update ----
  function update(dt) {
    // Floating "+1" texts and catch sparkles keep moving on every screen.
    popups.forEach((p) => { p.t += dt; p.y -= 30 * dt; });
    popups = popups.filter((p) => p.t < 1);
    bursts.forEach((p) => { p.t += dt; });
    bursts = bursts.filter((p) => p.t < 0.4);
    moveBugs(dt); // bugs fly on the start screen too, so the yard feels alive
    if (state !== 'playing') { cat.anim += dt * 10; frog.anim += dt * 10; return; }

    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; state = 'over'; overAt = performance.now(); sfx.end(); return; }

    // Cat: walk on the fence; a pounce dives down, a leap jumps up, both come back to the fence
    // (slower sideways while in the air).
    cat.stun -= dt;
    cat.rest -= dt;
    const catDir = cat.stun > 0 ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    cat.moving = catDir !== 0;
    if (catDir) cat.facing = catDir > 0 ? 'right' : 'left';
    const catAir = cat.pounce > 0 || cat.leap > 0;
    cat.x = Math.max(30, Math.min(W - 30, cat.x + catDir * (catAir ? CAT_SPEED * 0.5 : CAT_SPEED) * dt));
    for (const k of ['pounce', 'leap']) {
      if (cat[k] <= 0) continue;
      cat[k] -= dt;
      if (cat[k] <= 0) { cat[k] = 0; cat.rest = POUNCE_REST; }
    }
    if (cat.pounce > 0) cat.dive = POUNCE_DEPTH * Math.sin(Math.PI * (1 - cat.pounce / POUNCE_TIME));
    else if (cat.leap > 0) cat.dive = -LEAP_HEIGHT * Math.sin(Math.PI * (1 - cat.leap / LEAP_TIME));
    else cat.dive = 0;
    cat.anim += dt * 10;

    // Frog: hop sideways (not while the tongue is out), jump with gravity.
    frog.stun -= dt;
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

    // New bugs keep arriving.
    nextBug -= dt;
    if (nextBug <= 0) {
      if (bugs.length < MAX_BUGS) spawnBug();
      nextBug = BUG_EVERY[0] + rand() * (BUG_EVERY[1] - BUG_EVERY[0]);
    }

    // Catching: the cat with its pounce, the frog with its body or tongue. A stung player can't catch.
    const catBox = cat.stun > 0 || (cat.pounce <= 0 && cat.leap <= 0) ? null : catBody();
    const body = frog.stun > 0 ? null : frogBody();
    const tongue = frog.stun > 0 ? null : frogTongue();
    for (const g of bugs) {
      const box = bugBox(g);
      let who = null;
      if (catBox && overlap(box, catBox)) who = cat;
      else if ((body && overlap(box, body)) || (tongue && overlap(box, tongue))) who = frog;
      if (!who) continue;
      g.gone = true;
      const b = BUGS[g.kind];
      bursts.push({ x: g.x, y: g.y + b.h / 2, t: 0, color: g.kind === 'bee' ? C.yellow : b.colors.p || b.colors.y || C.pale });
      if (g.kind === 'bee') {
        if (who === frog) frog.tongue = 0;
        stun(who, who === cat ? cat.x : frog.x, who === cat ? FENCE_Y + cat.dive - 80 : frog.y - 80);
        continue;
      }
      who.score += b.points;
      popups.push({ x: g.x, y: g.y, text: '+' + b.points, color: who === cat ? C.orange : C.lime, t: 0 });
      b.points > 1 ? sfx.bonus() : sfx.catch();
      // Fill the special-attack meter; say so when it becomes full.
      if (who.eaten < SPECIAL_EVERY && ++who.eaten === SPECIAL_EVERY) {
        const atCat = who === cat;
        popups.push({ x: atCat ? cat.x : frog.x, y: atCat ? FENCE_Y - 70 : frog.y - 70,
          text: atCat ? 'POOP READY!' : 'SPIT READY!', color: atCat ? C.orange : C.lime, t: -0.5 });
        sfx.ready();
      }
    }
    bugs = bugs.filter((g) => !g.gone);

    // Poop falls with gravity; on the grass it lets off a stink cloud for a while.
    // A frog in the cloud (not jumping over it) gets knocked dizzy, once per poop.
    for (const p of poops) {
      if (!p.landed) {
        p.vy += FROG_GRAVITY * dt;
        p.y += p.vy * dt;
        if (p.y >= GROUND_Y) { p.y = GROUND_Y; p.landed = true; }
        continue;
      }
      p.t -= dt;
      if (!p.hit && Math.abs(frog.x - p.x) < STINK_RADIUS && frog.y > GROUND_Y - STINK_HEIGHT) {
        p.hit = true;
        frog.tongue = 0;
        stun(frog, frog.x, frog.y - 80, ATTACK_STUN, 'STINKY!');
      }
    }
    poops = poops.filter((p) => !p.landed || p.t > 0);

    // Spit flies straight up; it hits the cat wherever the cat is (on the fence or in the air).
    for (const sp of spits) {
      sp.y -= SPIT_SPEED * dt;
      if (overlap({ x: sp.x - PX, y: sp.y, w: 3 * PX, h: 4 * PX }, catBody())) {
        sp.gone = true;
        stun(cat, cat.x, FENCE_Y + cat.dive - 80, ATTACK_STUN, 'SPLAT!');
      }
      if (sp.y < -20) sp.gone = true;
    }
    spits = spits.filter((sp) => !sp.gone);
  }

  // Bugs fly across in a wavy line and leave on the other side.
  function moveBugs(dt) {
    if (state === 'ready' && bugs.length < 3 && rand() < dt) spawnBug();
    for (const g of bugs) {
      const b = BUGS[g.kind];
      g.t += dt;
      g.x += g.vx * dt;
      let wave = g.still ? 0 : Math.sin(g.t * b.waveSpeed) * b.wave;
      if (g.kind === 'butterfly' && !g.still) wave += Math.sin(g.t * 7.3) * 6; // flutters unevenly
      g.y = g.still ? g.baseY : Math.max(g.top, Math.min(g.bottom - b.h, g.baseY + wave));
      if ((g.vx > 0 && g.x > W + b.w) || (g.vx < 0 && g.x < -b.w)) g.gone = true;
    }
    bugs = bugs.filter((g) => !g.gone);
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
  // so it is exactly as chunky as the kitty and frog. DawnBringer 32 colors (see C), except the sky and hills.
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

  // Sky colors, picked from the user's sky reference: deep blue at the top, lighter step by step toward the horizon,
  // then a pale cloud bank. These are the only colors outside DawnBringer 32 (it has too few light blues).
  const SKY = {
    ramp: ['#2fb9ff', '#42befd', '#56c6fc', '#6acdfb', '#80d4fa', '#98dcf9', '#ade3f8'],
    bank: ['#bde8f9', '#cdeefb', '#def4fd'], // back, middle and front of the cloud bank
    shade: '#aadcf5',                        // shading on the drifting clouds
  };
  // One green ramp for the whole landscape, from the user's hill reference (outside DawnBringer 32).
  // Light greens lean yellow (sunlit), dark greens lean teal (shade), so hills, grass and bushes all match.
  // The hills use the same ramp, just one step paler, because they are far away.
  const GREEN = ['#4c9472', '#66ad6c', '#86c565', '#a6d86a', '#c4e683', '#d9f0a2'];
  const HILL = { far: '#6fa5b8', dark: GREEN[2], mid: GREEN[3], light: GREEN[5] };
  const GRASS = { dark: GREEN[1], main: GREEN[3], light: GREEN[4] };
  const BUSH = { edge: GREEN[0], fill: GREEN[2], light: GREEN[4] };

  // A wobbly line made of flat steps, like hand-drawn pixel art: holds a height for a few pixels, then moves 1 up or down.
  function steps(rnd, base, range, minRun, maxRun) {
    const line = [];
    let h = base;
    while (line.length < BW) {
      const run = minRun + Math.floor(rnd() * (maxRun - minRun + 1));
      for (let i = 0; i < run; i++) line.push(h);
      h = Math.max(base - range, Math.min(base + range, h + (rnd() < 0.5 ? -1 : 1)));
    }
    return line;
  }

  const skyLayer = makeLayer(BW, BH, (dot) => {
    const rnd = seeded(23);
    // Bands of blue, each lighter than the one above, with stepped uneven edges instead of straight lines.
    const bandTops = [7, 13, 18, 23, 27, 31].map((row) => steps(rnd, row, 2, 4, 14));
    for (let x = 0; x < BW; x++) {
      for (let y = 0; y < FENCE_ROW; y++) {
        let band = 0;
        while (band < bandTops.length && y >= bandTops[band][x]) band++;
        dot(x, y, SKY.ramp[band]);
      }
    }
    // Sun with a light edge.
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= 49) dot(192 + dx, 15 + dy, d <= 25 ? C.yellow : C.peach);
    }
    dot(189, 12, C.white, 2, 2);
    // Cloud bank along the horizon: three rows of soft hills, back to front, each lighter and lower.
    // Big slow waves give the hills; the stepped line adds the pixel-art staircase on their edges.
    [[30, 9, 0.9], [34, 8, 2.1], [38, 6, 4.0]].forEach(([base, height, phase], layer) => {
      const jag = steps(rnd, 0, 1, 2, 6);
      for (let x = 0; x < BW; x++) {
        const hill = (0.5 + 0.5 * Math.sin(x / 23 + phase)) * (0.6 + 0.4 * Math.sin(x / 9 + phase * 2));
        const top = Math.round(base - height * hill) + jag[x];
        dot(x, top, SKY.bank[layer], 1, FENCE_ROW - top);
        if (layer === 2 && x % 9 < 4) dot(x, top, C.white); // little bright tops on the front hills
      }
    });
  });

  // Clouds: a row of round bumps on a flat bottom. White, with light blue on the left side of each bump
  // and along the bottom. Every cloud gets its own random shape, from a tiny puff (size 0) to a big one (size 2).
  const cloudRnd = seeded(11);
  function makeCloud(size) {
    const RY = [[2, 3], [3, 4], [4, 7]][size];       // bump height range
    const N = [[1, 2], [2, 4], [3, 6]][size];        // bump count range
    const n = N[0] + Math.floor(cloudRnd() * (N[1] - N[0] + 1));
    const bumps = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
      const ry = RY[0] + Math.floor(cloudRnd() * (RY[1] - RY[0] + 1));
      const rx = ry * (1.3 + cloudRnd() * 0.5);      // wider than tall, so bumps look soft, not like columns
      if (i > 0) x += rx * (0.6 + cloudRnd() * 0.5);
      bumps.push({ x, rx, ry, lift: 0.5 + cloudRnd() * 0.5 }); // lift = how much of the bump shows above the base
    }
    const left = Math.min(...bumps.map((b) => b.x - b.rx)), right = Math.max(...bumps.map((b) => b.x + b.rx));
    const tall = Math.max(...bumps.map((b) => Math.ceil(b.ry * b.lift + b.ry)));
    const base = Math.min(tall, Math.max(...bumps.map((b) => Math.ceil(b.ry * (1 + b.lift))))) + 1;
    const w = Math.ceil(right - left) + 6, h = base + 1;
    bumps.forEach((b) => { b.x += 3 - left; b.y = base - b.ry * b.lift; });
    const inBump = (b, px, py) => ((px - b.x) / b.rx) ** 2 + ((py - b.y) / b.ry) ** 2 <= 1;
    const edge = size === 0 ? 1 : 2; // width of the shaded left side
    const img = makeLayer(w, h, (dot) => {
      for (let py = 0; py <= base; py++) {
        for (let px = 0; px < w; px++) {
          // The last bump covering this pixel is in front; shading its lower-left side shows the seams between bumps.
          let owner = null;
          for (const b of bumps) if (inBump(b, px, py)) owner = b;
          if (!owner) continue;
          const lowerHalf = py > owner.y - owner.ry * 0.4;
          const shade = py >= base - (size === 0 ? 0 : 1) || (lowerHalf && !inBump(owner, px - edge, py));
          dot(px, py, shade ? SKY.shade : C.white);
        }
      }
      // The flat bottom sticks out a little on both sides.
      dot(1, base, SKY.shade, w - 2, 1);
    });
    return { img, w, h };
  }
  // Small clouds are far away: higher, slower, drawn first. Big ones are closer and drift faster.
  const clouds = [0, 0, 1, 0, 1, 2, 2].map((size, i) => {
    const c = makeCloud(size);
    return { ...c, size, x: (i * 41 + cloudRnd() * 20) % BW, y: 1 + Math.floor(cloudRnd() * Math.max(1, 28 - c.h)),
      v: 1.5 + size * 1.5 + cloudRnd() };
  });

  const frontLayer = makeLayer(BW, BH, (dot) => {
    const rnd = seeded(7);

    // Hills behind the fence, after the user's hill reference.
    // 1. A far blue-green ridge: low and flat, with stepped edges.
    const ridge = steps(rnd, 43, 2, 3, 10);
    for (let x = 0; x < BW; x++) dot(x, ridge[x], HILL.far, 1, FENCE_ROW - ridge[x]);
    // 2. Round green hills in front of it. Each hump: [center x, top row, half width].
    // Each hill: [peak x, peak row, width on the left, width on the right]. Uneven sides make them lopsided.
    const humps = [[22, 29, 45, 75], [158, 35, 80, 50], [258, 30, 55, 70]];
    const jag = steps(rnd, 0, 2, 2, 6); // stepped wobble on the outline
    // Lumps and shoulders along the slopes: two waves of different sizes added together.
    const lumps = (x) => 2.5 * Math.sin(x / 6.3 + 1) + 1.5 * Math.sin(x / 2.7 + 4);
    const noise = (x, y) => { const s = Math.sin(Math.floor(x / 6) * 12.9898 + Math.floor(y / 2) * 78.233) * 43758.5; return s - Math.floor(s); };
    const tones = [HILL.dark, HILL.mid, HILL.light];
    const hillTop = [];
    for (let x = 0; x < BW; x++) {
      // The hump with the highest top at this column is in front.
      let top = FENCE_ROW, d = 0;
      for (const [cx, ty, wl, wr] of humps) {
        const k = (x - cx) / (x < cx ? wl : wr);
        // Pointier than a circle near the top (power 1.4), with lumps that grow toward the foot of the hill.
        const t = Math.round(ty + 26 * Math.abs(k) ** 1.4 + lumps(x) * Math.min(1, Math.abs(k) * 1.5)) + jag[x];
        if (t < top) { top = t; d = k; }
      }
      hillTop[x] = top;
      for (let y = top; y < FENCE_ROW; y++) {
        // Left side of each hump is in shade, the crest on the right catches the light.
        let tone = d < -0.3 ? 0 : (d > 0.1 && y - top < 4) ? 2 : 1;
        if (y === top && d > -0.3) tone = 2;
        // Short sideways streaks of a lighter or darker green, like the brush marks in the reference.
        const n = noise(x + Math.floor(y / 2) * 4, y);
        if (n < 0.15) tone = Math.min(2, tone + 1);
        else if (n > 0.85) tone = Math.max(0, tone - 1);
        dot(x, y, tones[tone]);
      }
    }
    // 3. A few thin pine trees on the hills.
    for (const x of [18, 24, 29, 158, 164, 232, 238, 243]) {
      const base = hillTop[x] + 2;
      [1, 1, 3, 1, 3, 3, 1, 1].forEach((w, i) => dot(x - (w >> 1), base - 8 + i, HILL.far, w, 1));
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
      blob(dot, [[cx - 7, GROUND_ROW - 3, 5], [cx, GROUND_ROW - 6, 7], [cx + 7, GROUND_ROW - 3, 5]], BUSH.edge, BUSH.fill, BUSH.light);
    }

    // Grass: bright top edge, blades poking up, then darker toward the bottom.
    dot(0, GROUND_ROW, GRASS.main, BW, BH - GROUND_ROW);
    dot(0, GROUND_ROW, GRASS.light, BW, 1);
    for (let x = 0; x < BW; x++) {
      const r = rnd();
      if (r < 0.4) dot(x, GROUND_ROW - 1, GRASS.light);
      if (r < 0.12) dot(x, GROUND_ROW - 2, GRASS.main);
    }
    for (let y = GROUND_ROW + 7; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (y >= GROUND_ROW + 11 ? (x + y) % 3 === 0 : (x + 2 * y) % 6 === 0) dot(x, y, GRASS.dark);
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rnd() * BW), y = GROUND_ROW + 2 + Math.floor(rnd() * 5);
      dot(x, y, GRASS.dark);
      dot(x + 1, y - 1, GRASS.dark);
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
      if (c.x < -c.w) {
        // Off the left edge: come back on the right as a new shape at a new height.
        Object.assign(c, makeCloud(c.size));
        c.x = BW + 2;
        c.y = 1 + Math.floor(cloudRnd() * Math.max(1, 28 - c.h));
      }
      ctx.drawImage(c.img, Math.round(c.x) * PX, c.y * PX, c.w * PX, c.h * PX);
    }
    ctx.drawImage(frontLayer, 0, 0, BW * PX, BH * PX);
  }

  // One square sprite pixel at a logical position, snapped to the grid.
  function pixel(x, y, col) { ctx.fillStyle = col; ctx.fillRect(snap(x), snap(y), PX, PX); }

  // A bug flapping its wings; fireflies also glow.
  function drawBug(g) {
    const b = BUGS[g.kind];
    const f = Math.floor(g.t * 12) % 2;
    const x = g.x - b.w / 2;
    if (g.kind === 'firefly' && Math.floor(g.t * 6) % 3 !== 0) {
      ctx.globalAlpha = 0.5;
      for (const [dx, dy] of [[-1, 3], [6, 3], [2, 6], [-1, 5], [5, 6]]) pixel(x + dx * PX, g.y + dy * PX, C.yellow);
      ctx.globalAlpha = 1;
    }
    const rows = g.vx > 0 ? b.frames[f] : b.flipped[f];
    // White outer edge, like the kitty and frog sprites, so bugs stand out against the fence.
    for (const [dx, dy] of [[-PX, 0], [PX, 0], [0, -PX], [0, PX]]) drawPixels(rows, x + dx, g.y + dy, b.edge);
    drawPixels(rows, x, g.y, b.colors);
  }

  // A ring of pixels that flies apart where a bug was caught.
  function drawBurst(p) {
    const r = (2 + p.t * 30) * PX / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      pixel(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.t < 0.2 ? C.white : p.color);
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

  function drawCat() {
    let frame;
    // Going down uses the fall frames, going up the jump frames.
    if (cat.pounce > 0) frame = pick(cat.pounce > POUNCE_TIME / 2 ? KITTY.fall[cat.facing] : KITTY.jumpUp[cat.facing], cat.anim);
    else if (cat.leap > 0) frame = pick(cat.leap > LEAP_TIME / 2 ? KITTY.jumpUp[cat.facing] : KITTY.fall[cat.facing], cat.anim);
    else if (cat.stun > 0) frame = pick(KITTY.idle[cat.facing], 0);
    else if (state === 'over' && cat.score < frog.score) frame = pick(KITTY.idle[cat.facing], 0); // the loser sits still
    else if (cat.moving && state === 'playing') frame = pick(KITTY.walk[cat.facing], cat.anim);
    else frame = pick(KITTY.idle[cat.facing], cat.anim);
    // A dizzy cat wobbles side to side.
    const wobble = cat.stun > 0 ? Math.round(Math.sin(performance.now() / 60)) * PX : 0;
    drawFrame(KITTY, frame, cat.x + wobble, FENCE_Y + 2 + cat.dive, false);
    if (cat.stun > 0) drawStars(cat.x, FENCE_Y + cat.dive - 19 * PX);
  }

  function drawFrog() {
    let frame;
    if (frog.stun > 0) frame = pick(FROG.hurt, frog.anim); // stung by a bee: red flash
    else if (state === 'over' && frog.score < cat.score) frame = pick(FROG.hurt, frog.anim / 2); // the loser blushes red
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

  // A swirly poop; once it has landed, green stink puffs rise from it.
  const POOP = {
    rows: ['...d...', '..dbd..', '.dbtbd.', '.ddddd.', 'dbbtbbd', 'ddddddd'],
    colors: { d: C.woodDark, b: C.wood, t: C.tan },
    edge: { d: C.white, b: C.white, t: C.white },
  };
  function drawPoop(p) {
    // White outer edge first (like the bugs), so the brown poop shows up against the brown fence.
    const px0 = p.x - 3.5 * PX, py0 = p.y - 6 * PX;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawPixels(POOP.rows, px0 + dx * PX, py0 + dy * PX, POOP.edge);
    drawPixels(POOP.rows, px0, py0, POOP.colors);
    if (!p.landed) return;
    const t = performance.now() / 1000;
    ctx.globalAlpha = Math.min(1, p.t) * 0.6;
    for (let i = 0; i < 10; i++) {
      const life = (t * 0.7 + i / 10) % 1; // each puff rises, fades, and starts again at the bottom
      const px = p.x + Math.sin(i * 2.4) * STINK_RADIUS * 0.85 + Math.sin(t * 2 + i) * 6;
      const py = GROUND_Y - 8 - life * STINK_HEIGHT;
      const r = 2 + Math.round(life * 2);
      ctx.fillStyle = i % 2 ? C.moss : C.lime; // yellow-green gas
      ctx.fillRect(snap(px) - r * PX, snap(py) - (r - 1) * PX, r * 2 * PX, (r - 1) * 2 * PX);
      ctx.fillRect(snap(px) - (r - 1) * PX, snap(py) - r * PX, (r - 1) * 2 * PX, r * 2 * PX);
    }
    ctx.globalAlpha = 1;
    // Three wavy stink lines over the poop.
    for (let k = -1; k <= 1; k++) for (let j = 0; j < 5; j++) {
      pixel(p.x + k * 4 * PX + Math.round(Math.sin(j * 1.2 + t * 8 + k)) * PX, p.y - 9 * PX - j * PX, C.olive);
    }
  }

  // A blob of spit with a short trail.
  function drawSpit(sp) {
    ctx.globalAlpha = 0.5;
    pixel(sp.x, sp.y + 5 * PX, C.cyan);
    pixel(sp.x, sp.y + 7 * PX, C.cyan);
    ctx.globalAlpha = 1;
    drawPixels(['.w.', 'wcw', 'ccc', '.c.'], sp.x - 1.5 * PX, sp.y, { w: C.white, c: C.cyan });
  }

  // Special-attack meter under a score: one box per bug. When full it blinks with the key to press.
  function drawMeter(who, x, dir, color, label) {
    const full = who.eaten >= SPECIAL_EVERY;
    for (let i = 0; i < SPECIAL_EVERY; i++) {
      const bx = dir > 0 ? x + i * 14 : x - i * 14 - 10;
      ctx.fillStyle = C.ink;
      ctx.fillRect(bx - 2, 40, 14, 14);
      ctx.fillStyle = i < who.eaten ? (full && Math.floor(performance.now() / 250) % 2 ? C.white : color) : C.plum;
      ctx.fillRect(bx + 1, 43, 8, 8);
    }
    if (full && state === 'playing') text(label, x + dir * (SPECIAL_EVERY * 14 + 8), 53, 10, color, dir > 0 ? 'left' : 'right');
  }

  function drawHud() {
    drawMeter(cat, 16, 1, C.orange, 'E: POOP!');
    drawMeter(frog, W - 16, -1, C.lime, 'ENTER: SPIT!');
    text('CAT ' + cat.score, 16, 30, 16, C.orange);
    text(frog.score + ' FROG', W - 16, 30, 16, C.lime, 'right');
    text(String(Math.ceil(timeLeft)), W / 2, 30, 16, timeLeft < 10 && state === 'playing' ? C.rose : C.white, 'center');
  }

  // A pixel-art box: dark edge, white border, dark inside. Extra space at the bottom for the bug key.
  function panel(lines, extra = 0) {
    const w = 540, h = 36 + lines.length * 30 + extra, x = W / 2 - w / 2, y = 190;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = C.white;
    ctx.fillRect(x + PX, y + PX, w - 2 * PX, h - 2 * PX);
    ctx.fillStyle = C.ink;
    ctx.fillRect(x + 2 * PX, y + 2 * PX, w - 4 * PX, h - 4 * PX);
    lines.forEach(([str, size, color], i) => text(str, W / 2, y + 40 + i * 30, size, color || C.white, 'center'));
    return y + 40 + lines.length * 30;
  }

  // One row showing every bug and what it is worth.
  function bugKey(y) {
    const items = [['fly', '+1'], ['butterfly', '+2'], ['firefly', '+3'], ['bee', 'OUCH']];
    items.forEach(([kind, label], i) => {
      const b = BUGS[kind], cx = W / 2 - 180 + i * 120;
      drawPixels(b.frames[0], cx - b.w - 4, y - b.h + 3, b.colors);
      text(label, cx + 4, y, 10, kind === 'bee' ? C.yellow : C.white);
    });
  }

  function draw(dt) {
    drawBackground(dt);
    bugs.forEach(drawBug);
    poops.forEach(drawPoop);
    drawCat();
    drawFrog();
    spits.forEach(drawSpit);
    bursts.forEach(drawBurst);
    popups.forEach((p) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - p.t));
      text(p.text, p.x, p.y, 12, p.color, 'center');
      ctx.globalAlpha = 1;
    });

    drawHud();

    if (state === 'ready') {
      const y = panel([
        ['BUG HUNT', 20, C.yellow],
        ['Cat: A/D walk W jump S pounce E poop', 12, C.orange],
        ['Frog: ←→ hop ↑ jump ↓ tongue ENTER spit', 12, C.lime],
        ['Catch 5 bugs: poop/spit = dizzy 3 s', 10, C.white],
      ], 60);
      bugKey(y + 4);
      text('Press SPACE to start', W / 2, y + 40, 12, C.white, 'center');
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

  // For automated checks: read the state, place bugs, and step the game by hand.
  window.__catFrog = {
    get state() { return state; }, get cat() { return cat; }, get frog() { return frog; }, get bugs() { return bugs; },
    get timeLeft() { return timeLeft; }, set timeLeft(v) { timeLeft = v; },
    addBug(kind, x, y) { bugs.push({ kind, x, baseY: y, y, vx: 0, t: 0, still: true }); }, // a test bug hovers in place
    get poops() { return poops; }, get spits() { return spits; }, SPECIAL_EVERY,
    setRand(fn) { rand = fn; }, update, draw, BUGS, POUNCE_TIME, LEAP_TIME, GROUND_Y, FENCE_Y,
  };
})();
