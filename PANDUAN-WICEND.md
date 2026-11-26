# Pemasangan Wicend Twibbon

1. Buat proyek Supabase terpisah dari akun staf. Isi `wicend-twibbon-config.js` dengan URL proyek dan publishable key (atau anon key), bukan secret key maupun service_role.
2. Aktifkan pendaftaran dan konfirmasi email. Izinkan URL HTTPS halaman `wicend-twibbon.html` di Redirect URLs Supabase dan gunakan SMTP yang sesuai untuk produksi.
3. Pasang file portal melalui proses deployment biasa. Menu Aplikasi Wicend ditambahkan ke dashboard dan halaman publik.
4. Uji daftar, konfirmasi email, masuk, pilih foto dan bingkai, unduh PNG, serta keluar. Editor belum menyediakan kampanye dengan tautan unik.

## Katalog Aplikasi Wicend

- Direktur/Manajer dapat menambah, mengedit, dan menghapus kartu di menu **Aplikasi Wicend**. Anggota lain hanya melihat kartu. Tautan aplikasi dan URL gambar opsional harus HTTPS. Jika gambar tidak tersedia, ikon digunakan sebagai pengganti.
- Katalog internal tersimpan di Supabase `records` (`collection = 'wicend_apps'`, `id = '_'`). Tanpa konfigurasi, katalog menampilkan Wicend Twibbon. Menghapus semua kartu menyimpan katalog kosong. Jika dua admin menyimpan bersamaan, penyimpanan terakhir berlaku.
- Halaman publik `aplikasi-wicend.html` hanya menampilkan Wicend Twibbon (`https://wicend-twibbon.pages.dev/`). Perubahan admin tidak terbit ke halaman publik: repositori tidak menyertakan kebijakan RLS yang memastikan koleksi ini dapat dibaca anonim dengan aman. Tidak ada perluasan akses anonim.
- Pembatasan edit pada antarmuka bukan pengganti RLS. Saat deploy, verifikasi bahwa kebijakan `records` mengizinkan pengguna internal membaca katalog, dan bahwa hanya Direktur/Manajer yang dapat menulis baris katalog di API. Jika kebijakan yang ada membuka akses tulis lebih luas, perketat kebijakan sebelum mengandalkan pembatasan tersebut.
