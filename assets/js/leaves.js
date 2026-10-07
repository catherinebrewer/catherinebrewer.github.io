/* A fractal tree drawn in slashes in the bottom-right corner of the home
   page. It plays once on load: fades in, unfurls with light drifting through
   it, and fades out. Not shown on narrow screens or with reduced motion. */
(() => {
    const cvs = document.getElementById('leaves');
    if (!cvs || !matchMedia('(min-width: 801px)').matches) return;
    const ctx = cvs.getContext('2d');

    const COLOR = [143, 175, 214];   // a paler cousin of --link
    const FONT_PX = 13;
    const FADE_IN = 1.5;             // seconds
    const GROW = 4;                  // seconds from first shoot to last twig
    const FADE_OUT = [4.5, 6];       // start and end, in seconds from load
    const DEPTH = 8;                 // branch generations
    const MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let cw, ch, A, C, R;
    let branches = [];
    const seed = Math.floor(Math.random() * 1e6);  // a different tree each visit
    const t0 = performance.now();

    // --- utilities -----------------------------------------------------------
    function mulberry32(a) {
        return () => {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    function hash(x, y, z) {
        let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    function noise3(x, y, z) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const xf = x - xi, yf = y - yi, zf = z - zi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
        const l = (a, b, t) => a + (b - a) * t;
        return l(
            l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
            l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
            w);
    }
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);

    // --- the tree ------------------------------------------------------------
    // Geometry is in "square units": a column is 1 wide and a row is A tall,
    // so angles look right on screen. Each branch splits in two, a little
    // shorter each time, with a touch of randomness so it looks grown rather
    // than computed.
    function build() {
        const rnd = mulberry32(seed);
        branches = [];
        const scale = Math.min(C, R * A * 1.1);
        const spread = 0.5 + rnd() * 0.1;
        const ratio = 0.74 + rnd() * 0.04;

        function grow(parent, rel, len, gen, abs) {
            const b = { parent, rel, len, gen, phase: rnd() * 6.283 };
            b.start = (gen / DEPTH) * GROW;
            b.dur = GROW / DEPTH * 1.6;
            const i = branches.push(b) - 1;
            if (gen + 1 >= DEPTH) return;
            for (const side of [-1, 1]) {
                let rel = side * spread + (rnd() - 0.5) * 0.22;
                // Keep reaching upwards: no branch lies flat or droops.
                const target = abs + rel;
                rel += clamp(target, 0.45, 2.75) - target;
                grow(i, rel, len * (ratio + (rnd() - 0.5) * 0.08), gen + 1, abs + rel);
            }
        }
        grow(-1, 1.95, scale * 0.2, 0, 1.95);
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = cvs.getBoundingClientRect();
        cvs.width = Math.round(rect.width * dpr);
        cvs.height = Math.round(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `${FONT_PX}px ${MONO}`;
        ctx.textBaseline = 'top';
        cw = ctx.measureText('M').width;
        ch = FONT_PX * 1.25;
        A = ch / cw;
        C = Math.ceil(rect.width / cw);
        R = Math.ceil(rect.height / ch);
        build();
    }

    // --- one frame -----------------------------------------------------------
    const ang = [], ex = [], ey = [];

    function frame(t) {
        // Fade in, hold, fade out.
        const fade = smooth(0, FADE_IN, t) * (1 - smooth(FADE_OUT[0], FADE_OUT[1], t));
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        if (fade <= 0) return;

        const gust = noise3(t * 0.3, 3.1, seed) - 0.5;
        const wind = tt => 0.5 * Math.sin(tt * 0.6) + 0.25 * Math.sin(tt * 1.4 + 1.7) + 0.8 * gust;
        const windX = wind(t);

        const rootX = C * 0.8, rootY = R * A + 2;
        const cells = new Map();
        for (let i = 0; i < branches.length; i++) {
            const b = branches[i];
            const sx = b.parent < 0 ? rootX : ex[b.parent];
            const sy = b.parent < 0 ? rootY : ey[b.parent];
            const base = b.parent < 0 ? b.rel : ang[b.parent] + b.rel;
            // Sway grows towards the tips and lags behind the trunk.
            const sway = (wind(t - b.gen * 0.15) * 0.02 + Math.sin(t * 1.6 + b.phase) * 0.006) * (b.gen + 1);
            ang[i] = base - sway;
            const g = easeOut((t - b.start) / b.dur);
            const L = b.len * g;
            ex[i] = sx + Math.cos(ang[i]) * L;
            ey[i] = sy - Math.sin(ang[i]) * L;
            if (g <= 0) continue;

            const deg = (((ang[i] * 180 / Math.PI) % 180) + 180) % 180;
            const chr = deg < 25 || deg >= 155 ? '-' : deg < 65 ? '/' : deg < 115 ? '|' : '\\';
            const thick = b.gen === 0 ? 1 : b.gen === 1 ? 0.5 : 0;
            const nx = -Math.sin(ang[i]), ny = -Math.cos(ang[i]);
            const steps = Math.ceil(L * 1.6) + 1;
            const weight = Math.pow(1 - b.gen / (DEPTH + 1), 1.4);
            for (let s = 0; s <= steps; s++) {
                const f = s / steps;
                for (let o = -thick; o <= thick + 1e-6; o += 0.5) {
                    const x = sx + (ex[i] - sx) * f + nx * o;
                    const y = sy + (ey[i] - sy) * f + ny * o;
                    const cc = Math.floor(x), r = Math.floor(y / A);
                    if (cc < 0 || cc >= C || r < 0 || r >= R) continue;
                    const k = r * C + cc;
                    const prev = cells.get(k);
                    if (!prev || prev.w < weight) cells.set(k, { chr, w: weight });
                    if (thick === 0) break;
                }
            }
        }

        // Light drifting through: a slow noise field brightens patches of the
        // tree and moves with the wind.
        for (const [k, { chr, w }] of cells) {
            const r = Math.floor(k / C), cc = k - r * C;
            const X = cc + 0.5, Y = (r + 0.5) * A;
            const light = smooth(0.35, 0.8, noise3(X * 0.09 + windX * 1.5, Y * 0.09, t * 0.15 + seed));
            const a = fade * (0.08 + 0.45 * w + 0.45 * light * (0.4 + w));
            ctx.fillStyle = `rgba(${COLOR[0]},${COLOR[1]},${COLOR[2]},${clamp(a).toFixed(3)})`;
            ctx.fillText(chr, cc * cw, r * ch);
        }
    }

    // --- loop ----------------------------------------------------------------
    let last = 0;
    function tick(now) {
        const t = (now - t0) / 1000;
        if (t > FADE_OUT[1]) { ctx.clearRect(0, 0, cvs.width, cvs.height); return; }
        if (now - last > 55) { frame(t); last = now; }
        requestAnimationFrame(tick);
    }
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });
    resize();
    if (!reduceMotion) requestAnimationFrame(tick);
})();
