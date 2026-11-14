// The red ball on the About page. It runs down a straight rail in the left margin, clear of the
// text and the contribution graph, with a dot on the rail level with each stop: the title, each
// role and section heading, the graph and the "Get in touch" button. Scrolling sets how far along
// the track the ball should be, and it eases there, leaving a fading trail. At a heading or the
// button it leaves the rail and stretches out across to become that stop's highlight (an
// underline, a fill for the button), and pulls back into a ball on its way back to the rail, so
// it only ever rides the rail as a ball. Only the rail and its dots are drawn. Reaching the graph
// wakes it. The markup and styles it drives (.ball, .trail, .timeline,
// .roles, .graph, .touch) live in src/pages/about.astro and src/components/ContributionGraph.astro.

type Point = { x: number; y: number };
type Box = { top: number; left: number; width: number; height: number };
type Stop = {
  el: HTMLElement;
  // Distance along the track, and how far before (and after) that it leaves (and rejoins) the rail.
  at: number;
  spur: number;
  // The ball's size while parked there.
  w: number;
  h: number;
  // Its element's top on the page.
  top: number;
  // The scroll positions it arrives at and leaves at.
  arrive: number;
  leave: number;
};

// The reading line: a stop is centred on its heading being this far down the screen. It holds
// from when the heading is ENTER down the screen until it nears the top (LEAVE).
const LINE = 0.45;
const ENTER = 0.75;
const LEAVE = 0.1;
// Between two stops the ball rides for this much scrolling (less where stops are close).
const RIDE = 120;
// Near the bottom stops are pulled in so they all get a turn; each keeps at least this much scroll.
const MIN_GAP = 160;
// The rail keeps this far left of the text and of the graph.
const RAIL_GAP = 28;
const GRAPH_GAP = 20;
// ...and at least this far in from the screen's edge.
const EDGE = 5;
// The ball parks once it's this close to a stop, rather than crawling the last pixels.
const PARK_PX = 2;
// Once scrolling has rested, a scroll smaller than this (trackpad drift, scroll anchoring) doesn't
// count as scrolling again, so the ball stays parked.
const NUDGE_PX = 16;
const TRAIL_MS = 320;
// The ball's spring along the track (critically damped: no overshoot).
const STIFFNESS = 260;
const DAMPING = 2 * Math.sqrt(STIFFNESS);

