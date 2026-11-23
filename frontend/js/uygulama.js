const durum = {
  token: localStorage.getItem("yemekhane_token") || "",
  kullanici: null,
  tanimlar: { yemekhaneler: [], ogunler: [], yemekler: [] },
  aktifSekme: "gunluk"
};

const ROL_ETIKET = {
  ogrenci: "Öğrenci",
  personel: "Personel",
  yonetici: "Yönetici"
};

function tlBicimle(tutar) {
  return Number(tutar || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " TL";
}

function tarihBicimle(tarihStr) {
  if (!tarihStr) return "-";
  const parcalar = tarihStr.split("T")[0].split("-");
  if (parcalar.length !== 3) return tarihStr;
  return `${parcalar[2]}.${parcalar[1]}.${parcalar[0]}`;
}

function tarihSaatBicimle(dtStr) {
  if (!dtStr) return "-";
  const [tarih, saat] = dtStr.replace("T", " ").split(" ");
  return `${tarihBicimle(tarih)} ${(saat || "").slice(0, 5)}`;
}

function bugunIso() {
  const simdi = new Date();
  const yil = simdi.getFullYear();
  const ay = String(simdi.getMonth() + 1).padStart(2, "0");
  const gun = String(simdi.getDate()).padStart(2, "0");
  return `${yil}-${ay}-${gun}`;
}

function bildirimGoster(mesaj, tur = "basari") {
  const kutu = document.getElementById("genel-bildirim");
  kutu.textContent = mesaj;
  kutu.className = `bildirim bildirim-${tur}`;
  kutu.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function bildirimGizle() {
  const kutu = document.getElementById("genel-bildirim");
  kutu.className = "bildirim gizli";
}

async function apiIstegi(yol, secenekler = {}) {
  const headers = { "Accept": "application/json", ...(secenekler.headers || {}) };
  if (durum.token) {
    headers["Authorization"] = `Bearer ${durum.token}`;
  }
  if (secenekler.body && typeof secenekler.body === "object") {
    headers["Content-Type"] = "application/json";
    secenekler.body = JSON.stringify(secenekler.body);
  }

  const yanit = await fetch(yol, { ...secenekler, headers });
  const veri = await yanit.json().catch(() => ({}));

  if (yanit.status === 401 && yol !== "/api/giris") {
    oturumuKapat();
    throw new Error(veri.hata || "Oturum süresi doldu.");
  }
  if (!yanit.ok) {
    throw new Error(veri.hata || "İşlem başarısız oldu.");
  }
  return veri;
}

function ustBilgiGuncelle() {
  if (!durum.kullanici) return;
  document.getElementById("ust-kullanici-ad").textContent = `${durum.kullanici.ad} ${durum.kullanici.soyad}`;
  document.getElementById("ust-kullanici-rol").textContent = ROL_ETIKET[durum.kullanici.rol] || durum.kullanici.rol;
  document.getElementById("ust-kullanici-bakiye").textContent = tlBicimle(durum.kullanici.bakiye);
  document.getElementById("bakiye-ekran-tutar").textContent = tlBicimle(durum.kullanici.bakiye);

  const yonBtn = document.getElementById("sekme-yonetici-btn");
  if (durum.kullanici.rol === "yonetici") {
    yonBtn.classList.remove("gizli");
  } else {
    yonBtn.classList.add("gizli");
  }
}

function kullaniciUcreti(menu) {
  return durum.kullanici.rol === "ogrenci" ? menu.ogrenci_fiyati : menu.personel_fiyati;
}

function oturumuKapat() {
  durum.token = "";
  durum.kullanici = null;
  localStorage.removeItem("yemekhane_token");
  document.getElementById("uygulama-ekrani").classList.add("gizli");
  document.getElementById("giris-ekrani").classList.remove("gizli");
}

async function uygulamayiBaslat() {
  document.getElementById("giris-ekrani").classList.add("gizli");
  document.getElementById("uygulama-ekrani").classList.remove("gizli");
  ustBilgiGuncelle();

  const tanimVeri = await apiIstegi("/api/tanimlar");
  durum.tanimlar = tanimVeri;

  const bugun = bugunIso();
  ["gunluk-yemekhane", "haftalik-yemekhane", "yon-yemekhane"].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = durum.tanimlar.yemekhaneler
      .map(y => `<option value="${y.id}">${y.ad} (Kapasite: ${y.kapasite})</option>`)
      .join("");
  });

  ["gunluk-ogun", "yon-ogun"].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = durum.tanimlar.ogunler
      .map(o => `<option value="${o.id}" ${o.id === 2 ? "selected" : ""}>${o.ad} (Son: ${o.son_saat})</option>`)
      .join("");
  });

  document.getElementById("gunluk-tarih").value = bugun;
  document.getElementById("haftalik-baslangic").value = bugun;
  document.getElementById("yon-tarih").value = bugun;

  const yemekListesiAlani = document.getElementById("yon-yemek-listesi");
  yemekListesiAlani.innerHTML = durum.tanimlar.yemekler.map(y => `
    <label class="yemek-secim-satir">
      <input type="checkbox" name="yon_yemek" value="${y.id}">
      <span><strong>[${y.kategori}]</strong> ${y.ad} (${y.kalori} kcal)</span>
    </label>
  `).join("");

  sekmeAc("gunluk");
}

