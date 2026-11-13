import { useEffect, useRef, useState } from 'react';
import { initSound } from '../sound';
import {
  available,
  busLive,
  callTruck,
  capacityKw,
  closeBreaker,
  demandKw,
  fuelRateL,
  hourOf,
  LIMIT_KW,
  loadKw,
  online,
  openBreaker,
  PRIME_KW,
  profile,
  resetUnit,
  setFeeder,
  setSync,
  startUnit,
  stopUnit,
  SYNC,
  syncDiff,
  TANK_L,
  trim,
  tripUnit,
  UNITS,
  type Plant,
} from '../sim/plant';
import { useUI } from '../store';
import { goPlant, PlantScene } from './PlantScene';
import { plant, usePlant, type PlantCam } from './store';

const clock = (p: Plant) => {
  const m = Math.floor(p.clock);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const mw = (kw: number) => (kw / 1000).toFixed(2);

function TopBar() {
  usePlant((s) => s.tick);
  const hz = plant.busHz;
  const hzClass = !busLive(plant) ? 'dead' : Math.abs(hz - 50) < 0.3 ? 'ok' : Math.abs(hz - 50) < 1.2 ? 'warn' : 'bad';
  const load = loadKw(plant);
  const cap = capacityKw(plant);
  const rate = fuelRateL(plant);
  const sfc = plant.stats.kwh > 1 ? plant.stats.litres / plant.stats.kwh : 0;
  return (
    <div className="p-top">
      <div>
        <span>Hari {plant.day}</span>
        <b>{clock(plant)}</b>
      </div>
      <div className={`p-hz ${hzClass}`}>
        <span>Frekuensi bus</span>
        <b>{busLive(plant) ? `${hz.toFixed(2)} Hz` : 'PADAM'}</b>
      </div>
      <div>
        <span>Tegangan</span>
        <b>{Math.round(plant.busV)} V</b>
      </div>
      <div>
        <span>Beban / kapasitas</span>
        <b>
          {mw(load)} / {mw(cap)} MW
        </b>
      </div>
      <div>
        <span>Cadangan berputar</span>
        <b>{mw(Math.max(0, cap - load))} MW</b>
      </div>
      <div>
        <span>Solar</span>
        <b>{Math.round((plant.fuel / TANK_L) * 100)}%</b>
        <small>{Math.round(rate)} L/jam</small>
      </div>
      <div>
        <span>Efisiensi</span>
        <b>{sfc ? sfc.toFixed(3) : '–'}</b>
        <small>L/kWh</small>
      </div>
    </div>
  );
}

function unitStatus(i: number) {
  const u = plant.units[i];
  if (u.alarm) return ['bad', `Alarm: ${u.alarm}`];
  if (u.phase === 'crank') return ['warn', 'Starter…'];
  if (u.phase === 'cooling') return ['warn', 'Pendinginan'];
  if (u.phase === 'stopping') return ['dead', 'Berhenti…'];
  if (u.phase === 'rest') return ['dead', 'Siaga'];
  if (u.breaker) return ['ok', 'Di bus'];
  if (u.syncing) return ['warn', 'Auto-sync…'];
  return available(u) ? ['warn', 'Siap, belum di bus'] : ['warn', 'Naik putaran'];
}

function Units() {
  const ui = usePlant();
  return (
    <aside className="p-panel p-left">
      <h2>Genset</h2>
      {plant.units.map((u, i) => {
        const [cls, text] = unitStatus(i);
        const pct = u.kw / PRIME_KW;
        return (
          <div key={i} className={`p-unit ${ui.selected === i ? 'sel' : ''}`} onClick={() => ui.set({ selected: i })}>
            <div className="p-unit-head">
              <b>G{i + 1}</b>
              <i className={`dot ${cls}`} />
              <span>{text}</span>
              <small>{Math.round(u.hours)} jam</small>
            </div>
            <div className="p-kw">
              <em style={{ width: `${Math.min(1.15, pct) * 87}%`, background: u.kw > PRIME_KW ? '#e0533c' : undefined }} />
              <span>
                {Math.round(u.kw)} kW · {u.rpm > 0 ? `${u.hz.toFixed(1)} Hz` : '—'}
              </span>
            </div>
            <div className="row">
              {u.phase === 'rest' ? (
                <button className="small" onClick={(e) => (e.stopPropagation(), startUnit(plant, i))}>
                  Start
                </button>
              ) : (
                <button className="small" onClick={(e) => (e.stopPropagation(), stopUnit(plant, i))}>
                  Stop
                </button>
              )}
              {u.breaker ? (
                <button className="small on" onClick={(e) => (e.stopPropagation(), openBreaker(plant, i))}>
                  Buka CB
                </button>
              ) : (
                <button
                  className="small"
                  disabled={!available(u)}
                  onClick={(e) => {
                    e.stopPropagation();
                    ui.set({ selected: i });
                    closeBreaker(plant, i);
                  }}
                >
                  Tutup CB
                </button>
              )}
              {u.alarm ? (
                <button className="small" onClick={(e) => (e.stopPropagation(), resetUnit(plant, i))}>
                  Reset
                </button>
              ) : (
                <label className="chk" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={u.auto} onChange={() => (u.auto = !u.auto)} /> Auto
                </label>
              )}
            </div>
          </div>
        );
      })}
      <h2>Kontrol pembangkit</h2>
      <label className="chk wide">
        <input type="checkbox" checked={plant.master} onChange={() => (plant.master = !plant.master)} /> Kontrol otomatis (load demand)
      </label>
      <label className="chk wide">
        <input type="checkbox" checked={plant.ufls} onChange={() => (plant.ufls = !plant.ufls)} /> Pelepasan beban otomatis (UFLS 48,5 Hz)
      </label>
      <div className="row">
        <button className="small" onClick={() => callTruck(plant)} disabled={plant.truckEta >= 0}>
          {plant.truckEta >= 0 ? `Truk tiba ${Math.ceil(plant.truckEta)} dtk` : '⛽ Panggil truk tangki'}
        </button>
        <button
          className="small"
          onClick={() => {
            const on = online(plant);
            if (on.length) tripUnit(plant, on[Math.floor(Math.random() * on.length)].id);
          }}
        >
          ⚠ Gangguan acak
        </button>
      </div>
      <div className="row">
        {[1, 5, 20].map((k) => (
          <button key={k} className={`small ${plant.timeScale === k ? 'on' : ''}`} onClick={() => (plant.timeScale = k)}>
            Waktu {k === 1 ? '1 mnt/dtk' : `${k}×`}
          </button>
        ))}
      </div>
      <div className="p-stats">
        <span>Energi {mw(plant.stats.kwh)} MWh</span>
        <span>Solar {Math.round(plant.stats.litres).toLocaleString('id')} L</span>
        <span>Padam {Math.round(plant.stats.outageMin)} penyulang-menit</span>
        <span>
          Lepas beban {plant.stats.shed}× · Salah sinkron {plant.stats.badSync}× · Trip {plant.stats.trips}×
        </span>
      </div>
    </aside>
  );
}

/** Synchroscope: the pointer turns at the slip frequency; close when it is near 12 o'clock and moving slowly. */
function Synchroscope() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let id = 0;
    const draw = () => {
      const g = ref.current?.getContext('2d');
      const u = plant.units[usePlant.getState().selected];
      if (g && u) {
        const W = 170;
        g.clearRect(0, 0, W, W);
        g.fillStyle = '#0d1014';
        g.beginPath();
        g.arc(W / 2, W / 2, 80, 0, Math.PI * 2);
        g.fill();
        // green window at the top
        g.strokeStyle = '#2fb36b';
        g.lineWidth = 10;
        g.beginPath();
        const win = (SYNC.deg * Math.PI) / 180;
        g.arc(W / 2, W / 2, 70, -Math.PI / 2 - win, -Math.PI / 2 + win);
        g.stroke();
        g.fillStyle = '#9aa4ad';
        g.font = '11px sans-serif';
        g.fillText('LAMBAT', 18, W - 14);
        g.fillText('CEPAT', W - 56, W - 14);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          g.strokeStyle = '#59626b';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(W / 2 + Math.sin(a) * 60, W / 2 - Math.cos(a) * 60);
          g.lineTo(W / 2 + Math.sin(a) * 76, W / 2 - Math.cos(a) * 76);
          g.stroke();
        }
        const live = busLive(plant) && !u.breaker && u.rpm > 1000;
        const ang = live ? (syncDiff(plant, u).deg * Math.PI) / 180 : u.breaker ? 0 : Math.PI;
        g.strokeStyle = live || u.breaker ? '#ffd23a' : '#444';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(W / 2, W / 2);
        g.lineTo(W / 2 + Math.sin(ang) * 64, W / 2 - Math.cos(ang) * 64);
        g.stroke();
        g.fillStyle = '#ccc';
        g.beginPath();
        g.arc(W / 2, W / 2, 5, 0, Math.PI * 2);
        g.fill();
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={ref} width={170} height={170} className="p-scope" aria-label="Synchroscope" />;
}

function SyncPanel() {
  const { selected } = usePlant();
  usePlant((s) => s.tick);
  const u = plant.units[selected];
  const live = busLive(plant);
  const d = syncDiff(plant, u);
  const ok = (v: number, lim: number) => (Math.abs(v) <= lim ? 'ok' : 'bad');
  return (
    <section className="p-panel p-sync">
      <h2>Sinkronisasi G{selected + 1}</h2>
      <div className="p-sync-body">
        <Synchroscope />
        <div className="p-sync-read">
          {u.breaker ? (
            <p>G{selected + 1} sudah di bus dan berbagi beban.</p>
          ) : !available(u) ? (
            <p>{u.phase === 'rest' ? 'Genset belum menyala. Tekan Start.' : 'Tunggu putaran dan tegangan stabil.'}</p>
          ) : !live ? (
            <p>
              Bus <b>mati</b>: breaker boleh langsung ditutup (<i>dead bus</i>). Genset ini jadi patokan bus.
            </p>
          ) : (
            <>
              <span className={ok(d.hz, SYNC.hz)}>Δf {d.hz >= 0 ? '+' : ''}{d.hz.toFixed(2)} Hz</span>
              <span className={ok(d.volts, SYNC.volts)}>ΔV {d.volts >= 0 ? '+' : ''}{(d.volts * 400).toFixed(0)} V</span>
              <span className={ok(d.deg, SYNC.deg)}>Δθ {d.deg.toFixed(0)}°</span>
            </>
          )}
          <div className="row">
            <button className="small" onClick={() => trim(plant, selected, -0.05, 0)}>
              Frek −
            </button>
            <button className="small" onClick={() => trim(plant, selected, 0.05, 0)}>
              Frek +
            </button>
          </div>
          <div className="row">
            <button className="small" onClick={() => trim(plant, selected, 0, -0.005)}>
              Teg −
            </button>
            <button className="small" onClick={() => trim(plant, selected, 0, 0.005)}>
              Teg +
            </button>
          </div>
          <div className="row">
            <button className="small ok-btn" disabled={u.breaker || !available(u)} onClick={() => closeBreaker(plant, selected)}>
              Tutup breaker
            </button>
            <button className={`small ${u.syncing ? 'on' : ''}`} disabled={u.breaker || !available(u) || !live} onClick={() => setSync(plant, selected, !u.syncing)}>
              Auto-sync
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feeders() {
  usePlant((s) => s.tick);
  const live = busLive(plant);
  return (
    <section className="p-panel p-feed">
      <h2>Penyulang 20 kV</h2>
      {plant.feeders.map((f, i) => {
        const on = f.on && live;
        return (
          <div key={i} className="p-feeder">
            <i className={`dot ${on ? 'ok' : 'bad'}`} />
            <span className="nm">{f.name}</span>
            <b>{Math.round(f.demand)} kW</b>
            <button className={`small ${f.on ? 'on' : ''}`} onClick={() => setFeeder(plant, i, !f.on)}>
              {f.on ? 'Lepas' : 'Sambung'}
            </button>
          </div>
        );
      })}
      <small className="hint">Urutan lepas otomatis saat frekuensi drop: Kantor → Kernel → PKS → Air & klinik → Perumahan.</small>
    </section>
  );
}

/** 24-hour chart: expected demand, the load actually served, and the capacity on the bus. */
function Chart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const hist = useRef<{ h: number; load: number; cap: number }[]>([]);
  useEffect(() => {
    let id = 0;
    let last = -1;
    const draw = () => {
      const g = ref.current?.getContext('2d');
      const h = hourOf(plant);
      if (Math.floor(h * 6) !== last) {
        last = Math.floor(h * 6);
        if (hist.current.length && h < hist.current[hist.current.length - 1].h) hist.current = [];
        hist.current.push({ h, load: loadKw(plant), cap: capacityKw(plant) });
      }
      if (g) {
        const W = 520;
        const H = 130;
        const max = 6000;
        const x = (hh: number) => 30 + (hh / 24) * (W - 40);
        const y = (kw: number) => H - 18 - (kw / max) * (H - 30);
        g.clearRect(0, 0, W, H);
        g.fillStyle = '#9aa4ad';
        g.font = '10px sans-serif';
        for (let k = 0; k <= 24; k += 6) g.fillText(`${String(k).padStart(2, '0')}:00`, x(k) - 12, H - 4);
        for (const mwv of [2, 4, 6]) {
          g.strokeStyle = '#2a3036';
          g.beginPath();
          g.moveTo(30, y(mwv * 1000));
          g.lineTo(W - 10, y(mwv * 1000));
          g.stroke();
          g.fillText(`${mwv} MW`, 0, y(mwv * 1000) + 3);
        }
        // expected demand for the day
        g.strokeStyle = '#6b7680';
        g.setLineDash([4, 4]);
        g.beginPath();
        for (let hh = 0; hh <= 24; hh += 0.25) {
          const v = [0, 1, 2, 3, 4].reduce((a, f) => a + profile(f, hh), 0);
          if (hh === 0) g.moveTo(x(hh), y(v));
          else g.lineTo(x(hh), y(v));
        }
        g.stroke();
        g.setLineDash([]);
        // capacity on the bus (steps) and load served
        for (const [key, color] of [
          ['cap', '#2fb36b'],
          ['load', '#ffd23a'],
        ] as const) {
          g.strokeStyle = color;
          g.lineWidth = 2;
          g.beginPath();
          hist.current.forEach((p, i) => (i ? g.lineTo(x(p.h), y(p[key])) : g.moveTo(x(p.h), y(p[key]))));
          g.stroke();
        }
        g.lineWidth = 1;
        g.strokeStyle = '#fff';
        g.beginPath();
        g.moveTo(x(h), 6);
        g.lineTo(x(h), H - 18);
        g.stroke();
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="p-chart">
      <canvas ref={ref} width={520} height={130} aria-label="Grafik beban 24 jam" />
      <div className="legend-row">
        <span style={{ color: '#6b7680' }}>- - perkiraan beban</span>
        <span style={{ color: '#ffd23a' }}>━ beban dilayani</span>
        <span style={{ color: '#2fb36b' }}>━ kapasitas di bus</span>
      </div>
    </div>
  );
}

function Narration() {
  const { toast, toastUntil } = usePlant();
  usePlant((s) => s.tick);
  const on = online(plant);
  const load = loadKw(plant);
  const demand = demandKw(plant);
  let text = '';
  if (toast && performance.now() < toastUntil) text = toast;
  else if (!busLive(plant))
    text = plant.units.some((u) => available(u))
      ? 'Ada genset yang siap. Tutup breakernya ke bus yang masih mati (dead bus), lalu sambungkan penyulang satu per satu.'
      : 'Kawasan padam. Lakukan black start: tekan Start pada G1, tunggu sampai siap, lalu tutup breakernya. Atau centang "Kontrol otomatis" dan lihat pembangkit bekerja sendiri.';
  else if (load > on.length * LIMIT_KW * 0.97) text = 'Genset di bus kelebihan beban, frekuensi turun! Sinkronkan genset tambahan atau lepas penyulang.';
  else if (demand > on.length * PRIME_KW * 0.8 && !plant.master)
    text = `Beban mendekati ${Math.round((demand / (on.length * PRIME_KW)) * 100)}% kapasitas. Siapkan genset berikutnya: Start, lalu sinkronkan (Frek ± sampai jarum berputar pelan, tutup breaker saat di jam 12).`;
  else if (on.length > 1 && demand < 0.55 * (on.length - 1) * PRIME_KW && !plant.master)
    text = 'Beban rendah: satu genset bisa dimatikan supaya sisanya bekerja di zona hemat (75–80%). Buka CB lalu Stop.';
  else text = `${on.length} genset di bus, masing-masing ${Math.round((load / Math.max(1, on.length) / PRIME_KW) * 100)}% beban. ${plant.master ? 'Kontrol otomatis yang mengatur.' : ''}`;
  return <p className="p-narr">{text}</p>;
}

const CAMS: [PlantCam, string][] = [
  ['hall', 'Hall'],
  ['inside', 'Dalam hall'],
  ['control', 'Ruang kontrol'],
  ['site', 'Pembangkit'],
  ['complex', 'Kawasan'],
];

let introSeen = false;

export function PlantApp() {
  const [intro, setIntro] = useState(!introSeen);
  useEffect(() => {
    document.body.classList.add('plant-mode');
    return () => document.body.classList.remove('plant-mode');
  }, []);
  useEffect(() => {
    const go = () => initSound();
    addEventListener('pointerdown', go, { once: true });
    return () => removeEventListener('pointerdown', go);
  }, []);
  return (
    <>
      <PlantScene />
      <header className="brand">
        <h1>PLTD Kawasan Sawit</h1>
        <p>{UNITS} × genset 2250 kVA · paralel · 20 kV</p>
        <button className="tour-start" onClick={() => useUI.getState().set({ mode: 'single' })}>
          ← Genset tunggal
        </button>
      </header>
      <TopBar />
      <Units />
      <SyncPanel />
      <Feeders />
      <Chart />
      <Narration />
      {intro && (
        <div className="intro">
          <div>
            <h1>Mode Pembangkit</h1>
            <p>
              Lima genset 2250 kVA di satu hall memasok pabrik kelapa sawit, pabrik inti, perumahan, kantor, dan air bersih lewat jaringan 20 kV. Jam
              berjalan cepat: beban naik-turun sepanjang hari, puncaknya malam hari.
            </p>
            <ol>
              <li>Black start: Start G1, lalu tutup breakernya ke bus yang mati</li>
              <li>Sambungkan penyulang satu per satu</li>
              <li>Saat beban naik, nyalakan genset berikutnya dan sinkronkan: tutup breaker saat jarum synchroscope di jam 12</li>
            </ol>
            <button
              className="big ok"
              onClick={() => {
                initSound();
                introSeen = true;
                setIntro(false);
              }}
            >
              Mulai
            </button>
          </div>
        </div>
      )}
      <div className="p-cams">
        {CAMS.map(([c, l]) => (
          <button key={c} className="small" onClick={() => goPlant(c)}>
            {l}
          </button>
        ))}
      </div>
    </>
  );
}