export function initScrollBall() {
  const ball = document.querySelector<HTMLElement>('.ball');
  const svg = document.querySelector<SVGSVGElement>('.trail');
  const track = svg?.querySelector('.track');
  const junctions = svg?.querySelector('.junctions');
  const trail = svg?.querySelector<SVGPathElement>('.trail-line');
  const fade = svg?.querySelector('linearGradient');
  const main = ball?.parentElement;
  const title = document.querySelector<HTMLElement>('main h1');
  const timeline = document.querySelector<HTMLElement>('.timeline');
  const list = timeline?.querySelector<HTMLElement>('.roles');
  const touch = document.querySelector<HTMLElement>('.touch');
  // The contribution graph's wrapper. The graph inside it is replaced once the live copy loads.
  const graph = document.querySelector<HTMLElement>('.graph');
  if (!ball || !track || !junctions || !trail || !fade || !main || !title || !timeline || !list || !touch) {
    // No ball to wake the graph: don't leave it greyed out.
    document.documentElement.classList.remove('graph-asleep');
    return;
  }

  const roles = [...list.querySelectorAll<HTMLElement>(':scope > li')];
  const DOT = ball.offsetWidth;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  // Layout boxes in main's coordinates, which the ball and trail are positioned in. Built from
  // offsets, not getBoundingClientRect, so the page's entrance animation doesn't skew them.
  const box = (el: HTMLElement): Box => {
    let top = 0;
    let left = 0;
    for (let node: HTMLElement | null = el; node && node !== main; node = node.offsetParent as HTMLElement | null) {
      top += node.offsetTop;
      left += node.offsetLeft;
    }
    return { top, left, width: el.offsetWidth, height: el.offsetHeight };
  };

  // The viewport's height with the browser's toolbars hidden. On phones innerHeight changes as the
  // toolbar slides in and out mid-scroll; this only changes on a real resize or rotation.
  const probe = document.createElement('div');
  probe.style.cssText = 'position: absolute; top: 0; height: 100lvh; width: 0; visibility: hidden;';
  let viewH = innerHeight;
  const measureView = () => {
    main.appendChild(probe);
    viewH = probe.offsetHeight || innerHeight;
    probe.remove();
  };

  // ---- The track ----------------------------------------------------------------------------

  let points: Point[] = [];
  // Distance along the track at each point.
  let lengths: number[] = [];
  let stops: Stop[] = [];
  let graphStop: Stop | undefined;

  const pointAt = (s: number): Point => {
    let i = 1;
    while (i < points.length - 1 && lengths[i] < s) i++;
    const [a, b] = [points[i - 1], points[i] ?? points[i - 1]];
    const span = lengths[i] - lengths[i - 1];
    const t = span > 0 ? clamp((s - lengths[i - 1]) / span, 0, 1) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  // Each stop in page order: the title, each role's heading, the later section headings and the
  // graph, and the button. (The Work and Elsewhere headings are skipped: the roles and the button
  // stand in for them.)
  const stopElements = () => [
    title,
    ...roles.map((role) => role.querySelector<HTMLElement>('.role-head')!),
    ...[...main.querySelectorAll<HTMLElement>('section h2, .graph')].filter((el) =>
      el === graph
        ? !!graph.querySelector('.grid')
        : !el.closest('section')!.contains(timeline) && !el.closest('section')!.contains(touch),
    ),
    touch,
  ];

  // Where the ball's left end sits at a stop (plus half a ball), and its size once parked there.
  // At the graph it stays on the rail, level with the grid's middle row.
  const spotOf = (el: HTMLElement, rail: number): Point & { w: number; h: number } => {
    const b = box(el);
    if (el === touch) return { x: b.left + DOT / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
    if (el === graph) {
      // Level with the fourth row (Wednesdays), measured on the last full week as the first and
      // current ones can be short.
      const grid = box(graph.querySelector<HTMLElement>('.grid')!);
      const full = [...graph.querySelectorAll<HTMLElement>('.week')].filter((w) => !w.querySelector('.empty')).at(-1);
      const day = full?.querySelectorAll<HTMLElement>('.day')[3];
      const y = day ? box(day).top + day.offsetHeight / 2 : grid.top + grid.height / 2;
      return { x: rail, y, w: DOT, h: DOT };
    }
    // Headings get an underline.
    const h = DOT * 0.6;
    return { x: b.left + DOT / 2, y: b.top + b.height + 3 + h / 2, w: b.width, h };
  };

  const build = () => {
    measureView();
    // The rail runs left of both the text and the graph (which reaches past the text on wide
    // screens), but never off the screen.
    const mainLeft = main.getBoundingClientRect().left;
    const grid = graph?.querySelector<HTMLElement>('.grid');
    const text = box(list).left;
    const rail = Math.max(
      Math.min(text - RAIL_GAP, grid ? box(grid).left - GRAPH_GAP : Infinity),
      EDGE + DOT / 2 - mainLeft,
    );
    const mainTop = main.getBoundingClientRect().top + scrollY;

    points = [];
    lengths = [];
    stops = [];
    // The dot on the rail level with each stop.
    const dots: number[] = [];
    const to = (x: number, y: number) => {
      const p = points.at(-1);
      if (p && p.x === x && p.y === y) return;
      lengths.push(p ? lengths.at(-1)! + Math.hypot(x - p.x, y - p.y) : 0);
      points.push({ x, y });
    };

    for (const el of stopElements()) {
      const spot = spotOf(el, rail);
      const top = mainTop + box(el).top;
      to(rail, spot.y);
      dots.push(spot.y);
      to(spot.x, spot.y);
      const at = lengths.at(-1)!;
      stops.push({ el, at, spur: Math.abs(spot.x - rail), w: spot.w, h: spot.h, top, arrive: el === title ? 0 : top - viewH * LINE, leave: 0 });
      to(rail, spot.y);
    }
    graphStop = stops.find((stop) => stop.el === graph);
    track.setAttribute('d', `M${rail} ${dots[0]}V${dots.at(-1)}`);
    // The dots are zero-length segments drawn with round caps.
    junctions.setAttribute('d', dots.map((y) => `M${rail} ${y}h0`).join(''));
    trail.setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(''));

    // When each stop arrives and leaves. First each gets an anchor: the scroll position where its
    // heading reaches the reading line, working back from the bottom to pull in the stops the
    // page would run out before. (`arrive` holds the anchor until the windows are worked out.)
    const last = stops.length - 1;
    const maxScroll = Math.max(document.documentElement.scrollHeight - viewH, 0);
    stops[last].arrive = Math.min(stops[last].arrive, maxScroll - 8);
    for (let i = last - 1; i > 0; i--) stops[i].arrive = Math.min(stops[i].arrive, stops[i + 1].arrive - MIN_GAP);
    for (let i = 1; i <= last; i++) stops[i].arrive = Math.max(stops[i].arrive, stops[i - 1].arrive + 1);
    const anchor = stops.map((stop) => stop.arrive);
    // Then each holds while its heading is comfortably on screen, so wherever you stop scrolling
    // with a heading in view, it's underlined. Where two windows meet or overlap, they split the
    // difference, leaving a short ride between them.
    stops.forEach((stop, i) => {
      // The button, last, sits near the bottom with the last section still on screen above it;
      // it only takes over at the very end, so that section gets its turn.
      stop.arrive = i === 0 ? -Infinity : anchor[i] - (i === last ? MIN_GAP / 2 : viewH * (ENTER - LINE));
      stop.leave = i === last ? Infinity : Math.max(stop.top - viewH * LEAVE, anchor[i] + 16);
    });
    for (let i = 0; i < last; i++) {
      const [a, b] = [stops[i], stops[i + 1]];
      const ride = Math.min(RIDE, (anchor[i + 1] - anchor[i]) * 0.3);
      if (a.leave + ride <= b.arrive) continue;
      const mid = clamp((a.leave + b.arrive) / 2, anchor[i] + ride / 2, anchor[i + 1] - ride / 2);
      a.leave = mid - ride / 2;
      b.arrive = mid + ride / 2;
    }
    builtFor = layoutKey();
  }

  // Where along the track the ball belongs at a scroll position, and the stop it's parked at.
  // Once scrolling has come to rest it never waits between stops: it goes on to whichever is nearer.
  function targetAt(y: number, resting = false): { s: number; stop: Stop | null } {
    let i = 0;
    while (i < stops.length - 1 && stops[i + 1].arrive <= y) i++;
    const a = stops[i];
    if (y <= a.leave) return { s: a.at, stop: a };
    const b = stops[i + 1];
    if (resting) {
      const nearer = y - a.leave < b.arrive - y ? a : b;
      return { s: nearer.at, stop: nearer };
    }
    return { s: a.at + ((b.at - a.at) * (y - a.leave)) / (b.arrive - a.leave), stop: null };
  }

  // ---- The ball -----------------------------------------------------------------------------

  let s = 0;
  let v = 0;
  let goal = 0;
  let goalStop: Stop | null = null;
  let parked: Stop | null = null;
  let shape = { w: DOT, h: DOT };
  // Eases the stretch in and out, so it starts and finishes gently.
  const ease = (x: number) => x * x * (3 - 2 * x);
  // Recent positions along the track, for the trail.
  let history: { s: number; t: number }[] = [];
  let frame = 0;
  let lastTick = 0;
  // The role last put in focus (-2: none set yet), and where reduced motion last showed the ball.
  let activeRole = -2;
  let stillAt: HTMLElement | null = null;

  // The graph starts greyed out (see src/pages/about.astro) and wakes once the ball reaches it:
  // the colour ripples out from where it touched, and it stays awake.
  let woken = !document.documentElement.classList.contains('graph-asleep');
  let figure: HTMLElement | null = null;
  const WAKE_MS = 650;
  const ROW_MS = 60;
  const wake = () => {
    if (woken || !figure) return;
    woken = true;
    const fig = figure;
    // Left to right across the weeks, and up and down from the middle of each week. Weeks hidden
    // on narrow screens don't count towards the run.
    const weeks = [...fig.querySelectorAll<HTMLElement>('.week')].filter((w) => w.offsetWidth > 0);
    weeks.forEach((week, i) => {
      for (const day of week.querySelectorAll<HTMLElement>('.day:not(.empty)')) {
        // Each day sits on grid row 2 (Sunday) to 8 (Saturday); row 5 is Wednesday.
        const fromMiddle = Math.abs(Number(day.style.gridRowStart) - 5) || 0;
        day.style.setProperty('--delay', `${Math.round((i / weeks.length) * WAKE_MS + fromMiddle * ROW_MS)}ms`);
      }
    });
    fig.classList.add('waking', 'awake');
    // Afterwards colour changes (e.g. the theme) are instant again.
    setTimeout(() => fig.classList.remove('waking'), WAKE_MS + 3 * ROW_MS + 600);
  }
  // Picks up the graph, again whenever the live copy replaces the one built with the page.
  const syncGraph = () => {
    figure = graph?.querySelector<HTMLElement>('.contributions') ?? null;
    figure?.classList.toggle('awake', woken);
  }

  const render = (now: number) => {
    // Reaching the graph (or riding past it while it's on screen) wakes it. Checked before any
    // style is written, so reading the graph's position doesn't force a layout.
    if (!woken && graphStop && s >= graphStop.at - 1 && figure) {
      const { top, bottom } = figure.getBoundingClientRect();
      if (bottom > 0 && top < innerHeight) wake();
    }

    const at = goalStop && s === goal ? goalStop : null;
    if (at !== parked) {
      parked = at;
      touch.classList.toggle('lit', at?.el === touch);
    }
    // Out along a stop's spur the ball stretches towards that stop's highlight, all the way once
    // it's there, and back into a ball by the time it's back on the rail.
    const near = stops.find((stop) => stop.spur > 0 && Math.abs(s - stop.at) < stop.spur);
    const m = near ? ease(1 - Math.abs(s - near.at) / near.spur) : 0;
    const w = near ? DOT + (near.w - DOT) * m : DOT;
    const h = near ? DOT + (near.h - DOT) * m : DOT;
    if (w !== shape.w || h !== shape.h) {
      shape = { w, h };
      ball.style.width = `${w}px`;
      ball.style.height = `${h}px`;
    }
    const p = pointAt(s);
    ball.style.transform = `translate(${p.x - DOT / 2}px, ${p.y}px) translateY(-50%)`;

    // The role the ball last passed is in focus and the others dim; any other stop clears it.
    const passed = stops.findLast((stop) => stop.at <= s + 0.5);
    const active = passed ? roles.findIndex((role) => role.contains(passed.el)) : -1;
    if (active !== activeRole) {
      activeRole = active;
      roles.forEach((role, i) => role.classList.toggle('active', i === active));
      list.classList.toggle('dim', active >= 0);
    }

    // The trail is the stretch of track covered in the last TRAIL_MS, fading towards its tail.
    // It reaches back to the furthest point the ball has been from where it is now, so it doesn't
    // vanish when the ball turns back.
    while (history.length && now - history[0].t > TRAIL_MS) history.shift();
    const tail = history.reduce((far, h) => (Math.abs(h.s - s) > Math.abs(far - s) ? h.s : far), s);
    const length = Math.abs(s - tail);
    trail.style.visibility = length < 1 ? 'hidden' : '';
    if (length >= 1) {
      const total = lengths.at(-1)!;
      trail.style.strokeDasharray = `${length} ${total + length}`;
      trail.style.strokeDashoffset = `${-Math.min(s, tail)}`;
      // The fade runs in a straight line from the trail's point furthest from the ball. (Its tail
      // can sit right on the ball, after a ride out along a spur and back, which would leave the
      // gradient no direction and paint it solid.)
      const to = pointAt(s);
      let from = pointAt(tail);
      for (const h of history) {
        const p = pointAt(h.s);
        if (Math.hypot(p.x - to.x, p.y - to.y) > Math.hypot(from.x - to.x, from.y - to.y)) from = p;
      }
      fade.setAttribute('x1', `${from.x}`);
      fade.setAttribute('y1', `${from.y}`);
      fade.setAttribute('x2', `${to.x}`);
      fade.setAttribute('y2', `${to.y}`);
    }

    if (reduceMotion.matches) {
      // Reduced motion: only the underlines show, faded in where they are; no ball in between.
      // Fades in each time it shows at a new heading, including straight from another one.
      const shownAt = parked && parked.el !== graph ? parked.el : null;
      if (shownAt && shownAt !== stillAt) ball.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
      stillAt = shownAt;
      ball.style.opacity = shownAt ? '1' : '0';
    }
  }

  const tick = (now: number) => {
    frame = 0;
    const dt = Math.min((now - (lastTick || now)) / 1000, 1 / 30);
    lastTick = now;
    v += (STIFFNESS * (goal - s) - DAMPING * v) * dt;
    s += v * dt;
    // During a fast scroll the spring would fall behind and lose the ball off screen.
    const lag = viewH * 0.35;
    if (Math.abs(goal - s) > lag) s = goal - Math.sign(goal - s) * lag;
    // Settle: heading for a stop, as soon as it's there, so the highlight starts on arrival.
    if (Math.abs(goal - s) < (goalStop ? PARK_PX : 0.1) && (goalStop || Math.abs(v) < 1)) {
      s = goal;
      v = 0;
    }
    history.push({ s, t: now });
    render(now);
    if (s !== goal || history.some((h) => h.s !== s)) frame = requestAnimationFrame(tick);
    else lastTick = 0;
  }

  // Whether scrolling has come to rest: a short pause in scroll events, or scrollend where it
  // fires (iOS doesn't always deliver it, so it isn't relied on).
  let resting = true;
  let restY = scrollY;
  let restTimer = 0;
  const onScroll = () => {
    if (resting && Math.abs(scrollY - restY) < NUDGE_PX) return update();
    resting = false;
    clearTimeout(restTimer);
    restTimer = window.setTimeout(onRest, 120);
    update();
  };
  const onRest = () => {
    clearTimeout(restTimer);
    if (resting) return;
    resting = true;
    restY = scrollY;
    update();
  };

  const retarget = () => {
    ({ s: goal, stop: goalStop } = targetAt(scrollY, resting));
  };
  // Put the ball at its goal at once, with no ride and no trail.
  const jump = () => {
    s = goal;
    v = 0;
    history = [];
    render(performance.now());
  };

  const update = () => {
    retarget();
    if (reduceMotion.matches) jump();
    else if (!frame) frame = requestAnimationFrame(tick);
  }

  // Jump straight to where the ball belongs, without animating its size either.
  const place = () => {
    retarget();
    ball.style.transition = 'none';
    jump();
    ball.offsetWidth;
    ball.style.transition = '';
  }

  // Rebuild the track after layout changes, keeping the ball at the same point between the same
  // two stops, even if a stop came or went (the graph, when the live copy swaps in).
  const rebuild = () => {
    const i = stops.findLastIndex((stop) => stop.at <= s);
    const [a0, b0] = [stops[i], stops[i + 1]];
    const progress = a0 && b0 ? (s - a0.at) / (b0.at - a0.at) : 0;
    syncGraph();
    build();
    const a = a0 && stops.find((stop) => stop.el === a0.el);
    if (!a) return place();
    const b = (b0 && stops.find((stop) => stop.el === b0.el)) ?? stops[stops.indexOf(a) + 1] ?? a;
    s = a.at + (b.at - a.at) * progress;
    history = [];
    update();
  }
  // What the track was last built for. A window resize (or main resizing) only rebuilds when this
  // changes, so the toolbar sliding in and out on phones doesn't, and one resize doesn't build twice.
  let builtFor = '';
  const layoutKey = () => `${main.offsetWidth} ${main.offsetHeight} ${viewH}`;
  const onResize = () => {
    measureView();
    if (layoutKey() !== builtFor) rebuild();
  };

  syncGraph();
  build();
  place();
  ball.style.visibility = 'visible';
  document.fonts.ready.then(() => {
    build();
    place();
  });
  addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scrollend', onRest);
  addEventListener('resize', onResize);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      document.documentElement.classList.remove('graph-asleep');
      woken = true;
      syncGraph();
    }
    ball.style.opacity = '';
    stillAt = null;
    place();
  });
  new ResizeObserver(onResize).observe(main);
  if (graph) new MutationObserver(rebuild).observe(graph, { childList: true, subtree: true });
}