function sekmeAc(sekmeAdi) {
  durum.aktifSekme = sekmeAdi;
  bildirimGizle();

  document.querySelectorAll(".sekme-dugme").forEach(btn => {
    btn.classList.toggle("aktif", btn.dataset.sekme === sekmeAdi);
  });
  document.querySelectorAll(".sekme-icerik").forEach(bolum => {
    bolum.classList.toggle("gizli", bolum.id !== `ekran-${sekmeAdi}`);
  });

  if (sekmeAdi === "gunluk") gunlukMenuYukle();
  if (sekmeAdi === "haftalik") haftalikMenuYukle();
  if (sekmeAdi === "rezervasyonlar") rezervasyonlariYukle();
  if (sekmeAdi === "bakiye") bakiyeEkraniniYukle();
  if (sekmeAdi === "degerlendirme") degerlendirmeEkraniniYukle();
  if (sekmeAdi === "yonetici") yoneticiRaporunuYukle();
}

// --- 2. GÜNÜN MENÜSÜ ---
async function gunlukMenuYukle() {
  const alan = document.getElementById("gunluk-menu-alani");
  alan.innerHTML = `<div class="kart">Menü yükleniyor...</div>`;
  try {
    const yh = document.getElementById("gunluk-yemekhane").value;
    const tarih = document.getElementById("gunluk-tarih").value;
    const ogun = document.getElementById("gunluk-ogun").value;
    const veri = await apiIstegi(`/api/menu/gunluk?yemekhane_id=${yh}&tarih=${tarih}&ogun_id=${ogun}`);

    if (!veri.menu) {
      alan.innerHTML = `<div class="kart"><p style="margin:0;">Seçilen tarih ve öğün için tanımlı menü bulunamadı.</p></div>`;
      return;
    }

    const m = veri.menu;
    const d = m.doluluk;
    const ucret = kullaniciUcreti(m);
    const sureDoldu = new Date(m.rezervasyon_son.replace(" ", "T")) <= new Date();
    const yerYok = Number(d.bos_yer) <= 0;
    const pasifMi = sureDoldu || yerYok;

    alan.innerHTML = `
      <div class="kart">
        <div class="menu-baslik">
          <div>
            <h3 style="margin-bottom:0.2rem;">${m.yemekhane} · ${m.ogun}</h3>
            <span style="color:var(--metin-soluk); font-size:var(--boyut-kucuk);">${tarihBicimle(m.tarih)} · Son Rezervasyon: ${tarihSaatBicimle(m.rezervasyon_son)}</span>
          </div>
          <span class="rozet rozet-bakiye" style="font-size:1rem;">${tlBicimle(ucret)}</span>
        </div>

        ${m.ozel_not ? `<p class="bildirim bildirim-basari" style="margin-bottom:0.85rem;"><strong>Duyuru:</strong> ${m.ozel_not}</p>` : ""}

        <div class="menu-bilgi-seridi">
          <span class="rozet">Toplam: <strong>${m.toplam_kalori} kcal</strong></span>
          <span class="rozet">Doluluk: <strong>${d.rezerve}/${d.kapasite}</strong> (%${d.doluluk_yuzde})</span>
          <span class="rozet">Boş Yer: <strong>${d.bos_yer}</strong></span>
        </div>

        <ul class="yemek-listesi">
          ${m.yemekler.map(y => `
            <li class="yemek-satir">
              <div class="yemek-sol">
                <div class="yemek-kategori">${y.kategori}</div>
                <div class="yemek-ad">${y.yemek} ${y.vejetaryen ? '<span class="rozet rozet-vejetaryen">Vejetaryen</span>' : ''}</div>
                ${y.alerjenler ? `<div class="alerjen-metin">Alerjenler: ${y.alerjenler}</div>` : ''}
              </div>
              <div style="font-weight:600; color:var(--metin-soluk);">${y.kalori} kcal</div>
            </li>
          `).join("")}
        </ul>

        <button type="button" class="dugme rez-yap-btn" data-menu-id="${m.menu_id}" ${pasifMi ? "disabled" : ""}>
          ${sureDoldu ? "Rezervasyon Süresi Doldu" : (yerYok ? "Kapasite Dolu" : `Rezervasyon Yap (${tlBicimle(ucret)})`)}
        </button>
      </div>
    `;
  } catch (err) {
    alan.innerHTML = `<div class="bildirim bildirim-hata">${err.message}</div>`;
  }
}

