// The red ball on the About page. It runs on a track: a straight rail down the left margin with a
// short straight spur out to each stop: the title, each role and section heading, the
// contribution graph and the "Get in touch" button. Scrolling sets how far along the track the
// ball should be, and it eases there, leaving a fading trail drawn over the same straight lines.
// Parked at a stop it becomes that stop's highlight: an underline under a heading, a fill for the
// button. Passing the graph wakes it. The markup and styles it drives (.ball, .trail, .timeline,
// .roles, .graph, .touch) live in src/pages/about.astro and src/components/ContributionGraph.astro.

type Point = { x: number; y: number };
type Stop = {
  el: HTMLElement;
  // Distance along the track.
  at: number;
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
// The ball parks once it's this close to a stop, rather than crawling the last pixels.
const PARK_PX = 2;
const TRAIL_MS = 320;
// The ball's spring along the track (critically damped: no overshoot).
const STIFFNESS = 260;
const DAMPING = 2 * Math.sqrt(STIFFNESS);

export function initScrollBall() {
  const ball = document.querySelector<HTMLElement>('.ball');
  const svg = document.querySelector<SVGSVGElement>('.trail');
  const track = svg?.querySelector('.track');
  const junctions = svg?.querySelector('.junctions');
  const trail = svg?.querySelector('.trail-line');
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
  const box = (el: HTMLElement) => {
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

  // Where the ball's centre sits at a stop, and its size once parked there.
  const spotOf = (el: HTMLElement) => {
    const b = box(el);
    if (el === touch) return { x: b.left + DOT / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
    if (el === graph) {
      // A round ball touching the grid's left edge, level with the fourth row (Wednesdays),
      // measured on the last full week as the first and current ones can be short.
      const grid = box(graph.querySelector<HTMLElement>('.grid')!);
      const full = [...graph.querySelectorAll<HTMLElement>('.week')].filter((w) => !w.querySelector('.empty')).at(-1);
      const day = full?.querySelectorAll<HTMLElement>('.day')[3];
      const y = day ? box(day).top + day.offsetHeight / 2 : grid.top + grid.height / 2;
      return { x: grid.left - 2 - DOT / 2, y, w: DOT, h: DOT };
    }
    // Headings get an underline.
    const h = DOT * 0.6;
    return { x: b.left + DOT / 2, y: b.top + b.height + 3 + h / 2, w: b.width, h };
  };

  const build = () => {
    measureView();
    // The rail hugs the outer edge of the left margin. On phones that margin is just the screen
    // edge, so it runs right beside the text instead.
    const phone = timeline.getBoundingClientRect().left < DOT * 2;
    const rail = phone ? box(list).left - 2 - DOT / 2 : box(timeline).left + 2 + DOT / 2;
    const mainTop = main.getBoundingClientRect().top + scrollY;

    points = [];
    lengths = [];
    stops = [];
    // Where each stop's spur leaves the rail, marked with a dot.
    const forks: Point[] = [];
    const to = (x: number, y: number) => {
      const p = points.at(-1);
      if (p && p.x === x && p.y === y) return;
      lengths.push(p ? lengths.at(-1)! + Math.hypot(x - p.x, y - p.y) : 0);
      points.push({ x, y });
    };

    for (const el of stopElements()) {
      const spot = spotOf(el);
      const top = mainTop + box(el).top;
      const stop = (): void => {
        stops.push({ el, at: lengths.at(-1)!, w: spot.w, h: spot.h, top, arrive: el === title ? 0 : top - viewH * LINE, leave: 0 });
      };
      if (el === graph && spot.x < rail) {
        // On wide screens the graph reaches past the rail, so the track steps out around it,
        // through the gaps above and below, rather than running over the squares.
        const grid = box(graph.querySelector<HTMLElement>('.grid')!);
        const wrap = box(graph);
        const above = grid.top - 16;
        const below = wrap.top + wrap.height + 12;
        to(rail, above);
        to(spot.x, above);
        to(spot.x, spot.y);
        forks.push(spot);
        stop();
        to(spot.x, below);
        to(rail, below);
      } else {
        if (points.length) to(rail, spot.y);
        forks.push({ x: rail, y: spot.y });
        to(spot.x, spot.y);
        stop();
        to(rail, spot.y);
      }
    }
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
    track.setAttribute('d', d);
    // The dots are zero-length segments drawn with round caps.
    junctions.setAttribute('d', forks.map(({ x, y }) => `M${x} ${y}h0`).join(''));
    trail.setAttribute('d', d);

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
      stop.arrive = i === 0 ? -Infinity : anchor[i] - viewH * (ENTER - LINE);
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
  // Recent positions along the track, for the trail.
  let history: { s: number; t: number }[] = [];
  let frame = 0;
  let lastTick = 0;

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
    // Parked once it has come to rest at a stop: grow into that stop's highlight. Leaving, it
    // shrinks back into a ball as it moves off (the sizes animate in CSS).
    const at = goalStop && s === goal ? goalStop : null;
    if (at !== parked) {
      parked = at;
      ball.classList.toggle('parked', !!at);
      ball.style.width = at ? `${at.w}px` : '';
      ball.style.height = at ? `${at.h}px` : '';
      touch.classList.toggle('lit', at?.el === touch);
    }
    const p = pointAt(s);
    ball.style.transform = `translate(${p.x - DOT / 2}px, ${p.y}px) translateY(-50%)`;

    // The role the ball last passed is in focus and the others dim; any other stop clears it.
    const passed = stops.findLast((stop) => stop.at <= s + 0.5);
    const active = passed ? roles.findIndex((role) => role.contains(passed.el)) : -1;
    roles.forEach((role, i) => role.classList.toggle('active', i === active));
    list.classList.toggle('dim', active >= 0);

    // Reaching the graph (or riding past it while it's on screen) wakes it.
    const graphStop = stops.find((stop) => stop.el === graph);
    if (!woken && graphStop && s >= graphStop.at - 1 && figure) {
      const { top, bottom } = figure.getBoundingClientRect();
      if (bottom > 0 && top < innerHeight) wake();
    }

    // The trail is the stretch of track covered in the last TRAIL_MS, fading towards its tail.
    history = history.filter((h) => now - h.t <= TRAIL_MS);
    const tail = history[0]?.s ?? s;
    const length = Math.abs(s - tail);
    trail.style.visibility = length < 1 ? 'hidden' : '';
    if (length >= 1) {
      const total = lengths.at(-1)!;
      trail.style.strokeDasharray = `${length} ${total + length}`;
      trail.style.strokeDashoffset = `${-Math.min(s, tail)}`;
      const [from, to] = [pointAt(tail), pointAt(s)];
      fade.setAttribute('x1', `${from.x}`);
      fade.setAttribute('y1', `${from.y}`);
      fade.setAttribute('x2', `${to.x}`);
      fade.setAttribute('y2', `${to.y}`);
    }

    if (reduceMotion.matches) {
      // Reduced motion: only the underlines show, faded in where they are; no ball in between.
      const shown = !!parked && parked.el !== graph;
      if (shown && ball.style.opacity !== '1') ball.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
      ball.style.opacity = shown ? '1' : '0';
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
  let restTimer = 0;
  const onScroll = () => {
    resting = false;
    clearTimeout(restTimer);
    restTimer = window.setTimeout(onRest, 120);
    update();
  };
  const onRest = () => {
    clearTimeout(restTimer);
    if (resting) return;
    resting = true;
    update();
  };

  const update = () => {
    ({ s: goal, stop: goalStop } = targetAt(scrollY, resting));
    if (reduceMotion.matches) {
      s = goal;
      v = 0;
      history = [];
      render(performance.now());
    } else if (!frame) {
      frame = requestAnimationFrame(tick);
    }
  }

  // Jump straight to where the ball belongs, without animating.
  const place = () => {
    ({ s: goal, stop: goalStop } = targetAt(scrollY, resting));
    s = goal;
    v = 0;
    history = [];
    ball.style.transition = 'none';
    render(performance.now());
    ball.offsetWidth;
    ball.style.transition = '';
  }

  // Rebuild the track after layout changes, keeping the ball at the same point between its stops.
  const rebuild = () => {
    const count = stops.length;
    const i = stops.findLastIndex((stop) => stop.at <= s);
    const next = stops[i + 1];
    const progress = i >= 0 && next ? i + (s - stops[i].at) / (next.at - stops[i].at) : i;
    syncGraph();
    build();
    if (stops.length !== count || i < 0) return place();
    const k = Math.floor(progress);
    const [a, b = a] = [stops[k], stops[k + 1]];
    s = a.at + (b.at - a.at) * (progress - k);
    history = [];
    update();
  }

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
  addEventListener('resize', rebuild);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      document.documentElement.classList.remove('graph-asleep');
      woken = true;
      syncGraph();
    }
    ball.style.opacity = '';
    place();
  });
  new ResizeObserver(rebuild).observe(main);
  if (graph) new MutationObserver(rebuild).observe(graph, { childList: true, subtree: true });
}
