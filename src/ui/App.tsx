import { useEffect, useState } from 'react';
import { Experience } from '../scene/Experience';
import { goTo, setInset, type Preset } from '../scene/camera';
import { FLOW_COLORS } from '../scene/Flows';
import { RATING, TANK_L, amps, fuelRate, genAvailable, hoursLeft, hz, loadFrac, refuel, setEStop, setMains } from '../sim/genset';
import { sequence } from '../dse';
import { initSound, setSound } from '../sound';
import { sim, useUI } from '../store';
import { DsePanel } from './DsePanel';
import { Tour } from './Tour';
import { PartCard } from './PartCard';
import { startTour } from '../tour';

function Gauges() {
  useUI((s) => s.tick);
  const lf = loadFrac(sim);
  const items: [string, string, string?][] = [
    ['Beban', `${Math.round(sim.genKw)} kW`, sim.genKw ? `${Math.round(lf * 100)}%` : undefined],
    ['Putaran', `${Math.round(sim.rpm)} rpm`],
    ['Frekuensi', `${hz(sim).toFixed(1)} Hz`],
    ['Tegangan', `${Math.round(sim.volts)} V`],
    ['Arus', `${Math.round(amps(sim))} A`],
    ['Solar', `${Math.round(fuelRate(sim))} L/jam`, `${Math.round((sim.fuel / TANK_L) * 100)}% tangki${isFinite(hoursLeft(sim)) ? ` · ${hoursLeft(sim).toFixed(1)} jam` : ''}`],
    ['Air pendingin', `${Math.round(sim.coolant)} °C`],
    ['Oli', `${sim.oil.toFixed(1)} bar`],
  ];
  return (
    <div className="gauges">
      {items.map(([k, v, sub]) => (
        <div key={k} className="g">
          <span>{k}</span>
          <b>{v}</b>
          {sub && <small>{sub}</small>}
        </div>
      ))}
    </div>
  );
}

