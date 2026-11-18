// Headless check of the drivetrain + physics feel. Run: npm run test:drive
import { Controls } from '../src/input/Controls';
import { PlayerCar } from '../src/vehicle/PlayerCar';

const dt = 1 / 60;
function run(label: string, setup: (car: PlayerCar, c: Controls, t: number) => void, seconds: number) {
  const car = new PlayerCar();
  car.speedCapKmh = 80;
  const c = new Controls();
  c.onGear = (g) => car.requestGear(g);
  const marks: string[] = [];
  let next = 0;
  for (let t = 0; t <= seconds; t += dt) {
    setup(car, c, t);
    car.step(dt, c);
    if (t >= next) {
      marks.push(`${t.toFixed(0)}s:${car.speedKmh.toFixed(1)}km/h@${car.drivetrain.rpm.toFixed(0)}`);
      next += seconds / 8;
    }
  }
  console.log(`${label.padEnd(28)} ${marks.join('  ')}`);
  return car;
}

run('creep in 1st, no pedals', (car, c, t) => t === 0 && c.push({ type: 'gear', gear: 1 }), 10);
run('full throttle, 1st only', (car, c, t) => { if (t === 0) c.push({ type: 'gear', gear: 1 }); c.throttle = 1; }, 10);
run('pull away in 4th (bogs)', (car, c, t) => { if (t === 0) c.push({ type: 'gear', gear: 4 }); c.throttle = 1; }, 10);
let t50 = -1;
run('full throttle, shifting up', (car, c, t) => {
  c.throttle = 1;
  const g = car.drivetrain.gear;
  if (t === 0) c.push({ type: 'gear', gear: 1 });
  else if (g > 0 && g < 5 && car.drivetrain.rpm > 5600) c.push({ type: 'gear', gear: (g + 1) as 2 | 3 | 4 | 5 });
  if (t50 < 0 && car.speedKmh >= 50) t50 = t;
}, 40);
console.log(`0-50 km/h: ${t50.toFixed(1)} s`);
run('50 km/h then full brake', (car, c, t) => {
  if (t === 0) { car.physics.v = 50 / 3.6; c.push({ type: 'gear', gear: 0 }); }
  c.brake = 1;
}, 4);
const r = run('reverse while rolling fwd', (car, c, t) => { if (t === 0) { car.physics.v = 5; c.push({ type: 'gear', gear: -1 }); } }, 1);
console.log(`  -> gear after refused R: ${r.drivetrain.gear} (expect 0)`);
run('reverse from stop, throttle', (car, c, t) => { if (t === 0) c.push({ type: 'gear', gear: -1 }); c.throttle = 0.5; }, 8);
