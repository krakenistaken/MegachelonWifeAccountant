# Ön Muhasebe & Maaş Takip Sistemi

Modern, hızlı ve zengin özelliklere sahip tam kapsamlı işletme ön muhasebe ve personel maaş/yoklama yönetim sistemi.

---

## 🚀 Özellikler

### 1. 📊 Ana Panel & Dönemsel Özet
- **Genel Bakış:** Toplam Gelir, Toplam Gider, Net Bakiye ve Kasa Dağılımı KPI kartları.
- **Dönemsel Analiz:** Bu Hafta, Geçen Hafta, Bu Ay, Geçen Ay, Bu Yıl ve Özel Tarih aralıkları için gelir-gider karşılaştırması.
- **Görsel Grafikler:** SVG Donut (Kategori Dağılımı) ve SVG Bar (Karşılaştırmalı trend) grafikleri.
- **Dışa Aktarım (Export):** Tek tıkla çok sayfalı **Excel (.xlsx)** ve **UTF-8 Türkçe uyumlu CSV (.csv)** rapor indirme.

### 2. 💸 Gelir & Gider İşlemleri
- Kategori, Kasa, Para Birimi, Tutar ve Açıklama ile hızlı işlem girişi.
- Arama, tip (Gelir/Gider), kategori ve tarih aralığına göre anlık filtreleme.
- Excel ve CSV dışa aktarım desteği.

### 3. 🏦 Kasalar & Bakiye Yönetimi
- Birden fazla kasa/hesap tanımlama (Nakit Kasa, Banka Hesabı, Pos vb.).
- Kasaya özel geçmiş işlem dökümü ve anlık bakiye takibi.
- Kasalar arası virman / transfer desteği.

### 4. 👥 Maaş, Personel & Günlük Yoklama
- **Personel Yönetimi:** İsim, soyisim, varsayılan günlük yevmiye (₺), telefon ve aktiflik takibi.
- **Günlük Yoklama:**
  - `✓ Geldi` ve `✗ Gelmedi` durumları.
  - **3 Ayrı Ödeme Durumu:**
    1. **✓ Tam Ödendi (Yeşil):** Yevmiyenin tamamı ödendi.
    2. **⚡ Kısmi Ödendi (Mavi):** O güne özel ödenen tutar (₺) girişi ve kalan borç hesabı.
    3. **✗ Ödenmedi (Sarı):** Ödeme yapılmadı / bekliyor.
  - **Kasa Seçimi:** Tanımlı kasalardan birini seçerek tutarı kasadan otomatik düşme veya kasa seçmeden elden/harici ödeme kaydı.
- **İnteraktif Aylık Çalışma Takvimi:**
  - Personel adına tıklandığında açılan takvim modalı.
  - 🟢 Tam Ödendi, 🔵 Kısmi Ödendi, 🟡 Ödenmedi (Bekleyen), 🔴 Devamsız (Gelmedi) renk kodlamaları.
  - Aylık hakediş, ödenen ve kalan alacak metrikleri.
- **Aylık Hakediş Bordrosu & Export:**
  - Ay bazlı personel hak ediş, ödenen ve kalan borç tablosu.
  - Excel ve CSV bordro dökümü indirme.

### 5. ⚡ Gerçek Zamanlı Güncellemeler (SSE)
- Server-Sent Events (SSE) ile sekmeler ve kullanıcılar arası anlık bakiye ve işlem senkronizasyonu.

---

## 🛠️ Kurulum ve Çalıştırma

### Gereksinimler
- Node.js 18+ veya 20+
- npm, pnpm veya yarn

### Adımlar

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. Geliştirme sunucusunu başlatın:
```bash
npm run dev
```

3. Tarayıcınızda açın:
```
http://localhost:3000
```

### 🔐 Varsayılan Giriş Bilgileri
- **Kullanıcı Adı:** `admin`
- **Şifre:** `admin123`

---

## 📁 Teknolojiler
- **Framework:** Next.js 16 (App Router) + React 19
- **Stil:** Tailwind CSS + Headless UI + Custom Vanilla SVG Charts
- **Veritabanı:** SQLite (better-sqlite3) + WAL Mode + Foreign Keys
- **Gerçek Zamanlı:** Server-Sent Events (SSE)
- **Export:** SheetJS (xlsx) + UTF-8 BOM CSV