// --- 3. HAFTALIK MENÜ ---
async function haftalikMenuYukle() {
  const alan = document.getElementById("haftalik-menu-alani");
  alan.innerHTML = `<div class="kart">Haftalık program yükleniyor...</div>`;
  try {
    const yh = document.getElementById("haftalik-yemekhane").value;
    const baslangic = document.getElementById("haftalik-baslangic").value;
    const veri = await apiIstegi(`/api/menu/haftalik?yemekhane_id=${yh}&baslangic=${baslangic}`);

    if (!veri.menuler || veri.menuler.length === 0) {
      alan.innerHTML = `<div class="kart"><p style="margin:0;">Bu tarih aralığında tanımlı menü bulunamadı.</p></div>`;
      return;
    }

    alan.innerHTML = veri.menuler.map(m => {
      const ucret = kullaniciUcreti(m);
      const pasifMi = Boolean(m.sure_doldu) || Number(m.bos_yer) <= 0;
      const yemekOzet = m.yemekler.map(y => `${y.yemek} (${y.kalori} kcal)`).join(" • ");
      return `
        <div class="kart">
          <div class="menu-baslik">
            <div>
              <strong>${tarihBicimle(m.tarih)} — ${m.ogun}</strong>
              <div style="font-size:var(--boyut-kucuk); color:var(--metin-soluk);">
                Boş Yer: ${m.bos_yer}/${m.kapasite} · Toplam: ${m.toplam_kalori} kcal · Son: ${tarihSaatBicimle(m.rezervasyon_son)}
              </div>
            </div>
            <span class="rozet rozet-bakiye">${tlBicimle(ucret)}</span>
          </div>
          ${m.ozel_not ? `<p style="font-size:var(--boyut-kucuk); color:var(--basari); margin-bottom:0.5rem;"><strong>Duyuru:</strong> ${m.ozel_not}</p>` : ""}
          <p style="font-size:var(--boyut-kucuk); margin-bottom:0.75rem;">${yemekOzet}</p>
          <button type="button" class="dugme dugme-kucuk rez-yap-btn" data-menu-id="${m.menu_id}" ${pasifMi ? "disabled" : ""}>
            ${m.sure_doldu ? "Süre Doldu" : (m.bos_yer <= 0 ? "Dolu" : "Rezervasyon Yap")}
          </button>
        </div>
      `;
    }).join("");
  } catch (err) {
    alan.innerHTML = `<div class="bildirim bildirim-hata">${err.message}</div>`;
  }
}

async function rezervasyonYapIstegi(menuId) {
  bildirimGizle();
  try {
    const sonuc = await apiIstegi("/api/rezervasyonlar", {
      method: "POST",
      body: { menu_id: Number(menuId) }
    });
    durum.kullanici.bakiye = sonuc.guncel_bakiye;
    ustBilgiGuncelle();
    bildirimGoster(`Rezervasyonunuz oluşturuldu. Yeni bakiyeniz: ${tlBicimle(sonuc.guncel_bakiye)}`, "basari");
    if (durum.aktifSekme === "gunluk") gunlukMenuYukle();
    if (durum.aktifSekme === "haftalik") haftalikMenuYukle();
  } catch (err) {
    bildirimGoster(err.message, "hata");
  }
}

