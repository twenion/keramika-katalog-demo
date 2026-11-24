# Səth — Keramika, Kafel və Metlax Kataloq Demosu

## Konsept: «Hörgü» (Döşəmə düzümü və fuga toru)

Kafel satıcısının əsl işi tək bir keramik parçanı bütöv memarlıq səthinə çevirməkdir. **Səth** demosu bu keçidi bütün səhifələrdə mərkəzə qoyur: ana səhifənin tam ekranlı perspektiv hero-sunda kafellər tək-tək məhlul yatağına oturur, fuga xətləri çəkilir və hər material öz döşəmə düzümü ilə açılır (`Xəzər Mərmər` düz ızgara, `Buta` mərkəzdən açılan metlax naxışı, `Palıd` siyənək/herringbone, `Zeytun` yarım sürüşdürmə). Scroll sekansı («Bir kafeldən otağa») tək bir parçadan `1 m²` ölçülü çərçivəyə və bütöv otaq səthinə keçərək `boxesFor` qutu hesabını (+10% kəsim ehtiyatı) canlı göstərir. Rəng palitrası əhəng suvağı (`#ECE8E1`), gil astarı (`#F3F0EA`), bazalt mürəkkəb (`#1C1B19`) və tək dərin kürə oksidi (`#843620`) üzərində qurulub — saf ağ zəmin, çəhrayı və digər Twenion demolarının görünüşü istifadə edilməyib. Tipografiya: self-hosted OFL dəyişkən fontlar **Source Serif 4** (display) + **Source Sans 3** (mətn və cədvəl rəqəmləri), tam Azərbaycan (`ə Ə ğ Ğ ı İ ö Ö ü Ü ç Ç ş Ş`) və Kiril (RU) örtüyü ilə.

### Qonşu demoların yoxlanışı (fərqləndirmə qeydi)

| Demo | Palitra | Fontlar | Səth fərqi |
| --- | --- | --- | --- |
| Təməl (`tikinti-market-demo`) | `#f4f2ef` + `#fff` + narıncı `#e8590c` | Inter | Saf ağ kart yoxdur, narıncı yoxdur |
| Qat (`qat-market-demo`) | Qara `#0b0d11` + neon laym `#d4f53c` | Unbounded, Onest | İşıqlı əhəng suvağı, neon yoxdur |
| KÜLƏK (`kulek-etir-demo`) | Tünd dəniz `#1d3b47` + buz mavi `#8fd3e8` | Libre Bodoni, Albert Sans | Açıq memarlıq toru, tünd mavi yoxdur |
| HƏRF (`herf-klaviatura-demo`) | Sümük `#e6e0d3` + kobalt `#2c48d6` | Unbounded, Onest | Kobalt və klaviatura düymə kölgəsi yoxdur |
| Flame Express (`flame-express-demo`) | Kömür `#120f0d` + alov `#e84a12/#ff991c` | Fira Sans Condensed, IBM Plex Sans | İşıqlı mat səth, alov narıncısı yoxdur |

## Səhifələr

- `index.html` — Ana səhifə: tam ekranlı «Hörgü» 3D perspektiv kafel döşəmə hero-su (4 material + 4 düzüm), scroll-a bağlı «Bir kafeldən otağa» sekansı + canlı qutu hesabı, asimmetrik 6 parçalı «Seçilmiş məhsullar» stendi, kateqoriya cədvəli.
- `katalog/index.html` — Kataloq: AZ/RU/EN normallaşdırılmış canlı axtarış (`mermer` → `Mərmər`), 5 faset üzrə canlı sayğaclı filtrlər (kateqoriya, ölçü, səth, rəng, istifadə yeri), FLIP animasiyalı asimmetrik tor və siyahı görünüşü, dizayn olunmuş boş vəziyyət, mobil filtr paneli.
- `mehsul/index.html?id=<id>` — Məhsul səhifəsi: real nisbətli ölçü xətkeşli stend, texniki göstəricilər toru, canlı qutu hesabı (`m² → qutu`, +10% kəsim ehtiyatı), WhatsApp düyməsi (yer tutucu nömrə ilə), interaktiv **«Səthdə bax»** perspektiv vizuallaşdırıcısı (Döşəmə/Divar, Düz / Yarım sürüşdürmə / Siyənək, 4 fuga rəngi, 2 mm / 4 mm fuga eni) və bənzər məhsullar.
- `admin/index.html` — Demo idarəetmə paneli (dəyişikliklər yalnız `localStorage["seth.overlay"]`-da saxlanılır): sürüklə-burax `.xlsx` idxalı + sətir xətalarını qırmızı göstərən önizləmə cədvəli + «Əlavə et», `data/numune.xlsx` endirmə linki, məhsul əlavə/redaktə/silmə (şəkil yükləmə və kiçiltmə ilə), JSON ixracı və sıfırlama.

