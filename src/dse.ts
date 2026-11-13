// DSE7320 MKII front panel: layout after the photo in operator manual 057-253 (page 83), drawn on a canvas.
// The same drawing feeds the 3D panel texture and the clickable 2D panel.
import {
  ALARMS,
  RATING,
  amps,
  genAvailable,
  genKva,
  hz,
  pressAuto,
  pressManual,
  pressStart,
  pressStop,
  pressTest,
  pressTransfer,
  statusText,
  TANK_L,
  type State,
} from './sim/genset';

export const W = 1010;
export const H = 800;

export type ButtonId = 'up' | 'down' | 'left' | 'right' | 'tick' | 'toMains' | 'toGen' | 'stop' | 'manual' | 'test' | 'auto' | 'mute' | 'start';
export const BUTTONS: { id: ButtonId; x: number; y: number; r: number; label: string }[] = [
  { id: 'up', x: 164, y: 166, r: 24, label: 'Naik' },
  { id: 'down', x: 164, y: 294, r: 24, label: 'Turun' },
  { id: 'left', x: 100, y: 230, r: 24, label: 'Halaman sebelumnya' },
  { id: 'right', x: 228, y: 230, r: 24, label: 'Halaman berikutnya' },
  { id: 'tick', x: 164, y: 230, r: 26, label: 'OK' },
  { id: 'toMains', x: 160, y: 460, r: 32, label: 'Transfer ke PLN (mode Manual)' },
  { id: 'toGen', x: 854, y: 484, r: 32, label: 'Transfer ke genset (mode Manual)' },
  { id: 'stop', x: 156, y: 616, r: 36, label: 'Stop / Reset' },
  { id: 'manual', x: 296, y: 616, r: 36, label: 'Mode Manual' },
  { id: 'test', x: 436, y: 616, r: 36, label: 'Mode Test' },
  { id: 'auto', x: 576, y: 616, r: 36, label: 'Mode Auto' },
  { id: 'mute', x: 716, y: 616, r: 36, label: 'Matikan alarm & tes lampu' },
  { id: 'start', x: 856, y: 616, r: 36, label: 'Start' },
];

// Panel-only state (not part of the genset): which LCD page is shown, lamp test, buzzer.
export const ui = { page: 0, scroll: 0, lampUntil: 0, buzzer: false, pressed: '' as ButtonId | '', pressedUntil: 0 };

const f1 = (x: number) => x.toFixed(1);
const f0 = (x: number) => Math.round(x).toString();

function pages(s: State): [string, string[]][] {
  const [st, sub] = statusText(s);
  const vln = s.volts / Math.sqrt(3);
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const list: [string, string[]][] = [
    [`Status|${clock}`, [st, sub, s.mode === 'stop' ? '' : s.mode === 'auto' ? 'Auto Mode' : s.mode === 'test' ? 'Test Mode' : 'Manual Mode'].filter((x, i, a) => x && a.indexOf(x) === i)],
    ['Engine', [`${f0(s.rpm)} RPM`, `Oil Pressure  ${f1(s.oil)} bar`, `Coolant Temp  ${f0(s.coolant)} °C`, `Battery       ${f1(s.battery)} V`, `Run Time  ${s.hours.toFixed(1)} h`, `Fuel Level    ${f0((s.fuel / TANK_L) * 100)} %`]],
    ['Generator', [`${f1(hz(s))} Hz`, `L-L  ${f0(s.volts)} ${f0(s.volts)} ${f0(s.volts)} V`, `L-N  ${f0(vln)} ${f0(vln)} ${f0(vln)} V`, `Amps ${f0(amps(s))} A`, `kW   ${f0(s.genKw)} kW`, `kVA  ${f0(genKva(s))} kVA`, `pf   ${s.genKw > 0 ? RATING.pf.toFixed(2) : '----'}`, `${f0(s.kwh)} kWh`]],
    ['Mains', s.mainsOk ? ['50.0 Hz', 'L-L  400 400 400 V', 'L-N  231 231 231 V'] : ['0.0 Hz', 'L-L  0 0 0 V', 'L-N  0 0 0 V']],
  ];
  if (s.alarms.length)
    s.alarms.forEach((a, i) => list.push([`${i + 1}/${s.alarms.length} Alarms`, [ALARMS[a].text, ALARMS[a].kind === 'trip' ? 'Electrical Trip' : ALARMS[a].kind === 'shutdown' ? 'Shutdown' : 'Warning']]));
  return list;
}

