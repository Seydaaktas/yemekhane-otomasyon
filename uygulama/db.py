import os
import pymysql

def _baglanti_olustur(host):
    return pymysql.connect(
        host=host,
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_KULLANICI", "yemekhane_app"),
        password=os.getenv("DB_SIFRE", "Uyg_2026"),
        database=os.getenv("DB_ADI", "yemekhane"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

def yazma_baglantisi():
    return _baglanti_olustur(os.getenv("DB_YAZMA_HOST", "mysql-primary"))

def okuma_baglantisi():
    return _baglanti_olustur(os.getenv("DB_OKUMA_HOST", "mysql-replica"))