## İşə salma

```bash
python -m http.server 8080 --bind 127.0.0.1
```

Sonra brauzerdə `http://127.0.0.1:8080/` açın. (ES modulları və `fetch` istifadə edildiyi üçün `file://` ilə deyil, lokal HTTP serverlə açılmalıdır.)

## Real olanlar / Şirkətdən lazım olanlar

- **Demoda işləyən real mexanika:** 3 dilli (AZ/RU/EN) canlı dil seçici (`?lang=` + `localStorage`), 5 fasetli canlı filtrləmə, FLIP keçidləri, qutu kalkulyatoru, «Səthdə bax» perspektiv mühərriki, brauzerdə kitabxanasız `.xlsx` oxuma (`js/core/xlsx.js`), admin dəyişikliklərinin dərhal kataloqda və məhsul səhifəsində əks olunması (`store.loadProducts`).
- **Real layihədə şirkətdən lazım olanlar:** real şirkət adı, loqo, salon ünvanı və iş saatları; real WhatsApp nömrəsi (hazırda görünən yer tutucu `+994 00 000 00 00`); ~500 məhsulun Excel cədvəli və yüksək keyfiyyətli kafel fotoları; qiymət/stok göstəriləcəksə onun formatı; real domen (hazırda canonical `https://example.az/`).
- **SEO / İstehsal arxitekturası qeydi:** Demoda bütün məhsul səhifələri `/mehsul/index.html?id=<id>` üzərindən klient tərəfində JS ilə çəkilir və `<meta name="robots" content="noindex">` qoyulub. Real layihədə hər məhsul səhifəsi server tərəfində (məs., **Cloudflare Pages + D1**) ayrıca təmiz URL (`/mehsul/<id>/`) və məhsula xas `Product` JSON-LD / Open Graph meta teqləri ilə generasiya olunur; `admin/` hissəsi autentifikasiya (Cloudflare Access və ya sessiya) arxasına alınır və şəkillər R2-yə yüklənir.

## Bütçe ölçümleri (24.11.2026)

| Metrika | Ölçülən | Hədd | Status |
| --- | --- | --- | --- |
| Ana səhifə `index.html` | `8.2 KB` | `< 60 KB` | OK |
| Cəmi CSS + JS (sıkıştırmasız: CSS `51.6 KB`, `js/ui` `122.8 KB`, `js/core` `23.4 KB`) | `197.8 KB` | `< 200 KB` | OK |
| Ana səhifə ilkin yükləmə (HTML + CSS + JS + fontlar + WebP kafel fotoları) | `1,104 KB` (~1.08 MB) | `< 1,500 KB` | OK |
| Self-hosted WOFF2 fontlar (6 fayl: `Source Serif 4` + `Source Sans 3`, latin + latin-ext + cyrillic) | `231.6 KB` | — | OK |

## i18n keys needed

Hal-hazırda bütün UI mətnləri `data/i18n.json` mövcud açarlarından oxunur (`console.warn` = 0, əskik açar = 0). Gələcəkdə əlavə təkmilləşdirmə üçün istəyə bağlı açarlar:
- `visualizer.grout.ivory`, `visualizer.grout.cement`, `visualizer.grout.basalt`, `visualizer.grout.oxide` (fuga rəng dairələrinin `aria-label` adları hazırda qısa rəng kodu ilədir).

## Core requests

`js/core/` sözləşməsi bütün UI axınlarını tam qarşıladı; heç bir çatışmazlıq tapılmadı. Yalnız bir kiçik rahatlıq qeydi:
- `js/core/store.js`: hazırda `loadProducts()` yalnız məhsul massivini qaytarır, `categories` və `facets` üçün UI `data/products.json`-u ayrıca bir dəfə oxuyur (`js/ui/data.js`). İstəyə bağlı olaraq `loadCatalogue()` kimi metadata daxil funksiya əlavə edilə bilər.

## Bilinen eksikler

- Demo admin dəyişiklikləri yalnız cari brauzerin `localStorage["seth.overlay"]` yaddaşında saxlanılır (backend yoxdur); fərqli cihazda görünmür.
- `mehsul/index.html?id=<id>` dinamik JS ilə çəkildiyi üçün JS bağlı rejimdə yalnız naviqasiya və statik geri dönüş linki göstərilir (real layihədə SSR / Cloudflare Pages + D1 ilə həll olunur).
- Kafel şəkilləri (`img/tiles/*.webp`) nümunədir; şirkətin real məhsul fotoları təqdim ediləndə eyni yol sxemi ilə əvəz olunacaq.
