// Test instruments: the ISO 8528 load-acceptance recorder and a three-phase oscilloscope.
import { useEffect, useRef } from 'react';
import { amps, genAvailable, hz, ISO_LIMITS, ISO_STEP_S, RATING, startIsoTest, stopIsoTest } from '../sim/genset';
import { sim, useUI } from '../store';

const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`;
const sec = (v: number) => `${v.toFixed(1).replace('.', ',')} dtk`;

/** Recorder chart: frequency (orange) and voltage (blue) against time, load steps in grey. */
function Recorder() {
  const ref = useRef<HTMLCanvasElement>(null);
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
        const rec = sim.iso.rec;
        const T = Math.max(20, sim.iso.plan.length * ISO_STEP_S, rec.length ? rec[rec.length - 1].t : 0);
        const x = (t: number) => 40 + ((W - 80) * t) / T;
        const yF = (f: number) => 10 + ((51 - f) / (51 - 43)) * (H - 30);
        const yV = (v: number) => 10 + ((420 - v) / (420 - 300)) * (H - 30);
        const yK = (k: number) => H - 20 - (k / 2000) * (H - 30);
        // grid and limit bands
        g.strokeStyle = '#1f2b26';
        g.lineWidth = 1;
        for (let f = 43; f <= 51; f++) {
          g.beginPath();
          g.moveTo(40, yF(f));
          g.lineTo(W - 40, yF(f));
          g.stroke();
        }
        g.fillStyle = 'rgba(255,154,46,0.08)';
        g.fillRect(40, yF(50.5), W - 80, yF(49.5) - yF(50.5));
        g.fillStyle = '#8a958f';
        g.font = '11px sans-serif';
        g.textAlign = 'right';
        for (const f of [44, 46, 48, 50]) g.fillText(`${f} Hz`, 36, yF(f) + 4);
        g.textAlign = 'left';
        for (const v of [320, 360, 400]) g.fillText(`${v} V`, W - 36, yV(v) + 4);
        const line = (pts: [number, number][], color: string, w = 1.6) => {
          g.strokeStyle = color;
          g.lineWidth = w;
          g.beginPath();
          pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
          g.stroke();
        };
        const step = Math.max(1, Math.floor(rec.length / 1500));
        const pts = rec.filter((_, i) => i % step === 0);
        line(pts.map((r) => [x(r.t), yK(r.kw)]), '#5b6660', 1.2);
        line(pts.map((r) => [x(r.t), yV(r.v)]), '#5fb4ff');
        line(pts.map((r) => [x(r.t), yF(r.hz)]), '#ff9a2e', 2);
        g.fillStyle = '#ff9a2e';
        g.fillText('Frekuensi', 46, 20);
        g.fillStyle = '#5fb4ff';
        g.fillText('Tegangan', 116, 20);
        g.fillStyle = '#8a958f';
        g.fillText('Beban (kW)', 180, 20);
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={ref} width={640} height={200} className="rec" aria-label="Rekaman frekuensi dan tegangan" />;
}

export function IsoPanel({ onClose }: { onClose: () => void }) {
  useUI((s) => s.tick);
  const iso = sim.iso;
  const ready = genAvailable(sim) && !sim.gcb;
  return (
    <section className="instrument iso" aria-label="Uji ISO 8528">
      <div className="lb-head">
        <b>📊 Uji penerimaan beban (ISO 8528-5)</b>
        <span>{iso.active ? `tahap ${iso.step}/${iso.plan.length - 1} · ${Math.round(sim.loadBankKw)} kW` : ''}</span>
        <button className="x" onClick={onClose} aria-label="Tutup uji ISO">
          ×
        </button>
      </div>
      <div className="row">
        <button disabled={!ready || iso.active} onClick={() => startIsoTest(sim, false)}>
          Bertahap 25 → 50 → 75 → 100%
        </button>
        <button disabled={!ready || iso.active} onClick={() => startIsoTest(sim, true)}>
          Langsung 0 → 100%
        </button>
        {iso.active && <button onClick={() => stopIsoTest(sim)}>Hentikan</button>}
      </div>
      {!ready && !iso.active && <p className="hint">Nyalakan genset tanpa beban dulu (tombol "Nyalakan tanpa beban"), tunggu sampai siap, lalu mulai uji. Beban diberikan lewat load bank.</p>}
      <Recorder />
      {iso.results.length > 0 && (
        <table className="iso-table">
          <thead>
            <tr>
              <th>Langkah beban</th>
              <th>Dip frekuensi</th>
              <th>Pulih (±1%)</th>
              <th>Dip tegangan</th>
              <th>Pulih (±3%)</th>
              <th>Kelas</th>
            </tr>
          </thead>
          <tbody>
            {iso.results.map((r, i) => (
              <tr key={i}>
                <td>
                  {Math.round(r.fromKw)} → {Math.round(r.toKw)} kW ({Math.round(((r.toKw - r.fromKw) / RATING.primeKw) * 100)}%)
                </td>
                <td>{pct(r.fDip)}</td>
                <td>{sec(r.fRec)}</td>
                <td>{pct(r.vDip)}</td>
                <td>{sec(r.vRec)}</td>
                <td className={r.cls === 'G3' ? 'ok' : r.cls === '-' ? 'bad' : 'warn'}>{r.cls === '-' ? 'Tidak lulus' : r.cls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">
        Batas tipikal ISO 8528-5 untuk beban naik: G3 dip frekuensi ≤{ISO_LIMITS.G3.f}% pulih ≤{ISO_LIMITS.G3.tf} dtk, tegangan ≤{ISO_LIMITS.G3.v}% pulih ≤
        {ISO_LIMITS.G3.tv} dtk; G2 ≤{ISO_LIMITS.G2.f}%/{ISO_LIMITS.G2.tf} dtk, ≤{ISO_LIMITS.G2.v}%/{ISO_LIMITS.G2.tv} dtk. Mesin turbo besar menerima beban paling
        baik secara bertahap: turbo butuh waktu untuk berputar cepat (turbo lag).
      </p>
    </section>
  );
}

/** Three-phase oscilloscope: two cycles of R, S, T voltage and phase R current, triggered so the trace stands still;
 *  amplitude and period follow the set, so a load step shows the wave shrinking and stretching. */
export function Scope({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let id = 0;
    const draw = () => {
      const c = ref.current;
      const g = c?.getContext('2d');
      if (c && g) {
        const W = c.width;
        const H = c.height;
        g.fillStyle = '#071009';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = '#163020';
        g.lineWidth = 1;
        for (let i = 1; i < 10; i++) {
          g.beginPath();
          g.moveTo((W * i) / 10, 0);
          g.lineTo((W * i) / 10, H);
          g.stroke();
        }
        for (let i = 1; i < 8; i++) {
          g.beginPath();
          g.moveTo(0, (H * i) / 8);
          g.lineTo(W, (H * i) / 8);
          g.stroke();
        }
        const f = hz(sim);
        const vPk = (sim.volts / Math.sqrt(3)) * Math.SQRT2; // phase-to-neutral peak
        const iPk = amps(sim) * Math.SQRT2;
        const span = 0.04; // 40 ms on screen = two cycles at 50 Hz
        const yv = (v: number) => H / 2 - (v / 400) * (H / 2 - 8);
        const yi = (i: number) => H / 2 - (i / 6000) * (H / 2 - 8);
        const wave = (color: string, fn: (t: number) => number, y: (v: number) => number, w = 1.8) => {
          g.strokeStyle = color;
          g.lineWidth = w;
          g.beginPath();
          for (let k = 0; k <= W; k += 2) {
            const t = (k / W) * span;
            const p = y(fn(t));
            k ? g.lineTo(k, p) : g.moveTo(k, p);
          }
          g.stroke();
        };
        const ph = (shift: number) => (t: number) => vPk * Math.sin(2 * Math.PI * f * t + shift);
        if (f > 1) {
          wave('#ff5a4a', ph(0), yv);
          wave('#ffd23a', ph((-2 * Math.PI) / 3), yv);
          wave('#5fb4ff', ph((2 * Math.PI) / 3), yv);
          // current lags the voltage by the power factor angle (0.8 → 37°)
          if (iPk > 1) wave('#7fe08a', (t) => iPk * Math.sin(2 * Math.PI * f * t - Math.acos(RATING.pf)), yi, 1.2);
        } else {
          g.strokeStyle = '#3a5a44';
          g.beginPath();
          g.moveTo(0, H / 2);
          g.lineTo(W, H / 2);
          g.stroke();
        }
        g.fillStyle = '#9ad0a8';
        g.font = '11px monospace';
        g.fillText(`${f.toFixed(2)} Hz  ${Math.round(sim.volts)} V L-L  ${Math.round(amps(sim))} A`, 8, 14);
        g.fillText('4 ms/div', W - 64, H - 6);
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <section className="instrument scope" aria-label="Osiloskop 3 fasa">
      <div className="lb-head">
        <b>📈 Osiloskop 3 fasa</b>
        <span>
          <i style={{ color: '#ff5a4a' }}>R</i> <i style={{ color: '#ffd23a' }}>S</i> <i style={{ color: '#5fb4ff' }}>T</i> <i style={{ color: '#7fe08a' }}>arus R</i>
        </span>
        <button className="x" onClick={onClose} aria-label="Tutup osiloskop">
          ×
        </button>
      </div>
      <canvas ref={ref} width={420} height={150} />
    </section>
  );
}