// --- 4. REZERVASYONLARIM ---
async function rezervasyonlariYukle() {
  const alan = document.getElementById("rezervasyonlar-alani");
  alan.innerHTML = `<p>Yükleniyor...</p>`;
  try {
    const veri = await apiIstegi("/api/rezervasyonlar");
    if (!veri.rezervasyonlar.length) {
      alan.innerHTML = `<p style="margin:0;">Henüz rezervasyonunuz bulunmuyor.</p>`;
      return;
    }

    alan.innerHTML = `
      <div class="tablo-kaydir">
        <table class="veri-tablo">
          <thead>
            <tr>
              <th>Tarih / Öğün</th>
              <th>Yemekhane</th>
              <th>Ücret</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${veri.rezervasyonlar.map(r => `
              <tr>
                <td><strong>${tarihBicimle(r.tarih)}</strong><br>${r.ogun}</td>
                <td>${r.yemekhane}</td>
                <td>${tlBicimle(r.ucret)}</td>
                <td><span class="rozet rozet-${r.durum}">${r.durum.toUpperCase()}</span></td>
                <td>
                  ${r.durum === "aktif" ? `
                    <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
                      ${!r.sure_doldu ? `<button type="button" class="dugme dugme-tehlike dugme-kucuk rez-iptal-btn" data-rez-id="${r.id}">İptal Et</button>` : ""}
                      <button type="button" class="dugme dugme-ikincil dugme-kucuk turnike-test-btn" data-rez-id="${r.id}">Turnike Okut (Test)</button>
                    </div>
                  ` : "-"}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    alan.innerHTML = `<div class="bildirim bildirim-hata">${err.message}</div>`;
  }
}

// --- 5. BAKİYE İŞLEMLERİ ---
async function bakiyeEkraniniYukle() {
  const alan = document.getElementById("bakiye-hareketleri-alani");
  alan.innerHTML = `<p>Hareketler yükleniyor...</p>`;
  try {
    const veri = await apiIstegi("/api/bakiye");
    durum.kullanici.bakiye = veri.bakiye;
    ustBilgiGuncelle();

    if (!veri.hareketler.length) {
      alan.innerHTML = `<p style="margin:0;">Henüz bakiye hareketi yok.</p>`;
      return;
    }

    alan.innerHTML = `
      <div class="tablo-kaydir">
        <table class="veri-tablo">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Tür</th>
              <th>Açıklama</th>
              <th>Tutar</th>
            </tr>
          </thead>
          <tbody>
            ${veri.hareketler.map(h => `
              <tr>
                <td>${tarihSaatBicimle(h.olusturma)}</td>
                <td>${h.tur.toUpperCase()}</td>
                <td>${h.aciklama || "-"}</td>
                <td class="${Number(h.tutar) >= 0 ? "tutar-arti" : "tutar-eksi"}">
                  ${Number(h.tutar) >= 0 ? "+" : ""}${tlBicimle(h.tutar)}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    alan.innerHTML = `<div class="bildirim bildirim-hata">${err.message}</div>`;
  }
}

