// "Cara kerja genset": guided tour chapters. Each chapter frames the camera, highlights a part and offers things to try.
import type { ReactNode } from 'react';
import { sequence } from './dse';
import { goToView, setInset, type View } from './scene/camera';
import { FUEL_CURVE, RATING, TANK_L, TIMERS, create, setMains } from './sim/genset';
import { sim, useUI } from './store';

export interface Chapter {
  title: string;
  view: View;
  part?: string;
  xray?: boolean;
  explode?: boolean;
  silent?: boolean;
  dse?: boolean; // show the DSE panel beside the tour
  body: () => ReactNode;
}

const Term = ({ children }: { children: ReactNode }) => <b className="term">{children}</b>;

function Try({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="try" onClick={onClick}>
      ▶ {label}
    </button>
  );
}

const resetSim = () => {
  const keep = { events: sim.events };
  Object.assign(sim, create(), keep);
};
const set = (p: Parameters<ReturnType<typeof useUI.getState>['set']>[0]) => useUI.getState().set(p);

export const CHAPTERS: Chapter[] = [
  {
    title: 'Gambaran besar',
    view: { pos: [6.5, 4.2, 8.5], target: [0, 1.3, 0] },
    part: 'all',
    body: () => (
      <>
        <p>
          Genset (<Term>generator set</Term>) itu pada dasarnya dua mesin yang disambung jadi satu: <b>mesin diesel</b> yang memutar poros, dan{' '}
          <b>alternator</b> yang mengubah putaran itu menjadi listrik.
        </p>
        <p>Unit ini terdiri dari empat bagian besar, dari kiri ke kanan:</p>
        <ol>
          <li>
            <b>Radiator</b> dengan kipas besar, untuk membuang panas mesin
          </li>
          <li>
            <b>Mesin Perkins 4016</b>, 16 silinder, 61 liter
          </li>
          <li>
            <b>Alternator Stamford</b>, penghasil listriknya
          </li>
          <li>
            <b>Panel kontrol DSE7320</b>, otaknya
          </li>
        </ol>
        <p>
          Semuanya duduk di atas <Term>base frame</Term> (rangka baja) dengan karet peredam getaran. Panjang 5,9 m, berat sekitar 15 ton.
        </p>
        <p>
          Dayanya <b>2250 kVA</b>, cukup untuk gedung perkantoran besar, rumah sakit, atau sekitar 1.700 rumah berdaya 1.300 VA sekaligus.
        </p>
      </>
    ),
  },
  {
    title: 'Mesin diesel 16 silinder',
    view: { pos: [-0.6, 4.4, 3.6], target: [-0.5, 1.6, 0] },
    part: 'engine',
    body: () => (
      <>
        <p>
          Mesin Perkins 4016-61TRG3 punya 16 silinder yang tersusun dalam dua baris membentuk huruf V (<Term>V16, sudut 60°</Term>). Total isi silindernya
          61 liter, kira-kira 40 kali mesin mobil 1.500 cc.
        </p>
        <p>
          Tiap silinder bekerja dalam <Term>4 langkah</Term>:
        </p>
        <ol>
          <li>
            <b>Hisap</b>: udara masuk.
          </li>
          <li>
            <b>Kompresi</b>: udara dimampatkan sampai panas sekali (rasio 13,6 : 1).
          </li>
          <li>
            <b>Usaha</b>: solar disemprotkan ke udara panas itu dan langsung terbakar sendiri, tanpa busi. Ledakannya mendorong piston.
          </li>
          <li>
            <b>Buang</b>: gas sisa pembakaran dikeluarkan.
          </li>
        </ol>
        <p>
          Mesin genset selalu berputar di <b>1500 rpm</b>, tidak naik turun seperti mesin mobil. Alasannya dijelaskan di bab alternator.
        </p>
        <Try
          label="Nyalakan dan lihat aliran X-ray"
          onClick={() => {
            set({ xray: true });
            if (!sim.firing) sequence(sim, ['manual', 'start']);
          }}
        />
      </>
    ),
  },
  {
    title: 'Turbo dan udara',
    view: { pos: [3.4, 3.8, 3.2], target: [0.9, 2.1, 0] },
    part: 'air',
    xray: true,
    body: () => (
      <>
        <p>
          Makin banyak udara yang masuk, makin banyak solar yang bisa dibakar, dan makin besar tenaganya. Karena itu mesin ini punya <b>4 turbocharger</b>.
        </p>
        <p>
          <Term>Turbo</Term> adalah kipas kembar pada satu poros. Gas buang yang panas memutar kipas pertama, dan kipas kedua ikut berputar untuk memompa udara
          segar ke mesin. Jadi tenaga gas buang yang biasanya terbuang dimanfaatkan lagi.
        </p>
        <p>
          Udara yang dipompa turbo jadi panas, padahal udara panas itu renggang. Sebelum masuk silinder, udara didinginkan dulu di <Term>charge air cooler</Term>{' '}
          (pendingin udara) yang memakai air. Udara dingin lebih padat, jadi oksigennya lebih banyak.
        </p>
        <p>
          Di X-ray: <span style={{ color: '#9be7ff' }}>biru muda</span> adalah udara masuk dari 4 filter hitam di atas, dan{' '}
          <span style={{ color: '#ff5a4a' }}>merah</span> adalah gas buang menuju knalpot. Coba naikkan beban, alirannya ikut makin cepat.
        </p>
        <Try
          label="Beri beban 1500 kW"
          onClick={() => {
            if (!sim.firing) sequence(sim, ['test', 'start']);
            else sequence(sim, ['test']);
            sim.demandKw = 1500;
          }}
        />
      </>
    ),
  },
  {
    title: 'Sistem pendingin',
    view: { pos: [-6, 2.6, 3.2], target: [-2.4, 1.4, 0] },
    part: 'radiator',
    xray: true,
    body: () => (
      <>
        <p>
          Hanya sekitar 40% energi solar yang menjadi putaran. Sisanya menjadi panas: sebagian keluar lewat knalpot, sebagian lagi harus dibuang lewat{' '}
          <b>air pendingin</b>.
        </p>
        <p>
          <Term>Pompa air</Term> di depan mesin mengalirkan sekitar 260 liter air pendingin mengelilingi silinder, lalu ke <b>radiator</b>. Kipas besar yang
          diputar sabuk meniupkan udara menembus sirip radiator. Radiator ini punya dua bagian: satu untuk air mesin, satu lagi untuk pendingin udara turbo.
        </p>
        <p>
          <Term>Thermostat</Term> menjaga suhu di 80–90 °C. Saat siaga, pemanas air menjaga mesin tetap hangat sekitar 45 °C supaya mesin siap menerima beban
          begitu menyala.
        </p>
        <p>
          Kalau radiator tersumbat debu, suhu naik. Panel memberi peringatan di 90 °C dan mematikan mesin di 96 °C.
        </p>
        <Try
          label="Simulasikan radiator tersumbat (waktu 30×)"
          onClick={() => {
            if (!sim.firing) sequence(sim, ['test', 'start']);
            sim.faultRadiator = true;
            set({ speed: 30 });
          }}
        />
      </>
    ),
  },
  {
    title: 'Alternator',
    view: { pos: [4.6, 2.6, 3.4], target: [1.7, 1.3, 0] },
    part: 'alternator',
    body: () => (
      <>
        <p>
          Prinsipnya sama dengan dinamo sepeda: <b>magnet yang berputar di dalam kumparan kawat menghasilkan listrik</b>. Bedanya, magnet di alternator ini
          adalah elektromagnet seberat 1,7 ton, dan kumparannya tembaga seberat 2 ton.
        </p>
        <p>
          Magnetnya punya <Term>4 kutub</Term>. Rumus frekuensinya: <code>f = rpm × kutub ÷ 120</code>, jadi <code>1500 × 4 ÷ 120 = 50 Hz</code>, sama
          dengan listrik PLN. Itulah sebabnya putaran mesin harus dijaga tetap 1500 rpm. Kalau putaran turun, frekuensi ikut turun.
        </p>
        <p>
          <Term>AVR</Term> (automatic voltage regulator) mengatur kekuatan magnet supaya tegangan tetap 400 V antarfasa (231 V fasa ke netral), berapa pun
          bebannya. Arusnya sangat besar: sekitar 3.250 ampere per fasa pada beban penuh.
        </p>
        <p>Efisiensinya sekitar 96%, jadi hampir semua putaran menjadi listrik.</p>
      </>
    ),
  },
  {
    title: 'Bahan bakar',
    view: { pos: [0.6, 1.9, 3.4], target: [-0.6, 1.1, 0.4] },
    part: 'fuel',
    xray: true,
    body: () => (
      <>
        <p>
          Solar dari tangki disaring di <b>3 filter putih</b> di samping mesin, lalu dipompa ke <Term>injektor</Term> di tiap silinder. Panel mengatur
          banyaknya solar lewat <Term>governor elektronik</Term>: makin berat beban, makin banyak solar yang disemprotkan supaya putaran tetap 1500 rpm.
        </p>
        <p>Konsumsi solar menurut datasheet Perkins:</p>
        <table className="tbl">
          <tbody>
            {FUEL_CURVE.filter(([x]) => x > 0).map(([x, l]) => (
              <tr key={x}>
                <td>{Math.round(x * 100)}% beban</td>
                <td>{Math.round(x * RATING.primeKw)} kW</td>
                <td>{l} L/jam</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Dengan tangki harian {TANK_L.toLocaleString('id')} liter, genset bisa jalan sekitar 5,8 jam di beban 75%. Panel memberi peringatan saat solar tinggal
          10%.
        </p>
      </>
    ),
  },
  {
    title: 'Panel kontrol DSE7320',
    view: { pos: [3.6, 2.1, 2.6], target: [2.72, 1.75, 0.62] },
    part: 'panel',
    dse: true,
    body: () => (
      <>
        <p>
          <b>DSE7320 MKII</b> buatan Deep Sea Electronics adalah otak genset. Panel ini mengawasi listrik PLN, menyalakan dan mematikan mesin, memindahkan beban,
          dan melindungi mesin dari kerusakan.
        </p>
        <p>Baris tombol bawah, dari kiri ke kanan:</p>
        <ul>
          <li>
            <b>O merah, Stop/Reset</b>: matikan, dan hapus alarm.
          </li>
          <li>
            <b>Tangan, Manual</b>: dikendalikan operator.
          </li>
          <li>
            <b>Menara, Test</b>: nyalakan dan langsung ambil beban.
          </li>
          <li>
            <b>AUTO</b>: siaga otomatis. Ini mode normal sehari-hari.
          </li>
          <li>
            <b>Bel dicoret</b>: matikan buzzer alarm dan tes semua lampu.
          </li>
          <li>
            <b>I hijau, Start</b>.
          </li>
        </ul>
        <p>
          Di tengah ada <Term>diagram mimic</Term>: garis dari PLN, ke gedung, ke genset. Empat LED-nya menunjukkan PLN ada, breaker PLN tertutup, breaker genset
          tertutup, dan genset siap.
        </p>
        <p>Tombol ◀ ▶ di kiri atas mengganti halaman layar: Status, Engine, Generator, Mains, Alarms.</p>
      </>
    ),
  },
  {
    title: 'Menyalakan secara manual',
    view: { pos: [5.4, 3.0, 5.6], target: [0.9, 1.5, 0.3] },
    part: 'all',
    dse: true,
    body: () => (
      <>
        <p>Urutan yang terjadi saat operator menekan tombol:</p>
        <ol>
          <li>
            Tekan <b>Manual</b>, lalu <b>Start (I)</b>.
          </li>
          <li>
            Panel membuka katup solar dan menghidupkan <Term>motor starter</Term> (2 motor, 24 V). Mesin diputar sekitar 150 rpm. Tegangan aki turun sampai sekitar
            19 V, sampai layar panel ikut meredup.
          </li>
          <li>
            Mesin terbakar, putaran naik. Di 600 rpm starter dilepas otomatis (<Term>crank disconnect</Term>). Kalau tidak hidup dalam {TIMERS.crank} detik, starter
            istirahat {TIMERS.crankRest} detik lalu mencoba lagi, maksimal {TIMERS.attempts} kali.
          </li>
          <li>
            {TIMERS.safety} detik pertama adalah <Term>safety delay</Term>: tekanan oli dan suhu belum diperiksa karena angkanya memang belum stabil.
          </li>
          <li>
            Tegangan 400 V dan 50 Hz tercapai, layar menampilkan <b>Generator Available</b>.
          </li>
        </ol>
        <p>Di mode Manual, beban baru pindah ke genset kalau operator menekan tombol transfer (ikon ~).</p>
        <Try
          label="Nyalakan (Manual → Start)"
          onClick={() => {
            resetSim();
            sequence(sim, ['manual', 'start']);
          }}
        />
        <Try label="Matikan (Stop)" onClick={() => sequence(sim, ['stop'])} />
      </>
    ),
  },
  {
    title: 'Saat PLN padam',
    view: { pos: [15, 9, 14], target: [2.5, 1.8, -5] },
    dse: true,
    body: () => (
      <>
        <p>
          Di mode <b>AUTO</b> semuanya berjalan sendiri. Ini disebut <Term>AMF</Term> (auto mains failure). Timer yang dipakai adalah setelan pabrik DSE:
        </p>
        <ol className="timeline">
          <li>
            <b>0 s</b>: PLN padam, lampu gedung mati.
          </li>
          <li>
            <b>{TIMERS.mainsTransient} s</b>: memastikan bukan kedip sesaat (<Term>mains transient delay</Term>). Breaker PLN dibuka.
          </li>
          <li>
            <b>+{TIMERS.startDelay} s</b>: <Term>start delay</Term>, lalu starter bekerja.
          </li>
          <li>
            Mesin hidup, lalu {TIMERS.safety} detik <Term>safety delay</Term>.
          </li>
          <li>
            Genset siap, breaker genset ditutup ({TIMERS.transfer} detik setelah breaker PLN terbuka). Lampu gedung menyala lagi. Totalnya sekitar 20–25 detik.
          </li>
          <li>
            PLN kembali: tunggu {TIMERS.returnDelay} detik (<Term>return delay</Term>) supaya PLN benar-benar stabil, lalu beban pindah ke PLN.
          </li>
          <li>
            Mesin jalan tanpa beban {TIMERS.cooling} detik (<Term>cooling</Term>) supaya turbo dingin, baru mati.
          </li>
        </ol>
        <p>
          Breaker PLN dan breaker genset tidak pernah tertutup bersamaan. Kalau keduanya tertutup, listrik genset bisa mengalir balik ke jaringan PLN dan
          membahayakan petugas.
        </p>
        <Try
          label="PLN padam"
          onClick={() => {
            if (sim.mode !== 'auto') sequence(sim, ['auto']);
            setMains(sim, false);
          }}
        />
        <Try label="PLN kembali" onClick={() => setMains(sim, true)} />
      </>
    ),
  },
  {
    title: 'Beban dan kapasitas',
    view: { pos: [6.5, 4.2, 8.5], target: [0, 1.3, 0] },
    part: 'all',
    body: () => (
      <>
        <p>
          <Term>kVA</Term> adalah daya semu, <Term>kW</Term> adalah daya nyata. Selisihnya karena <Term>power factor</Term> (0,8): motor dan AC menarik arus yang
          tidak semuanya menjadi kerja. Jadi 2250 kVA × 0,8 = 1800 kW.
        </p>
        <ul>
          <li>
            <b>Prime 1800 kW</b>: boleh dipakai terus dengan beban naik turun. Boleh overload 10% sebentar.
          </li>
          <li>
            <b>Standby 2000 kW</b>: hanya untuk keadaan darurat, jamnya dibatasi.
          </li>
          <li>
            <b>Base 1440 kW</b>: beban konstan 24 jam tanpa henti.
          </li>
        </ul>
        <p>
          Saat beban naik mendadak, mesin "kaget": putaran dan frekuensi turun sesaat, lalu governor menambah solar dan putaran kembali dalam beberapa detik. Knalpot
          sempat mengepulkan asap gelap. Lihat angka Hz di atas.
        </p>
        <Try
          label="Beban 900 kW"
          onClick={() => {
            if (!sim.firing) sequence(sim, ['test', 'start']);
            sim.demandKw = 900;
          }}
        />
        <Try label="Lompat ke 1800 kW" onClick={() => (sim.demandKw = 1800)} />
        <Try label="Overload 2100 kW" onClick={() => (sim.demandKw = 2100)} />
      </>
    ),
  },
  {
    title: 'Proteksi dan alarm',
    view: { pos: [3.6, 2.1, 2.6], target: [2.72, 1.75, 0.62] },
    part: 'panel',
    dse: true,
    body: () => (
      <>
        <p>Panel terus mengawasi mesin. Ada tiga jenis alarm:</p>
        <ul>
          <li>
            <b>Warning</b>: peringatan saja, mesin tetap jalan (misalnya suhu 90 °C, tekanan oli 1,24 bar, solar tinggal 10%).
          </li>
          <li>
            <b>Electrical trip</b>: breaker genset dibuka, mesin didinginkan dulu, lalu mati (misalnya overload).
          </li>
          <li>
            <b>Shutdown</b>: mesin langsung mati (oli di bawah 1,03 bar, suhu 96 °C, gagal start, emergency stop).
          </li>
        </ul>
        <p>Alarm membunyikan buzzer, menyalakan LED merah, dan layar pindah ke halaman Alarms. Tekan Stop/Reset setelah penyebabnya diperbaiki.</p>
        <Try
          label="Oli bocor"
          onClick={() => {
            if (!sim.firing) sequence(sim, ['manual', 'start']);
            setTimeout(() => (sim.faultOil = true), 15000);
          }}
        />
        <Try
          label="Perbaiki dan reset"
          onClick={() => {
            sim.faultOil = false;
            sim.faultRadiator = false;
            sequence(sim, ['stop', 'stop', 'auto']);
          }}
        />
      </>
    ),
  },
  {
    title: 'Open type vs silent type',
    view: { pos: [11, 6, 12], target: [0, 1.5, 0] },
    silent: true,
    body: () => (
      <>
        <p>
          <b>Open type</b> adalah genset terbuka seperti di bab sebelumnya. Unit ini dipasang di dalam ruang genset khusus yang berventilasi dan berperedam.
        </p>
        <p>
          <b>Silent type</b> dimasukkan ke <Term>kanopi</Term> seukuran kontainer 40 kaki (12,2 × 2,4 × 2,9 m). Dinding kanopi dilapisi peredam suara, udara
          panas dari radiator dibuang lewat kisi-kisi di ujung, dan gas buang melewati <Term>silencer</Term> besar di atap. Hasilnya jauh lebih senyap dan bisa
          dipasang di luar ruangan.
        </p>
        <p>Coba dengarkan: suara mesin di mode silent lebih redam. Nyalakan X-ray untuk melihat ke dalam kanopi.</p>
        <Try
          label="Nyalakan genset"
          onClick={() => {
            if (!sim.firing) sequence(sim, ['test', 'start']);
          }}
        />
        <Try label="X-ray kanopi" onClick={() => set({ xray: !useUI.getState().xray })} />
      </>
    ),
  },
  {
    title: 'Tes rutin dan perawatan',
    view: { pos: [6.5, 4, 9], target: [1.2, 1.2, 1.8] },
    part: 'all',
    dse: true,
    body: () => (
      <>
        <p>Genset yang jarang dipakai justru harus rutin dites, supaya benar-benar mau hidup saat dibutuhkan.</p>
        <ul>
          <li>
            <b>Mingguan, tanpa beban</b>: Manual → Start, jalan 10–15 menit. Gedung tetap memakai PLN. Tujuannya memastikan mesin mau hidup dan oli bersirkulasi.
          </li>
          <li>
            <b>Bulanan, dengan beban</b>: memakai <Term>load bank</Term>, kotak berisi elemen pemanas raksasa yang "memakan" listrik genset dan membuangnya
            sebagai panas. Genset diuji di beban nyata tanpa mengganggu gedung. Menjalankan genset diesel terlalu lama tanpa beban juga kurang baik
            (<Term>wet stacking</Term>: solar tidak terbakar sempurna).
          </li>
          <li>
            <b>Tes transfer</b>: mode Test memindahkan beban gedung ke genset walaupun PLN normal, untuk menguji breaker dan ATS.
          </li>
        </ul>
        <p>Selain itu ada perawatan berkala: ganti oli dan filter, cek aki dan air pendingin, bersihkan radiator.</p>
        <Try
          label="Tes mingguan"
          onClick={() => {
            resetSim();
            sequence(sim, ['manual', 'start']);
          }}
        />
        <Try
          label="Tes load bank 1350 kW"
          onClick={() => {
            if (!sim.firing) sequence(sim, ['manual', 'start']);
            sim.loadBankKw = 1350;
            const on = () => (sim.firing && sim.sinceStart > TIMERS.safety + 2 ? (sim.loadBankOn = true) : setTimeout(on, 500));
            on();
          }}
        />
      </>
    ),
  },
];

let saved: { view: 'open' | 'silent'; xray: boolean; explode: boolean; panelOpen: boolean } | null = null;

const fitInset = (dse: boolean) => (innerWidth > 900 ? setInset(432, dse ? 472 : 0, 0) : setInset(0, 0, innerHeight * 0.5));

export function openChapter(i: number) {
  const c = CHAPTERS[i];
  const narrow = innerWidth <= 900;
  set({ tour: i, view: c.silent ? 'silent' : 'open', xray: !!c.xray, explode: !!c.explode, panelOpen: !!c.dse && !narrow });
  fitInset(!!c.dse && !narrow);
  setTimeout(() => goToView(c.view), 30);
}

export function startTour() {
  const s = useUI.getState();
  saved = { view: s.view, xray: s.xray, explode: s.explode, panelOpen: s.panelOpen };
  resetSim();
  set({ speed: 1 });
  openChapter(0);
}

export function endTour() {
  set({ tour: null, speed: 1, ...(saved ?? {}) });
  saved = null;
}
