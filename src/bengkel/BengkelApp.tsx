import { EMBED } from '../embed';
import { useEffect, useRef } from 'react';
import { displacement, gensetFit, IC, LIMITS, limitsOf, repair, startEngine, startPull, steady, STOCK, stopEngine, TURBOS, type Build, type Intercooler, type TurboSize } from '../sim/dyno';
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
  const L = limitsOf(e.build);
  const g: [string, string, string][] = [
    ['Putaran', `${Math.round(e.rpm)} rpm`, cls(e.rpm > L.valveFloat, e.build.limiter > 0 && e.rpm > e.build.limiter - 30)],
    ['Torsi', `${Math.round(e.torque).toLocaleString('id')} Nm`, ''],
    ['Tenaga', `${Math.round(e.power)} kW`, ''],
    ['Boost', `${e.boost.toFixed(2)} bar`, ''],
    ['Suhu gas buang', `${Math.round(e.egt)} °C`, cls(e.egt > L.egtDamage, e.egt > L.egtWarn)],
    ['Lambda', e.lambda > 8 ? '–' : e.lambda.toFixed(2), cls(e.lambda < 1.15, e.lambda < 1.4)],
    ['Asap', `${Math.round(e.smoke * 100)}%`, cls(e.smoke > 0.5, e.smoke > 0.2)],
    ['Air pendingin', `${Math.round(e.coolant)} °C`, cls(e.coolant > L.coolantDamage, e.coolant > L.coolantWarn)],
    ['Tekanan silinder', `${Math.round(e.pcp)} bar`, cls(e.pcp > L.pcpGasket, e.pcp > L.pcpGasket - 15)],
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

/** A free number field (no upper limit) with a few quick picks underneath. */
function Num({
  label,
  value,
  unit,
  min = 0,
  step = 1,
  quick = [],
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min?: number;
  step?: number;
  quick?: [number, string][];
  onChange: (v: number) => void;
}) {
  return (
    <label className="b-num">
      <span>{label}</span>
      <span className="b-num-in">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={Number.isFinite(value) ? +value.toFixed(3) : 0}
          onChange={(ev) => {
            const v = parseFloat(ev.target.value);
            if (Number.isFinite(v) && v >= min) onChange(v);
          }}
        />
        <em>{unit}</em>
      </span>
      {quick.length > 0 && (
        <span className="b-quick">
          {quick.map(([v, l]) => (
            <button key={l} type="button" className={`small ${Math.abs(value - v) < 1e-9 ? 'on' : ''}`} onClick={() => onChange(v)}>
              {l}
            </button>
          ))}
        </span>
      )}
    </label>
  );
}

const FULL: Partial<Build> = {
  name: 'Full modif',
  bore: 164,
  stroke: 200,
  turbo: 'besar',
  intercooler: 'udara',
  injector: 1.35,
  map: 1.15,
  timing: 2,
  straight: true,
  radiatorKw: 2300,
  limiter: 2000,
  paint: '#b3261e',
};
const MONSTER: Partial<Build> = {
  name: 'Monster',
  bore: 200,
  stroke: 240,
  turbo: 'custom',
  boost: 4.8,
  spool: 1500,
  intercooler: 'udara',
  injector: 2.2,
  map: 1,
  timing: 1,
  straight: true,
  forged: true,
  radiatorKw: 6000,
  limiter: 2200,
  altKva: 6000,
  paint: '#1d1f22',
};

function Mods() {
  useBengkel((s) => s.tick);
  const b = engine.build;
  const set = (p: Partial<Build>) => Object.assign(engine.build, p);
  const disp = displacement(b);
  const spec = steady(b, 1500);
  const fit = gensetFit(b);
  return (
    <aside className="b-panel b-left">
      <h2>Modifikasi mesin · full custom</h2>
      <div className="b-row2">
        <Num label="Bore" unit="mm" min={50} value={b.bore} quick={[[160, 'std'], [166, '166'], [180, '180']]} onChange={(v) => set({ bore: v })} />
        <Num label="Stroke" unit="mm" min={50} value={b.stroke} quick={[[190, 'std'], [205, '205'], [230, '230']]} onChange={(v) => set({ stroke: v })} />
      </div>
      <p className="b-note">
        Kapasitas <b>{disp.toFixed(1).replace('.', ',')} L</b> ({Math.round(disp * 1000).toLocaleString('id')} cc, 16 silinder) · standar 61,1 L
      </p>
      <Select<TurboSize> label="Turbo" value={b.turbo} options={(Object.keys(TURBOS) as TurboSize[]).map((k) => [k, TURBOS[k].label])} onChange={(v) => set({ turbo: v })} />
      {b.turbo === 'custom' && (
        <div className="b-row2">
          <Num label="Boost" unit="bar" min={0.3} step={0.1} value={b.boost ?? 2.6} quick={[[3.5, '3,5'], [5, '5']]} onChange={(v) => set({ boost: v })} />
          <Num label="Spool penuh di" unit="rpm" min={700} step={50} value={b.spool ?? 1100} quick={[[1100, '1100'], [1500, '1500']]} onChange={(v) => set({ spool: v })} />
        </div>
      )}
      <Select<Intercooler> label="Intercooler" value={b.intercooler} options={(Object.keys(IC) as Intercooler[]).map((k) => [k, IC[k].label])} onChange={(v) => set({ intercooler: v })} />
      <div className="b-row2">
        <Num label="Injektor" unit="× std" min={0.5} step={0.05} value={b.injector} quick={[[1, 'std'], [1.5, '1,5×'], [2, '2×']]} onChange={(v) => set({ injector: v })} />
        <Num label="Peta ECU" unit="× std" min={0.5} step={0.05} value={b.map} quick={[[1, 'std'], [1.15, '1,15×']]} onChange={(v) => set({ map: v })} />
      </div>
      <div className="b-row2">
        <Num label="Timing (maju +)" unit="°" min={-10} step={1} value={b.timing} quick={[[0, 'std'], [3, '+3']]} onChange={(v) => set({ timing: v })} />
        <Num label="Pembatas putaran" unit="rpm" min={0} step={100} value={b.limiter} quick={[[1800, 'std'], [0, 'mati']]} onChange={(v) => set({ limiter: v })} />
      </div>
      <div className="b-row2">
        <Num label="Radiator" unit="kW panas" min={300} step={100} value={b.radiatorKw ?? (b.bigRadiator ? 2300 : 1450)} quick={[[1450, 'std'], [3000, '3000']]} onChange={(v) => set({ radiatorKw: v })} />
        <Num label="Alternator" unit="kVA" min={500} step={250} value={b.altKva ?? 2250} quick={[[2250, 'std'], [3000, '3000']]} onChange={(v) => set({ altKva: v })} />
      </div>
      <div className="b-row2">
        <Select label="Knalpot" value={b.straight ? 1 : 0} options={[[0, 'Standar'], [1, 'Lurus (straight pipe)']]} onChange={(v) => set({ straight: v === 1 })} />
        <Select label="Komponen dalam" value={b.forged ? 1 : 0} options={[[0, 'Standar'], [1, 'Forged (diperkuat)']]} onChange={(v) => set({ forged: v === 1 })} />
      </div>
      <div className="b-paint">
        <span>Warna mesin</span>
        {PAINTS.map((c) => (
          <button key={c} className={b.paint === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ paint: c })} aria-label={`Warna ${c}`} />
        ))}
      </div>
      <p className="b-note">
        Perkiraan di 1500 rpm gas penuh: <b>{Math.round(spec.power).toLocaleString('id')} kW</b>, EGT {Math.round(spec.egt)} °C, lambda {spec.lambda.toFixed(2)}, asap{' '}
        {Math.round(spec.smoke * 100)}%, tekanan silinder {Math.round(spec.pcp)} bar (batas {Math.round(limitsOf(b).pcpGasket)}). Di genset: ±{Math.round(Math.min(fit.kwe, fit.altPrimeKw)).toLocaleString('id')}{' '}
        kW prime ({fit.kwe > fit.altPrimeKw ? 'dibatasi alternator' : 'dibatasi mesin'}).
      </p>
      <div className="row">
        <button onClick={() => Object.assign(engine.build, { ...STOCK, paint: b.paint })}>Standar</button>
        <button onClick={() => Object.assign(engine.build, { ...STOCK, ...FULL })}>Full modif</button>
        <button onClick={() => Object.assign(engine.build, { ...STOCK, ...MONSTER })}>Monster</button>
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
    // estimated full-throttle curves (this build and stock), recomputed only when the build changes
    const estimate = (b: Build) => {
      const top = Math.min(3500, b.limiter || limitsOf(b).rodFail - 100);
      const out: { rpm: number; kw: number; nm: number }[] = [];
      for (let r = 800; r <= top; r += 50) {
        const x = steady(b, r);
        out.push({ rpm: r, kw: Math.max(0, x.power), nm: (Math.max(0, x.power) * 1000) / ((r * 2 * Math.PI) / 60) });
      }
      return out;
    };
    const stockCurve = estimate(STOCK);
    let key = '';
    let buildCurve = stockCurve;
    const trail: { rpm: number; kw: number }[] = [];
    let lastTrail = 0;
    const draw = (now = 0) => {
      const c = ref.current;
      const g = c?.getContext('2d');
      const k = JSON.stringify(engine.build);
      if (k !== key) {
        key = k;
        buildCurve = estimate(engine.build);
      }
      if (engine.running && engine.dynoMode === 'bebas' && now - lastTrail > 60) {
        lastTrail = now;
        trail.push({ rpm: engine.rpm, kw: engine.power });
        if (trail.length > 160) trail.shift();
      }
      if (c && g) {
        const W = c.width;
        const H = c.height;
        g.fillStyle = '#0b1210';
        g.fillRect(0, 0, W, H);
        // axes grow with the biggest curve shown, so a monster build still fits
        const shown = [buildCurve, engine.pull.points, ...saved.filter((sv) => compare.includes(sv.id)).map((sv) => sv.curve)];
        const all = shown.flat();
        const nice = (v: number, step: number, floor: number) => Math.max(floor, Math.ceil((v * 1.1) / step) * step);
        const kMax = nice(Math.max(0, ...all.map((p) => p.kw)), 1200, 4800);
        const nMax = nice(Math.max(0, ...all.map((p) => p.nm)), 8000, 24000);
        const rMax = nice(Math.max(2300, ...all.map((p) => p.rpm)), 250, 2300);
        const x = (r: number) => 40 + ((W - 90) * (r - 800)) / (rMax - 800);
        const yk = (k: number) => H - 22 - ((H - 34) * k) / kMax;
        const yn = (n: number) => H - 22 - ((H - 34) * n) / nMax;
        g.strokeStyle = '#1f2b26';
        g.fillStyle = '#7f8a85';
        g.font = '10px sans-serif';
        for (let r = 800; r <= rMax; r += rMax > 3000 ? 500 : 250) {
          g.beginPath();
          g.moveTo(x(r), 10);
          g.lineTo(x(r), H - 22);
          g.stroke();
          g.fillText(String(r), x(r) - 12, H - 8);
        }
        for (let k = 0; k <= kMax; k += kMax / 4) g.fillText(`${Math.round(k).toLocaleString('id')} kW`, 2, yk(k) + 3);
        g.textAlign = 'right';
        for (let n = 0; n <= nMax; n += nMax / 3) g.fillText(`${Math.round(n / 1000)}k Nm`, W - 2, yn(n) + 3);
        g.textAlign = 'left';
        // estimates: stock in grey, this build in faint gold
        const thin = (pts: { rpm: number; kw: number; nm: number }[], color: string) => {
          g.strokeStyle = color;
          g.lineWidth = 1.2;
          g.setLineDash([]);
          g.beginPath();
          pts.forEach((p, i) => (i ? g.lineTo(x(p.rpm), yk(p.kw)) : g.moveTo(x(p.rpm), yk(p.kw))));
          g.stroke();
          g.setLineDash([3, 4]);
          g.beginPath();
          pts.forEach((p, i) => (i ? g.lineTo(x(p.rpm), yn(p.nm)) : g.moveTo(x(p.rpm), yn(p.nm))));
          g.stroke();
          g.setLineDash([]);
        };
        thin(stockCurve, 'rgba(160,170,165,0.55)');
        thin(buildCurve, 'rgba(255,210,58,0.45)');
        g.fillStyle = 'rgba(255,255,255,0.55)';
        for (const t of trail) g.fillRect(x(t.rpm) - 1, yk(t.kw) - 1, 2, 2);
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
      <p className="b-note">
        Garis penuh = tenaga (kW), putus-putus = torsi (Nm). Tipis abu-abu = perkiraan mesin standar, tipis kuning = perkiraan build ini, tebal kuning = hasil dyno
        pull terakhir, titik putih = jejak saat digas. Tekan "Dyno pull" untuk hasil uji sebenarnya.
      </p>
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
        {fit.kwe > fit.altPrimeKw * 1.1
          ? `Lebih dari alternator ${Math.round(fit.altPrimeKw / 0.8).toLocaleString('id')} kVA (${Math.round(fit.altPrimeKw).toLocaleString('id')} kW prime): tenaga ekstra tidak terpakai, alternator yang jadi pembatas. Naikkan kVA alternator di atas.`
          : fit.kwe < fit.altPrimeKw
            ? `Alternator sanggup ${Math.round(fit.altPrimeKw).toLocaleString('id')} kW prime, tapi mesin hanya ±${Math.round(fit.kwe).toLocaleString('id')} kWe: mesin yang jadi pembatas.`
            : 'Mesin dan alternator seimbang.'}{' '}
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
  ['belakang', 'Intercooler'],
  ['sel', 'Ruang uji'],
];

export function BengkelApp() {
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
      <BengkelHud />
    </>
  );
}

/** Everything on screen over the workshop; the Traknus World shows this while the player is at the dyno. */
export function BengkelHud() {
  const hideUi = useBengkel((s) => s.hideUi);
  return (
    <>
      <header className="brand" style={hideUi ? { display: 'none' } : undefined}>
        <h1>Bengkel & Dyno</h1>
        <p>Perkins 4016 · modifikasi dan uji tenaga</p>
        {!EMBED.on && (
          <button className="tour-start" onClick={() => useUI.getState().set({ mode: 'single' })}>
            ← Genset tunggal
          </button>
        )}
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
