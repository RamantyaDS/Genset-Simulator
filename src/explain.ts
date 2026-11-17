// Plain-language narration of what the genset and controller are doing right now.
import { ALARMS, TIMERS, fuelRate, genAvailable, hz, loadFrac, primeOf, type State } from './sim/genset';

export function explain(s: State): string {
  const alarm = s.alarms.find((a) => ALARMS[a].kind !== 'warning');
  if (alarm === 'estop') return 'Tombol emergency stop ditekan. Mesin langsung mati dan tidak bisa dinyalakan sebelum tombolnya dilepas lalu panel di-reset (tekan Stop/Reset).';
  if (alarm === 'failStart') return `Mesin gagal hidup setelah ${TIMERS.attempts} kali mencoba starter. Biasanya karena solar habis, udara masuk ke saluran solar, atau aki lemah. Perbaiki penyebabnya, lalu tekan Stop/Reset.`;
  if (alarm === 'fuelEmpty') return 'Solar habis, mesin mati sendiri. Isi solar, lalu tekan Stop/Reset untuk menghapus alarm.';
  if (alarm === 'lowOil') return 'Tekanan oli turun di bawah 1,03 bar, jadi panel mematikan mesin seketika. Tanpa oli, bantalan poros engkol bisa rusak dalam hitungan detik. Perbaiki kebocoran, lalu tekan Stop/Reset.';
  if (alarm === 'highTemp') return 'Suhu air pendingin tembus 96 °C, jadi panel mematikan mesin. Penyebab umumnya radiator kotor atau tersumbat, sabuk kipas putus, atau air pendingin kurang. Tunggu mesin dingin, perbaiki, lalu tekan Stop/Reset.';
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
      if (s.alarms.includes('highTempWarn')) return `Peringatan: suhu air pendingin ${Math.round(s.coolant)} °C, sudah lewat batas 90 °C. Mesin masih jalan, tapi kalau sampai 96 °C panel akan mematikannya.`;
      if (s.alarms.includes('lowOilWarn')) return `Peringatan: tekanan oli tinggal ${s.oil.toFixed(1)} bar. Kalau turun di bawah 1,03 bar, mesin dimatikan otomatis.`;
      if (s.loadBankOn && !s.gcb)
        return `Tes dengan load bank: genset menanggung ${Math.round(s.genKw)} kW ke kotak pemanas resistor (${Math.round(loadFrac(s) * 100)}%), sementara gedung tetap memakai PLN. Panasnya dibuang oleh kipas load bank. Cara ini membuktikan genset kuat menanggung beban tanpa mengganggu gedung.`;
      if (s.gcb) {
        // against the prime rating the set actually has (a fitted workshop build may raise it)
        const prime = primeOf(s);
        const lf = s.genKw / prime;
        const note =
          lf > 1.1
            ? 'Ini di atas batas aman. Kalau bertahan 5 detik, breaker akan trip.'
            : lf > 1
              ? 'Di atas daya prime: boleh sebentar (overload 10%), tapi tidak untuk jalan terus.'
              : lf > 0.8
                ? 'Beban berat tapi masih di zona prime.'
                : 'Beban nyaman.';
        const test = s.mode === 'test' && s.mainsOk ? 'Mode Test: PLN sebenarnya masih ada, tapi beban gedung sengaja dipindah ke genset untuk menguji transfer. Tekan AUTO untuk mengembalikannya. ' : '';
        return `${test}Genset menanggung ${Math.round(s.genKw)} kW (${Math.round(lf * 100)}% dari ${Math.round(prime)} kW prime${s.mod ? ', mesin modifikasi' : ''}). Frekuensi ${hz(s).toFixed(1)} Hz, solar ${Math.round(fuelRate(s))} liter/jam. ${note}`;
      }
      if (s.mode === 'auto' && s.mainsOk) return `PLN sudah kembali. Panel menunggu ${TIMERS.returnDelay} detik (return delay) untuk memastikan PLN benar-benar stabil sebelum beban dipindah balik.`;
      if (s.mode === 'manual')
        return s.mainsOk
          ? 'Genset menyala tanpa beban, gedung tetap memakai PLN. Ini tes mingguan yang paling umum: memastikan mesin mau hidup dan oli bersirkulasi. Untuk menguji dengan beban, nyalakan load bank, atau tekan transfer ke genset (ikon ~).'
          : 'Genset siap (Generator Available) tapi belum dibebani. Di mode Manual, tekan tombol transfer ke genset (ikon gelombang ~) untuk memindahkan beban.';
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
