# 101 Okey Premium - PWA

## 📱 Progressive Web App Özellikleri

Bu oyun artık **PWA (Progressive Web App)** olarak yapılandırılmıştır ve tüm cihazlarda çalışır!

### ✅ Desteklenen Platformlar

- 📱 **iOS** (iPhone, iPad)
- 🤖 **Android** (Telefonlar, Tabletler)
- 💻 **Masaüstü** (Windows, Mac, Linux)
- 🌐 **Tüm Modern Tarayıcılar**

### 🎮 Özellikler

1. **Offline Çalışma** - İnternet olmadan oynanabilir
2. **Ana Ekrana Ekleme** - Uygulama gibi kullanılabilir
3. **Tam Ekran Mod** - Tarayıcı çubukları gizlenir
4. **Responsive Tasarım** - Tüm ekran boyutlarına uyumlu
5. **Landscape Zorunluluğu** - Oyun yatay modda oynanır
6. **Safe Area Desteği** - iPhone X ve üzeri çentikli cihazlarda düzgün görünüm

### 📲 Kurulum Talimatları

#### iOS (iPhone/iPad):
1. Safari'de oyunu açın
2. Paylaş butonuna (📤) tıklayın
3. "Ana Ekrana Ekle" seçeneğini seçin
4. "Ekle" butonuna tıklayın
5. Ana ekranda "Okey 101" ikonu görünecek

#### Android:
1. Chrome'da oyunu açın
2. Menü (⋮) butonuna tıklayın
3. "Ana ekrana ekle" seçeneğini seçin
4. "Ekle" butonuna tıklayın
5. Ana ekranda "Okey 101" ikonu görünecek

#### Masaüstü (Chrome/Edge):
1. Tarayıcıda oyunu açın
2. Adres çubuğundaki yükle simgesine (⊕) tıklayın
3. "Yükle" butonuna tıklayın
4. Uygulama masaüstünde görünecek

### 🎯 Responsive Breakpoints

- **Desktop**: 1200px ve üzeri - Tam boyut
- **Tablet**: 900px - 1200px - Orta boyut
- **Mobile Landscape**: 700px - 900px - Küçük boyut
- **Small Mobile**: 700px ve altı - En küçük boyut
- **Portrait Mode**: Yatay moda çevirme uyarısı gösterilir

### 📁 Dosya Yapısı

```
okey-101/
├── index.html          # Ana HTML dosyası
├── style.css           # Responsive CSS stilleri
├── script.js           # Oyun mantığı + Service Worker kaydı
├── manifest.json       # PWA manifest dosyası
├── service-worker.js   # Offline çalışma için Service Worker
├── icon-192.png        # Küçük ikon (192x192)
├── icon-512.png        # Büyük ikon (512x512)
└── README.md           # Bu dosya
```

### 🚀 Geliştirme

Yerel sunucu ile test etmek için:

```bash
# Python 3
python -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000
```

Tarayıcıda: `http://localhost:8000`

### 🔧 Teknik Detaylar

- **Viewport**: `viewport-fit=cover` - Çentikli cihazlar için
- **User Scalable**: `no` - Zoom kapalı
- **Orientation**: `landscape` - Sadece yatay mod
- **Theme Color**: `#1a4d2e` - Yeşil keçe rengi
- **Cache Strategy**: Cache-first with network fallback

### 📝 Notlar

- Oyun **landscape (yatay)** modda oynanmak üzere tasarlanmıştır
- Portrait (dikey) modda "Lütfen cihazınızı yatay konuma çevirin" mesajı gösterilir
- Service Worker sayesinde offline çalışır
- Tüm dosyalar cache'lenir, hızlı yükleme sağlanır

### 🎨 Görsel Optimizasyonlar

- Performans için ağır shadow'lar kaldırıldı
- Gradient'ler basitleştirildi
- Transition animasyonları optimize edildi
- Tüm cihazlarda 60 FPS hedeflendi

---

**Geliştirici**: Antigravity AI  
**Versiyon**: 1.0.0  
**Son Güncelleme**: 2025-12-22
