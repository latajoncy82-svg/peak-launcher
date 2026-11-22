(() => {
  const STORAGE_KEY = 'peak-launcher-site-lang';

  const LANGUAGES = [
    { code: 'pl', short: 'PL', name: 'Polski', locale: 'pl-PL' },
    { code: 'en', short: 'EN', name: 'English', locale: 'en-US' },
    { code: 'de', short: 'DE', name: 'Deutsch', locale: 'de-DE' },
    { code: 'es', short: 'ES', name: 'Español', locale: 'es-ES' },
    { code: 'fr', short: 'FR', name: 'Français', locale: 'fr-FR' },
    { code: 'uk', short: 'UK', name: 'Українська', locale: 'uk-UA' }
  ];

  const DICT = {
    pl: {
      'meta.title': 'Peak Launcher — Kinowy launcher Minecraft',
      'meta.description': 'Peak Launcher to prosty, kinowy launcher Minecraft na Windows z motywem Góry PEAK, wszystkimi wersjami gry, modami i shaderami z Modrinth oraz automatyczną instalacją Javy i Fabrica.',
      'nav.download': 'Pobierz',
      'nav.features': 'Funkcje',
      'nav.versions': 'Wersje',
      'nav.langLabel': 'Język strony',
      'nav.themeTitle': 'Przełącz motyw strony',
      'hero.kicker': 'Windows 10 / 11 (64-bit) · Wersja {tag} · Bezpłatny',
      'hero.title': 'Sięgnij szczytu w Minecraft.',
      'hero.lead': 'Czysty, kinowy launcher z motywem Góry PEAK. Ponad 925 wersji gry, mody, shadery i paczki z Modrinth jednym kliknięciem oraz automatyczna Java i Fabric.',
      'hero.downloadBtn': 'Pobierz dla Windows',
      'hero.moreOptions': 'Więcej opcji pobierania',
      'hero.installerTitle': 'Instalator Windows (.exe)',
      'hero.installerSub': 'Zalecany · pełna instalacja i skróty',
      'hero.portableTitle': 'Wersja Portable (.exe)',
      'hero.portableSub': 'Bez instalacji · gotowa po uruchomieniu',
      'hero.allGithub': 'Wszystkie wydania na GitHubie',
      'hero.featuresBtn': 'Funkcje',
      'preview.caption': 'Peak Launcher {ver} · Cinema GUI',
      'preview.dark': 'Nocny Szczyt',
      'preview.light': 'Lodowcowy Dzień',
      'preview.mods': 'Mody',
      'preview.java': 'Java i Fabric',
      'features.title': 'Prosty. Szybki. Gotowy na mody.',
      'features.subtitle': 'Zero zbędnych paneli — cała konfiguracja środowiska dzieje się w tle.',
      'features.f1.title': 'Wszystkie wersje (925+)',
      'features.f1.desc': 'Pełny katalog Mojang od klasycznych Alpha i Beta po najnowsze wydania i snapshoty, z izolowanymi profilami.',
      'features.f2.title': 'Mody, Shadery & .jar',
      'features.f2.desc': 'Przeglądaj mody, shadery i resource packi z Modrinth, instaluj gotowe zestawy (FPS Boost, Shadery, QoL), aktualizuj 1 klikiem lub wrzucaj .jar / .zip.',
      'features.f3.title': 'Automatyczna Java 8–25',
      'features.f3.desc': 'Wykrywa lokalną Javę i pobiera brakującą wersję Eclipse Temurin JRE (8, 17, 21 lub 25) przed startem gry.',
      'features.f4.title': 'Fabric & 6 języków',
      'features.f4.desc': 'Instalacja Fabric Loadera jednym kliknięciem oraz interfejs po polsku, angielsku, niemiecku, hiszpańsku, francusku i ukraińsku.',
      'req.osLabel': 'System',
      'req.osVal': 'Windows 10 / 11 (64-bit)',
      'req.ramLabel': 'Pamięć RAM',
      'req.ramVal': 'Min. 4 GB (zalecane 8 GB+)',
      'req.javaLabel': 'Java',
      'req.javaVal': 'Auto-instalacja (8 / 17 / 21 / 25)',
      'req.loaderLabel': 'Modloader',
      'req.loaderVal': 'Fabric + Vanilla',
      'releases.title': 'Wydania i pobieranie',
      'releases.subtitle': 'Instalator Windows lub wersja Portable bez instalacji.',
      'releases.loading': 'Ładowanie wydań…',
      'releases.sourceGithub': 'Zsynchronizowano z GitHub Releases',
      'releases.sourceFallback': 'Aktualny katalog wydań Peak Launcher',
      'releases.empty': 'Brak opublikowanych wydań.',
      'releases.latestBadge': 'Najnowsza',
      'releases.downloadInstaller': 'Pobierz Instalator (.exe)',
      'releases.downloadPortable': 'Pobierz Portable (.exe)',
      'releases.viewGithub': 'Zobacz na GitHubie ↗',
      'footer.releases': 'Wydania'
    },
    en: {
      'meta.title': 'Peak Launcher — Cinematic Minecraft Launcher',
      'meta.description': 'Peak Launcher is a clean, cinematic Minecraft launcher for Windows inspired by PEAK Mountain, featuring all game versions, Modrinth mods & shaders, and automatic Java & Fabric installation.',
      'nav.download': 'Download',
      'nav.features': 'Features',
      'nav.versions': 'Releases',
      'nav.langLabel': 'Website language',
      'nav.themeTitle': 'Switch site theme',
      'hero.kicker': 'Windows 10 / 11 (64-bit) · Version {tag} · Free',
      'hero.title': 'Reach the summit in Minecraft.',
      'hero.lead': 'Clean, cinematic launcher inspired by PEAK Mountain. Over 925 game versions, 1-click Modrinth mods, shaders & resource packs, plus automatic Java and Fabric.',
      'hero.downloadBtn': 'Download for Windows',
      'hero.moreOptions': 'More download options',
      'hero.installerTitle': 'Windows Installer (.exe)',
      'hero.installerSub': 'Recommended · full setup and shortcuts',
      'hero.portableTitle': 'Portable Edition (.exe)',
      'hero.portableSub': 'No installation · ready to launch',
      'hero.allGithub': 'All releases on GitHub',
      'hero.featuresBtn': 'Features',
      'preview.caption': 'Peak Launcher {ver} · Cinema GUI',
      'preview.dark': 'Night Summit',
      'preview.light': 'Glacier Day',
      'preview.mods': 'Mods',
      'preview.java': 'Java & Fabric',
      'features.title': 'Simple. Fast. Ready for mods.',
      'features.subtitle': 'Zero clutter — all environment setup happens automatically in the background.',
      'features.f1.title': 'All Versions (925+)',
      'features.f1.desc': 'Complete Mojang catalog from classic Alpha and Beta to the latest releases and snapshots, with isolated profiles.',
      'features.f2.title': 'Mods, Shaders & .jar',
      'features.f2.desc': 'Browse Modrinth mods, shaders & resource packs, install 1-click packs (FPS Boost, Shaders, QoL), update mods automatically or drop .jar / .zip files.',
      'features.f3.title': 'Automatic Java 8–25',
      'features.f3.desc': 'Detects local Java and downloads the right Eclipse Temurin JRE (8, 17, 21, or 25) before game launch.',
      'features.f4.title': 'Fabric & 6 Languages',
      'features.f4.desc': 'One-click Fabric Loader installation plus full interface in English, Polish, German, Spanish, French, and Ukrainian.',
      'req.osLabel': 'OS',
      'req.osVal': 'Windows 10 / 11 (64-bit)',
      'req.ramLabel': 'Memory (RAM)',
      'req.ramVal': 'Min. 4 GB (8 GB+ recommended)',
      'req.javaLabel': 'Java',
      'req.javaVal': 'Auto-install (8 / 17 / 21 / 25)',
      'req.loaderLabel': 'Mod Loader',
      'req.loaderVal': 'Fabric + Vanilla',
      'releases.title': 'Releases & Downloads',
      'releases.subtitle': 'Windows Installer or zero-setup Portable edition.',
      'releases.loading': 'Loading releases…',
      'releases.sourceGithub': 'Synced with GitHub Releases',
      'releases.sourceFallback': 'Peak Launcher release catalog',
      'releases.empty': 'No published releases found.',
      'releases.latestBadge': 'Latest',
      'releases.downloadInstaller': 'Download Installer (.exe)',
      'releases.downloadPortable': 'Download Portable (.exe)',
      'releases.viewGithub': 'View on GitHub ↗',
      'footer.releases': 'Releases'
    },
    de: {
      'meta.title': 'Peak Launcher — Kinoreifer Minecraft-Launcher',
      'meta.description': 'Peak Launcher ist ein schlichter, kinoreifer Minecraft-Launcher für Windows im PEAK-Berg-Design mit allen Versionen, Modrinth-Mods & Shadern sowie automatischer Java- und Fabric-Installation.',
      'nav.download': 'Download',
      'nav.features': 'Funktionen',
      'nav.versions': 'Versionen',
      'nav.langLabel': 'Website-Sprache',
      'nav.themeTitle': 'Design wechseln',
      'hero.kicker': 'Windows 10 / 11 (64-Bit) · Version {tag} · Kostenlos',
      'hero.title': 'Erreiche den Gipfel in Minecraft.',
      'hero.lead': 'Schlichter, kinoreifer Launcher im PEAK-Berg-Design. Über 925 Spielversionen, Modrinth-Mods, Shader & Ressourcenpakete mit 1 Klick sowie automatisches Java und Fabric.',
      'hero.downloadBtn': 'Für Windows herunterladen',
      'hero.moreOptions': 'Weitere Download-Optionen',
      'hero.installerTitle': 'Windows-Installer (.exe)',
      'hero.installerSub': 'Empfohlen · vollständige Installation & Verknüpfungen',
      'hero.portableTitle': 'Portable-Version (.exe)',
      'hero.portableSub': 'Ohne Installation · sofort startklar',
      'hero.allGithub': 'Alle Releases auf GitHub',
      'hero.featuresBtn': 'Funktionen',
      'preview.caption': 'Peak Launcher {ver} · Cinema GUI',
      'preview.dark': 'Nachtgipfel',
      'preview.light': 'Gletschertag',
      'preview.mods': 'Mods',
      'preview.java': 'Java & Fabric',
      'features.title': 'Schlicht. Schnell. Bereit für Mods.',
      'features.subtitle': 'Kein Ballast — die gesamte Einrichtung läuft im Hintergrund.',
      'features.f1.title': 'Alle Versionen (925+)',
      'features.f1.desc': 'Kompletter Mojang-Katalog von Alpha und Beta bis zu den neuesten Releases und Snapshots mit isolierten Profilen.',
      'features.f2.title': 'Mods, Shader & .jar',
      'features.f2.desc': 'Modrinth-Mods, Shader & Ressourcenpakete durchsuchen, 1-Klick-Pakete (FPS Boost, Shader, QoL) installieren, Updates prüfen oder .jar / .zip ablegen.',
      'features.f3.title': 'Automatisches Java 8–25',
      'features.f3.desc': 'Erkennt lokales Java und lädt vor dem Spielstart die passende Eclipse Temurin JRE (8, 17, 21 oder 25) herunter.',
      'features.f4.title': 'Fabric & 6 Sprachen',
      'features.f4.desc': 'Ein-Klick-Installation von Fabric Loader sowie Oberfläche auf Deutsch, Polnisch, Englisch, Spanisch, Französisch und Ukrainisch.',
      'req.osLabel': 'System',
      'req.osVal': 'Windows 10 / 11 (64-Bit)',
      'req.ramLabel': 'Arbeitsspeicher',
      'req.ramVal': 'Min. 4 GB (8 GB+ empfohlen)',
      'req.javaLabel': 'Java',
      'req.javaVal': 'Auto-Installation (8 / 17 / 21 / 25)',
      'req.loaderLabel': 'Modloader',
      'req.loaderVal': 'Fabric + Vanilla',
      'releases.title': 'Releases & Downloads',
      'releases.subtitle': 'Windows-Installer oder Portable-Version ohne Installation.',
      'releases.loading': 'Releases werden geladen…',
      'releases.sourceGithub': 'Mit GitHub Releases synchronisiert',
      'releases.sourceFallback': 'Aktueller Peak-Launcher-Katalog',
      'releases.empty': 'Keine veröffentlichten Releases gefunden.',
      'releases.latestBadge': 'Aktuell',
      'releases.downloadInstaller': 'Installer herunterladen (.exe)',
      'releases.downloadPortable': 'Portable herunterladen (.exe)',
      'releases.viewGithub': 'Auf GitHub ansehen ↗',
      'footer.releases': 'Releases'
    },
    es: {
      'meta.title': 'Peak Launcher — Launcher cinematográfico de Minecraft',
      'meta.description': 'Peak Launcher es un launcher limpio y cinematográfico para Minecraft en Windows inspirado en la Montaña PEAK, con todas las versiones, mods y shaders de Modrinth e instalación automática de Java y Fabric.',
      'nav.download': 'Descargar',
      'nav.features': 'Funciones',
      'nav.versions': 'Versiones',
      'nav.langLabel': 'Idioma del sitio',
      'nav.themeTitle': 'Cambiar tema del sitio',
      'hero.kicker': 'Windows 10 / 11 (64-bit) · Versión {tag} · Gratis',
      'hero.title': 'Alcanza la cima en Minecraft.',
      'hero.lead': 'Launcher limpio y cinematográfico con estética PEAK Mountain. Más de 925 versiones, mods, shaders y packs de Modrinth en un clic, con Java y Fabric automáticos.',
      'hero.downloadBtn': 'Descargar para Windows',
      'hero.moreOptions': 'Más opciones de descarga',
      'hero.installerTitle': 'Instalador de Windows (.exe)',
      'hero.installerSub': 'Recomendado · instalación completa y accesos directos',
      'hero.portableTitle': 'Edición Portable (.exe)',
      'hero.portableSub': 'Sin instalación · listo para abrir',
      'hero.allGithub': 'Todas las versiones en GitHub',
      'hero.featuresBtn': 'Funciones',
      'preview.caption': 'Peak Launcher {ver} · Cinema GUI',
      'preview.dark': 'Cumbre Nocturna',
      'preview.light': 'Día Glaciar',
      'preview.mods': 'Mods',
      'preview.java': 'Java y Fabric',
      'features.title': 'Simple. Rápido. Listo para mods.',
      'features.subtitle': 'Sin paneles innecesarios — todo el entorno se configura en segundo plano.',
      'features.f1.title': 'Todas las versiones (925+)',
      'features.f1.desc': 'Catálogo completo de Mojang desde Alpha y Beta hasta los últimos lanzamientos y snapshots con perfiles aislados.',
      'features.f2.title': 'Mods, Shaders y .jar',
      'features.f2.desc': 'Explora mods, shaders y packs de recursos en Modrinth, instala packs en 1 clic (FPS Boost, Shaders, QoL), actualiza fácil o arrastra .jar / .zip.',
      'features.f3.title': 'Java automática 8–25',
      'features.f3.desc': 'Detecta Java local y descarga Eclipse Temurin JRE (8, 17, 21 o 25) automáticamente antes de iniciar el juego.',
      'features.f4.title': 'Fabric y 6 idiomas',
      'features.f4.desc': 'Instalación de Fabric Loader en un clic e interfaz completa en español, polaco, inglés, alemán, francés y ucraniano.',
      'req.osLabel': 'Sistema',
      'req.osVal': 'Windows 10 / 11 (64-bit)',
      'req.ramLabel': 'Memoria RAM',
      'req.ramVal': 'Mín. 4 GB (8 GB+ recom.)',
      'req.javaLabel': 'Java',
      'req.javaVal': 'Auto-instalación (8 / 17 / 21 / 25)',
      'req.loaderLabel': 'Modloader',
      'req.loaderVal': 'Fabric + Vanilla',
      'releases.title': 'Versiones y descargas',
      'releases.subtitle': 'Instalador para Windows o edición Portable sin instalación.',
      'releases.loading': 'Cargando versiones…',
      'releases.sourceGithub': 'Sincronizado con GitHub Releases',
      'releases.sourceFallback': 'Catálogo de versiones de Peak Launcher',
      'releases.empty': 'No hay versiones publicadas.',
      'releases.latestBadge': 'Última',
      'releases.downloadInstaller': 'Descargar Instalador (.exe)',
      'releases.downloadPortable': 'Descargar Portable (.exe)',
      'releases.viewGithub': 'Ver en GitHub ↗',
      'footer.releases': 'Versiones'
    },
    fr: {
      'meta.title': 'Peak Launcher — Launcher Minecraft cinématique',
      'meta.description': 'Peak Launcher est un launcher Minecraft épuré et cinématique pour Windows inspiré du mont PEAK, avec toutes les versions, les mods et shaders Modrinth et l’installation automatique de Java et Fabric.',
      'nav.download': 'Télécharger',
      'nav.features': 'Fonctionnalités',
      'nav.versions': 'Versions',
      'nav.langLabel': 'Langue du site',
      'nav.themeTitle': 'Changer le thème du site',
      'hero.kicker': 'Windows 10 / 11 (64-bit) · Version {tag} · Gratuit',
      'hero.title': 'Atteignez le sommet dans Minecraft.',
      'hero.lead': 'Launcher épuré et cinématique sur le thème du mont PEAK. Plus de 925 versions, mods, shaders et packs Modrinth en 1 clic, avec Java et Fabric automatiques.',
      'hero.downloadBtn': 'Télécharger pour Windows',
      'hero.moreOptions': 'Plus d’options de téléchargement',
      'hero.installerTitle': 'Installateur Windows (.exe)',
      'hero.installerSub': 'Recommandé · installation complète et raccourcis',
      'hero.portableTitle': 'Version Portable (.exe)',
      'hero.portableSub': 'Sans installation · prêt à l’emploi',
      'hero.allGithub': 'Toutes les versions sur GitHub',
      'hero.featuresBtn': 'Fonctionnalités',
      'preview.caption': 'Peak Launcher {ver} · Cinema GUI',
      'preview.dark': 'Sommet Nocturne',
      'preview.light': 'Jour Glaciaire',
      'preview.mods': 'Mods',
      'preview.java': 'Java & Fabric',
      'features.title': 'Simple. Rapide. Prêt pour les mods.',
      'features.subtitle': 'Zéro encombrement — toute la configuration s’effectue en arrière-plan.',
      'features.f1.title': 'Toutes les versions (925+)',
      'features.f1.desc': 'Catalogue complet Mojang d’Alpha et Beta jusqu’aux dernières sorties et snapshots, avec profils isolés.',
      'features.f2.title': 'Mods, Shaders & .jar',
      'features.f2.desc': 'Parcourez mods, shaders et packs Modrinth, installez nos packs 1 clic (FPS Boost, Shaders, QoL), mettez à jour ou déposez vos .jar / .zip.',
      'features.f3.title': 'Java automatique 8–25',
      'features.f3.desc': 'Détecte Java localement et télécharge Eclipse Temurin JRE (8, 17, 21 ou 25) avant de lancer le jeu.',
      'features.f4.title': 'Fabric & 6 langues',
      'features.f4.desc': 'Installation en 1 clic de Fabric Loader et interface en français, polonais, anglais, allemand, espagnol et ukrainien.',
      'req.osLabel': 'Système',
      'req.osVal': 'Windows 10 / 11 (64-bit)',
      'req.ramLabel': 'Mémoire RAM',
      'req.ramVal': 'Min. 4 Go (8 Go+ recom.)',
      'req.javaLabel': 'Java',
      'req.javaVal': 'Auto-installation (8 / 17 / 21 / 25)',
      'req.loaderLabel': 'Modloader',
      'req.loaderVal': 'Fabric + Vanilla',
      'releases.title': 'Versions et téléchargements',
      'releases.subtitle': 'Installateur Windows ou édition Portable sans installation.',
      'releases.loading': 'Chargement des versions…',
      'releases.sourceGithub': 'Synchronisé avec GitHub Releases',
      'releases.sourceFallback': 'Catalogue des versions Peak Launcher',
      'releases.empty': 'Aucune version publiée.',
      'releases.latestBadge': 'Dernière',
      'releases.downloadInstaller': 'Télécharger Installateur (.exe)',
      'releases.downloadPortable': 'Télécharger Portable (.exe)',
      'releases.viewGithub': 'Voir sur GitHub ↗',
      'footer.releases': 'Versions'
    },
    uk: {
      'meta.title': 'Peak Launcher — Кінематографічний лаунчер Minecraft',
      'meta.description': 'Peak Launcher — чистий кінематографічний лаунчер Minecraft для Windows у стилі Гори PEAK з усіма версіями гри, модами й шейдерами з Modrinth та автоматичною Java і Fabric.',
      'nav.download': 'Завантажити',
      'nav.features': 'Функції',
      'nav.versions': 'Версії',
      'nav.langLabel': 'Мова сайту',
      'nav.themeTitle': 'Змінити тему сайту',
      'hero.kicker': 'Windows 10 / 11 (64-bit) · Версія {tag} · Безкоштовно',
      'hero.title': 'Досягни вершини у Minecraft.',
      'hero.lead': 'Чистий кінематографічний лаунчер у стилі Гори PEAK. Понад 925 версій гри, моди, шейдери й паки з Modrinth в один клік та автоматичні Java і Fabric.',
      'hero.downloadBtn': 'Завантажити для Windows',
      'hero.moreOptions': 'Більше варіантів завантаження',
      'hero.installerTitle': 'Інсталятор Windows (.exe)',
      'hero.installerSub': 'Рекомендовано · повне встановлення та ярлики',
      'hero.portableTitle': 'Портативна версія (.exe)',
      'hero.portableSub': 'Без встановлення · готова до запуску',
      'hero.allGithub': 'Усі релізи на GitHub',
      'hero.featuresBtn': 'Функції',
      'preview.caption': 'Peak Launcher {ver} · Cinema GUI',
      'preview.dark': 'Нічна Вершина',
      'preview.light': 'Льодовиковий День',
      'preview.mods': 'Моди',
      'preview.java': 'Java і Fabric',
      'features.title': 'Простий. Швидкий. Готовий до модів.',
      'features.subtitle': 'Жодних зайвих панелей — усе налаштування середовища відбувається у фоні.',
      'features.f1.title': 'Усі версії (925+)',
      'features.f1.desc': 'Повний каталог Mojang від класичних Alpha і Beta до найновіших релізів і снапшотів з ізольованими профілями.',
      'features.f2.title': 'Моди, Шейдери та .jar',
      'features.f2.desc': 'Переглядайте моди, шейдери й ресурс-паки з Modrinth, встановлюйте готові набори (FPS Boost, Шейдери, QoL), оновлюйте в 1 клік або перетягуйте .jar / .zip.',
      'features.f3.title': 'Автоматична Java 8–25',
      'features.f3.desc': 'Визначає локальну Java і завантажує потрібну Eclipse Temurin JRE (8, 17, 21 або 25) перед запуском гри.',
      'features.f4.title': 'Fabric і 6 мов',
      'features.f4.desc': 'Встановлення Fabric Loader в один клік та інтерфейс українською, польською, англійською, німецькою, іспанською й французькою.',
      'req.osLabel': 'Система',
      'req.osVal': 'Windows 10 / 11 (64-bit)',
      'req.ramLabel': 'Пам’ять RAM',
      'req.ramVal': 'Мін. 4 ГБ (реком. 8 ГБ+)',
      'req.javaLabel': 'Java',
      'req.javaVal': 'Автовстановлення (8 / 17 / 21 / 25)',
      'req.loaderLabel': 'Модлоадер',
      'req.loaderVal': 'Fabric + Vanilla',
      'releases.title': 'Релізи та завантаження',
      'releases.subtitle': 'Інсталятор Windows або портативна версія без встановлення.',
      'releases.loading': 'Завантаження релізів…',
      'releases.sourceGithub': 'Синхронізовано з GitHub Releases',
      'releases.sourceFallback': 'Актуальний каталог релізів Peak Launcher',
      'releases.empty': 'Не знайдено опублікованих релізів.',
      'releases.latestBadge': 'Найновіша',
      'releases.downloadInstaller': 'Завантажити Інсталятор (.exe)',
      'releases.downloadPortable': 'Завантажити Portable (.exe)',
      'releases.viewGithub': 'Відкрити на GitHub ↗',
      'footer.releases': 'Релізи'
    }
  };

  let currentLang = 'pl';

  function normalizeLang(lang) {
    if (typeof lang !== 'string') return 'pl';
    const clean = lang.trim().toLowerCase().slice(0, 2);
    return Object.prototype.hasOwnProperty.call(DICT, clean) ? clean : 'pl';
  }

  function detectInitialLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeLang(saved);
    } catch {
      // Ignore storage access failures
    }
    return 'pl';
  }

  function setLanguage(lang) {
    currentLang = normalizeLang(lang);
    document.documentElement.lang = currentLang;
    try {
      localStorage.setItem(STORAGE_KEY, currentLang);
    } catch {
      // Ignore storage failures
    }
    return currentLang;
  }

  function getLanguage() {
    return currentLang;
  }

  function getLocale() {
    const found = LANGUAGES.find((l) => l.code === currentLang);
    return found ? found.locale : 'pl-PL';
  }

  function t(key, vars = {}) {
    const table = DICT[currentLang] || DICT.pl;
    let text = table[key] !== undefined ? table[key] : DICT.pl[key];
    if (text === undefined) return key;
    if (vars && typeof vars === 'object') {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }

  function applyDomTranslations(root = document, vars = { ver: '1.3', tag: 'v1.3.0' }) {
    document.title = t('meta.title', vars);
    const metaDesc = root.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('meta.description', vars));

    for (const el of root.querySelectorAll('[data-i18n]')) {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key, vars);
    }
    for (const el of root.querySelectorAll('[data-i18n-title]')) {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key, vars));
    }
    for (const el of root.querySelectorAll('[data-i18n-aria]')) {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key, vars));
    }
  }

  currentLang = detectInitialLanguage();
  document.documentElement.lang = currentLang;

  window.PeakSiteI18n = {
    LANGUAGES,
    setLanguage,
    getLanguage,
    getLocale,
    t,
    applyDomTranslations
  };
})();