export function press(s: State, id: ButtonId) {
  ui.pressed = id;
  ui.pressedUntil = performance.now() + 150;
  const n = pages(s).length;
  switch (id) {
    case 'stop':
      return pressStop(s);
    case 'manual':
      return pressManual(s);
    case 'test':
      return pressTest(s);
    case 'auto':
      return pressAuto(s);
    case 'start':
      return pressStart(s);
    case 'toMains':
      return pressTransfer(s, false);
    case 'toGen':
      return pressTransfer(s, true);
    case 'mute':
      ui.buzzer = false;
      ui.lampUntil = performance.now() + 1500;
      s.events.push('beep');
      return;
    case 'left':
      ui.page = (ui.page - 1 + n) % n;
      ui.scroll = 0;
      break;
    case 'right':
      ui.page = (ui.page + 1) % n;
      ui.scroll = 0;
      break;
    case 'up':
      ui.scroll = Math.max(0, ui.scroll - 1);
      break;
    case 'down':
      ui.scroll++;
      break;
  }
  s.events.push('beep');
}

/** Presses panel buttons one after another, slowly enough to watch (used by the scenario shortcuts). */
export function sequence(s: State, ids: ButtonId[], gap = 700) {
  ids.forEach((id, i) => setTimeout(() => press(s, id), 300 + i * gap));
}

/** Jump to the alarm page when a new alarm appears, as the module does. */
export function showAlarms(s: State) {
  ui.buzzer = true;
  const p = pages(s);
  const i = p.findIndex(([t]) => t.endsWith('Alarms'));
  if (i >= 0) ui.page = i;
  ui.scroll = 0;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function led(g: CanvasRenderingContext2D, x: number, y: number, on: boolean, color: string, r = 9) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = on ? color : '#3a3d33';
  if (on) {
    g.shadowColor = color;
    g.shadowBlur = 18;
  }
  g.fill();
  g.shadowBlur = 0;
}

function button(g: CanvasRenderingContext2D, x: number, y: number, r: number, face: string, down: boolean) {
  g.beginPath();
  g.arc(x, y + 3, r, 0, Math.PI * 2);
  g.fillStyle = '#0b0c0d';
  g.fill();
  const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3 + (down ? 2 : 0), r * 0.1, x, y, r);
  grad.addColorStop(0, face === 'red' ? '#e0474c' : face === 'green' ? '#3fa35e' : '#ffffff');
  grad.addColorStop(1, face === 'red' ? '#9e1d22' : face === 'green' ? '#1c6b37' : '#c9cccf');
  g.beginPath();
  g.arc(x, y + (down ? 2 : 0), r, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
}

function pylon(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(x - s * 0.5, y + s * 0.8);
  g.lineTo(x, y - s * 0.8);
  g.lineTo(x + s * 0.5, y + s * 0.8);
  g.moveTo(x - s * 0.55, y - s * 0.35);
  g.lineTo(x + s * 0.55, y - s * 0.35);
  g.moveTo(x - s * 0.4, y);
  g.lineTo(x + s * 0.4, y);
  g.moveTo(x - s * 0.3, y + s * 0.4);
  g.lineTo(x + s * 0.3, y - s * 0.1);
  g.moveTo(x + s * 0.3, y + s * 0.4);
  g.lineTo(x - s * 0.3, y - s * 0.1);
  g.stroke();
}

