import json
import os
import redis

OTURUM_TTL_SN = 86400   # 24 saat
GUNLUK_MENU_TTL_SN = 300   # 5 dakika
HAFTALIK_MENU_TTL_SN = 600 # 10 dakika

def redis_baglantisi():
    return redis.Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        decode_responses=True
    )

# --- 1. Oturum Yönetimi ---
def oturum_kaydet(token, kullanici_id):
    r = redis_baglantisi()
    r.setex(f"oturum:{token}", OTURUM_TTL_SN, str(kullanici_id))

def oturum_kullanici_id_getir(token):
    if not token:
        return None
    r = redis_baglantisi()
    deger = r.get(f"oturum:{token}")
    return int(deger) if deger else None

def oturum_sil(token):
    if not token:
        return
    r = redis_baglantisi()
    r.delete(f"oturum:{token}")

# --- 2. Menü Önbelleği (Cache-Aside) ---
def onbellekten_oku(anahtar):
    r = redis_baglantisi()
    veri = r.get(anahtar)
    return json.loads(veri) if veri else None

def onbellege_yaz(anahtar, veri, ttl_sn):
    r = redis_baglantisi()
    r.setex(anahtar, ttl_sn, json.dumps(veri, ensure_ascii=False))

# --- 3. Önbellek Geçersiz Kılma (Invalidation) ---
def menu_onbellegi_temizle():
    r = redis_baglantisi()
    anahtarlar = list(r.scan_iter(match="menu:*"))
    if anahtarlar:
        r.delete(*anahtarlar)