import { sim, useUI } from '../store';

/** Simulated time as a day and clock, counted from Monday 08:00. */
export function clockOf(t: number) {
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const m = Math.floor(t / 60) + 8 * 60;
  const d = Math.floor(m / 1440);
  const hm = m % 1440;
  return `${days[d % 7]} ${String(Math.floor(hm / 60)).padStart(2, '0')}:${String(hm % 60).padStart(2, '0')}`;
}

const dur = (s: number) => (s < 120 ? `${Math.round(s)} dtk` : `${Math.round(s / 60)} mnt`);

/** Engine logbook: every run from first fire to stop, with the readings a technician writes down. */
export function Logbook({ onClose }: { onClose: () => void }) {
  useUI((s) => s.tick);
  const runs = [...sim.runs].reverse();
  return (
    <div className="logbook" role="dialog" aria-label="Logbook genset">
      <div className="lb-head">
        <b>📒 Logbook genset</b>
        <span>{clockOf(sim.t)}</span>
        <button className="x" onClick={onClose} aria-label="Tutup logbook">
          ×
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="hint">Belum ada catatan. Setiap kali genset menyala (PLN padam, tes, atau uji mingguan) tercatat di sini.</p>
      ) : (
        <div className="lb-scroll">
          <table>
            <thead>
              <tr>
                <th>Mulai</th>
                <th>Lama</th>
                <th>Keperluan</th>
                <th>kWh</th>
                <th>Solar</th>
                <th>Air pend. maks</th>
                <th>Oli min</th>
                <th>Aki saat starter</th>
                <th>Starter</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={i}>
                  <td>{clockOf(r.start)}</td>
                  <td>{r.end < 0 ? 'jalan…' : dur(r.end - r.start)}</td>
                  <td>{r.why}</td>
                  <td>{Math.round(r.kwh)}</td>
                  <td>{r.litres.toFixed(1)} L</td>
                  <td>{Math.round(r.maxCoolant)} °C</td>
                  <td>{r.minOil < 90 ? `${r.minOil.toFixed(1)} bar` : '–'}</td>
                  <td className={r.crankV && r.crankV < 18 ? 'bad' : ''}>{r.crankV ? `${r.crankV.toFixed(1)} V` : '–'}</td>
                  <td className={r.crankSec > 4 ? 'warn' : ''}>{r.crankSec.toFixed(1)} dtk</td>
                  <td className={r.alarms.length ? 'bad' : 'ok'}>{r.alarms.length ? r.alarms.join(', ') : 'Normal'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        Yang diperiksa teknisi: tegangan aki saat starter (di bawah ±18 V tanda aki melemah), lama starter (lebih dari 4 detik: mesin dingin atau aki lemah), tekanan oli
        saat jalan, dan suhu air pendingin.
      </p>
    </div>
  );
}
