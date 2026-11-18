# Plan: "I am Traffic" – a slow, first-person web traffic driving sim

## Context
`traffic-simulator/` is empty, so this is a new project. The goal is a calm, slow driving game played in a browser. You sit inside a car stuck in city traffic. Speeds are low; the challenge is reading traffic, indicating, and picking the faster lane as lane speeds change. The world tells its own story with breakdowns, crashes and roadworks that cause the jams. Each level is at least 5 minutes long. There is no score and no fail state (pure zen). It runs on desktop (mouse plus arrow keys) and on mobile in landscape (joystick, draggable H-pattern shifter, tappable pedals).

Decisions already made: **manual H-pattern 1–5 + R, clutchless** · **no score** · **low-poly geometry made in code** · **Web Audio sounds made in code** in v1.

Build order follows the request: **cockpit → drivable car → roads → traffic → everything else.**

## Stack (same as the sibling projects `slop-footy` / `cricket-too`)
- Vite 8 + TypeScript + three 0.187, with no framework. Menus are plain DOM and CSS.
- Code to adapt from `../slop-footy`:
  - `src/ui/Fullscreen.ts`: requestFullscreen with the webkit fallback. Change it from a toggle button to "enter on Start".
  - `src/render/Quality.ts`: automatic DPR and shadow scaling based on frame time. Needed for mobile.
  - `scripts/simtest.mjs` pattern: a headless sim test.
- Simulation runs at a fixed 60 Hz step and rendering is interpolated. Seeded RNG so levels are deterministic.

## Project layout
```
index.html, vite.config.ts (server.host=true for phone testing), tsconfig.json
public/manifest.webmanifest        display: fullscreen, orientation: landscape (iOS add-to-home-screen)
src/main.ts
src/core/        Loop.ts (fixed step), rng.ts, math.ts
src/platform/    Fullscreen.ts, Orientation.ts (lock + rotate prompt), device.ts (touch detect)
src/ui/          Menu.ts, Pause.ts, Settings.ts, JourneyEnd.ts, style.css
src/input/       InputState.ts, DesktopInput.ts, TouchInput.ts
src/input/widgets/ Shifter.ts (shared H-gate), Joystick.ts, Pedals.ts
src/vehicle/     CarPhysics.ts, Drivetrain.ts, Indicators.ts, PlayerCar.ts
src/cockpit/     Cockpit.ts, SteeringWheel.ts, Gauges.ts, Mirrors.ts, HeadCamera.ts, SatNav.ts
src/world/       Road.ts, RoadMesh.ts, Scenery.ts, Chunks.ts, Lighting.ts, themes.ts
src/traffic/     Vehicle.ts, IDM.ts, MOBIL.ts, LaneFlow.ts, Spawner.ts, TrafficSystem.ts, TrafficRenderer.ts
src/incidents/   IncidentSystem.ts, catalog/*.ts (one file per incident type), props.ts
src/levels/      LevelDef.ts, LevelRunner.ts, l1-suburb.ts … l5-stadium.ts
src/audio/       Audio.ts, EngineSound.ts, Sfx.ts, Ambience.ts
src/render/      Quality.ts
scripts/simtest.mjs   headless traffic and level-duration test
```

---

## Phase 1 – First-person cockpit, menu, fullscreen, orientation
**Menu → fullscreen → landscape**
- Main menu has a Start button. The same click does three things: `requestFullscreen()`, `screen.orientation.lock('landscape')` (wrapped in try/catch, since only Android Chrome honours it), and resumes the `AudioContext`.
- `Orientation.ts`: on touch devices in portrait, show a full-screen "rotate your phone" overlay and pause the game. This covers iPhone Safari, which cannot go fullscreen or lock orientation. Add the PWA manifest as the iOS workaround.
- Pause on `visibilitychange`, on leaving fullscreen, and on Esc.

**Cockpit (low-poly meshes parented to the car root)**
- Dashboard, centre console, A-pillars, roof lining, bonnet visible through the windscreen, and an interior mirror. Use right-hand drive and left-hand traffic by default, with a Settings toggle that mirrors the cockpit and lane order. Build every layout from a `side` sign so the toggle is cheap.
- `SteeringWheel.ts`: the wheel mesh rotates ±450° for full lock, which is about 13:1 against a 35° road-wheel angle. It also has indicator stalk meshes that move when used.
- `Gauges.ts`: CanvasTexture instrument cluster with speedo (0–100 km/h), tacho, gear readout, indicator arrows and hazard light. The texture is redrawn only when a value changes.
- `HeadCamera.ts`: driver eye point, FOV about 70, near plane 0.03. Adds slight head-bob and look-into-turn, a jolt on bumps, and a glance left/right to check the blind spot (desktop Q/E; mobile small edge buttons).
- `Mirrors.ts`: one low-res render target (about 256×80) from a rear camera feeds the interior mirror. Side mirrors are on High quality only. Mirrors render every second frame. They are core to lane-change gameplay.
- `SatNav.ts`: canvas screen on the console showing route progress, distance left and a "radio" ticker for traffic reports. This is how the story is told without a HUD.

