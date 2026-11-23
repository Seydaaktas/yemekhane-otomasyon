import pymysql
from db import yazma_baglantisi, okuma_baglantisi
import redis_katmani as rk

class IsKuraliHatasi(Exception):
    pass

def _proseduru_calistir(prosedur_adi, parametreler):
    conn = yazma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.callproc(prosedur_adi, parametreler)
            sonuc = cur.fetchone()
            return sonuc
    except pymysql.err.OperationalError as e:
        if e.args and e.args[0] == 1644:
            raise IsKuraliHatasi(e.args[1])
        if e.args and e.args[0] == 3819:
            raise IsKuraliHatasi("Geçersiz veri değeri girildi.")
        raise
    finally:
        conn.close()

def kullanici_getir_eposta(eposta):
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ad, soyad, eposta, sifre_hash, rol, ogrenci_no, bakiye, aktif "
                "FROM kullanicilar WHERE eposta = %s",
                (eposta,)
            )
            return cur.fetchone()
    finally:
        conn.close()

def kullanici_getir_id(kullanici_id, kaynaktan=False):
    conn = yazma_baglantisi() if kaynaktan else okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ad, soyad, eposta, rol, ogrenci_no, bakiye "
                "FROM kullanicilar WHERE id = %s AND aktif = 1",
                (kullanici_id,)
            )
            return cur.fetchone()
    finally:
        conn.close()

def yemekhaneleri_getir():
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, ad, konum, kapasite FROM yemekhaneler ORDER BY id")
            return cur.fetchall()
    finally:
        conn.close()

def ogunleri_getir():
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, ad, sira, son_saat, servis_baslangic, servis_bitis FROM ogunler ORDER BY sira")
            return cur.fetchall()
    finally:
        conn.close()

def tum_yemekleri_getir():
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT y.id, y.ad, y.kalori, y.vejetaryen, k.ad AS kategori, k.sira AS kategori_sira "
                "FROM yemekler y JOIN yemek_kategorileri k ON k.id = y.kategori_id "
                "ORDER BY k.sira, y.ad"
            )
            return cur.fetchall()
    finally:
        conn.close()

def gunun_menusu_getir(yemekhane_id, tarih, ogun_id):
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM v_menu_detay "
                "WHERE yemekhane_id = %s AND tarih = %s AND ogun_id = %s "
                "ORDER BY kategori_sira, yemek",
                (yemekhane_id, tarih, ogun_id)
            )
            yemekler = cur.fetchall()
            if not yemekler:
                return None

            menu_id = yemekler[0]["menu_id"]
            cur.execute("SELECT * FROM v_menu_doluluk WHERE menu_id = %s", (menu_id,))
            doluluk = cur.fetchone()

            toplam_kalori = sum(int(y["kalori"]) for y in yemekler)
            return {
                "menu_id": menu_id,
                "tarih": yemekler[0]["tarih"],
                "yemekhane_id": yemekler[0]["yemekhane_id"],
                "yemekhane": yemekler[0]["yemekhane"],
                "ogun_id": yemekler[0]["ogun_id"],
                "ogun": yemekler[0]["ogun"],
                "rezervasyon_son": yemekler[0]["rezervasyon_son"],
                "ogrenci_fiyati": yemekler[0]["ogrenci_fiyati"],
                "personel_fiyati": yemekler[0]["personel_fiyati"],
                "toplam_kalori": toplam_kalori,
                "doluluk": doluluk,
                "yemekler": yemekler
            }
    finally:
        conn.close()

