# Pemasangan Wicend Twibbon

1. Buat proyek Supabase terpisah dari akun staf. Isi `wicend-twibbon-config.js` dengan URL proyek dan publishable key (atau anon key), bukan secret key maupun service_role.
2. Aktifkan pendaftaran dan konfirmasi email. Izinkan URL HTTPS halaman `wicend-twibbon.html` di Redirect URLs Supabase dan gunakan SMTP yang sesuai untuk produksi.
3. Pasang file portal melalui proses deployment biasa. Menu Aplikasi Wicend ditambahkan ke dashboard dan halaman publik.
4. Uji daftar, konfirmasi email, masuk, pilih foto dan bingkai, unduh PNG, serta keluar. Editor belum menyediakan kampanye dengan tautan unik.
