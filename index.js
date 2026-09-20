const express = require('express');
const fetch = require('node-fetch');
const { RealmAPI } = require('prismarine-realms');
const { Authflow } = require('prismarine-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Bot Bilgileri
const TELEGRAM_BOT_TOKEN = "8828670056:AAFQSjff6jw35Rhu3_B4MqsGOcFMy_zEWhA";
const TELEGRAM_CHAT_ID = "-1004306640579";

// Microsoft Yetkilendirme (Bedrock için)
const authflow = new Authflow('realmsbot', './auth_cache');
const api = RealmAPI.from(authflow, 'bedrock');

let oncekiOyuncular = [];
let ilkKontrol = true;
const gamertagCache = new Map();

// Telegram Bildirim Fonksiyonu
async function telegramMesajGonder(metin) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(metin)}`;
    await fetch(url);
    console.log("Telegram bildirimi gönderildi:", metin);
  } catch (hata) {
    console.error("Telegram mesajı gönderilemedi:", hata);
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

    // İlk kontrolde Telegram grubuna durum raporu gönder
    if (ilkKontrol) {
      oncekiOyuncular = suAnkiOyuncular;
      ilkKontrol = false;
      if (suAnkiOyuncular.length > 0) {
        await telegramMesajGonder(`📌 Realms Botu Aktif!\nŞu an sunucudaki oyuncular: ${suAnkiOyuncular.join(', ')}`);
      } else {
        await telegramMesajGonder("📌 Realms Botu Aktif!\nŞu an sunucuda kimse yok.");
      }
      return;
    }

    // Giriş yapanlar
    const yeniGirenler = suAnkiOyuncular.filter(oyuncu => !oncekiOyuncular.includes(oyuncu));
    
    // Çıkış yapanlar
    const cikanlar = oncekiOyuncular.filter(oyuncu => !suAnkiOyuncular.includes(oyuncu));

    if (yeniGirenler.length > 0) {
      for (const oyuncu of yeniGirenler) {
        await telegramMesajGonder(`🎮 ${oyuncu} Realms sunucusuna giriş yaptı!`);
      }
    }

    if (cikanlar.length > 0) {
      for (const oyuncu of cikanlar) {
        await telegramMesajGonder(`🚪 ${oyuncu} Realms sunucusundan ayrıldı!`);
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
  res.send('Bedrock Realms Telegram Botu 7/24 Aktif!');
});

app.listen(PORT, () => {
  console.log(`Bot ${PORT} portunda başlatıldı.`);
  setTimeout(realmsKontrolEt, 5000);
});
