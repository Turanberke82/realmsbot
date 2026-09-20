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
    
    const realms = await api.getRealms();
    
    if (!realms || realms.length === 0) {
      console.log("Hesaba bağlı herhangi bir Realms sunucusu bulunamadı.");
      return;
    }

    const targetRealm = realms[0];
    const realmData = await api.getRealm(targetRealm.id);

    // Render Logs ekranından yapıyı görebilmemiz için log
    if (realmData.players) {
      console.log("Gelen Oyuncu Verisi:", JSON.stringify(realmData.players));
    }

    // Bedrock'ın tüm olası isim alanlarını (name, gamerTag, displayName vb.) tara
    const suAnkiOyuncular = (realmData.players || [])
      .filter(p => p.online === true || p.online === 'true')
      .map(p => {
        const isim = p.name || p.gamerTag || p.gamertag || p.displayName || p.username;
        return isim || (p.xuid ? `Oyuncu_${p.xuid.slice(-4)}` : "Gamer");
      });

    console.log("Şu anki çevrimiçi oyuncular:", suAnkiOyuncular);

    // İlk kontrolde mevcut listeyi kaydet
    if (ilkKontrol) {
      oncekiOyuncular = suAnkiOyuncular;
      ilkKontrol = false;
      return;
    }

    // Sunucuya yeni giren oyuncular
    const yeniGirenler = suAnkiOyuncular.filter(oyuncu => !oncekiOyuncular.includes(oyuncu));
    
    // Sunucudan çıkan oyuncular
    const cikanlar = oncekiOyuncular.filter(oyuncu => !suAnkiOyuncular.includes(oyuncu));

    // Giriş bildirimleri
    if (yeniGirenler.length > 0) {
      for (const oyuncu of yeniGirenler) {
        await whatsappMesajGonder(`🎮 ${oyuncu} sunucuya giriş yaptı!`);
      }
    }

    // Çıkış bildirimleri
    if (cikanlar.length > 0) {
      for (const oyuncu of cikanlar) {
        await whatsappMesajGonder(`🚪 ${oyuncu} sunucudan ayrıldı!`);
      }
    }

    oncekiOyuncular = suAnkiOyuncular;

  } catch (hata) {
    console.error("Realms kontrol hatası:", hata.message);
  }
}

// Her 60 saniyede bir kontrol et
setInterval(realmsKontrolEt, 60000);

// Web Sunucusu
app.get('/', (req, res) => {
  res.send('Bedrock Realms Botu 7/24 Aktif ve Çalışıyor!');
});

app.listen(PORT, () => {
  console.log(`Bot ${PORT} portunda başlatıldı.`);
  setTimeout(realmsKontrolEt, 5000);
});
