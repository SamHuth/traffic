# I am Traffic

A slow, first-person traffic driving sim for the browser (Three.js + TypeScript + Vite). See [PLAN.md](PLAN.md) for the full roadmap.

```sh
npm install
npm run dev          # http://localhost:5173 (also on your LAN for phone testing)
npm run build        # typecheck + production build
npm run test:drive   # headless drivetrain/physics check
npm run test:sim     # headless traffic run of every level: ≥ 5 min, no gridlock
```

URL flags: `?debug` (telemetry overlay), `?touch` / `?desktop` (force control scheme), `?autostart=<level-id|lot>` (skip the menu, no fullscreen), `?s=<metres>` (start part-way along a route).

## Levels
1. **Monday Crawl** – suburbs, buses, a breakdown, ducks crossing (morning)
2. **City Loop** – CBD, roadworks, burst water main, lost mattresses (midday)
3. **Motorway Merge** – four lanes, on-ramps, a two-lane crash that gets cleared (overcast)
4. **Bridge & Tunnel** – harbour bridge, tunnel breakdown, ambulance from behind (dusk)
5. **Game Night** – stadium crowds, rain, a crash and sirens (night)

## Controls
**Desktop:** click + drag to grab and turn the wheel (let go and it self-centres) · ↑/W accelerate · ↓/S brake · drag the gear knob (or 1–5, R, N) · A/D or `,`/`.` indicators · X hazards · Q/E look · Space/H horn · Esc/P pause.

**Mobile (landscape):** left thumb joystick steers · hold the pedals (higher on the pad = more) · drag the gear knob · arrow buttons indicate · ‹ › glance.

## Status
- [x] Phase 1: cockpit, menu, fullscreen + landscape lock / rotate prompt, desktop + touch input
- [x] Phase 2: drivable car (clutchless H-pattern, auto-clutch, lugging, bicycle model), test lot
- [x] Phase 3: roads (spline routes, lane sections/tapers, themed streamed chunks, side streets, tunnels, bridges)
- [x] Phase 4: traffic (IDM + MOBIL, stop-and-go waves, surges, zipper merges, courtesy gaps, horns, oncoming traffic)
- [x] Phase 5: incidents (breakdowns, crashes cleared by tow trucks, roadworks, lost loads, buses, ducks, ambulances, VMS signs, radio reports)
- [x] Phase 6: five levels, lighting presets, night + rain, journey-end postcard, ambience
