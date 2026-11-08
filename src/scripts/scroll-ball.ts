// The red ball on the About page: it starts as the title's underline, rides down the left margin
// with a fading trail as you scroll, stretches into an underline under each role and section
// heading you settle on, and finishes by filling in the "Get in touch" button. The markup and
// styles it drives (.ball, .trail, .timeline, .roles, .touch) live in src/pages/about.astro.
export function initScrollBall() {
  const ball = document.querySelector<HTMLElement>('.ball');
  const canvas = document.querySelector<HTMLCanvasElement>('.trail');
  const main = ball?.parentElement;
  const title = document.querySelector<HTMLElement>('main h1');
  const timeline = document.querySelector<HTMLElement>('.timeline');
  const list = timeline?.querySelector<HTMLElement>('.roles');
  const touch = document.querySelector<HTMLElement>('.touch');
  const ctx = canvas?.getContext('2d');

  if (ball && canvas && ctx && main && title && timeline && list && touch) {
    const roles = [...list.querySelectorAll<HTMLElement>(':scope > li')];
    // Where the ball stops after the title, in order: each role's heading, each later section's
    // heading, and finally the "Get in touch" button. A stop's zone is the stretch of page it
    // belongs to; the ball arrives as the zone reaches the reading line.
    const stops = [
      ...roles.map((role) => ({ el: role.querySelector<HTMLElement>('.role-head')!, zone: role })),
      ...[...main.querySelectorAll<HTMLElement>('section h2')]
        .filter((h2) => !h2.closest('section')!.contains(timeline) && !h2.closest('section')!.contains(touch))
        .map((h2) => ({ el: h2, zone: h2.closest('section')! })),
      { el: touch, zone: touch },
    ];
    const dot = ball.offsetWidth;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const TRAIL_MS = 550;

    type Box = { x: number; y: number; w: number; h: number };
    const KEYS = ['x', 'y', 'w', 'h'] as const;
    const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

    // Layout boxes in main's coordinates, which the ball is positioned in. Built from offsets, not
    // getBoundingClientRect, so the page's entrance animation (which shifts content while it
    // runs) doesn't throw the measurements off.
    function box(el: HTMLElement) {
      let top = 0;
      let left = 0;
      for (let node: HTMLElement | null = el; node && node !== main; node = node.offsetParent as HTMLElement | null) {
        top += node.offsetTop;
        left += node.offsetLeft;
      }
      return { top, left, width: el.offsetWidth, height: el.offsetHeight };
    }

    // The ball follows a reading line, in main's coordinates, normally 40% down the viewport.
    // At the top it starts just under the title, and towards the bottom it speeds up to reach the
    // "Get in touch" button, which would otherwise never get that far up the screen. Both ramps
    // keep the ball moving continuously instead of jumping.
    function readingLine() {
      const middle = innerHeight * 0.4;
      // Page positions (where they'd be in the viewport at scroll 0).
      const mainTop = main!.getBoundingClientRect().top + scrollY;
      const top = mainTop + box(title!).top + box(title!).height + 4;
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      const bottom = mainTop + box(touch!).top + box(touch!).height - maxScroll;
      let line = middle;
      if (middle > top) line = top + (middle - top) * clamp(scrollY / (middle - top), 0, 1);
      if (bottom > middle) line += (bottom - line) * clamp(1 - (maxScroll - scrollY) / (bottom - middle), 0, 1);
      return line - main!.getBoundingClientRect().top;
    }

    // The ball's track hugs the outer edge of the left margin, well clear of the text.
    const trackX = () => box(timeline!).left + 2;

    // Where the ball should end up for the current scroll position, and the stop it's
    // stretched over there, if any.
    function target(): { box: Box; line: HTMLElement | null } {
      // Headings get an underline; the button gets filled in.
      const shape = (el: HTMLElement) => {
        const b = box(el);
        return el === touch
          ? { box: { x: b.left, y: b.top, w: b.width, h: b.height }, line: el }
          : { box: { x: b.left, y: b.top + b.height + 3, w: b.width, h: dot * 0.6 }, line: el };
      };
      const centre = (el: HTMLElement) => {
        const { box: b } = shape(el);
        return b.y + b.h / 2;
      };

      // At the top of the page the ball underlines the title.
      if (scrollY < 16) return shape(title!);

      const y = readingLine();
      // A stop starts a little before its zone reaches the reading line, and holds for the first
      // part of the zone — at least 140px of scrolling even for short sections — so a quick scroll
      // still gives the ball time to get there. The last stop holds for good.
      const land = (i: number) => box(stops[i].zone).top - 48;
      const hold = (i: number) => {
        const zone = box(stops[i].zone);
        return i === stops.length - 1 ? Infinity : zone.top + clamp(zone.height * 0.45, 140, 220);
      };
      const index = stops.findLastIndex((_, i) => land(i) <= y);
      if (index >= 0 && y < hold(index)) return shape(stops[index].el);

      // Otherwise ride down the track to the next stop. The ride is paced so the ball reaches the
      // next stop just as its zone reaches the reading line: it makes up the time it spent holding
      // evenly along the way, never with a sudden dash.
      const head = box(title!);
      const from = index < 0
        ? { y: centre(title!), at: head.top + head.height + 4 }
        : { y: centre(stops[index].el), at: hold(index) };
      const next = stops[index + 1];
      const t = clamp((y - from.at) / (land(index + 1) - from.at), 0, 1);
      const at = from.y + (centre(next.el) - from.y) * t;
      return { box: { x: trackX(), y: at - dot / 2, w: dot, h: dot }, line: null };
    }

    // A spring per property. Position is critically damped — a smooth ease-out with no overshoot,
    // so the ball and its trail don't sway. Size keeps a little bounce when stretching into an
    // underline, but retracts crisply with none, so the ball never dips to nothing on the way back.
    const SPRING = {
      x: { stiffness: 200, damping: 28 },
      y: { stiffness: 200, damping: 28 },
      w: { stiffness: 220, damping: 20 },
      h: { stiffness: 220, damping: 20 },
    };
    const RETRACT = { stiffness: 300, damping: 35 };
    let { box: goal, line: goalLine } = target();
    const pos: Box = { ...goal };
    const vel: Box = { x: 0, y: 0, w: 0, h: 0 };
    // The heading the ball is currently stretched under, and that underline's box.
    let line = goalLine;
    let lineBox = goal;
    let last = 0;
    let frame = 0;
    // Recent positions of the ball's leading end, in main's coordinates.
    let trail: { x: number; y: number; t: number }[] = [];

    function render() {
      // Squash and stretch along the direction of travel while it's a ball.
      const speed = Math.hypot(vel.x, vel.y);
      const stretch = pos.w < dot * 2 ? clamp(speed / 6000, 0, 0.12) : 0;
      const angle = Math.atan2(vel.y, vel.x);
      touch!.classList.toggle('lit', line === touch && pos.w > dot * 2);
      ball!.style.width = `${pos.w}px`;
      ball!.style.height = `${pos.h}px`;
      ball!.style.transform =
        `translate(${pos.x}px, ${pos.y}px) rotate(${angle}rad) scale(${1 + stretch}, ${1 - stretch}) rotate(${-angle}rad)`;
    }

    function drawTrail(now: number) {
      trail = trail.filter((p) => now - p.t < TRAIL_MS);
      const dpr = devicePixelRatio || 1;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, innerWidth, innerHeight);
      if (trail.length < 2) return;
      // Trail points live in main's coordinates so they stay put on the page as it scrolls.
      const m = main!.getBoundingClientRect();
      ctx!.strokeStyle = getComputedStyle(ball!).backgroundColor;
      ctx!.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const life = 1 - (now - trail[i].t) / TRAIL_MS;
        ctx!.globalAlpha = life * life * 0.6;
        ctx!.lineWidth = dot * (0.25 + 0.6 * life);
        ctx!.beginPath();
        ctx!.moveTo(trail[i - 1].x + m.left, trail[i - 1].y + m.top);
        ctx!.lineTo(trail[i].x + m.left, trail[i].y + m.top);
        ctx!.stroke();
      }
    }

    // A ball on the track, level with an underline.
    const ballAt = (b: Box): Box => ({ x: trackX(), y: b.y + b.h / 2 - dot / 2, w: dot, h: dot });

    // Shape changes happen before travelling, never during: an underline first shrinks sideways
    // into a ball on the track, then the ball moves; a ball first gets level with its heading on
    // the track, then stretches out under it. So the ball only ever travels along the track.
    // The ball lands on a stop when you settle on it, not while you fly past. A stop reached while
    // scrolling slowly — or where scrolling comes to rest — is committed: the ball gets there and
    // stretches out even if you then drift past, and the underline lingers a moment before moving
    // on. A fast scroll cancels any landing still on its way, so the ball rides along with you
    // and never lags behind replaying stops you've already left.
    const LINGER_MS = 200;
    const FAST_PX_PER_S = 1500;
    let landedAt = 0;
    let pending: { el: HTMLElement; box: Box } | null = null;
    let speed = 0;
    let lastScroll = { y: scrollY, t: performance.now() };
    let restTimer = 0;

    const next = () => pending;

    function stage(now: number): Box {
      if (line) {
        if (line === goalLine) return goal;
        return now - landedAt < LINGER_MS ? lineBox : ballAt(lineBox);
      }
      const stop = next();
      return stop ? ballAt(stop.box) : goal;
    }

    function step(now: number) {
      frame = 0;
      const dt = Math.min((now - (last || now)) / 1000, 1 / 30);
      last = now;
      // Settled on a stop the ball isn't on yet (e.g. it was busy with the previous one): head there.
      if (!pending && goalLine && goalLine !== line && speed <= FAST_PX_PER_S) pending = { el: goalLine, box: goal };
      const aim = stage(now);
      let moving = false;
      for (const k of KEYS) {
        const spring = (k === 'w' || k === 'h') && aim[k] < pos[k] ? RETRACT : SPRING[k];
        const force = spring.stiffness * (aim[k] - pos[k]) - spring.damping * vel[k];
        vel[k] += force * dt;
        pos[k] += vel[k] * dt;
        if (Math.abs(aim[k] - pos[k]) > 0.1 || Math.abs(vel[k]) > 0.1) moving = true;
        else { pos[k] = aim[k]; vel[k] = 0; }
      }

      // Move on to the next stage once this one is (nearly) done.
      if (line && line !== goalLine) {
        if (now - landedAt < LINGER_MS) moving = true;
        else if (Math.abs(pos.w - dot) < 1 && Math.abs(pos.h - dot) < 1) {
          line = null;
          moving = true;
        }
      } else if (!line && next() && Math.hypot(pos.x - aim.x, pos.y - aim.y) < 4 && Math.hypot(vel.x, vel.y) < 400) {
        // Close enough, and not still flying past: start stretching.
        const stop = next()!;
        line = stop.el;
        lineBox = stop.el === goalLine ? goal : stop.box;
        landedAt = now;
        pending = null;
        moving = true;
      }
      render();

      const lead = { x: pos.x + Math.min(pos.w, dot) / 2, y: pos.y + pos.h / 2, t: now };
      const prev = trail.at(-1);
      if (!prev || Math.hypot(lead.x - prev.x, lead.y - prev.y) > 0.5) trail.push(lead);
      drawTrail(now);

      // Keep going while the ball moves or its trail is still fading.
      if (moving || trail.length > 1) frame = requestAnimationFrame(step);
      else last = 0;
    }

    function update() {
      ({ box: goal, line: goalLine } = target());
      if (line && line === goalLine) lineBox = goal;
      if (goalLine && goalLine === line) pending = null;
      else if (speed > FAST_PX_PER_S) {
        if (!line) pending = null;
      } else if (goalLine && !pending) pending = { el: goalLine, box: goal };
      const y = readingLine();
      const active = roles.findLastIndex((role) => box(role).top <= y);
      roles.forEach((role, i) => role.classList.toggle('active', i === active));
      list!.classList.toggle('dim', scrollY >= 16 && active >= 0 && y <= box(timeline!).top + box(timeline!).height);
      if (reduceMotion.matches) {
        showStill();
      } else if (!frame) {
        frame = requestAnimationFrame(step);
      }
    }

    function resize() {
      const dpr = devicePixelRatio || 1;
      canvas!.width = innerWidth * dpr;
      canvas!.height = innerHeight * dpr;
      update();
    }

    // Place the ball without animating, e.g. once the web font has loaded and moved things.
    function place() {
      ({ box: goal, line: goalLine } = target());
      if (reduceMotion.matches) return showStill();
      Object.assign(pos, goal);
      Object.assign(vel, { x: 0, y: 0, w: 0, h: 0 });
      line = goalLine;
      lineBox = goal;
      pending = null;
      render();
    }

    // Reduced motion: only show underlines, fading each in where it is; hide the ball in between.
    function showStill() {
      const changed = goalLine !== line;
      Object.assign(pos, goal);
      Object.assign(vel, { x: 0, y: 0, w: 0, h: 0 });
      line = goalLine;
      lineBox = goal;
      pending = null;
      render();
      ball!.style.opacity = line ? '1' : '0';
      if (line && changed) ball!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
    }

    render();
    ball.style.visibility = 'visible';
    document.fonts.ready.then(place);
    // Track scroll speed, and treat a short pause as coming to rest.
    function onScroll() {
      const now = performance.now();
      const instant = (Math.abs(scrollY - lastScroll.y) / Math.max(now - lastScroll.t, 1)) * 1000;
      speed = speed * 0.6 + instant * 0.4;
      lastScroll = { y: scrollY, t: now };
      clearTimeout(restTimer);
      restTimer = window.setTimeout(() => {
        speed = 0;
        update();
      }, 120);
      update();
    }

    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', resize);
    new ResizeObserver(update).observe(main);
    resize();
  }
}
