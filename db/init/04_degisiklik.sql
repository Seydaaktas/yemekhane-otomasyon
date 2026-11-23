SET NAMES utf8mb4;
USE yemekhane;

-- Menülere yönetici tarafından girilebilecek özel not / duyuru alanı eklenir
ALTER TABLE menuler
    ADD COLUMN ozel_not VARCHAR(200) NULL AFTER personel_fiyati;

-- Bugünün öğle menülerine örnek duyuru notu eklenir
UPDATE menuler
   SET ozel_not = 'Bugüne özel ücretsiz ayran ikramı dahildir.'
 WHERE tarih = CURDATE() AND ogun_id = 2;