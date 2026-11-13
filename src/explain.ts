// Plain-language narration of what the genset and controller are doing right now.
import { ALARMS, RATING, TIMERS, fuelRate, genAvailable, hz, loadFrac, type State } from './sim/genset';

export function explain(s: State): string {
  const alarm = s.alarms.find((a) => ALARMS[a].kind !== 'warning');
  if (alarm === 'estop') return 'Tombol emergency stop ditekan. Mesin langsung mati dan tidak bisa dinyalakan sebelum tombolnya dilepas lalu panel di-reset (tekan Stop/Reset).';
  if (alarm === 'failStart') return `Mesin gagal hidup setelah ${TIMERS.attempts} kali mencoba starter. Biasanya karena solar habis, udara masuk ke saluran solar, atau aki lemah. Perbaiki penyebabnya, lalu tekan Stop/Reset.`;
  if (alarm === 'fuelEmpty') return 'Solar habis, mesin mati sendiri. Isi solar, lalu tekan Stop/Reset untuk menghapus alarm.';
  if (alarm === 'overloadTrip') return 'Beban melebihi 110% daya prime selama 5 detik. Panel membuka breaker genset (electrical trip) untuk melindungi mesin dan alternator, lalu mesin didinginkan sebelum mati.';

  switch (s.phase) {
    case 'startDelay':
      return `PLN padam sudah dipastikan. Panel menunggu ${TIMERS.startDelay} detik (start delay) supaya listrik yang cuma kedip sebentar tidak memicu genset.`;
    case 'crank':
      return s.firing
        ? 'Mesin sudah menyala! Begitu putaran tembus 600 rpm, starter dilepas otomatis (crank disconnect).'
        : `Motor starter memutar mesin sekitar 150 rpm (percobaan ${s.attempt} dari ${TIMERS.attempts}). Solar disemprotkan, dan udara yang dikompres di silinder menjadi cukup panas untuk membakarnya. Mesin diesel tidak pakai busi.`;
    case 'crankRest':
      return `Starter istirahat ${TIMERS.crankRest} detik agar motornya tidak kepanasan dan aki pulih, lalu mencoba lagi.`;
    case 'cooling':
      return `Beban sudah dikembalikan ke PLN. Mesin dibiarkan jalan tanpa beban selama ${TIMERS.cooling} detik (cooling) supaya turbo dan mesin dingin pelan-pelan sebelum dimatikan.`;
    case 'stopping':
      return 'Suplai solar diputus. Mesin melambat sampai berhenti; roda gila dan rotor alternator yang berat butuh beberapa detik untuk diam.';
    case 'running': {
      if (s.sinceStart < TIMERS.safety)
        return `Mesin berputar naik ke 1500 rpm. Selama ${TIMERS.safety} detik pertama (safety delay) panel belum memeriksa tekanan oli dan suhu, karena angkanya memang belum stabil.`;
      if (!genAvailable(s)) return 'Menunggu tegangan dan frekuensi generator stabil sebelum boleh dibebani.';
      if (s.gcb) {
        const lf = loadFrac(s);
        const note =
          lf > 1.1
            ? 'Ini di atas batas aman. Kalau bertahan 5 detik, breaker akan trip.'
            : lf > 1
              ? 'Di atas daya prime: boleh sebentar (overload 10%), tapi tidak untuk jalan terus.'
              : lf > 0.8
                ? 'Beban berat tapi masih di zona prime.'
                : 'Beban nyaman.';
        return `Genset menanggung ${Math.round(s.genKw)} kW (${Math.round(lf * 100)}% dari ${RATING.primeKw} kW prime). Frekuensi ${hz(s).toFixed(1)} Hz, solar ${Math.round(fuelRate(s))} liter/jam. ${note}`;
      }
      if (s.mode === 'auto' && s.mainsOk) return `PLN sudah kembali. Panel menunggu ${TIMERS.returnDelay} detik (return delay) untuk memastikan PLN benar-benar stabil sebelum beban dipindah balik.`;
      if (s.mode === 'manual') return 'Genset siap (Generator Available) tapi belum dibebani. Di mode Manual, tekan tombol transfer ke genset (ikon gelombang ~) untuk memindahkan beban.';
      return 'Genset siap menerima beban.';
    }
    default:
      if (s.mode === 'stop') return 'Panel di mode Stop: genset tidak akan menyala walaupun PLN padam. Tekan AUTO supaya genset siaga otomatis.';
      if (!s.mainsOk && s.mode === 'auto') return `PLN padam! Panel menunggu ${TIMERS.mainsTransient} detik untuk memastikan ini bukan gangguan sesaat.`;
      if (s.mode === 'manual') return 'Mode Manual: tekan tombol hijau (I) untuk menyalakan genset.';
      if (s.mode === 'test') return 'Mode Test: tekan tombol hijau (I). Genset akan menyala dan langsung mengambil beban, cara rutin mengetes genset.';
      return 'Mode AUTO, genset siaga. Gedung memakai listrik PLN. Coba klik "PLN padam" untuk melihat genset bekerja sendiri.';
  }
}
