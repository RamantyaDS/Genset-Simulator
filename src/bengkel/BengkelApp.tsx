import { useEffect, useRef } from 'react';
import { displacement, gensetFit, IC, LIMITS, repair, startEngine, startPull, steady, STOCK, stopEngine, TURBOS, type Build, type Intercooler, type TurboSize } from '../sim/dyno';
import { initSound } from '../sound';
import { useUI } from '../store';
import { BengkelScene, goB, type BView } from './BengkelScene';
import { engine, input, onEngineEvent, persist, useBengkel, type SavedBuild } from './store';

const PAINTS = ['#1f7f86', '#b3261e', '#1d1f22', '#1f4f9a', '#e07a10', '#e8e8e8'];
const CURVE_COLORS = ['#ffd23a', '#5fb4ff', '#ff7a6a', '#7fe08a'];

function Gauges() {
  useBengkel((s) => s.tick);
  const e = engine;
  const cls = (bad: boolean, warn: boolean) => (bad ? 'bad' : warn ? 'warn' : '');
  const g: [string, string, string][] = [
    ['Putaran', `${Math.round(e.rpm)} rpm`, cls(e.rpm > LIMITS.valveFloat, e.build.limiter > 0 && e.rpm > e.build.limiter - 30)],
    ['Torsi', `${Math.round(e.torque).toLocaleString('id')} Nm`, ''],
    ['Tenaga', `${Math.round(e.power)} kW`, ''],
    ['Boost', `${e.boost.toFixed(2)} bar`, ''],
    ['Suhu gas buang', `${Math.round(e.egt)} °C`, cls(e.egt > LIMITS.egtDamage, e.egt > LIMITS.egtWarn)],
    ['Lambda', e.lambda > 8 ? '–' : e.lambda.toFixed(2), cls(e.lambda < 1.15, e.lambda < 1.4)],
    ['Asap', `${Math.round(e.smoke * 100)}%`, cls(e.smoke > 0.5, e.smoke > 0.2)],
    ['Air pendingin', `${Math.round(e.coolant)} °C`, cls(e.coolant > LIMITS.coolantDamage, e.coolant > LIMITS.coolantWarn)],
    ['Tekanan silinder', `${Math.round(e.pcp)} bar`, cls(e.pcp > LIMITS.pcpGasket, e.pcp > LIMITS.pcpGasket - 15)],
    ['Solar', `${Math.round(e.fuelLph)} L/jam`, ''],
  ];
  return (
    <div className="b-gauges">
      {g.map(([k, v, c]) => (
        <div key={k} className={c}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="b-field">
      <span>{label}</span>
      <select value={String(value)} onChange={(ev) => onChange(options.find(([o]) => String(o) === ev.target.value)![0])}>
        {options.map(([o, l]) => (
          <option key={String(o)} value={String(o)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="b-slider">
      <span>
        {label} <b>{fmt(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(ev) => onChange(+ev.target.value)} />
    </label>
  );
}

function Mods() {
  useBengkel((s) => s.tick);
  const b = engine.build;
  const set = (p: Partial<Build>) => Object.assign(engine.build, p);
  const disp = displacement(b);
  const spec = steady(b, 1500);
  return (
    <aside className="b-panel b-left">
      <h2>Modifikasi mesin</h2>
      <div className="b-row2">
        <Select label="Bore" value={b.bore} options={[160, 162, 164, 166].map((v) => [v, `${v} mm${v === 160 ? ' (std)' : ''}`])} onChange={(v) => set({ bore: v })} />
        <Select label="Stroke" value={b.stroke} options={[190, 195, 200, 205].map((v) => [v, `${v} mm${v === 190 ? ' (std)' : ''}`])} onChange={(v) => set({ stroke: v })} />
      </div>
      <p className="b-note">
        Kapasitas <b>{disp.toFixed(1).replace('.', ',')} L</b> ({Math.round(disp * 1000).toLocaleString('id')} cc) · standar 61,1 L
      </p>
      <Select<TurboSize> label="Turbo (2 buah)" value={b.turbo} options={(Object.keys(TURBOS) as TurboSize[]).map((k) => [k, TURBOS[k].label])} onChange={(v) => set({ turbo: v })} />
      <Select<Intercooler> label="Intercooler" value={b.intercooler} options={(Object.keys(IC) as Intercooler[]).map((k) => [k, IC[k].label])} onChange={(v) => set({ intercooler: v })} />
      <Slider label="Injektor" value={b.injector} min={1} max={1.6} step={0.05} fmt={(v) => `+${Math.round((v - 1) * 100)}%`} onChange={(v) => set({ injector: v })} />
      <Slider label="Peta ECU (solar)" value={b.map} min={0.9} max={1.4} step={0.05} fmt={(v) => (v < 1 ? 'hemat' : v === 1 ? 'standar' : `agresif +${Math.round((v - 1) * 100)}%`)} onChange={(v) => set({ map: v })} />
      <Slider label="Timing injeksi" value={b.timing} min={-2} max={6} step={1} fmt={(v) => (v === 0 ? 'standar' : `${v > 0 ? 'maju' : 'mundur'} ${Math.abs(v)}°`)} onChange={(v) => set({ timing: v })} />
      <div className="b-row2">
        <Select label="Knalpot" value={b.straight ? 1 : 0} options={[[0, 'Standar'], [1, 'Lurus (straight pipe)']]} onChange={(v) => set({ straight: v === 1 })} />
        <Select label="Radiator" value={b.bigRadiator ? 1 : 0} options={[[0, 'Standar'], [1, 'Besar']]} onChange={(v) => set({ bigRadiator: v === 1 })} />
      </div>
      <Select label="Pembatas putaran" value={b.limiter} options={[[1800, '1800 rpm (std)'], [2000, '2000 rpm'], [2200, '2200 rpm'], [0, 'Mati (bahaya)']]} onChange={(v) => set({ limiter: v })} />
      <div className="b-paint">
        <span>Warna mesin</span>
        {PAINTS.map((c) => (
          <button key={c} className={b.paint === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ paint: c })} aria-label={`Warna ${c}`} />
        ))}
      </div>
      <p className="b-note">
        Perkiraan di 1500 rpm gas penuh: <b>{Math.round(spec.power)} kW</b>, EGT {Math.round(spec.egt)} °C, lambda {spec.lambda.toFixed(2)}, asap {Math.round(spec.smoke * 100)}%.
      </p>
      <div className="row">
        <button onClick={() => Object.assign(engine.build, { ...STOCK, paint: b.paint })}>Kembali standar</button>
        <button onClick={() => Object.assign(engine.build, { ...STOCK, name: 'Full modif', bore: 164, stroke: 200, turbo: 'besar', intercooler: 'udara', injector: 1.35, map: 1.15, timing: 2, straight: true, bigRadiator: true, limiter: 2000, paint: '#b3261e' })}>
          Preset full modif
        </button>
      </div>
    </aside>
  );
}

function Controls() {
  useBengkel((s) => s.tick);
  const e = engine;
  return (
    <section className="b-panel b-ctrl">
      <div className="row">
        {e.running ? (
          <button onClick={() => stopEngine(e)}>⏹ Matikan</button>
        ) : (
          <button className="ok-btn" disabled={e.wrecked} onClick={() => (initSound(), startEngine(e))}>
            ▶ Nyalakan
          </button>
        )}
        <button disabled={!e.running || e.pull.active} onClick={() => startPull(e)}>
          📈 Dyno pull
        </button>
      </div>
      <button
        className={`b-gas ${input.held ? 'on' : ''}`}
        disabled={!e.running}
        onPointerDown={() => (input.held = true)}
        onPointerUp={() => (input.held = false)}
        onPointerLeave={() => (input.held = false)}
      >
        GAS (tahan · W / ↑ / spasi)
      </button>
      <Slider label="Throttle tetap" value={input.base} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => (input.base = v)} />
      <Slider label="Beban dyno (mode bebas)" value={e.absorb} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => (e.absorb = v)} />
    </section>
  );
}

function Damage() {
  useBengkel((s) => s.tick);
  const d = engine.dmg;
  const rows: [string, number, string][] = [
    ['Turbo', d.turbo, 'EGT di atas 760 °C'],
    ['Paking kepala silinder', d.gasket, 'tekanan silinder > 210 bar, air > 112 °C'],
    ['Katup', d.valves, 'di atas 2100 rpm (valve float)'],
    ['Setang piston', d.rods, 'di atas ±2400 rpm'],
  ];
  return (
    <section className="b-panel b-dmg">
      <h2>Kondisi mesin</h2>
      {rows.map(([l, v, why]) => (
        <div key={l} className="b-bar" title={`Rusak bila: ${why}`}>
          <span>{l}</span>
          <i>
            <em style={{ width: `${(1 - v) * 100}%`, background: v > 0.66 ? '#e0533c' : v > 0.2 ? '#e0a33c' : '#3fa06a' }} />
          </i>
        </div>
      ))}
      {(engine.wrecked || Object.values(d).some((v) => v > 0)) && (
        <button className="small" onClick={() => repair(engine)}>
          🔧 Bongkar & rakit ulang
        </button>
      )}
    </section>
  );
}

/** Dyno chart: power (solid) and torque (dashed) against rpm for the last pull and any saved builds being compared. */
function Chart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { saved, compare } = useBengkel();
  useEffect(() => {
    let id = 0;
    const draw = () => {
      const c = ref.current;
      const g = c?.getContext('2d');
      if (c && g) {
        const W = c.width;
        const H = c.height;
        g.fillStyle = '#0b1210';
        g.fillRect(0, 0, W, H);
        const x = (r: number) => 40 + ((W - 90) * (r - 800)) / (2300 - 800);
        const yk = (k: number) => H - 22 - ((H - 34) * k) / 4800;
        const yn = (n: number) => H - 22 - ((H - 34) * n) / 24000;
        g.strokeStyle = '#1f2b26';
        g.fillStyle = '#7f8a85';
        g.font = '10px sans-serif';
        for (let r = 800; r <= 2300; r += 250) {
          g.beginPath();
          g.moveTo(x(r), 10);
          g.lineTo(x(r), H - 22);
          g.stroke();
          g.fillText(String(r), x(r) - 12, H - 8);
        }
        for (let k = 0; k <= 4800; k += 1200) g.fillText(`${k} kW`, 2, yk(k) + 3);
        g.textAlign = 'right';
        for (let n = 0; n <= 24000; n += 8000) g.fillText(`${n / 1000}k Nm`, W - 2, yn(n) + 3);
        g.textAlign = 'left';
        const curves: { pts: { rpm: number; kw: number; nm: number }[]; color: string }[] = [];
        saved.filter((s) => compare.includes(s.id)).forEach((s, i) => curves.push({ pts: s.curve, color: CURVE_COLORS[(i + 1) % 4] }));
        if (engine.pull.points.length) curves.push({ pts: engine.pull.points, color: CURVE_COLORS[0] });
        for (const cv of curves) {
          g.strokeStyle = cv.color;
          g.lineWidth = 2;
          g.setLineDash([]);
          g.beginPath();
          cv.pts.forEach((p, i) => (i ? g.lineTo(x(p.rpm), yk(p.kw)) : g.moveTo(x(p.rpm), yk(p.kw))));
          g.stroke();
          g.setLineDash([5, 4]);
          g.beginPath();
          cv.pts.forEach((p, i) => (i ? g.lineTo(x(p.rpm), yn(p.nm)) : g.moveTo(x(p.rpm), yn(p.nm))));
          g.stroke();
        }
        g.setLineDash([]);
        // live operating point
        if (engine.running) {
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.arc(x(engine.rpm), yk(engine.power), 4, 0, Math.PI * 2);
          g.fill();
        }
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, [saved, compare]);
  return <canvas ref={ref} width={560} height={220} aria-label="Grafik dyno tenaga dan torsi" />;
}

function Builds() {
  const { saved, compare, records } = useBengkel();
  useBengkel((s) => s.tick);
  const save = () => {
    const pts = engine.pull.points;
    if (!pts.length) return void (engine.message = 'Lakukan dyno pull dulu supaya build punya grafik.');
    const name = prompt('Nama build:', engine.build.name === STOCK.name ? 'Build saya' : engine.build.name) ?? '';
    if (!name) return;
    const sb: SavedBuild = {
      id: String(Date.now()),
      build: { ...engine.build, name },
      curve: pts.map((p) => ({ rpm: p.rpm, kw: p.kw, nm: p.nm })),
      peakKw: Math.max(...pts.map((p) => p.kw)),
      peakNm: Math.max(...pts.map((p) => p.nm)),
    };
    const next = [...saved, sb].slice(-8);
    useBengkel.getState().set({ saved: next, compare: [...compare, sb.id].slice(-3) });
    persist('genset-builds', next);
  };
  const del = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    useBengkel.getState().set({ saved: next, compare: compare.filter((c) => c !== id) });
    persist('genset-builds', next);
  };
  const fit = gensetFit(engine.build);
  return (
    <section className="b-panel b-right">
      <h2>Dyno</h2>
      <Chart />
      <p className="b-note">Garis penuh = tenaga (kW), putus-putus = torsi (Nm). Kuning = pull terakhir.</p>
      <h2>Build tersimpan</h2>
      <button className="small" onClick={save}>
        💾 Simpan build ini
      </button>
      {saved.map((s, i) => (
        <div key={s.id} className="b-build">
          <label>
            <input
              type="checkbox"
              checked={compare.includes(s.id)}
              onChange={() => useBengkel.getState().set({ compare: compare.includes(s.id) ? compare.filter((c) => c !== s.id) : [...compare, s.id].slice(-3) })}
            />{' '}
            <b style={{ color: compare.includes(s.id) ? CURVE_COLORS[(compare.indexOf(s.id) + 1) % 4] : undefined }}>{s.build.name}</b>
          </label>
          <span>
            {Math.round(s.peakKw)} kW · {Math.round(s.peakNm).toLocaleString('id')} Nm
          </span>
          <button className="small" onClick={() => Object.assign(engine.build, s.build)}>
            Pakai
          </button>
          <button className="small" onClick={() => del(s.id)} aria-label={`Hapus ${s.build.name}`}>
            ×
          </button>
          {i === -1 && null}
        </div>
      ))}
      <h2>Tantangan</h2>
      <ul className="b-chal">
        <li>
          Tenaga maksimal tanpa kerusakan: <b>{records.power ? `${Math.round(records.power)} kW` : '–'}</b>
        </li>
        <li>
          Paling hemat di 1500 rpm (L/kWh): <b>{records.efficient ? records.efficient.toFixed(3) : '–'}</b>
        </li>
        <li>
          Torsi terbesar di 1000 rpm: <b>{records.lowTorque ? `${Math.round(records.lowTorque).toLocaleString('id')} Nm` : '–'}</b>
        </li>
      </ul>
      <h2>Pasang ke genset</h2>
      <p className="b-note">
        Di genset mesin dikunci 1500 rpm. Build ini memberi <b>{Math.round(fit.kw)} kWm</b> di poros, sekitar <b>{Math.round(fit.kwe)} kWe</b> setelah alternator.{' '}
        {fit.kwe > 2000
          ? 'Lebih dari batas alternator Stamford 2250 kVA (2000 kW standby): tenaga ekstra tidak bisa dipakai, alternator yang jadi pembatas.'
          : fit.kwe < 1800
            ? 'Kurang dari 1800 kW prime: genset tidak sanggup memikul beban penuh.'
            : 'Masih dalam batas alternator.'}{' '}
        Modifikasi juga bisa membuat genset tidak lolos uji emisi dan menggugurkan garansi pabrik.
      </p>
      <button
        className="small ok-btn"
        onClick={() => {
          localStorage.setItem('genset-fit', JSON.stringify(engine.build));
          useUI.getState().set({ mode: 'single' });
        }}
      >
        🔧 Pasang ke genset dan buka mode genset
      </button>
    </section>
  );
}

function Narration() {
  useBengkel((s) => s.tick);
  const m = engine.message;
  return m ? <p className="b-narr">{m}</p> : null;
}

const VIEWS: [BView, string][] = [
  ['mesin', 'Mesin'],
  ['turbo', 'Turbo'],
  ['dyno', 'Dyno'],
  ['sel', 'Ruang uji'],
];

export function BengkelApp() {
  const hideUi = useBengkel((s) => s.hideUi);
  useEffect(() => {
    document.body.classList.add('bengkel-mode');
    const go = () => initSound();
    addEventListener('pointerdown', go, { once: true });
    // records come from finished pulls on an undamaged engine
    const off = onEngineEvent((ev) => {
      if (ev !== 'pullDone') return;
      const pts = engine.pull.points;
      const r = { ...useBengkel.getState().records };
      const healthy = !Object.values(engine.dmg).some((v) => v > 0.05);
      const peak = Math.max(...pts.map((p) => p.kw));
      if (healthy && peak > r.power) r.power = peak;
      const at = (rpm: number) => pts.reduce((a, p) => (Math.abs(p.rpm - rpm) < Math.abs(a.rpm - rpm) ? p : a), pts[0]);
      const p15 = at(1500);
      const lpk = steady(engine.build, 1500).fuelLph / Math.max(1, p15.kw);
      if (healthy && (!r.efficient || lpk < r.efficient)) r.efficient = lpk;
      if (at(1000).nm > r.lowTorque) r.lowTorque = at(1000).nm;
      useBengkel.getState().set({ records: r });
      persist('genset-records', r);
    });
    return () => {
      document.body.classList.remove('bengkel-mode');
      removeEventListener('pointerdown', go);
      off();
      input.held = false;
    };
  }, []);
  return (
    <>
      <BengkelScene />
      <header className="brand" style={hideUi ? { display: 'none' } : undefined}>
        <h1>Bengkel & Dyno</h1>
        <p>Perkins 4016 · modifikasi dan uji tenaga</p>
        <button className="tour-start" onClick={() => useUI.getState().set({ mode: 'single' })}>
          ← Genset tunggal
        </button>
      </header>
      {!hideUi && (
        <>
          <Gauges />
          <Mods />
          <Controls />
          <Damage />
          <Builds />
          <Narration />
        </>
      )}
      <div className="b-cams">
        <button className={`small ${hideUi ? '' : 'on'}`} onClick={() => useBengkel.getState().set({ hideUi: !hideUi })}>
          👁 Panel
        </button>
        {VIEWS.map(([v, l]) => (
          <button key={v} className="small" onClick={() => goB(v)}>
            {l}
          </button>
        ))}
      </div>
    </>
  );
}