// --- 6. DEĞERLENDİRME ---
async function degerlendirmeEkraniniYukle() {
  const alan = document.getElementById("degerlendirme-alani");
  alan.innerHTML = `<p>Kullanılmış menüler yükleniyor...</p>`;
  try {
    const veri = await apiIstegi("/api/rezervasyonlar");
    const kullanilanlar = veri.rezervasyonlar.filter(r => r.durum === "kullanildi");

    if (!kullanilanlar.length) {
      alan.innerHTML = `<p style="margin:0;">Değerlendirilebilecek kullanılmış rezervasyonunuz yok. Rezervasyonlarım sekmesinden "Turnike Okut (Test)" ile test edebilirsiniz.</p>`;
      return;
    }

    alan.innerHTML = kullanilanlar.map(r => `
      <form class="kart deg-form" data-menu-id="${r.menu_id}">
        <h3>${tarihBicimle(r.tarih)} · ${r.yemekhane} (${r.ogun})</h3>
        <div class="filtre-izgara">
          <div>
            <label>Puan (1 – 5)</label>
            <select name="puan" required>
              ${[5, 4, 3, 2, 1].map(p => `<option value="${p}" ${Number(r.verilen_puan) === p ? "selected" : ""}>${p} Yıldız</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Yorum (İsteğe bağlı)</label>
            <input type="text" name="yorum" maxlength="500" value="${r.verilen_yorum || ""}" placeholder="Yemekler nasıldı?">
          </div>
          <div>
            <button type="submit" class="dugme" style="width:100%;">Kaydet</button>
          </div>
        </div>
      </form>
    `).join("");
  } catch (err) {
    alan.innerHTML = `<div class="bildirim bildirim-hata">${err.message}</div>`;
  }
}

// --- 7. YÖNETİCİ PANELİ ---
async function yoneticiRaporunuYukle() {
  const alan = document.getElementById("yonetici-rapor-alani");
  alan.innerHTML = `<p>Rapor yükleniyor...</p>`;
  try {
    const veri = await apiIstegi("/api/yonetici/rapor");
    alan.innerHTML = `
      <div class="tablo-kaydir">
        <table class="veri-tablo">
          <thead>
            <tr>
              <th>Tarih / Öğün</th>
              <th>Yemekhane</th>
              <th>Doluluk</th>
              <th>Fiyat (Öğr / Per)</th>
              <th>Ortalama Puan</th>
              <th>Özel Not</th>
            </tr>
          </thead>
          <tbody>
            ${veri.menuler.map(m => `
              <tr>
                <td><strong>${tarihBicimle(m.tarih)}</strong><br>${m.ogun}</td>
                <td>${m.yemekhane}</td>
                <td>${m.rezerve}/${m.kapasite} (%${m.doluluk_yuzde})</td>
                <td>${tlBicimle(m.ogrenci_fiyati)} / ${tlBicimle(m.personel_fiyati)}</td>
                <td>${m.oy_sayisi > 0 ? `${m.ortalama_puan} / 5 (${m.oy_sayisi} oy)` : "Henüz oy yok"}</td>
                <td>${m.ozel_not || "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    alan.innerHTML = `<div class="bildirim bildirim-hata">${err.message}</div>`;
  }
}

// --- OLAY DİNLEYİCİLERİ ---
document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".hizli-giris").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("giris-eposta").value = btn.dataset.eposta;
      document.getElementById("giris-sifre").value = "Yemek2026!";
    });
  });

  document.getElementById("giris-formu").addEventListener("submit", async (e) => {
    e.preventDefault();
    const hataKutu = document.getElementById("giris-bildirim");
    hataKutu.classList.add("gizli");
    try {
      const sonuc = await apiIstegi("/api/giris", {
        method: "POST",
        body: {
          eposta: document.getElementById("giris-eposta").value,
          sifre: document.getElementById("giris-sifre").value
        }
      });
      durum.token = sonuc.token;
      durum.kullanici = sonuc.kullanici;
      localStorage.setItem("yemekhane_token", sonuc.token);
      await uygulamayiBaslat();
    } catch (err) {
      hataKutu.textContent = err.message;
      hataKutu.classList.remove("gizli");
    }
  });

  document.getElementById("cikis-dugmesi").addEventListener("click", async () => {
    await apiIstegi("/api/cikis", { method: "POST" }).catch(() => {});
    oturumuKapat();
  });

  document.querySelectorAll(".sekme-dugme").forEach(btn => {
    btn.addEventListener("click", () => sekmeAc(btn.dataset.sekme));
  });

  document.getElementById("gunluk-getir-btn").addEventListener("click", gunlukMenuYukle);
  document.getElementById("haftalik-getir-btn").addEventListener("click", haftalikMenuYukle);
  document.getElementById("rez-yenile-btn").addEventListener("click", rezervasyonlariYukle);
  document.getElementById("yon-rapor-yenile").addEventListener("click", yoneticiRaporunuYukle);

  document.querySelectorAll(".hizli-tutar").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("bakiye-tutar-input").value = btn.dataset.tutar;
    });
  });

  document.getElementById("bakiye-yukle-formu").addEventListener("submit", async (e) => {
    e.preventDefault();
    bildirimGizle();
    try {
      const tutar = Number(document.getElementById("bakiye-tutar-input").value);
      const sonuc = await apiIstegi("/api/bakiye/yukle", {
        method: "POST",
        body: { tutar }
      });
      durum.kullanici.bakiye = sonuc.guncel_bakiye;
      ustBilgiGuncelle();
      document.getElementById("bakiye-tutar-input").value = "";
      bildirimGoster(`Bakiye yüklendi. Yeni bakiye: ${tlBicimle(sonuc.guncel_bakiye)}`, "basari");
      bakiyeEkraniniYukle();
    } catch (err) {
      bildirimGoster(err.message, "hata");
    }
  });

  document.getElementById("yonetici-menu-formu").addEventListener("submit", async (e) => {
    e.preventDefault();
    bildirimGizle();
    const seciliYemekler = Array.from(document.querySelectorAll('input[name="yon_yemek"]:checked'))
      .map(cb => Number(cb.value));

    try {
      const sonuc = await apiIstegi("/api/yonetici/menu", {
        method: "POST",
        body: {
          yemekhane_id: Number(document.getElementById("yon-yemekhane").value),
          tarih: document.getElementById("yon-tarih").value,
          ogun_id: Number(document.getElementById("yon-ogun").value),
          ogrenci_fiyati: Number(document.getElementById("yon-ogr-fiyat").value),
          personel_fiyati: Number(document.getElementById("yon-per-fiyat").value),
          ozel_not: document.getElementById("yon-ozel-not").value,
          yemek_idler: seciliYemekler
        }
      });
      bildirimGoster(sonuc.mesaj, "basari");
      yoneticiRaporunuYukle();
    } catch (err) {
      bildirimGoster(err.message, "hata");
    }
  });

  document.body.addEventListener("click", async (e) => {
    const rezBtn = e.target.closest(".rez-yap-btn");
    if (rezBtn) {
      await rezervasyonYapIstegi(rezBtn.dataset.menuId);
      return;
    }

    const iptalBtn = e.target.closest(".rez-iptal-btn");
    if (iptalBtn) {
      bildirimGizle();
      try {
        const sonuc = await apiIstegi(`/api/rezervasyonlar/${iptalBtn.dataset.rezId}/iptal`, { method: "POST" });
        durum.kullanici.bakiye = sonuc.guncel_bakiye;
        ustBilgiGuncelle();
        bildirimGoster(`Rezervasyon iptal edildi ve ${tlBicimle(sonuc.iptal.iade)} iade edildi.`, "basari");
        rezervasyonlariYukle();
      } catch (err) {
        bildirimGoster(err.message, "hata");
      }
      return;
    }

    const turnikeBtn = e.target.closest(".turnike-test-btn");
    if (turnikeBtn) {
      bildirimGizle();
      try {
        const sonuc = await apiIstegi(`/api/rezervasyonlar/${turnikeBtn.dataset.rezId}/turnike-test`, { method: "POST" });
        bildirimGoster(`Turnike geçişi tamamlandı (${sonuc.ogun}). Artık Değerlendirme sekmesinden puan verebilirsiniz.`, "basari");
        rezervasyonlariYukle();
      } catch (err) {
        bildirimGoster(err.message, "hata");
      }
    }
  });

  document.body.addEventListener("submit", async (e) => {
    const degForm = e.target.closest(".deg-form");
    if (!degForm) return;
    e.preventDefault();
    bildirimGizle();
    try {
      const sonuc = await apiIstegi("/api/degerlendirmeler", {
        method: "POST",
        body: {
          menu_id: Number(degForm.dataset.menuId),
          puan: Number(degForm.querySelector('[name="puan"]').value),
          yorum: degForm.querySelector('[name="yorum"]').value
        }
      });
      bildirimGoster(sonuc.mesaj, "basari");
    } catch (err) {
      bildirimGoster(err.message, "hata");
    }
  });

  if (durum.token) {
    try {
      const veri = await apiIstegi("/api/ben");
      durum.kullanici = veri.kullanici;
      await uygulamayiBaslat();
    } catch {
      oturumuKapat();
    }
  }
});