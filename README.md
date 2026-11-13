# Genset Simulator

Simulator 3D genset 2250 kVA yang berjalan di browser. Bisa dicoba untuk melihat bagaimana genset menyala sendiri saat listrik PLN padam, dari motor starter sampai mengambil beban gedung.

**Coba langsung:** https://ramantyads.github.io/Genset-Simulator/

## Unit yang disimulasikan

| | |
|---|---|
| Daya | Prime 2250 kVA / 1800 kW, standby 2500 kVA / 2000 kW, base 1800 kVA / 1440 kW |
| Mesin | Perkins 4016-61TRG3: 16 silinder V 60°, 61,1 liter, 4 turbo, 1500 rpm |
| Alternator | Stamford P734H: 4 kutub, AVR DECS100 dengan eksitasi PMG |
| Panel kontrol | Deep Sea Electronics DSE7320 MKII (auto mains failure) |
| Dimensi open type | 5,9 × 2,2 × 2,55 m; silent type dalam kanopi kontainer 40 ft |

## Fitur

- Tur "Cara kerja genset": 13 bab, mulai dari mesin diesel, turbo, pendingin, alternator, bahan bakar, panel DSE, cara menyalakan, saat PLN padam, beban dan kapasitas, proteksi, open vs silent, sampai tes rutin. Kamera menyorot bagian yang dibahas dan setiap bab punya contoh yang bisa dicoba
- Tes genset tanpa memadamkan PLN: nyalakan tanpa beban (mode Manual), tes beban gedung (mode Test), atau tes dengan load bank
- Model 3D yang dibangun dari kode, dengan ukuran mengikuti datasheet dan bentuk mengikuti foto genset Perkins 4016 open type: base frame, radiator dan kipas, mesin V16 dengan kepala silinder per silinder, 4 turbo, 4 filter udara melintang, alternator dengan tutup kerucut, dan panel
- Open type dan silent type (kanopi kontainer 40 ft dengan silencer di atap)
- Panel DSE7320 yang bisa dipencet, dengan tata letak sesuai manual 057-253: mode Stop, Manual, Test, Auto, tombol Start, transfer beban, halaman layar Status, Engine, Generator, Mains, dan Alarms, LED mimic, serta lampu tes
- Skenario PLN padam memakai urutan dan timer default pabrik DSE: transient 2 detik, start delay 5 detik, crank 10 detik (3 kali percobaan), safety delay 10 detik, transfer 0,7 detik, return delay 30 detik, cooling 60 detik
- Respons beban: frekuensi dan tegangan turun sesaat saat beban naik, lalu pulih
- Konsumsi solar dari datasheet Perkins 4016-61TRG3 (126, 234, 344, 371, 470, 529 L/jam di beban 25, 50, 75, 80, 100, 110%), plus perkiraan sisa jam operasi dari isi tangki
- Suhu air pendingin naik perlahan seperti aslinya (pemanas menjaga 45 °C saat siaga, thermostat 80–90 °C saat jalan). Waktu bisa dipercepat 10× atau 30×
- Gangguan: emergency stop, solar habis (gagal start setelah 3 kali percobaan), overload trip, radiator tersumbat, oli bocor, dengan level proteksi pabrik DSE (suhu: peringatan 90 °C, shutdown 96 °C; oli: peringatan 1,24 bar, shutdown 1,03 bar)
- X-ray: aliran solar, udara turbo, gas buang, air pendingin, dan listrik
- Bongkar dua level: rakitan utama, lalu setiap komponen (16 kepala silinder, tutup rocker, manifold, 4 turbo, charge air cooler, bak oli, gear case, pompa air, filter, starter, rotor dan stator alternator, exciter, kotak terminal). Blok mesin menjadi transparan sehingga poros engkol dan 16 piston terlihat bergerak, lengkap dengan kilatan langkah usaha. Klik komponen mana saja untuk melihat nama dan fungsinya
- Suara mesin disintesis per silinder dengan AudioWorklet: 16 ledakan tiap dua putaran (200 per detik pada 1500 rpm), masing-masing berisi dentuman knalpot, bunyi pembakaran, dan ketukan diesel. Ada juga starter yang tersendat tiap langkah kompresi, mesin yang tersendat saat mulai hidup, suara makin berat saat dibebani, ketukan lebih keras saat mesin dingin, turbo, kipas, gema lingkungan, klak breaker, dan buzzer alarm. Suara lebih redam di dalam kanopi silent
- Efek panas: rumah turbo dan pipa buang tiap silinder membara merah saat suhu gas buang tinggi (beban berat atau overload), udara di atas knalpot dan di depan radiator tampak bergetar (heat shimmer), dan suhu gas buang tampil di halaman Engine panel DSE
- Asap knalpot seperti diesel asli: uap putih saat starter, kepulan hitam saat mesin menyala, kabut putih kebiruan saat mesin masih dingin, jelaga hitam saat beban naik mendadak (turbo lag), hampir bening saat jalan normal, dan abu-abu gelap saat overload
- Narasi bahasa Indonesia yang menjelaskan apa yang sedang terjadi di setiap tahap

