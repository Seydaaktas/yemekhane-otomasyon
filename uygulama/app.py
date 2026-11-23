from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import wraps
import secrets
import bcrypt
from flask import Flask, jsonify, make_response, request
import veri_katmani as vk
import redis_katmani as rk

app = Flask(__name__)

def _json_temizle(veri):
    if isinstance(veri, Decimal):
        return float(veri)
    if isinstance(veri, (datetime, date)):
        return veri.isoformat()
    if isinstance(veri, timedelta):
        toplam_sn = int(veri.total_seconds())
        saat = toplam_sn // 3600
        dakika = (toplam_sn % 3600) // 60
        return f"{saat:02d}:{dakika:02d}"
    if isinstance(veri, list):
        return [_json_temizle(x) for x in veri]
    if isinstance(veri, dict):
        return {k: _json_temizle(v) for k, v in veri.items()}
    return veri

def yanit_ver(veri, durum=200, basliklar=None):
    resp = make_response(jsonify(_json_temizle(veri)), durum)
    if basliklar:
        for k, v in basliklar.items():
            resp.headers[k] = v
    return resp

def giris_gerekli(f):
    @wraps(f)
    def sarmalayici(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        token = auth.replace("Bearer ", "").strip()
        kullanici_id = rk.oturum_kullanici_id_getir(token)
        if not kullanici_id:
            return yanit_ver({"hata": "Oturum açmanız gerekiyor."}, 401)
        kullanici = vk.kullanici_getir_id(kullanici_id)
        if not kullanici:
            return yanit_ver({"hata": "Kullanıcı bulunamadı."}, 401)
        request.kullanici = kullanici
        request.token = token
        return f(*args, **kwargs)
    return sarmalayici

@app.errorhandler(vk.IsKuraliHatasi)
def is_kurali_hatasi_yakala(e):
    return yanit_ver({"hata": str(e)}, 400)

@app.errorhandler(Exception)
def genel_hata_yakala(e):
    app.logger.exception("Beklenmeyen sunucu hatası")
    return yanit_ver({"hata": "İşlem sırasında bir hata oluştu."}, 500)

@app.get("/api/")
def saglik():
    return yanit_ver({"durum": "ok", "servis": "yemekhane-api", "onbellek": "redis"})

@app.post("/api/giris")
def giris():
    veri = request.get_json(silent=True) or {}
    eposta = (veri.get("eposta") or "").strip().lower()
    sifre = veri.get("sifre") or ""

    if not eposta or not sifre:
        return yanit_ver({"hata": "E-posta ve şifre zorunludur."}, 400)

    kullanici = vk.kullanici_getir_eposta(eposta)
    if not kullanici or not kullanici["aktif"]:
        return yanit_ver({"hata": "E-posta veya şifre hatalı."}, 401)

    if not bcrypt.checkpw(sifre.encode("utf-8"), kullanici["sifre_hash"].encode("utf-8")):
        return yanit_ver({"hata": "E-posta veya şifre hatalı."}, 401)

    token = secrets.token_hex(24)
    rk.oturum_kaydet(token, kullanici["id"])

    guncel = vk.kullanici_getir_id(kullanici["id"], kaynaktan=True)
    return yanit_ver({"token": token, "kullanici": guncel})

@app.post("/api/cikis")
@giris_gerekli
def cikis():
    rk.oturum_sil(request.token)
    return yanit_ver({"mesaj": "Çıkış yapıldı."})

@app.get("/api/ben")
@giris_gerekli
def ben():
    guncel = vk.kullanici_getir_id(request.kullanici["id"], kaynaktan=True)
    return yanit_ver({"kullanici": guncel})

@app.get("/api/tanimlar")
@giris_gerekli
def tanimlar():
    return yanit_ver({
        "yemekhaneler": vk.yemekhaneleri_getir(),
        "ogunler": vk.ogunleri_getir(),
        "yemekler": vk.tum_yemekleri_getir()
    })

@app.get("/api/menu/gunluk")
@giris_gerekli
def gunluk_menu():
    yemekhane_id = request.args.get("yemekhane_id", default=1, type=int)
    ogun_id = request.args.get("ogun_id", default=2, type=int)
    tarih = request.args.get("tarih") or date.today().isoformat()

    anahtar = f"menu:gunluk:{yemekhane_id}:{tarih}:{ogun_id}"
    onbellek_veri = rk.onbellekten_oku(anahtar)
    if onbellek_veri is not None:
        return yanit_ver({"menu": onbellek_veri, "onbellek": "HIT"}, basliklar={"X-Cache": "HIT"})

    menu = _json_temizle(vk.gunun_menusu_getir(yemekhane_id, tarih, ogun_id))
    if menu is not None:
        rk.onbellege_yaz(anahtar, menu, rk.GUNLUK_MENU_TTL_SN)
    return yanit_ver({"menu": menu, "onbellek": "MISS"}, basliklar={"X-Cache": "MISS"})

@app.get("/api/menu/haftalik")
@giris_gerekli
def haftalik_menu():
    yemekhane_id = request.args.get("yemekhane_id", default=1, type=int)
    bugun = date.today()
    baslangic = request.args.get("baslangic") or (bugun - timedelta(days=bugun.weekday())).isoformat()
    bitis = request.args.get("bitis") or (date.fromisoformat(baslangic) + timedelta(days=6)).isoformat()

    anahtar = f"menu:haftalik:{yemekhane_id}:{baslangic}:{bitis}"
    onbellek_veri = rk.onbellekten_oku(anahtar)
    if onbellek_veri is not None:
        return yanit_ver(
            {"menuler": onbellek_veri, "baslangic": baslangic, "bitis": bitis, "onbellek": "HIT"},
            basliklar={"X-Cache": "HIT"}
        )

    menuler = _json_temizle(vk.haftalik_menuleri_getir(yemekhane_id, baslangic, bitis))
    if menuler:
        rk.onbellege_yaz(anahtar, menuler, rk.HAFTALIK_MENU_TTL_SN)
    return yanit_ver(
        {"menuler": menuler, "baslangic": baslangic, "bitis": bitis, "onbellek": "MISS"},
        basliklar={"X-Cache": "MISS"}
    )

@app.get("/api/rezervasyonlar")
@giris_gerekli
def rezervasyonlarim():
    liste = vk.kullanici_rezervasyonlari_getir(request.kullanici["id"])
    return yanit_ver({"rezervasyonlar": liste})

@app.post("/api/rezervasyonlar")
@giris_gerekli
def rezervasyon_yap():
    veri = request.get_json(silent=True) or {}
    menu_id = veri.get("menu_id")
    if not menu_id:
        return yanit_ver({"hata": "Menü seçilmedi."}, 400)
    sonuc = vk.rezervasyon_yap(request.kullanici["id"], int(menu_id))
    return yanit_ver(sonuc, 201)

@app.post("/api/rezervasyonlar/<int:rez_id>/iptal")
@giris_gerekli
def rezervasyon_iptal(rez_id):
    sonuc = vk.rezervasyon_iptal(request.kullanici["id"], rez_id)
    return yanit_ver(sonuc)

@app.post("/api/rezervasyonlar/<int:rez_id>/turnike-test")
@giris_gerekli
def turnike_test(rez_id):
    sonuc = vk.turnike_gecis_test(request.kullanici["id"], rez_id)
    return yanit_ver(sonuc)

@app.get("/api/bakiye")
@giris_gerekli
def bakiye_bilgisi():
    guncel = vk.kullanici_getir_id(request.kullanici["id"], kaynaktan=True)
    hareketler = vk.bakiye_hareketleri_getir(request.kullanici["id"])
    return yanit_ver({
        "bakiye": guncel["bakiye"],
        "hareketler": hareketler
    })

@app.post("/api/bakiye/yukle")
@giris_gerekli
def bakiye_yukle():
    veri = request.get_json(silent=True) or {}
    try:
        tutar = float(veri.get("tutar", 0))
    except (TypeError, ValueError):
        return yanit_ver({"hata": "Geçerli bir tutar giriniz."}, 400)

    sonuc = vk.bakiye_yukle(request.kullanici["id"], tutar)
    return yanit_ver(sonuc)

@app.post("/api/degerlendirmeler")
@giris_gerekli
def degerlendir():
    veri = request.get_json(silent=True) or {}
    menu_id = veri.get("menu_id")
    puan = veri.get("puan")
    yorum = (veri.get("yorum") or "").strip() or None

    if not menu_id or puan not in [1, 2, 3, 4, 5]:
        return yanit_ver({"hata": "1 ile 5 arasında puan seçmelisiniz."}, 400)

    vk.degerlendirme_kaydet(request.kullanici["id"], int(menu_id), int(puan), yorum)
    return yanit_ver({"mesaj": "Değerlendirmeniz kaydedildi."})

@app.get("/api/yonetici/rapor")
@giris_gerekli
def yonetici_rapor():
    if request.kullanici["rol"] != "yonetici":
        return yanit_ver({"hata": "Bu işlem için yönetici yetkisi gerekir."}, 403)
    return yanit_ver({"menuler": vk.yonetici_raporlari_getir()})

@app.post("/api/yonetici/menu")
@giris_gerekli
def yonetici_menu_kaydet():
    if request.kullanici["rol"] != "yonetici":
        return yanit_ver({"hata": "Bu işlem için yönetici yetkisi gerekir."}, 403)

    veri = request.get_json(silent=True) or {}
    try:
        menu_id = vk.yonetici_menu_kaydet(
            int(veri["yemekhane_id"]),
            veri["tarih"],
            int(veri["ogun_id"]),
            float(veri["ogrenci_fiyati"]),
            float(veri["personel_fiyati"]),
            veri.get("yemek_idler", [])
        )
        return yanit_ver({"mesaj": "Menü kaydedildi.", "menu_id": menu_id})
    except KeyError:
        return yanit_ver({"hata": "Tüm menü alanlarını doldurunuz."}, 400)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)