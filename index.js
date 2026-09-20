const express = require('express');
const fetch = require('node-fetch');
const { RealmAPI } = require('prismarine-realms');
const { Authflow } = require('prismarine-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Express JSON body parser (Telegram mesajlarını okumak için)
app.use(express.json());

// Telegram Bot Bilgileri
const TELEGRAM_BOT_TOKEN = "8828670056:AAFQSjff6jw35Rhu3_B4MqsGOcFMy_zEWhA";
const TELEGRAM_CHAT_ID = "-1004306640579";

// Microsoft Yetkilendirme (Bedrock için)
const authflow = new Authflow('realmsbot', './auth_cache');
const api = RealmAPI.from(authflow, 'bedrock');

let oncekiOyuncular = [];
let ilkKontrol = true;
const gamertagCache = new Map(); // XUID -> Gamertag önbelleği
let bugunSabahMesajiAtildi = false; // Sabah birden fazla atmaması için kontrol

// Telegram Mesaj Gönderme Fonksiyonu
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
    const realms = await api.getRealms();
    
    if (!realms || realms.length === 0) {
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

      suAnkiOrb = suAnkiOyuncular.push(isim); // Düzenleme
    }

    // Gerçek oyuncu listesi aktarımı (yukarıdaki satırdaki olası hatayı düzeltilmiş hali)
    // Yukarıdaki döngü için diziye ekleme:
    // (Kodun akışı bozulmasın diye p.name direkt eklenir)

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

    const yeniGirenler = suAnkiOyuncular.filter(oyuncu => !oncekiOyuncular.includes(oyuncu));
    const cikanlar = oncekiOyuncular.filter(oyuncu => !suAnkiOyuncular.includes(oyuncu));

    if (yeniGirenler.length > 0) {
      await Promise.all(yeniGirenler.map(oyuncu => 
        telegramMesajGonder(`🎮 ${oyuncu} Realms sunucusuna giriş yaptı!`)
      ));
    }

    if (cikanlar.length > 0) {
      await Promise.all(cikanlar.map(oyuncu => 
        telegramMesajGonder(`🚪 ${oyuncu} Realms sunucusundan ayrıldı!`)
      ));
    }

    oncekiOyuncular = suAnkiOyuncular;

  } catch (hata) {
    console.error("Realms kontrol hatası:", hata.message);
  }
}

// Her gün Türkiye saati ile sabah 09:00'da "Bot aktif" mesajı gönderme kontrolü
function sabahAktifKontrolu() {
  const simdi = new Date();
  
  // Render sunucusu UTC kullanır. Türkiye saati UTC+3 olduğu için TR saatini hesaplıyoruz:
  let trSaat = simdi.getUTCHours() + 3;
  if (trSaat >= 24) trSaat -= 24; // Gece yarısı geçişleri için
  
  const dakika = simdi.getUTCMinutes();
  const gun = simdi.getUTCDate();

  // Saat 09:00 olduğunda ve o gün henüz mesaj atılmadıysa
  if (trSaat === 9 && dakika === 0) {
    if (!bugunSabahMesajiAtildi) {
      telegramMesajGonder("🤖 **Günaydın! Bot aktif ve sorunsuz çalışıyor.** ☀️");
      bugunSabahMesajiAtildi = true;
    }
  } else {
    // Saat 09:00 geçtiği an (örneğin 09:01), bir sonraki gün tekrar atabilmesi için kilidi kaldırıyoruz
    if (trSaat !== 9) {
      bugunSabahMesajiAtildi = false;
    }
  }
}

// 10 saniyede bir Realms sunucusunu kontrol et
setInterval(realmsKontrolEt, 10000);

// Her 1 dakikada bir sabah saat 9 kontrolünü çalıştır
setInterval(sabahAktifKontrolu, 60000);

// Telegram'dan gelen mesajları dinleme (Webhook endpoint)
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    
    if (update.message && update.message.text) {
      const mesajText = update.message.text;
      const gonderenAd = update.message.from.first_name || "Birisi";
      const chatId = update.message.chat.id.toString();

      // Sadece gruptan gelen ve /mesaj ile başlayan komutları işle
      if (chatId === TELEGRAM_CHAT_ID && mesajText.startsWith('/mesaj')) {
        const icerik = mesajText.replace('/mesaj', '').trim();
        if (icerik) {
          const formatliMesaj = `${gonderenAd}: ${icerik}`;
          await telegramMesajGonder(formatliMesaj);
        }
      }
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook işleme hatası:", err);
    res.sendStatus(200);
  }
});

app.get('/', (req, res) => {
  res.send('Bedrock Realms Telegram Botu 7/24 Aktif!');
});

app.listen(PORT, () => {
  console.log(`Bot ${PORT} portunda başlatıldı.`);
  setTimeout(realmsKontrolEt, 2000);
});
