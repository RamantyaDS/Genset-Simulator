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

- Model 3D yang dibangun dari kode, dengan ukuran mengikuti datasheet: base frame, radiator dan kipas, mesin V16 dengan kepala silinder per silinder, turbo, alternator, dan panel
- Open type dan silent type (kanopi kontainer 40 ft dengan silencer di atap)
- Panel DSE7320 yang bisa dipencet, dengan tata letak sesuai manual 057-253: mode Stop, Manual, Test, Auto, tombol Start, transfer beban, halaman layar Status, Engine, Generator, Mains, dan Alarms, LED mimic, serta lampu tes
- Skenario PLN padam memakai urutan dan timer default pabrik DSE: transient 2 detik, start delay 5 detik, crank 10 detik (3 kali percobaan), safety delay 10 detik, transfer 0,7 detik, return delay 30 detik, cooling 60 detik
- Respons beban: frekuensi dan tegangan turun sesaat saat beban naik, lalu pulih
- Konsumsi solar sesuai datasheet (246, 349, 470, 529 L/jam di beban 50, 75, 100, 110%)
- Gangguan: emergency stop, solar habis (gagal start setelah 3 kali percobaan), overload trip
- X-ray: aliran solar, udara turbo, gas buang, air pendingin, dan listrik
- Mode bongkar untuk memisahkan radiator, mesin, alternator, dan panel
- Suara disintesis langsung di browser: pembakaran V16 (200 Hz pada 1500 rpm), motor starter, turbo, kipas, klak breaker, dan buzzer alarm. Suara lebih redam di dalam kanopi silent
- Asap knalpot: kepulan gelap saat mesin menyala dan saat beban naik
- Narasi bahasa Indonesia yang menjelaskan apa yang sedang terjadi di setiap tahap

## Catatan akurasi

Spesifikasi diambil dari halaman produk Traknus, datasheet mesin dan genset 4016-61TRG3, datasheet Stamford P734H, serta manual operator DSE7320 MKII. Ada beberapa penyederhanaan:

- Pemanasan mesin dipercepat supaya demo tidak terlalu lama
- Konsumsi solar di beban 0% dan 25% adalah perkiraan
- Kapasitas tangki harian 2000 L adalah asumsi
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