def haftalik_menuleri_getir(yemekhane_id, baslangic_tarih, bitis_tarih):
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT d.menu_id, d.tarih, d.yemekhane_id, d.yemekhane, d.ogun_id, d.ogun, "
                "d.kapasite, d.rezerve, d.bos_yer, d.doluluk_yuzde, d.rezervasyon_son, "
                "m.ogrenci_fiyati, m.personel_fiyati, "
                "(d.rezervasyon_son <= NOW()) AS sure_doldu "
                "FROM v_menu_doluluk d "
                "JOIN menuler m ON m.id = d.menu_id "
                "JOIN ogunler o ON o.id = d.ogun_id "
                "WHERE d.yemekhane_id = %s AND d.tarih BETWEEN %s AND %s "
                "ORDER BY d.tarih, o.sira",
                (yemekhane_id, baslangic_tarih, bitis_tarih)
            )
            menuler = cur.fetchall()

            for menu in menuler:
                cur.execute(
                    "SELECT yemek_id, yemek, kategori, kalori, vejetaryen, alerjenler "
                    "FROM v_menu_detay WHERE menu_id = %s ORDER BY kategori_sira, yemek",
                    (menu["menu_id"],)
                )
                menu["yemekler"] = cur.fetchall()
                menu["toplam_kalori"] = sum(int(y["kalori"]) for y in menu["yemekler"])
            return menuler
    finally:
        conn.close()

def rezervasyon_yap(kullanici_id, menu_id):
    sonuc = _proseduru_calistir("sp_rezervasyon_yap", (kullanici_id, menu_id))
    # Doluluk değiştiği için menü önbelleğini temizle
    rk.menu_onbellegi_temizle()
    guncel_kullanici = kullanici_getir_id(kullanici_id, kaynaktan=True)
    return {
        "rezervasyon": sonuc,
        "guncel_bakiye": guncel_kullanici["bakiye"] if guncel_kullanici else sonuc["bakiye"]
    }

def rezervasyon_iptal(kullanici_id, rezervasyon_id):
    sonuc = _proseduru_calistir("sp_rezervasyon_iptal", (kullanici_id, rezervasyon_id))
    # Doluluk değiştiği için menü önbelleğini temizle
    rk.menu_onbellegi_temizle()
    guncel_kullanici = kullanici_getir_id(kullanici_id, kaynaktan=True)
    return {
        "iptal": sonuc,
        "guncel_bakiye": guncel_kullanici["bakiye"] if guncel_kullanici else sonuc["bakiye"]
    }

def turnike_gecis_test(kullanici_id, rezervasyon_id):
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT m.yemekhane_id, CONCAT(m.tarih, ' ', o.servis_baslangic) AS servis_zamani "
                "FROM rezervasyonlar r "
                "JOIN menuler m ON m.id = r.menu_id "
                "JOIN ogunler o ON o.id = m.ogun_id "
                "WHERE r.id = %s AND r.kullanici_id = %s",
                (rezervasyon_id, kullanici_id)
            )
            bilgi = cur.fetchone()
            if not bilgi:
                raise IsKuraliHatasi("Rezervasyon bulunamadı.")
    finally:
        conn.close()

    return _proseduru_calistir(
        "sp_turnike_gecis",
        (kullanici_id, bilgi["yemekhane_id"], str(bilgi["servis_zamani"]))
    )

def kullanici_rezervasyonlari_getir(kullanici_id):
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.id, r.menu_id, r.durum, r.ucret, r.olusturma, r.kullanma_zamani, r.iptal_zamani, "
                "m.tarih, yh.ad AS yemekhane, o.ad AS ogun, "
                "TIMESTAMP(m.tarih, o.son_saat) AS rezervasyon_son, "
                "(TIMESTAMP(m.tarih, o.son_saat) <= NOW()) AS sure_doldu, "
                "d.puan AS verilen_puan, d.yorum AS verilen_yorum "
                "FROM rezervasyonlar r "
                "JOIN menuler m ON m.id = r.menu_id "
                "JOIN yemekhaneler yh ON yh.id = m.yemekhane_id "
                "JOIN ogunler o ON o.id = m.ogun_id "
                "LEFT JOIN degerlendirmeler d ON d.menu_id = r.menu_id AND d.kullanici_id = r.kullanici_id "
                "WHERE r.kullanici_id = %s "
                "ORDER BY m.tarih DESC, o.sira DESC",
                (kullanici_id,)
            )
            return cur.fetchall()
    finally:
        conn.close()

def bakiye_yukle(kullanici_id, tutar):
    sonuc = _proseduru_calistir("sp_bakiye_yukle", (kullanici_id, tutar))
    guncel_kullanici = kullanici_getir_id(kullanici_id, kaynaktan=True)
    return {
        "hareket": sonuc,
        "guncel_bakiye": guncel_kullanici["bakiye"] if guncel_kullanici else sonuc["bakiye"]
    }

