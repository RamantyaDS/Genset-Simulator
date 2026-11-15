import { useState } from 'react';
import { UPS } from '../sim/genset';
import { sim, useUI } from '../store';

const sec = (v: number) => `${v.toFixed(1).replace('.', ',')} dtk`;

/** Stopwatch of the last mains failure: the AMF sequence second by second and how long the building was dark. */
export function Stopwatch() {
  useUI((s) => s.tick);
  const [open, setOpen] = useState(true);
  const o = sim.outage;
  const has = o.steps.length > 0;
  return (
    <section className="stopwatch" aria-label="Stopwatch PLN padam">
      <div className="sw-head">
        <b>⏱ Stopwatch PLN padam</b>
        <button className="x" onClick={() => setOpen(!open)} aria-label={open ? 'Ciutkan' : 'Buka'}>
          {open ? '–' : '+'}
        </button>
      </div>
      {open && (
        <>
          <label className="chk">
            <input type="checkbox" checked={sim.upsOn} onChange={() => (sim.upsOn = !sim.upsOn)} /> UPS gedung ({UPS.kw} kW, ±
            {Math.round((UPS.kwh / UPS.kw) * 60)} menit) · baterai {Math.round(sim.upsCharge * 100)}%
          </label>
          {!has ? (
            <p className="hint">Klik "PLN padam" untuk mengukur berapa lama gedung gelap sampai genset mengambil beban.</p>
          ) : (
            <>
              <div className="sw-big">
                <div>
                  <span>Gedung (beban biasa) gelap</span>
                  <b className={o.normalBack < 0 ? 'run' : ''}>{sec(o.normalDark)}</b>
                </div>
                <div>
                  <span>Beban kritis (server, lampu darurat)</span>
                  <b className={o.critDark > 0 ? 'bad' : 'ok'}>{sec(o.critDark)}</b>
                </div>
              </div>
              <ol className="sw-steps">
                {o.steps.map((x, i) => (
                  <li key={i}>
                    <em>+{x.t.toFixed(1).replace('.', ',')}</em> {x.label}
                  </li>
                ))}
              </ol>
              <p className="hint">
                {sim.upsOn
                  ? 'Dengan UPS, server dan lampu darurat tidak sempat padam. Matikan UPS lalu ulangi untuk membandingkan.'
                  : 'Tanpa UPS, beban kritis ikut gelap selama genset start. Nyalakan UPS lalu ulangi untuk membandingkan.'}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