**Input layer (built now, drives a parked car)**
- `InputState`: `steer -1..1`, `throttle 0..1`, `brake 0..1`, `gear` (R,N,1–5), `indicator` (L/R/off), `hazards`, `horn`, `glance`.
- `Shifter.ts` is a **shared SVG widget** drawn over the centre console on both platforms:
  ```
  1   3   5
  |   |   |
  +---N---+
  |   |   |
  2   4   R
  ```
  Pointer-drag of the knob is constrained to the gate. You cross the neutral rail to change column. A gear engages past 80% of slot travel and the knob snaps.
- **Desktop** (`DesktopInput.ts`):
  - Mouse X sets steering with a centre dead zone and a sensitivity setting. Steering freezes while the pointer is over or dragging the shifter, so shifting does not jerk the wheel.
  - Up arrow is throttle and Down arrow is brake, both ramped over about 0.25 s for smooth analog feel.
  - Q/E glance, `,`/`.` indicators (or click the stalk), H horn, Esc pause. Number keys 1–5/R/N are a hidden fallback.
  - No joystick is shown.
- **Mobile** (`TouchInput.ts`, multi-touch through pointerId tracking):
  - Left thumb uses a `Joystick`. Only the X axis steers, and the wheel self-centres when you release.
  - Right side has a `Pedals` cutout: an SVG footwell window with a wide brake and a tall accelerator. Pressing higher on a pedal gives more input, and input ramps in on tap.
  - The shifter sits right of centre. Indicator stalk buttons sit beside the wheel, plus a hazard button.

**Done when:** the menu goes fullscreen and the rotate prompt works. You sit in a cockpit in an empty scene with a ground grid and sky. The wheel, stalks, shifter, pedals and gauges all react to input on desktop and on a phone.

## Phase 2 – Drivable car
- `Drivetrain.ts`:
  - Gear ratios put the rev limiter at about 1st 20 / 2nd 35 / 3rd 50 / 4th 65 / 5th 80 km/h. A per-level `speedCap` governor (city 60, motorway 80) keeps speeds low.
  - Auto-clutch below idle RPM means **no stalling**.
  - Lugging (too high a gear at low speed) gives weak torque, a shudder and a low engine note.
  - Neutral coasts. Reverse only engages below 3 km/h, and trying it faster plays a gear-grind sound.
  - Engine braking when you lift off.
- `CarPhysics.ts`: kinematic bicycle model (yaw rate = v·tan(δ)/wheelbase). No tyre slip is needed at these speeds, so it stays stable. Steering rate is limited, with a slight speed-sensitive reduction. Rolling resistance and brakes are included.
- `Indicators.ts`: stalk on/off with self-cancel after the wheel passes about 90° and comes back. Hazards on a separate toggle.
- Test scene: a flat lot with cones to tune feel.

**Done when:** you can pull away in 1st, shift up and down through the gate, indicate, reverse and stop, and it feels heavy and slow.

## Phase 3 – Roads
- `Road.ts`: each level is a chain of sections along a centreline spline (straights plus arcs and gentle hills). Each section has a lane count, lane width, shoulder/kerb, median and theme.
  - Core API: `frameAt(s)` gives position, tangent and normal; `project(xyz)` gives `{s, d, lane}`.
  - Sections support lane drops, on-ramps and merges.
- `RoadMesh.ts`: road and lane-marking strips (dashed/solid, merge arrows), kerbs, barriers and footpaths, generated per chunk.
- Player stays on the road by projecting onto the road frame. Kerbs and barriers clamp `d` with a bump jolt and sound.
- `Scenery.ts` + `themes.ts`: seeded procedural buildings, trees, streetlights, signs, parked cars and overpasses, using InstancedMesh per prop type. Themes are suburb, CBD, motorway, bridge/tunnel and stadium precinct.
- `Chunks.ts`: build and dispose chunks within about −150 m to +500 m of the player, with fog hiding the edge. `Lighting.ts` has time-of-day presets (morning, midday, dusk, night with headlights and streetlights).

