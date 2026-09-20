const express = require('express');
const fetch = require('node-fetch');
const { RealmAPI } = require('prismarine-realms');
const { Authflow } = require('prismarine-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// CallMeBot WhatsApp Bilgileri
const PHONE_NUMBER = "905427619891";
const CALLMEBOT_API_KEY = "2320760";

// Microsoft Yetkilendirme (Bedrock için)
const authflow = new Authflow('realmsbot', './auth_cache');
const api = RealmAPI.from(authflow, 'bedrock');

let oncekiOyuncular = [];
let ilkKontrol = true;

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

// Bedrock Realms Kontrol Döngüsü
async function realmsKontrolEt() {
  try {
    console.log("Realms sunucusu kontrol ediliyor...");
    
    // Hesaba bağlı tüm Realms sunucularını çek
    const realms = await api.getRealms();
    
    if (!realms || realms.length === 0) {
      console.log("Hesaba bağlı herhangi bir Realms sunucusu bulunamadı.");
      return;
    }

    // İlk Realms sunucusunu seç
    const targetRealm = realms[0];
    const realmData = await api.getRealm(targetRealm.id);

    // Çevrimiçi oyuncuları filtrele
    const suAnkiOyuncular = (realmData.players || [])
      .filter(p => p.online === true)
      .map(p => p.name);

    console.log("Şu anki çevrimiçi oyuncular:", suAnkiOyuncular);

    // İlk kontrolde mevcut herkesi mesaj atıp rahatsız etmemek için sadece listeyi kaydet
    if (ilkKontrol) {
      oncekiOyuncular = suAnkiOyuncular;
      ilkKontrol = false;
      return;
    }

    // Sunucuya yeni giren oyuncuları tespit et
    const yeniGirenler = suAnkiOyuncular.filter(oyuncu => !oncekiOyuncular.includes(oyuncu));

    if (yeniGirenler.length > 0) {
      for (const oyuncu of yeniGirenler) {
        await whatsappMesajGonder(`🎮 ${oyuncu} Bedrock Realms sunucusuna giriş yaptı!`);
      }
    }

    oncekiOyuncular = suAnkiOyuncular;

  } catch (hata) {
    console.error("Realms kontrol hatası:", hata.message);
  }
}

// Her 60 saniyede bir kontrol yap
setInterval(realmsKontrolEt, 60000);

// Web Sunucusu (7/24 Aktiflik için)
app.get('/', (req, res) => {
  res.send('Bedrock Realms Botu 7/24 Aktif ve Çalışıyor!');
});

app.listen(PORT, () => {
  console.log(`Bot ${PORT} portunda başlatıldı.`);
  // İlk kontrolü başlat
  setTimeout(realmsKontrolEt, 5000);
});