## Mode pembangkit 5 unit

Tombol "Mode pembangkit 5 unit" (atau `?mode=plant`) membuka PLTD kecil: lima genset 2250 kVA berjajar di dalam hall, memasok kawasan pabrik kelapa sawit lewat jaringan 20 kV.

- Kawasan yang dilayani lewat 7 penyulang: PKS (30–90 t/jam), kernel crushing plant, refinery minyak goreng, bulking station dan dermaga, perumahan karyawan ber-AC dengan sekolah dan masjid, kantor dan bengkel, air bersih dan klinik. Beban tiap penyulang mengikuti jam; puncaknya sekitar 6,1 MW pada malam hari (6,9 MW saat kapal muat), sesuai rancangan N+1: empat genset kerja keras di jam puncak, satu cadangan
- Kejadian: PKS start bertahap pagi hari (boiler, rebusan, press, klarifikasi), istirahat siang dan ganti shift, motor besar start langsung (DOL) dengan lonjakan arus yang menurunkan frekuensi dan tegangan sesaat, kapal tanker sandar dan memuat CPO selama 6 jam
- Skenario tantangan selama 24 jam: Panen puncak (PKS 90 t/jam dua shift), G3 overhaul (hanya 4 genset), dan Hemat solar (operasi manual di bawah 0,262 L/kWh), semuanya tanpa lepas beban
- Slider kapasitas PKS dan pengali beban seluruh kawasan (50–150%), serta tombol start motor besar dan kapal sandar, untuk mendorong genset sampai batasnya
- Black start: genset pertama boleh menutup breaker ke bus yang masih mati (dead bus)
- Sinkronisasi manual dengan sinkroskop: atur frekuensi dan tegangan, lalu tutup breaker saat jarum mendekati jam 12 (selisih di bawah 0,2 Hz, 4% tegangan, dan 15°). Menutup di luar fase membuat genset trip
- Pembagian beban kW merata antar unit (isochronous load sharing); frekuensi bus turun bila beban melebihi kapasitas
- Pelepasan beban otomatis (UFLS) pada 48,5 Hz menurut urutan prioritas feeder; di bawah 47 Hz seluruh pembangkit padam
- Kontrol otomatis (load demand): menyalakan unit berikutnya saat beban di atas 80% kapasitas dan mematikan unit saat beban cukup ditanggung unit yang tersisa
- Jam dipercepat (1, 5, atau 20 menit simulasi per detik) untuk melihat profil beban sehari, konsumsi solar, efisiensi L/kWh, dan pengisian tangki lewat truk
- Kelima genset memakai model 3D detail yang sama dengan mode genset tunggal. Tombol 🔍 (atau klik genset di hall) mendekati satu unit dengan semua fitur genset tunggal: gauge mesin, bongkar dua level, X-ray aliran, info komponen, panel DSE7320 unit itu, heat shimmer, serta gangguan per unit (emergency stop, radiator tersumbat, oli bocor) yang memicu shutdown seperti aslinya
- Beban per unit: "bagi rata" (isochronous) atau base load dengan setelan kW, untuk memaksa satu genset sampai beban penuh. Load bank 0–2000 kW per unit untuk tes seperti genset tunggal; di atas 110% selama 5 detik genset trip overload
- Tangki harian 2000 L di samping tiap genset, diisi pompa transfer dari tangki induk 60.000 L (mulai mengisi di bawah 60%, berhenti di 95%). Tangki harian kosong mematikan genset
- Tampilan selalu malam supaya lampu hall, rumah, pabrik, dan lampu jalan terlihat; jam dan profil beban tetap berjalan sepanjang hari. Lampu rumah dan pabrik hanya menyala bila feeder-nya bertegangan, ruang kontrol dengan layar SCADA, gangguan acak untuk latihan

Catatan: pada instalasi nyata, paralel genset memakai pengendali seperti DSE8610 MKII (DSE7320 tidak bisa paralel). Profil beban kawasan adalah perkiraan, bukan data pabrik tertentu.

## Catatan akurasi

Spesifikasi diambil dari halaman produk Traknus, datasheet mesin dan genset 4016-61TRG3, datasheet Stamford P734H, serta manual operator DSE7320 MKII. Ada beberapa penyederhanaan:

- Konsumsi solar tanpa beban (40 L/jam) adalah perkiraan; Perkins tidak mencantumkannya
- Kapasitas tangki harian 2000 L adalah asumsi (unit open type tidak punya tangki bawaan)
- Timer warm-up dan cooling memakai setelan pabrik DSE; perakit genset bisa mengubahnya
- Bentuk model mengikuti foto produk, tetapi bukan gambar teknik resmi

## Pengembangan

```bash
npm install
npm run dev    # http://localhost:5173/Genset-Simulator/
npm test       # test simulasi genset dan panel
npm run build
```

Setiap push ke `main` otomatis di-deploy ke GitHub Pages lewat GitHub Actions.

Stack: Vite, React, TypeScript, React Three Fiber, drei, Zustand, Vitest.

Logika genset dan panel ada di [`src/sim/genset.ts`](src/sim/genset.ts), terpisah dari kode 3D.
