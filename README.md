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
- Model 3D yang dibangun dari kode, dengan ukuran mengikuti datasheet: base frame, radiator dan kipas, mesin V16 dengan kepala silinder per silinder, turbo, alternator, dan panel
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
- Asap knalpot seperti diesel asli: uap putih saat starter, kepulan hitam saat mesin menyala, kabut putih kebiruan saat mesin masih dingin, jelaga hitam saat beban naik mendadak (turbo lag), hampir bening saat jalan normal, dan abu-abu gelap saat overload
- Narasi bahasa Indonesia yang menjelaskan apa yang sedang terjadi di setiap tahap

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
