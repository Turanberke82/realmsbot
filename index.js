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
const gamertagCache = new Map(); // XUID -> Gamertag önbelleği

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

// XUID ile Xbox Live Servisinden Gerçek Gamertag Çekme
async function getGamertag(xuid) {
  if (!xuid) return null;
  if (gamertagCache.has(xuid)) return gamertagCache.get(xuid);

  try {
    const xboxToken = await authflow.getXboxToken('http://xboxlive.com');
    const response = await fetch(`https://profile.xboxlive.com/users/xuid(${xuid})/settings?settings=Gamertag`, {
      headers: {
        'Authorization': `XBL3.0 x=${xboxToken.userHash};${xboxToken.XSTSToken}`,
        'x-xbl-contract-version': '2'
      }
    });
    const data = await response.json();
    if (data.profileUsers && data.profileUsers[0] && data.profileUsers[0].settings) {
      const setting = data.profileUsers[0].settings.find(s => s.id === 'Gamertag');
      if (setting && setting.value) {
        gamertagCache.set(xuid, setting.value);
        return setting.value;
      }
    }
  } catch (err) {
    console.error("Xbox profili çekme hatası:", err.message);
  }
  return null;
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

    const onlinePlayers = (realmData.players || []).filter(p => p.online === true || p.online === 'true');
    const suAnkiOyuncular = [];

    for (const p of onlinePlayers) {
      let isim = p.name || p.gamerTag || p.gamertag || p.displayName || p.username;
      
      const xuid = p.xuid || p.uuid;

      if (!isim && xuid) {
        isim = await getGamertag(xuid);
      }

      if (!isim) {
        isim = xuid ? `Oyuncu_${xuid.slice(-4)}` : "Oyuncu";
      }

      suAnkiOyuncular.push(isim);
    }

    console.log("Şu anki çevrimiçi oyuncular:", suAnkiOyuncular);

    // İlk kontrolde durum raporu gönder
    if (ilkKontrol) {
      oncekiOyuncular = suAnkiOyuncular;
      ilkKontrol = false;
      if (suAnkiOyuncular.length > 0) {
        await whatsappMesajGonder(`📌 Bot aktif! Şu an sunucudaki oyuncular: ${suAnkiOyuncular.join(', ')}`);
      } else {
        await whatsappMesajGonder("📌 Bot aktif! Şu an sunucuda kimse yok.");
      }
      return;
    }

    // Giriş yapanlar
    const yeniGirenler = suAnkiOyuncular.filter(oyuncu => !oncekiOyuncular.includes(oyuncu));
    
    // Çıkış yapanlar
    const cikanlar = oncekiOyuncular.filter(oyuncu => !suAnkiOyuncular.includes(oyuncu));

    if (yeniGirenler.length > 0) {
      for (const oyuncu of yeniGirenler) {
        await whatsappMesajGonder(`🎮 ${oyuncu} sunucuya giriş yaptı!`);
      }
    }

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
