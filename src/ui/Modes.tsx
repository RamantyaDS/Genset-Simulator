// Cards for the two special views: the thermal camera's temperature scale and the bullet-time cylinder explanation.
import { goTo } from '../scene/camera';
import { cyl, STROKES } from '../scene/Cylinder';
import { partTemp, T_MAX, T_MIN } from '../scene/Thermal';
import { useUI } from '../store';

export function ThermalCard() {
  useUI((s) => s.tick);
  const spots: [string, string][] = [
    ['Turbo & pipa buang', 'turbo'],
    ['Kepala silinder', 'head'],
    ['Blok mesin', 'block'],
    ['Radiator', 'radiator'],
    ['Alternator', 'stator'],
    ['Rangka', 'base'],
  ];
  return (
    <section className="mode-card thermal-card" aria-label="Skala kamera termal">
      <div className="lb-head">
        <b>🌡 Kamera termal</b>
        <button className="x" onClick={() => useUI.getState().set({ thermal: false })} aria-label="Matikan kamera termal">
          ×
        </button>
      </div>
      <div className="scale">
        <i />
        <span>{T_MIN} °C</span>
        <span>140</span>
        <span>{T_MAX} °C</span>
      </div>
      <ul>
        {spots.map(([l, p]) => (
          <li key={p}>
            <span>{l}</span>
            <b>{Math.round(partTemp(p))} °C</b>
          </li>
        ))}
      </ul>
      <p className="hint">Seperti inspeksi termografi: bagian yang jauh lebih panas dari biasanya (sambungan kabel longgar, radiator tersumbat) langsung kelihatan.</p>
    </section>
  );
}

export function CylinderCard() {
  const speed = useUI((s) => s.cylSpeed);
  useUI((s) => s.tick);
  const st = STROKES[cyl.stroke];
  return (
    <section className="mode-card cyl-card" aria-label="Satu silinder gerak lambat">
      <div className="lb-head">
        <b>🔬 Satu silinder · gerak lambat</b>
        <button
          className="x"
          onClick={() => {
            useUI.getState().set({ cylinder: false });
            goTo('genset');
          }}
          aria-label="Tutup"
        >
          ×
        </button>
      </div>
      <div className="strokes">
        {STROKES.map((s, i) => (
          <span key={s.name} className={i === cyl.stroke ? 'on' : ''}>
            {s.name}
          </span>
        ))}
      </div>
      <p className="st-desc">{st.desc}</p>
      <label className="slider">
        <span>
          <span>Kecepatan</span>
          <b>{speed} dtk per siklus</b>
        </span>
        <input type="range" min={3} max={20} step={1} value={speed} onChange={(e) => useUI.getState().set({ cylSpeed: +e.target.value })} />
      </label>
      <p className="hint">
        Mesin aslinya berputar 1500 rpm: satu siklus 4 langkah hanya 0,08 detik, dan 16 silinder bergantian sehingga ada 200 ledakan per detik. Poros engkol berputar
        dua kali untuk setiap siklus.
      </p>
    </section>
  );
}