function Controls() {
  const ui = useUI();
  const [sound, setSnd] = useState(true);
  const run = (ids: Parameters<typeof sequence>[1]) => {
    ui.set({ panelOpen: true });
    sequence(sim, ids);
  };
  const lfMarks = [
    [RATING.baseKw, 'base'],
    [RATING.primeKw, 'prime'],
    [RATING.standbyKw, 'standby'],
  ] as const;
  const views: [Preset, string][] = [
    ['genset', 'Genset'],
    ['panel', 'Panel'],
    ['engine', 'Mesin'],
    ['radiator', 'Radiator'],
    ['site', 'Lokasi'],
  ];
  return (
    <aside className="panel">
      <h2>Skenario</h2>
      <button className={`big ${sim.mainsOk ? 'warn' : 'ok'}`} onClick={() => setMains(sim, !sim.mainsOk)}>
        {sim.mainsOk ? '⚡ PLN padam' : '💡 PLN kembali menyala'}
      </button>
      <label className="slider">
        <span>
          Beban gedung <b>{ui.tick >= 0 && Math.round(sim.demandKw)} kW</b>
        </span>
        <input
          aria-label="Beban gedung"
          type="range"
          min={0}
          max={2200}
          step={50}
          value={sim.demandKw}
          onChange={(e) => {
            sim.demandKw = +e.target.value;
            ui.bump();
          }}
        />
        <div className="marks">
          {lfMarks.map(([kw, name]) => (
            <i key={name} style={{ left: `${(kw / 2200) * 100}%` }}>
              {name}
            </i>
          ))}
        </div>
      </label>

      <h2>Tes genset (PLN tetap menyala)</h2>
      <div className="row">
        <button onClick={() => run(['manual', 'start'])}>
          Nyalakan tanpa beban
        </button>
        <button onClick={() => run(['test', 'start'])}>
          Tes beban gedung
        </button>
      </div>
      <div className="row">
        <button onClick={() => run(['auto'])}>
          Selesai tes (Auto)
        </button>
        <button onClick={() => run(['stop'])}>
          Stop
        </button>
      </div>
      <label className="slider">
        <span>
          <span>
            <input
              aria-label="Nyalakan load bank"
              type="checkbox"
              checked={sim.loadBankOn}
              disabled={!genAvailable(sim) && !sim.loadBankOn}
              onChange={(e) => {
                sim.loadBankOn = e.target.checked;
                ui.bump();
              }}
            />{' '}
            Load bank
          </span>
          <b>{Math.round(sim.loadBankKw)} kW</b>
        </span>
        <input
          aria-label="Daya load bank"
          type="range"
          min={0}
          max={2000}
          step={50}
          value={sim.loadBankKw}
          onChange={(e) => {
            sim.loadBankKw = +e.target.value;
            ui.bump();
          }}
        />
      </label>

      <h2>Gangguan</h2>
      <div className="row">
        <button className={sim.eStop ? 'on danger' : ''} onClick={() => setEStop(sim, !sim.eStop)}>
          {sim.eStop ? 'Lepas E-stop' : '🛑 Emergency stop'}
        </button>
        <button onClick={() => (sim.fuel > 0 ? (sim.fuel = 0) : refuel(sim))}>{sim.fuel > 0 ? 'Kuras solar' : '⛽ Isi solar'}</button>
      </div>
      <div className="row">
        <button className={sim.faultRadiator ? 'on danger' : ''} onClick={() => (sim.faultRadiator = !sim.faultRadiator)}>
          Radiator tersumbat
        </button>
        <button className={sim.faultOil ? 'on danger' : ''} onClick={() => (sim.faultOil = !sim.faultOil)}>
          Oli bocor
        </button>
      </div>

      <h2>Tampilan</h2>
      <div className="row">
        <button className={ui.view === 'open' ? 'on' : ''} onClick={() => ui.set({ view: 'open' })}>
          Open type
        </button>
        <button
          className={ui.view === 'silent' ? 'on' : ''}
          onClick={() => {
            ui.set({ view: 'silent', explode: 0, focus: null });
            goTo('silent');
          }}
        >
          Silent type
        </button>
      </div>
      <div className="row">
        <button className={ui.xray ? 'on' : ''} onClick={() => ui.set({ xray: !ui.xray })}>
          X-ray aliran
        </button>
        <button
          className={ui.explode ? 'on' : ''}
          disabled={ui.view === 'silent'}
          onClick={() => {
            const next = ui.explode === 0 ? 1 : ui.explode === 1 ? 2 : 0;
            ui.set({ explode: next, focus: null });
            goTo(next ? 'exploded' : 'genset');
          }}
        >
          {ui.explode === 0 ? 'Bongkar' : ui.explode === 1 ? 'Bongkar detail' : 'Rakit lagi'}
        </button>
      </div>
      <div className="row wrap">
        {views.map(([p, label]) => (
          <button key={p} className="small" onClick={() => goTo(p)}>
            {label}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          className={ui.speed > 1 ? 'on' : ''}
          title="Percepat waktu, misalnya untuk melihat mesin memanas atau solar berkurang"
          onClick={() => ui.set({ speed: ui.speed === 1 ? 10 : ui.speed === 10 ? 30 : 1 })}
        >
          Waktu {ui.speed}×
        </button>
        <button
          onClick={() => {
            setSound(!sound);
            setSnd(!sound);
          }}
        >
          {sound ? '🔊 Suara' : '🔇 Bisu'}
        </button>
        {!ui.panelOpen && <button onClick={() => ui.set({ panelOpen: true })}>Panel DSE</button>}
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
    </aside>
  );
}

export function App() {
  const [started, setStarted] = useState(false);
  const panelOpen = useUI((s) => s.panelOpen);
  const tour = useUI((s) => s.tour);
  // Phones show one sheet at a time: the controls, or the DSE panel.
  const [narrow, setNarrow] = useState(() => innerWidth <= 900);
  useEffect(() => {
    if (innerWidth <= 900) useUI.getState().set({ panelOpen: false });
    const f = () => setNarrow(innerWidth <= 900);
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  useEffect(() => {
    if (tour !== null) return; // the tour sets its own framing
    // Keep the camera framing clear of the side panels (desktop) or the bottom sheets (phone).
    const fit = () => (innerWidth > 900 ? setInset(322, panelOpen ? 472 : 0, 0) : setInset(0, 0, innerHeight * 0.3));
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [panelOpen, tour]);
  return (
    <>
      <Experience />
      <header className="brand">
        <h1>Genset 2250 kVA</h1>
        <p>Perkins 4016-61TRG3 · Stamford P734H · DSE7320</p>
        {tour === null && (
          <button className="tour-start" onClick={startTour}>
            ▶ Cara kerja genset
          </button>
        )}
      </header>
      <Gauges />
      {tour !== null ? <Tour /> : !(narrow && panelOpen) && <Controls />}
      {panelOpen && !(narrow && tour !== null) && <DsePanel />}
      <PartCard />
      {!started && (
        <div className="intro">
          <div>
            <h1>Simulator Genset 2250 kVA</h1>
            <p>
              Lihat bagaimana genset menyalakan dirinya sendiri saat listrik PLN padam, dari starter sampai mengambil beban gedung. Mesin 16
              silinder, 61 liter, 1800 kW.
            </p>
            <button
              className="big ok"
              onClick={() => {
                initSound();
                setStarted(true);
              }}
            >
              Mulai (suara aktif)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