## Phase 4 – Traffic
- **Lane-space AI**. Each AI vehicle stores `(sectionS, lane, laneChangeT, speed)`, which is cheap and stable. The world pose comes from the road frame.
- `IDM.ts`: Intelligent Driver Model car-following with per-car `v0, T, s0, a, b`. It naturally produces **stop-and-go shockwaves**, which are the heart of the game.
- `MOBIL.ts`: lane-change decisions with politeness. AI indicates about 2 s before moving and blends across over about 3 s.
- `LaneFlow.ts` controls lane speeds:
  - Each lane has a flow factor that scales `v0`: slow noise plus local bottlenecks. This makes different lanes faster at different times.
  - Scripted **surges**: all lanes ramp up to near free-flow for 20–40 s, then compress back to a crawl.
- **Player interplay**:
  - AI treats the player as a vehicle in whichever lane they occupy.
  - When the player indicates toward a lane, AI cars in that lane within about 30 m behind may open a courtesy gap, which makes indicating matter.
  - A car that gets cut off honks and flashes its lights. A bump stops both cars with a jolt and a honk. No fail state.
- `Spawner.ts`: holds a density target per section in a window around the player and recycles cars that leave it.
- `TrafficRenderer.ts`:
  - InstancedMesh per body type (hatch, sedan, SUV, ute, van, bus, truck) with per-instance colour.
  - Instanced emissive quads for **brake lights, indicators and hazards**, so a red ripple of brake lights shows the wave coming. About 150 cars active.

## Phase 5 – Incidents and environmental storytelling
`IncidentSystem.ts`: each incident is data with `{s, lanesBlocked, sRange, slowZone (rubbernecking cap on all lanes), props, timeline}`. Timeline steps can change blockages, which change traffic.

Catalog:
- **Breakdown**: hazards on, bonnet up, driver on the phone.
- **Fender-bender**: two cars, people swapping details.
- **Multi-car crash**: police, ambulance, fire truck with flashing lights, cones and a lane closure. A tow truck later clears it, the lane reopens, and a **surge** follows.
- **Roadworks**: cones, a worker with a SLOW sign, merge arrows, a 40 zone.
- **Truck lost its load**: mattresses or watermelons on the road.
- **Bus stops** and double-parked delivery vans blocking the kerb lane.
- **Emergency vehicle from behind**: siren, AI pulls aside, the player should too.
- **Burst water main**: a puddle and a fountain.
- Ducks crossing, a police checkpoint, and a rubbernecking slowdown at a crash on the opposite carriageway.

Signage and radio foreshadow what is ahead: overhead message signs ("CRASH AHEAD – RIGHT LANE CLOSED 2 KM") and satnav ticker lines.

## Phase 6 – Levels, audio, polish
- `LevelDef`: road sections, theme, time of day, weather, density, speedCap, incident placements and a flow-event timeline.
- Length target is 1.8–3 km at a 15–25 km/h average, which gives **5–8 minutes**. This is verified by the sim test.
- Five levels:
  1. **Monday Crawl**: suburban arterial, 2 lanes, school zone, broken-down ute, buses.
  2. **City Loop**: CBD, 3 lanes, traffic-light stop lines, double-parked trucks, roadworks.
  3. **Motorway Merge**: 4 lanes, on-ramps, shockwaves and surges, multi-car crash.
  4. **Bridge & Tunnel**: lane drops, tunnel lighting, breakdown in the tunnel, ambulance from behind.
  5. **Game Night**: stadium precinct at night in rain, police directing, crowd crossing.
- `LevelRunner`: start state (in Neutral, parked at the kerb or in a queue), the event timeline, and a finish line at the exit ramp. `JourneyEnd` is a calm postcard (time, distance, lane changes, cars you let in). These are stats, not a score.
- `Audio.ts`, all generated in code:
  - Engine: two detuned oscillators and noise through a lowpass, with pitch and filter driven by RPM and load. Lugging adds a shudder.
  - Indicator relay tick, horns, a siren with distance attenuation, kerb thud, gear grind.
  - City ambience bed (filtered noise plus random distant horns), rain, and the tunnel reverb that changes at the entrance.
- Settings: traffic side, quality (auto/low/med/high), mouse sensitivity, volume.

---

## Verification
- `npm run dev` for desktop. `vite --host` lets a phone on the LAN load the dev server for touch, rotate prompt and fullscreen checks (Android Chrome and iOS Safari).
- `npm run build` runs `tsc --noEmit && vite build` cleanly.
- `scripts/simtest.mjs` runs the traffic sim headless for each level with a bot player that follows the middle lane. It asserts:
  - (a) the level takes 5 min or more of sim time;
  - (b) there is no permanent gridlock (flow is above 0 in every 60 s window);
  - (c) surges and incident clears happen on schedule.
- After each phase, a manual check against its "done when" criteria. A frame-time readout in the dev overlay (`?debug`) confirms a stable 60 fps on mid-range mobile with Quality on auto.
