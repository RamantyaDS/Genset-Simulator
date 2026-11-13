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
  DAY_L,
  drainDayTank,
  fillDayTank,
  LIMIT_KW as UNIT_MAX_KW,
  motorStart,
  FUEL_RP,
  PLN_RP,
  resetUnit,
  SCENARIOS,
  SERVICE_H,
  SERVICE_RP,
  setWeather,
  startService,
  type Weather,
  setEStop,
  shipArrives,
  startScenario,
  type ScenarioId,
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
import { press, type ButtonId } from '../dse';
import { FLOW_COLORS } from '../scene/Flows';
import { amps, fuelRate, hz as setHz } from '../sim/genset';
import { DsePanel } from '../ui/DsePanel';
import { PartCard } from '../ui/PartCard';
import { unitState } from './GensetUnit';
import { goPlant, goSeat, goUnit, inspectUnit, leaveInspect, type UnitView } from './camera';
import { PlantScene } from './PlantScene';
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
        <span>Tangki induk</span>
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
              <button className="small icon" title="Dekati genset ini: bongkar, X-ray, panel DSE, gangguan" onClick={(e) => (e.stopPropagation(), inspectUnit(i))}>
                🔍
              </button>
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
      <Scenario />
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

/** Challenges, and the knobs that push the load: mill throughput, a whole-complex multiplier, motor starts, ships. */
function Scenario() {
  usePlant((s) => s.tick);
  const g = plant.goal;
  const elapsed = g ? Math.min(24, ((plant.day - 1) * 1440 + plant.clock - g.start) / 60) : 0;
  return (
    <>
      <h2>Skenario</h2>
      <div className="row wrap">
        {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => (
          <button
            key={id}
            className={`small ${(g?.id ?? 'bebas') === id ? 'on' : ''}`}
            title={SCENARIOS[id].brief}
            onClick={() => {
              startScenario(plant, id);
              usePlant.getState().bump();
            }}
          >
            {SCENARIOS[id].name}
          </button>
        ))}
      </div>
      {g && (
        <p className={`p-goal ${g.done ? (g.passed ? 'ok' : 'bad') : ''}`}>
          {g.done ? g.result : `${SCENARIOS[g.id].brief} Berjalan ${elapsed.toFixed(1)} / 24 jam · lepas beban ${plant.stats.shed}× · padam ${g.blackouts}×`}
        </p>
      )}
      <h2>Beban kawasan</h2>
      <label className="p-slider">
        <span>
          Kapasitas PKS <b>{plant.tph} t/jam</b> ({Math.round(300 + 18 * plant.tph)} kW saat olah penuh)
        </span>
        <input type="range" min={30} max={90} step={5} value={plant.tph} onChange={(e) => (plant.tph = +e.target.value)} />
      </label>
      <label className="chk wide">
        <input type="checkbox" checked={plant.pksAllDay} onChange={() => (plant.pksAllDay = !plant.pksAllDay)} /> PKS jalan dua shift penuh (24 jam)
      </label>
      <label className="p-slider">
        <span>
          Pengali beban seluruh kawasan <b>{Math.round(plant.loadMul * 100)}%</b>
        </span>
        <input type="range" min={0.5} max={1.5} step={0.05} value={plant.loadMul} onChange={(e) => (plant.loadMul = +e.target.value)} />
      </label>
      <div className="row">
        <button className="small" disabled={!busLive(plant)} onClick={() => motorStart(plant)}>
          ⚙ Start motor besar
        </button>
        <button className="small" disabled={plant.shipMin > 0} onClick={() => shipArrives(plant)}>
          {plant.shipMin > 0 ? `🚢 Muat kapal ${Math.ceil(plant.shipMin / 60)} jam` : '🚢 Kapal sandar'}
        </button>
      </div>
    </>
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

/** DSE buttons on one paralleled set: the mode keys pick manual/auto for the load-demand master, start and stop act
 *  on the set, the breaker keys close (with check-sync) or open its breaker, the rest only move the screen. */
function unitPress(i: number, id: ButtonId) {
  const u = plant.units[i];
  switch (id) {
    case 'stop':
      u.auto = false;
      if (u.phase === 'rest') resetUnit(plant, i);
      else stopUnit(plant, i);
      break;
    case 'manual':
    case 'test':
      u.auto = false;
      break;
    case 'auto':
      u.auto = true;
      break;
    case 'start':
      if (!u.auto) startUnit(plant, i);
      break;
    case 'toGen':
      closeBreaker(plant, i);
      break;
    case 'toMains':
      openBreaker(plant, i);
      break;
  }
  const screenOnly = ['up', 'down', 'left', 'right', 'tick', 'mute'].includes(id);
  press(unitState[i], screenOnly ? id : 'mute');
}

const UNIT_VIEWS: [UnitView, string][] = [
  ['genset', 'Genset'],
  ['panel', 'Panel'],
  ['engine', 'Mesin'],
  ['radiator', 'Radiator'],
];

/** Everything the single-set page offers, for the set being inspected. */
function UnitDetail() {
  const { selected: i } = usePlant();
  usePlant((s) => s.tick);
  const ui = useUI();
  const u = plant.units[i];
  const s = unitState[i];
  const [cls, text] = unitStatus(i);
  const g: [string, string, string?][] = [
    ['Beban', `${Math.round(u.kw)} kW`, u.kw ? `${Math.round((u.kw / PRIME_KW) * 100)}%` : undefined],
    ['Putaran', `${Math.round(u.rpm)} rpm`],
    ['Frekuensi', `${setHz(s).toFixed(1)} Hz`],
    ['Tegangan', `${Math.round(u.volts)} V`],
    ['Arus', `${Math.round(amps(s))} A`],
    ['Solar', `${Math.round(fuelRate(s))} L/jam`],
    ['Air pendingin', `${Math.round(u.coolant)} °C`],
    ['Oli', `${u.oil.toFixed(1)} bar`],
    ['Gas buang', `${Math.round(u.exhaust)} °C`],
  ];
  if (ui.panelOpen)
    return <DsePanel s={s} onPress={(id) => unitPress(i, id)} note={`G${i + 1}: ${text}. Mode ${u.auto ? 'AUTO, diatur kontrol otomatis' : 'MANUAL'}.`} />;
  return (
    <section className="p-panel p-detail">
      <div className="p-detail-head">
        <h2>
          Genset G{i + 1} <i className={`dot ${cls}`} /> <span>{text}</span>
        </h2>
        <button className="small" onClick={leaveInspect}>
          ← Kembali
        </button>
      </div>
      <div className="row">
        {plant.units.map((_, k) => (
          <button key={k} className={`small ${k === i ? 'on' : ''}`} onClick={() => inspectUnit(k)}>
            G{k + 1}
          </button>
        ))}
      </div>
      <div className="p-gauges">
        {g.map(([k, v, sub]) => (
          <div key={k}>
            <span>{k}</span>
            <b>{v}</b>
            {sub && <small>{sub}</small>}
          </div>
        ))}
      </div>
      <h2>Beban unit</h2>
      <div className="row">
        <button className={`small ${u.baseKw <= 0 ? 'on' : ''}`} onClick={() => (u.baseKw = 0)}>
          Bagi rata
        </button>
        <button className={`small ${u.baseKw > 0 ? 'on' : ''}`} onClick={() => (u.baseKw = u.baseKw > 0 ? u.baseKw : PRIME_KW)}>
          Base load
        </button>
      </div>
      {u.baseKw > 0 && (
        <label className="p-slider">
          <span>
            Setelan base load <b>{u.baseKw} kW</b> ({Math.round((u.baseKw / PRIME_KW) * 100)}%)
          </span>
          <input type="range" min={100} max={UNIT_MAX_KW} step={50} value={u.baseKw} onChange={(e) => (u.baseKw = +e.target.value)} />
        </label>
      )}
      <p className="hint">
        {u.baseKw > 0
          ? 'Saat di bus, unit ini dipaksa memikul beban sebesar setelan; unit lain yang "bagi rata" menanggung sisanya dan menjaga frekuensi.'
          : 'Saat di bus, beban dibagi rata dengan unit lain. Pilih base load untuk memaksa unit ini sampai beban penuh.'}
      </p>
      <label className="chk wide">
        <input type="checkbox" checked={u.loadBank} disabled={!available(u) && !u.loadBank} onChange={() => (u.loadBank = !u.loadBank)} /> Load bank
        <b className="p-lb">{u.loadBankKw} kW</b>
      </label>
      <input
        className="p-range"
        type="range"
        min={0}
        max={UNIT_MAX_KW}
        step={50}
        value={u.loadBankKw}
        onChange={(e) => (u.loadBankKw = +e.target.value)}
        aria-label="Daya load bank"
      />
      <p className="hint">
        Load bank resistif dipasang di terminal genset. Breaker terbuka: genset dites sendiri tanpa mengganggu kawasan. Di atas 1980 kW (110%) selama 5 detik
        genset trip overload.
      </p>
      <h2>Tangki harian</h2>
      <div className="p-tank">
        <em style={{ width: `${(u.dayTank / DAY_L) * 100}%`, background: u.dayTank < DAY_L * 0.1 ? '#e0533c' : undefined }} />
        <span>
          {Math.round(u.dayTank).toLocaleString('id')} / {DAY_L.toLocaleString('id')} L · {u.pumping ? 'pompa transfer mengisi' : u.pumpAuto ? 'pompa siaga' : 'pompa mati'}
        </span>
      </div>
      <div className="row">
        <button className={`small ${u.pumpAuto ? 'on' : ''}`} onClick={() => (u.pumpAuto = !u.pumpAuto)}>
          Pompa {u.pumpAuto ? 'auto' : 'mati'}
        </button>
        <button className="small" onClick={() => drainDayTank(plant, i)}>
          Kuras solar
        </button>
        <button className="small" onClick={() => fillDayTank(plant, i)} disabled={u.dayTank >= DAY_L - 1}>
          ⛽ Isi penuh
        </button>
      </div>
      <h2>Servis</h2>
      <div className="p-svc">
        <div className="p-tank">
          <em
            style={{
              width: `${Math.min(1, u.sinceService / SERVICE_H) * 100}%`,
              background: u.sinceService > SERVICE_H * 1.2 ? '#e0533c' : u.sinceService > SERVICE_H ? '#e0a33c' : '#3fa06a',
            }}
          />
          <span>{u.serviceMin > 0 ? `diservis · ${Math.ceil(u.serviceMin / 60)} jam lagi` : `${Math.round(u.sinceService)} / ${SERVICE_H} jam sejak servis`}</span>
        </div>
        <button className="small" disabled={u.phase !== 'rest' || u.locked} onClick={() => startService(plant, i)}>
          Servis
        </button>
      </div>
      <h2>Gangguan</h2>
      <div className="row">
        <button className={u.eStop ? 'small on danger' : 'small'} onClick={() => setEStop(plant, i, !u.eStop)}>
          {u.eStop ? 'Lepas E-stop' : '🛑 Emergency stop'}
        </button>
        <button className={u.faultRadiator ? 'small on danger' : 'small'} onClick={() => (u.faultRadiator = !u.faultRadiator)}>
          Radiator tersumbat
        </button>
        <button className={u.faultOil ? 'small on danger' : 'small'} onClick={() => (u.faultOil = !u.faultOil)}>
          Oli bocor
        </button>
      </div>
      <h2>Tampilan</h2>
      <div className="row">
        <button className={`small ${ui.xray ? 'on' : ''}`} onClick={() => ui.set({ xray: !ui.xray })}>
          X-ray aliran
        </button>
        <button
          className={`small ${ui.explode ? 'on' : ''}`}
          onClick={() => {
            const next = ui.explode === 0 ? 1 : ui.explode === 1 ? 2 : 0;
            ui.set({ explode: next, focus: null });
            goUnit(i, next ? 'exploded' : 'genset');
          }}
        >
          {ui.explode === 0 ? 'Bongkar' : ui.explode === 1 ? 'Bongkar detail' : 'Rakit lagi'}
        </button>
        <button className="small" onClick={() => ui.set({ panelOpen: true })}>
          Panel DSE
        </button>
      </div>
      <div className="row">
        {UNIT_VIEWS.map(([v, l]) => (
          <button key={v} className="small" onClick={() => goUnit(i, v)}>
            {l}
          </button>
        ))}
      </div>
      {ui.xray && (
        <ul className="legend">
          <li style={{ color: FLOW_COLORS.fuel }}>Solar</li>
          <li style={{ color: FLOW_COLORS.air }}>Udara masuk (turbo)</li>
          <li style={{ color: FLOW_COLORS.exhaust }}>Gas buang</li>
          <li style={{ color: FLOW_COLORS.coolant }}>Air pendingin</li>
          <li style={{ color: FLOW_COLORS.power }}>Listrik</li>
        </ul>
      )}
      <p className="hint">Klik komponen mana saja pada genset ini untuk melihat nama dan fungsinya.</p>
    </section>
  );
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

const rp = (v: number) => `Rp ${Math.round(v).toLocaleString('id')}`;
const rpShort = (v: number) => (v >= 1e9 ? `Rp ${(v / 1e9).toFixed(2)} M` : v >= 1e6 ? `Rp ${(v / 1e6).toFixed(1)} jt` : rp(v));

function FeederList() {
  const live = busLive(plant);
  return (
    <>
      {plant.feeders.map((f, i) => {
        const on = f.on && live;
        const state = f.lockout ? `lockout · perbaikan ${Math.ceil(f.repairMin / 60)} jam` : f.reclose >= 0 ? 'recloser menunggu…' : '';
        return (
          <div key={i} className="p-feeder">
            <i className={`dot ${on ? 'ok' : f.lockout || f.reclose >= 0 ? 'warn' : 'bad'}`} />
            <span className="nm">
              {f.name}
              {state && <em className="p-state">{state}</em>}
            </span>
            <b>{Math.round(f.demand)} kW</b>
            <button className={`small ${f.on ? 'on' : ''}`} disabled={f.lockout} onClick={() => setFeeder(plant, i, !f.on)}>
              {f.on ? 'Lepas' : 'Sambung'}
            </button>
          </div>
        );
      })}
      <small className="hint">
        Urutan lepas otomatis saat frekuensi drop:{' '}
        {[...plant.feeders]
          .sort((a, b) => a.shedOrder - b.shedOrder)
          .map((f) => f.short)
          .join(' → ')}
        .
      </small>
    </>
  );
}

function WeatherUps() {
  const W: [Weather, string][] = [
    ['cerah', 'Cerah'],
    ['hujan', '🌧 Hujan'],
    ['badai', '⛈ Badai petir'],
  ];
  return (
    <>
      <h2>Cuaca</h2>
      <div className="row">
        {W.map(([w, l]) => (
          <button key={w} className={`small ${plant.weather === w ? 'on' : ''}`} onClick={() => setWeather(plant, w)}>
            {l}
          </button>
        ))}
      </div>
      <label className="chk wide">
        <input type="checkbox" checked={plant.autoWeather} onChange={() => (plant.autoWeather = !plant.autoWeather)} /> Cuaca berubah sendiri
      </label>
      <p className="hint">
        Hujan: dahan basah bisa menyentuh kabel. Badai: petir menyambar jaringan 20 kV. Recloser mencoba menyambung lagi dua kali; gangguan sesaat langsung
        pulih, pohon tumbang membuat penyulang lockout sampai regu lapangan selesai.
      </p>
      <h2>UPS</h2>
      {plant.ups.map((u) => {
        const mins = (u.charge * u.kwh * 60) / u.kw;
        return (
          <div key={u.name} className="p-ups">
            <div>
              <b>{u.name}</b>
              <span className={u.onBattery ? 'warn' : u.charge > 0.99 ? 'ok' : ''}>
                {u.charge === 0 ? 'baterai habis' : u.onBattery ? `pakai baterai · sisa ±${Math.round(mins)} mnt` : u.charge < 0.99 ? 'mengisi baterai' : 'online'}
              </span>
            </div>
            <div className="p-tank">
              <em style={{ width: `${u.charge * 100}%`, background: u.charge < 0.2 ? '#e0533c' : '#3fa06a' }} />
              <span>
                {Math.round(u.charge * 100)}% · {u.kw} kW · {u.kwh} kWh
              </span>
            </div>
          </div>
        );
      })}
      <p className="hint">UPS menanggung beban kritis tanpa jeda saat sumbernya hilang: layar SCADA, relay proteksi, lampu darurat ruang kontrol, dan ruang tindakan klinik.</p>
    </>
  );
}

function ServiceCost() {
  const t = plant.today;
  const todayRp = t.litres * FUEL_RP + t.serviceRp;
  const perKwh = t.kwh > 1 ? (t.litres * FUEL_RP) / t.kwh : 0;
  return (
    <>
      <h2>Jadwal servis (tiap {SERVICE_H} jam)</h2>
      {plant.units.map((u, i) => {
        const f = u.sinceService / SERVICE_H;
        return (
          <div key={i} className="p-svc">
            <b>G{i + 1}</b>
            <div className="p-tank">
              <em style={{ width: `${Math.min(1, f) * 100}%`, background: f > 1.2 ? '#e0533c' : f > 1 ? '#e0a33c' : '#3fa06a' }} />
              <span>{u.serviceMin > 0 ? `diservis · ${Math.ceil(u.serviceMin / 60)} jam lagi` : `${Math.round(u.sinceService)} / ${SERVICE_H} jam`}</span>
            </div>
            <button className="small" disabled={u.phase !== 'rest' || u.locked} onClick={() => startService(plant, i)}>
              Servis
            </button>
          </div>
        );
      })}
      <p className="hint">Matikan genset dulu untuk diservis (±4 jam). Lewat 100 jam dari jadwal, risiko genset trip karena oli rusak terus naik.</p>
      <h2>Biaya hari ini (Hari {plant.day})</h2>
      <div className="p-cost">
        <span>Energi</span>
        <b>{(t.kwh / 1000).toFixed(1)} MWh</b>
        <span>Solar</span>
        <b>
          {Math.round(t.litres).toLocaleString('id')} L · {rpShort(t.litres * FUEL_RP)}
        </b>
        <span>Servis</span>
        <b>{rpShort(t.serviceRp)}</b>
        <span>Total</span>
        <b>{rpShort(todayRp)}</b>
        <span>Biaya solar per kWh</span>
        <b>
          {perKwh ? rp(perKwh) : '–'} <small>(PLN industri ±{rp(PLN_RP)})</small>
        </b>
      </div>
      {plant.reports.length > 0 && (
        <>
          <h2>Laporan harian</h2>
          <table className="p-report">
            <thead>
              <tr>
                <th>Hari</th>
                <th>MWh</th>
                <th>Solar L</th>
                <th>Biaya</th>
                <th>Rp/kWh</th>
                <th>Lepas</th>
              </tr>
            </thead>
            <tbody>
              {plant.reports.map((r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{(r.kwh / 1000).toFixed(1)}</td>
                  <td>{Math.round(r.litres).toLocaleString('id')}</td>
                  <td>{rpShort(r.rp)}</td>
                  <td>{r.kwh ? Math.round(r.rp / r.kwh).toLocaleString('id') : '–'}</td>
                  <td>{r.shed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="hint">
        Asumsi: solar industri {rp(FUEL_RP)}/L, servis 500 jam {rpShort(SERVICE_RP)}, tarif PLN industri ±{rp(PLN_RP)}/kWh. Total sejak mulai {rpShort(plant.costRp)}.
      </p>
    </>
  );
}

type Tab = 'feeder' | 'cuaca' | 'biaya';
let lastTab: Tab = 'feeder';

function Feeders() {
  usePlant((s) => s.tick);
  const [tab, setTab] = useState<Tab>(lastTab);
  const pick = (t: Tab) => {
    lastTab = t;
    setTab(t);
  };
  const tabs: [Tab, string][] = [
    ['feeder', 'Penyulang'],
    ['cuaca', 'Cuaca & UPS'],
    ['biaya', 'Servis & biaya'],
  ];
  return (
    <section className="p-panel p-feed">
      <div className="p-tabs" role="tablist">
        {tabs.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`small ${tab === t ? 'on' : ''}`} onClick={() => pick(t)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'feeder' ? <FeederList /> : tab === 'cuaca' ? <WeatherUps /> : <ServiceCost />}
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
          const v = plant.feeders.reduce((a, f) => a + profile(f.id, hh, plant.tph, plant.pksAllDay), 0) * plant.loadMul;
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
  const inspect = usePlant((s) => s.inspect);
  const cam = usePlant((s) => s.cam);
  const hideUi = usePlant((s) => s.hideUi);
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
      <header className="brand" style={hideUi ? { display: 'none' } : undefined}>
        <h1>PLTD Kawasan Sawit</h1>
        <p>{UNITS} × genset 2250 kVA · paralel · 20 kV</p>
        <button className="tour-start" onClick={() => useUI.getState().set({ mode: 'single' })}>
          ← Genset tunggal
        </button>
      </header>
      {!hideUi && (
        <>
          <TopBar />
          <Units />
          {inspect ? (
            <>
              <UnitDetail />
              <PartCard />
            </>
          ) : (
            <>
              <SyncPanel />
              <Feeders />
              <Chart />
              <Narration />
            </>
          )}
        </>
      )}
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
        {cam === 'control' && (
          <div className="p-seats">
            <span>🪑 Duduk di</span>
            {['G1', 'G2', 'G3', 'G4', 'G5', 'Bus'].map((l, k) => (
              <button key={l} className="small" onClick={() => (goSeat(k), usePlant.getState().set({ hideUi: true }))} title={k < 5 ? `Kursi operator konsol genset ${l}` : 'Kursi operator konsol bus dan penyulang'}>
                {l}
              </button>
            ))}
          </div>
        )}
        <button className={`small ${hideUi ? '' : 'on'}`} title="Tampilkan atau sembunyikan panel di layar" onClick={() => usePlant.getState().set({ hideUi: !hideUi })}>
          👁 Panel
        </button>
        {CAMS.map(([c, l]) => (
          <button
            key={c}
            className={`small ${cam === c ? 'on' : ''}`}
            onClick={() => {
              leaveInspect();
              goPlant(c);
              usePlant.getState().set({ cam: c, hideUi: false });
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </>
  );
}
