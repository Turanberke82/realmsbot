const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// CallMeBot WhatsApp Bilgileri (Buraya kendi telefon numaranı ve API anahtarını yaz)
const PHONE_NUMBER = "905XXXXXXXXX"; // Ülke koduyla (Örn: 905301234567)
const CALLMEBOT_API_KEY = "123456";  // CallMeBot'tan aldığın API anahtarı

let oncekiOyuncular = [];

// WhatsApp Bildirim Fonksiyonu
async function whatsappMesajGonder(metin) {
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${PHONE_NUMBER}&text=${encodeURIComponent(metin)}&apikey=${CALLMEBOT_API_KEY}`;
    await fetch(url);
    console.log("WhatsApp bildirimi gönderildi:", metin);
  } catch (hata) {
    console.error("WhatsApp mesajı gönderilemedi:", hata);
  }
}

// Realms Kontrol Döngüsü (Her 60 saniyede bir çalışır)
async function realmsKontrolEt() {
  try {
    console.log("Realms sunucusu kontrol ediliyor...");
    
    // YAKINDA: Microsoft / Realms API entegrasyonu buraya gelecek
    
  } catch (hata) {
    console.error("Realms kontrol hatası:", hata);
  }
}

// 60 saniyede bir kontrol et
setInterval(realmsKontrolEt, 60000);

// Render'ın uyku moduna geçmemesi ve sistemi canlı tutması için web sunucusu
app.get('/', (req, res) => {
  res.send('Realms Botu 7/24 Aktif ve Çalışıyor!');
});

app.listen(PORT, () => {
  console.log(`Bot ${PORT} portunda başarıyla başlatıldı.`);
});
