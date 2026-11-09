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
    const TRAIL_MS = 320;

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

    // The ball follows a reading line, in main's coordinates, normally this far down the viewport.
    const MIDDLE = 0.4;

    // The viewport's height with the browser's toolbars hidden. On phones innerHeight grows and
    // shrinks as the toolbar slides away and back mid-scroll, which would shift the reading line
    // and every stop with it; this only changes on a real resize or rotation.
    const probe = document.createElement('div');
    probe.style.cssText = 'position: absolute; top: 0; height: 100lvh; width: 0; visibility: hidden;';
    let viewH = innerHeight;
    const measureView = () => {
      main!.appendChild(probe);
      viewH = probe.offsetHeight || innerHeight;
      probe.remove();
    };
    measureView();

    // A stop starts a little before its zone reaches the reading line, and holds until its
    // heading starts to leave the top of the screen, or the next stop starts, whichever is first.
    // It holds for at least 140px of scrolling, so a quick scroll still gives the ball time to get
    // there. The last stop holds for good.
    const land = (i: number) => box(stops[i].zone).top - 48;
    function hold(i: number) {
      if (i === stops.length - 1) return Infinity;
      const leaving = box(stops[i].el).top + viewH * MIDDLE;
      return Math.min(Math.max(leaving, box(stops[i].zone).top + 140), land(i + 1));
    }

    // At the top of the page the reading line starts just under the title, so the ball moves
    // continuously instead of jumping. Towards the bottom some stops would never reach it before
    // the page runs out, so there it's bent to bring them in.
    function readingLine() {
      const middle = viewH * MIDDLE;
      // main's position on the page, and the title's bottom where it sits in the viewport at the top.
      const mainTop = main!.getBoundingClientRect().top + scrollY;
      const top = mainTop + box(title!).top + box(title!).height + 4;
      const maxScroll = document.documentElement.scrollHeight - viewH;
      const lineAt = (sy: number) =>
        sy + middle - mainTop - (middle > top ? (middle - top) * (1 - clamp(sy / (middle - top), 0, 1)) : 0);
      const end = box(touch!).top + box(touch!).height;
      if (lineAt(maxScroll) >= end) return lineAt(scrollY);

      // The scroll position where the line naturally reaches a point (lineAt only ever rises).
      const scrollAt = (line: number) => {
        let [lo, hi] = [0, Math.max(line + mainTop, 1)];
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          if (lineAt(mid) < line) lo = mid;
          else hi = mid;
        }
        return hi;
      };

      // Working back from the bottom, each stop starts and lets go where it naturally would, or
      // as late as still leaves room for the stops below it: up to MIN_HOLD px of scrolling on
      // each and, before a heading that had to be brought in early, MIN_TRAVEL to get there, as
      // leaving one stop and arriving at the next takes the ball a moment. Both are kept small,
      // as on a short screen the last few stops share its last stretch of scrolling. The
      // "Get in touch" button arrives just before the bottom.
      const MIN_HOLD = 160;
      const MIN_TRAVEL = 60;
      const last = stops.length - 1;
      let next = Math.min(scrollAt(land(last)), maxScroll - 24);
      const knots: [number, number][] = [[next, land(last)], [maxScroll, end]];
      for (let i = last - 1; i >= 0; i--) {
        const starts = scrollAt(land(i));
        const ends = scrollAt(hold(i));
        // A stop that hands straight over to the next one needs no travel.
        const early = i + 1 < last && hold(i) < land(i + 1) && next < scrollAt(land(i + 1)) - 0.5;
        const held = Math.min(ends, next - (early ? MIN_TRAVEL : 0));
        next = Math.min(starts, held - Math.min(ends - starts, MIN_HOLD));
        knots.unshift([next, land(i)], [held, hold(i)]);
      }

      // Between those points the line moves steadily, at its natural pace where it can.
      const natural = ([sy, line]: [number, number]) => Math.abs(lineAt(sy) - line) < 0.5;
      let prev: [number, number] = [0, lineAt(0)];
      for (const knot of knots) {
        if (scrollY <= knot[0]) {
          if (natural(prev) && natural(knot)) return lineAt(scrollY);
          const span = knot[0] - prev[0];
          return span > 0 ? prev[1] + ((knot[1] - prev[1]) * (scrollY - prev[0])) / span : knot[1];
        }
        prev = knot;
      }
      return end;
    }

    // The ball's track hugs the outer edge of the left margin, well clear of the text. On phones
    // that margin is just the screen edge, so the track runs right beside the text instead, and
    // the hop between it and an underline is only a ball's width.
    const trackX = () =>
      timeline!.getBoundingClientRect().left < dot * 2 ? box(list!).left - dot - 2 : box(timeline!).left + 2;

    // Whether scrolling has come to rest. Only while scrolling does the ball ride the track
    // between stops; at rest it always settles on a heading.
    let resting = true;

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
      const index = stops.findLastIndex((_, i) => land(i) <= y);
      if (index >= 0 && y < hold(index)) return shape(stops[index].el);

      // At rest between two stops, settle on whichever heading is nearer the reading line.
      const prev = index < 0 ? title! : stops[index].el;
      const upcoming = stops[index + 1].el;
      if (resting) return shape(Math.abs(centre(prev) - y) <= Math.abs(centre(upcoming) - y) ? prev : upcoming);

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
    // so the ball and its trail don't sway. Sideways moves are only the short hops on and off the
    // track, so they're quicker, leaving the ball time to reach the next stop during a steady
    // scroll. Size keeps a little bounce when stretching into an underline, but retracts crisply
    // with none, so the ball never dips to nothing on the way back.
    const SPRING = {
      x: { stiffness: 700, damping: 53 },
      y: { stiffness: 320, damping: 36 },
      w: { stiffness: 220, damping: 20 },
      h: { stiffness: 220, damping: 20 },
    };
    const RETRACT = { stiffness: 600, damping: 49 };
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
      // The role the ball underlines is the one in focus; the others dim. Between stops the last
      // one stays in focus, and any other stop (title, later sections, button) clears it, so the
      // dimming always matches the underline.
      if (line) {
        const active = roles.findIndex((role) => role.contains(line));
        roles.forEach((role, i) => role.classList.toggle('active', i === active));
        list!.classList.toggle('dim', active >= 0);
      }
      ball!.style.width = `${pos.w}px`;
      ball!.style.height = `${pos.h}px`;
      ball!.style.transform =
        `translate(${pos.x}px, ${pos.y}px) rotate(${angle}rad) scale(${1 + stretch}, ${1 - stretch}) rotate(${-angle}rad)`;
    }

    // The trail is drawn on a canvas that sits on the page (in main's coordinates), not on the
    // screen, so it scrolls together with the ball; iOS scrolls the page on its own thread, and a
    // screen-fixed canvas redrawn from script falls behind it. The canvas is a window a little
    // taller than the screen that moves to wherever the trail is.
    const TRAIL_DPR = Math.min(devicePixelRatio || 1, 2);
    let trailColor = '';
    let win = { x: 0, y: 0, w: 0, h: 0 };
    function sizeTrail() {
      // Kept within the window: on phones the track sits at the screen edge, and a canvas
      // poking past it lets the page wiggle sideways (iOS pans even with overflow-x clipped).
      const mainLeft = main!.getBoundingClientRect().left;
      const x = Math.max(trackX() - dot * 2, Math.floor(-mainLeft));
      const right = Math.min(main!.clientWidth + dot * 2, document.documentElement.clientWidth - mainLeft);
      const w = Math.floor(right - x);
      // Sized from the screen, not the window, so iOS's toolbar showing and hiding doesn't
      // reallocate the canvas mid-scroll.
      const h = Math.ceil(Math.max(innerHeight, screen.height) * 1.5);
      if (w === win.w && h === win.h && x === win.x) return;
      win = { x, y: win.y, w, h };
      canvas!.width = w * TRAIL_DPR;
      canvas!.height = h * TRAIL_DPR;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      canvas!.style.transform = `translate(${win.x}px, ${win.y}px)`;
    }

    function drawTrail(now: number) {
      trail = trail.filter((p) => now - p.t < TRAIL_MS);
      ctx!.setTransform(TRAIL_DPR, 0, 0, TRAIL_DPR, 0, 0);
      ctx!.clearRect(0, 0, win.w, win.h);
      if (trail.length < 2) return;

      // Keep the window over the trail.
      const ys = trail.map((p) => p.y);
      const lo = Math.min(...ys) - dot;
      const hi = Math.max(...ys) + dot;
      if (lo < win.y || hi > win.y + win.h) {
        win.y = Math.round((lo + hi) / 2 - win.h / 2);
        canvas!.style.transform = `translate(${win.x}px, ${win.y}px)`;
      }

      // One tapered ribbon filled in a single pass, fading from the ball back to nothing. Drawing
      // it as separate translucent segments doubles the paint where they overlap, which shows
      // up as a string of darker beads.
      const life = (p: { t: number }) => 1 - (now - p.t) / TRAIL_MS;
      const half = (p: { t: number }) => (dot * (0.15 + 0.35 * life(p))) / 2;
      const left: [number, number][] = [];
      const right: [number, number][] = [];
      for (let i = 0; i < trail.length; i++) {
        const a = trail[Math.max(i - 1, 0)];
        const b = trail[Math.min(i + 1, trail.length - 1)];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const p = trail[i];
        const r = half(p);
        left.push([p.x - win.x + nx * r, p.y - win.y + ny * r]);
        right.push([p.x - win.x - nx * r, p.y - win.y - ny * r]);
      }
      const tail = trail[0];
      const head = trail[trail.length - 1];
      const fade = ctx!.createLinearGradient(tail.x - win.x, tail.y - win.y, head.x - win.x, head.y - win.y);
      fade.addColorStop(0, 'transparent');
      fade.addColorStop(1, trailColor);
      ctx!.globalAlpha = 0.45 * life(head) ** 2;
      ctx!.fillStyle = fade;
      ctx!.beginPath();
      ctx!.moveTo(...left[0]);
      for (const pt of left.slice(1)) ctx!.lineTo(...pt);
      for (const pt of right.reverse()) ctx!.lineTo(...pt);
      ctx!.closePath();
      ctx!.fill();
    }

    // A ball at the left end of an underline, and level with it on the track.
    const ballAt = (b: Box): Box => ({ x: b.x, y: b.y + b.h / 2 - dot / 2, w: dot, h: dot });
    const trackAt = (y: number): Box => ({ x: trackX(), y, w: dot, h: dot });
    const onTrack = () => Math.abs(pos.x - trackX()) < 2;

    // Shape changes happen in place, and only a round ball ever moves, so scrolling back and
    // forth mid-change never drags a half-shrunk line around. Leaving a stop, the underline
    // shrinks into a ball at its left end, slides straight across to the track, then rides it.
    // Arriving, the ball rides the track until it's level with the heading, slides straight
    // across to the underline's left end, then stretches out. Up and down travel only ever
    // happens on the track, clear of the text.
    // The ball lands on a stop when you settle on it, not while you fly past: it heads for a stop
    // reached while scrolling slowly, or where scrolling comes to rest, but only stretches out if
    // you're still there when it arrives, so a stop you've already left never flashes up. Once
    // landed, the underline lingers a moment before moving on, unless you're scrolling fast.
    const LINGER_MS = 120;
    const FAST_PX_PER_S = 1000;
    let landedAt = 0;
    let pending: { el: HTMLElement; box: Box } | null = null;
    let speed = 0;
    let lastScroll = { y: scrollY, t: performance.now() };
    let restTimer = 0;

    const next = () => pending;

    const lingering = (now: number) => now - landedAt < LINGER_MS && speed <= FAST_PX_PER_S;

    function stage(now: number): Box {
      if (line) {
        if (line === goalLine) return goal;
        return lingering(now) ? lineBox : ballAt(lineBox);
      }
      const stop = next();
      if (stop) {
        const end = ballAt(stop.box);
        // Level with the heading: slide across to it.
        if (Math.abs(pos.y - end.y) < 4) return end;
        // Off the track (e.g. just left another stop): get back on it first, then ride.
        return onTrack() ? trackAt(end.y) : trackAt(pos.y);
      }
      return onTrack() ? goal : trackAt(pos.y);
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
        if (lingering(now)) moving = true;
        else if (Math.abs(pos.w - dot) < 4 && Math.abs(pos.h - dot) < 4) {
          line = null;
          moving = true;
        }
      } else if (!line && next() && next()!.el !== goalLine) {
        // Already scrolled past it: skip it and ride on.
        pending = null;
        moving = true;
      } else if (!line && next() && Math.hypot(pos.x - ballAt(next()!.box).x, pos.y - ballAt(next()!.box).y) < 4 && Math.hypot(vel.x, vel.y) < 400) {
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
      if (reduceMotion.matches) {
        showStill();
      } else if (!frame) {
        // Read once per burst rather than every frame; it changes with the theme.
        trailColor = getComputedStyle(ball!).backgroundColor;
        frame = requestAnimationFrame(step);
      }
    }

    function resize() {
      measureView();
      sizeTrail();
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
      trail = [];
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
      resting = false;
      clearTimeout(restTimer);
      restTimer = window.setTimeout(() => {
        speed = 0;
        resting = true;
        update();
      }, 80);
      update();
    }

    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', resize);
    new ResizeObserver(resize).observe(main);
    resize();
  }
}
