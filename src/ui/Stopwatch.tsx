import { useState } from 'react';
import { UPS } from '../sim/genset';
import { sim, useUI } from '../store';

const sec = (v: number) => `${v.toFixed(1).replace('.', ',')} dtk`;

/** Stopwatch of the last mains failure: the AMF sequence second by second and how long the building was dark. */
export function Stopwatch({ compact = false }: { compact?: boolean }) {
  useUI((s) => s.tick);
  const [open, setOpen] = useState(!compact);
  const o = sim.outage;
  const has = o.steps.length > 0;
  if (compact && !has) return null; // on a phone it only appears once there is something to time
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
              {o.blink > 0 && (
                <p className="sw-blink">
                  Kedip saat balik ke PLN: <b>{sec(o.blink)}</b>
                  <span>
                    Ini <i>open transition</i>: breaker genset dibuka dulu, baru breaker PLN masuk, jadi gedung padam sesaat. Supaya tanpa kedip dibutuhkan{' '}
                    <i>closed transition</i>: genset disinkronkan dulu dengan PLN lalu paralel sebentar (kurang dari 100 ms) sebelum genset dilepas. Itu butuh ATS
                    closed transition atau pengendali sinkron seperti DSE8610, serta izin paralel dari PLN. DSE7320 hanya open transition.
                  </span>
                </p>
              )}
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