def bakiye_hareketleri_getir(kullanici_id):
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, tur, tutar, rezervasyon_id, aciklama, olusturma "
                "FROM bakiye_hareketleri WHERE kullanici_id = %s "
                "ORDER BY olusturma DESC, id DESC LIMIT 50",
                (kullanici_id,)
            )
            return cur.fetchall()
    finally:
        conn.close()

def degerlendirme_kaydet(kullanici_id, menu_id, puan, yorum):
    conn_oku = okuma_baglantisi()
    try:
        with conn_oku.cursor() as cur:
            cur.execute(
                "SELECT durum FROM rezervasyonlar WHERE kullanici_id = %s AND menu_id = %s",
                (kullanici_id, menu_id)
            )
            rez = cur.fetchone()
            if not rez or rez["durum"] != "kullanildi":
                raise IsKuraliHatasi("Yalnızca kullandığınız menüleri değerlendirebilirsiniz.")
    finally:
        conn_oku.close()

    conn_yaz = yazma_baglantisi()
    try:
        with conn_yaz.cursor() as cur:
            cur.execute(
                "INSERT INTO degerlendirmeler (kullanici_id, menu_id, puan, yorum) "
                "VALUES (%s, %s, %s, %s) "
                "ON DUPLICATE KEY UPDATE puan = VALUES(puan), yorum = VALUES(yorum)",
                (kullanici_id, menu_id, puan, yorum)
            )
    finally:
        conn_yaz.close()

def yonetici_raporlari_getir():
    conn = okuma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT d.menu_id, d.tarih, d.yemekhane_id, d.yemekhane, d.ogun_id, d.ogun, "
                "d.kapasite, d.rezerve, d.bos_yer, d.doluluk_yuzde, "
                "m.ogrenci_fiyati, m.personel_fiyati, "
                "COALESCE(p.oy_sayisi, 0) AS oy_sayisi, p.ortalama_puan "
                "FROM v_menu_doluluk d "
                "JOIN menuler m ON m.id = d.menu_id "
                "JOIN ogunler o ON o.id = d.ogun_id "
                "LEFT JOIN v_menu_puan p ON p.menu_id = d.menu_id "
                "ORDER BY d.tarih DESC, d.yemekhane_id, o.sira"
            )
            raporlar = cur.fetchall()
            for r in raporlar:
                cur.execute("SELECT yemek_id FROM menu_yemekleri WHERE menu_id = %s", (r["menu_id"],))
                r["yemek_idler"] = [satir["yemek_id"] for satir in cur.fetchall()]
            return raporlar
    finally:
        conn.close()

def yonetici_menu_kaydet(yemekhane_id, tarih, ogun_id, ogrenci_fiyati, personel_fiyati, yemek_idler):
    if not yemek_idler:
        raise IsKuraliHatasi("Menüde en az bir yemek seçilmelidir.")

    conn = yazma_baglantisi()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM menuler WHERE yemekhane_id = %s AND tarih = %s AND ogun_id = %s",
                (yemekhane_id, tarih, ogun_id)
            )
            mevcut = cur.fetchone()
            if mevcut:
                menu_id = mevcut["id"]
                cur.execute(
                    "UPDATE menuler SET ogrenci_fiyati = %s, personel_fiyati = %s WHERE id = %s",
                    (ogrenci_fiyati, personel_fiyati, menu_id)
                )
                cur.execute("DELETE FROM menu_yemekleri WHERE menu_id = %s", (menu_id,))
            else:
                cur.execute(
                    "INSERT INTO menuler (yemekhane_id, tarih, ogun_id, ogrenci_fiyati, personel_fiyati) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (yemekhane_id, tarih, ogun_id, ogrenci_fiyati, personel_fiyati)
                )
                menu_id = cur.lastrowid

            for y_id in yemek_idler:
                cur.execute(
                    "INSERT INTO menu_yemekleri (menu_id, yemek_id) VALUES (%s, %s)",
                    (menu_id, int(y_id))
                )
            # Menü içeriği veya fiyatı değiştiği için önbelleği temizle
            rk.menu_onbellegi_temizle()
            return menu_id
    finally:
        conn.close()