export function drawModule(g: CanvasRenderingContext2D, s: State) {
  const now = performance.now();
  const lamp = now < ui.lampUntil;
  const down = (id: ButtonId) => ui.pressed === id && now < ui.pressedUntil;

  // body
  g.clearRect(0, 0, W, H);
  rr(g, 4, 4, W - 8, H - 8, 70);
  g.fillStyle = '#1d1f21';
  g.fill();
  rr(g, 30, 30, W - 60, H - 60, 50);
  g.fillStyle = '#26292c';
  g.fill();

  // display bezel
  rr(g, 290, 104, 590, 256, 10);
  g.fillStyle = '#0d0e0f';
  g.fill();
  g.fillStyle = '#d6d8da';
  g.font = '600 20px "IBM Plex Sans", Arial';
  g.fillText('DEEP SEA ELECTRONICS', 380, 142);
  g.font = '600 14px "IBM Plex Sans", Arial';
  g.fillText('DSE 7320 MKII', 770, 142);
  g.strokeStyle = '#d6d8da';
  g.lineWidth = 2;
  g.strokeRect(322, 128, 26, 20);
  g.font = '600 9px Arial';
  g.fillText('DSE', 326, 145);

  // LCD: dims while the starter pulls the battery down, like the real module's backlight
  const backlit = s.battery > 20.5 || lamp;
  rr(g, 324, 180, 330, 162, 4);
  g.fillStyle = backlit ? '#7fd34a' : '#4f7f33';
  g.fill();
  const p = pages(s);
  ui.page = Math.min(ui.page, p.length - 1);
  const [title, lines] = p[ui.page];
  ui.scroll = Math.min(ui.scroll, Math.max(0, lines.length - 3));
  g.fillStyle = '#16300e';
  g.font = '500 27px "IBM Plex Mono", ui-monospace, monospace';
  const [tl, tr] = title.split('|');
  g.fillText(tl, 336, 212);
  if (tr) g.fillText(tr, 642 - g.measureText(tr).width, 212);
  g.fillRect(332, 222, 314, 2);
  lines.slice(ui.scroll, ui.scroll + 3).forEach((l, i) => g.fillText(l, 336, 256 + i * 36));

  // four configurable LEDs with insert labels: used here for common alarms
  const has = (...a: string[]) => s.alarms.some((x) => a.includes(x));
  const alarmLeds: [string, boolean][] = [
    ['Low fuel', has('lowFuel', 'fuelEmpty')],
    ['Overload', has('overload', 'overloadTrip')],
    ['Oil / temp', has('lowOil', 'lowOilWarn', 'highTemp', 'highTempWarn')],
    ['Emergency stop', has('estop', 'failStart') && s.eStop],
  ];
  alarmLeds.forEach(([label, on], i) => {
    const y = 204 + i * 40;
    led(g, 684, y, on || lamp, '#ff2a2a', 8);
    rr(g, 708, y - 16, 160, 32, 3);
    g.fillStyle = '#c9c6c0';
    g.fill();
    g.fillStyle = '#2b2b2b';
    g.font = '500 16px "IBM Plex Sans", Arial';
    g.fillText(label, 716, y + 6);
  });

  // navigation cluster
  for (const b of BUTTONS.slice(0, 5)) button(g, b.x, b.y, b.r, b.id === 'tick' ? 'white' : 'black', down(b.id));
  g.fillStyle = '#25282b';
  const tri = (x: number, y: number, a: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(8, 6);
    g.lineTo(-8, 6);
    g.closePath();
    g.fill();
    g.restore();
  };
  for (const b of BUTTONS.slice(0, 4)) {
    // dark buttons with white arrows, white tick button
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fillStyle = '#1a1c1e';
    g.fill();
    g.fillStyle = '#f2f2f2';
    tri(b.x, b.y, { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[b.id as 'up']);
  }
  g.strokeStyle = '#1d6b3a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(152, 230);
  g.lineTo(162, 241);
  g.lineTo(178, 218);
  g.stroke();

  // mimic line: mains — mains breaker — load — gen breaker — generator
  g.strokeStyle = '#e8e8e8';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(154, 522);
  g.lineTo(860, 522);
  g.moveTo(510, 486);
  g.lineTo(510, 522);
  g.stroke();
  // building/load icon
  g.fillStyle = '#f0f0f0';
  g.fillRect(470, 478, 80, 8);
  g.fillRect(478, 446, 12, 32);
  g.fillRect(500, 452, 10, 26);
  g.fillRect(518, 436, 10, 42);
  g.fillRect(534, 456, 10, 22);
  led(g, 154, 522, (s.mainsOk) || lamp, '#d8f23a');
  led(g, 326, 522, s.mcb || lamp, '#d8f23a');
  led(g, 686, 522, s.gcb || lamp, '#d8f23a');
  led(g, 860, 522, genAvailable(s) || lamp, '#d8f23a');
  // transfer buttons
  button(g, 160, 460, 28, 'black', down('toMains'));
  g.beginPath();
  g.arc(160, 460 + (down('toMains') ? 2 : 0), 28, 0, Math.PI * 2);
  g.fillStyle = '#16181a';
  g.fill();
  pylon(g, 160, 460, 16, '#f0f0f0');
  g.beginPath();
  g.arc(854, 484 + (down('toGen') ? 2 : 0), 28, 0, Math.PI * 2);
  g.fillStyle = '#16181a';
  g.fill();
  g.strokeStyle = '#f0f0f0';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(854, 484, 17, 0, Math.PI * 2);
  g.moveTo(843, 486);
  g.bezierCurveTo(848, 474, 852, 474, 854, 484);
  g.bezierCurveTo(856, 494, 860, 494, 865, 482);
  g.stroke();

  // mode and control buttons
  const modeOn: Partial<Record<ButtonId, boolean>> = { stop: s.mode === 'stop', manual: s.mode === 'manual', test: s.mode === 'test', auto: s.mode === 'auto' };
  for (const b of BUTTONS.slice(7)) {
    const face = b.id === 'stop' ? 'red' : b.id === 'start' ? 'green' : 'white';
    button(g, b.x, b.y, b.r, face, down(b.id));
    const y = b.y + (down(b.id) ? 2 : 0);
    g.strokeStyle = g.fillStyle = face === 'white' ? '#2a2d30' : '#ffffff';
    g.lineWidth = 6;
    if (b.id === 'stop') {
      g.beginPath();
      g.ellipse(b.x, y, 11, 15, 0, 0, Math.PI * 2);
      g.stroke();
    } else if (b.id === 'start') {
      g.fillRect(b.x - 3.5, y - 16, 7, 32);
    } else if (b.id === 'manual') {
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(b.x - 6, y + 14);
      g.lineTo(b.x - 10, y);
      g.moveTo(b.x - 2, y + 4);
      g.lineTo(b.x - 2, y - 16);
      g.moveTo(b.x + 3, y + 2);
      g.lineTo(b.x + 3, y - 10);
      g.moveTo(b.x + 8, y + 3);
      g.lineTo(b.x + 8, y - 6);
      g.moveTo(b.x - 6, y + 14);
      g.lineTo(b.x + 9, y + 14);
      g.stroke();
    } else if (b.id === 'test') {
      pylon(g, b.x, y, 13, '#2a2d30');
      g.strokeStyle = '#c3232b';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(b.x, y, 20, 0, Math.PI * 2);
      g.moveTo(b.x - 14, y + 14);
      g.lineTo(b.x + 14, y - 14);
      g.stroke();
    } else if (b.id === 'auto') {
      g.lineWidth = 2;
      g.strokeRect(b.x - 22, y - 11, 44, 22);
      g.font = '700 14px Arial';
      g.fillText('AUTO', b.x - 19, y + 5);
    } else if (b.id === 'mute') {
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(b.x - 12, y - 6);
      g.lineTo(b.x - 4, y - 6);
      g.lineTo(b.x + 6, y - 14);
      g.lineTo(b.x + 6, y + 14);
      g.lineTo(b.x - 4, y + 6);
      g.lineTo(b.x - 12, y + 6);
      g.closePath();
      g.stroke();
      g.strokeStyle = '#c3232b';
      g.beginPath();
      g.arc(b.x, y, 20, 0, Math.PI * 2);
      g.moveTo(b.x - 14, y + 14);
      g.lineTo(b.x + 14, y - 14);
      g.stroke();
    }
    if (b.id in modeOn) led(g, b.x + 30, b.y - 46, !!modeOn[b.id] || lamp, '#ff2a2a', 7);
  }
}

