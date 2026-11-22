const assert = require('assert');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERIFY_DIR = path.resolve(__dirname, '..', '.verify-tmp');
process.env.PEAK_VERIFY_DIR = VERIFY_DIR;

const { Store, computeOfflineUuid } = require('../src/store');
const { getManifest, ensureVersionJson } = require('../src/engine/versions');
const { detectInstalledJavas, getAdoptiumReleaseInfo } = require('../src/engine/javaManager');
const {
  getFabricSupportedVersions,
  getFabricLoadersForMc,
  installFabric
} = require('../src/engine/fabricManager');
const {
  searchModrinth,
  getModrinthProjectDetails,
  installModrinthContent,
  installModrinthMod,
  listProfileContent,
  listProfileMods,
  toggleContent,
  toggleMod,
  deleteContent,
  deleteMod,
  checkAndUpdateProfileMods
} = require('../src/engine/modsManager');
const {
  validateMinecraftSkinPng,
  listSkinCatalog,
  setAccountSkinFromPreset,
  setAccountSkinFromUsername,
  clearAccountSkin,
  getAccountSkinInfo
} = require('../src/engine/skinManager');
const {
  ensureAuthlibInjector,
  startLocalSkinServer
} = require('../src/engine/skinServer');
const { buildLaunchSpec, ensureNativesTree } = require('../src/engine/launcher');

function assertNoPlaceholders(args, label) {
  for (const arg of args) {
    assert(
      typeof arg === 'string' && !/\$\{[^}]+\}/.test(arg),
      `[${label}] Nierozwiązany placeholder w argumencie: ${arg}`
    );
  }
}

async function runVerification() {
  if (fs.existsSync(VERIFY_DIR)) {
    fs.rmSync(VERIFY_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(VERIFY_DIR, { recursive: true });

  try {
    console.log('1. Testowanie Store, wielu kont, języków i offline UUID...');
    const store = new Store();
    const state = store.getState();
    assert(state.profiles.length >= 3, 'Brak domyślnych profili');
    for (const lang of ['pl', 'en', 'de', 'es', 'fr', 'uk']) {
      const savedLang = store.setLanguage(lang);
      assert.strictEqual(savedLang, lang, `Nie zapisano języka ${lang}`);
      assert.strictEqual(store.getState().language, lang);
    }
    assert.strictEqual(store.setLanguage('invalid'), 'pl', 'Niepoprawny język powinien wrócić do pl');
    store.setLanguage('pl');
    const uuid = computeOfflineUuid('PeakPlayer');
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid), 'Niepoprawny UUID v3');

    const accSteve = store.saveAccount({ username: 'StevePeak' });
    const accAlex = store.saveAccount({ username: 'AlexSummit' });
    assert.strictEqual(store.getState().accounts.length, 3, 'Powinny być 3 konta po dodaniu 2 nowych');
    assert(accSteve.uuid !== accAlex.uuid && accSteve.uuid !== uuid, 'UUID różnych kont powinny się różnić');

    const switched = store.selectAccount(accSteve.id);
    assert.strictEqual(store.getActiveAccount().id, accSteve.id, 'Przełączenie aktywnego konta nie zadziałało');
    assert(Boolean(switched.lastUsedAt), 'Brak znacznika lastUsedAt po wyborze konta');

    const renamedAlex = store.saveAccount({ id: accAlex.id, username: 'AlexPeak' });
    assert.strictEqual(renamedAlex.username, 'AlexPeak', 'Zmiana nicku istniejącego konta nie powiodła się');
    assert.strictEqual(renamedAlex.uuid, computeOfflineUuid('AlexPeak'), 'UUID nie zaktualizował się po zmianie nicku');

    assert.throws(
      () => store.saveAccount({ id: accAlex.id, username: 'StevePeak' }),
      /istnieje/i,
      'Powinna wystąpić blokada duplikatu przy edycji nicku'
    );

    // Aktywne konto to teraz accAlex — po jego usunięciu aktywne musi bezpiecznie wrócić na inne konto
    const afterDeleteState = store.deleteAccount(accAlex.id);
    assert.strictEqual(afterDeleteState.accounts.length, 2, 'Usunięcie konta nie zmniejszyło listy');
    assert(afterDeleteState.activeAccountId && afterDeleteState.activeAccountId !== accAlex.id, 'Brak fallbacku activeAccountId po usunięciu aktywnego konta');
    store.selectAccount(accSteve.id);
    const dataDir = store.getDataDir();

    console.log('2. Testowanie manifestu Mojang (wszystkie wersje)...');
    const manifest = await getManifest(dataDir, true);
    assert(manifest.versions.length > 900, `Zbyt mało wersji: ${manifest.versions.length}`);
    for (const reqVer of ['26.3', '1.21.4', '1.12.2', 'b1.7.3']) {
      assert(manifest.versions.some((v) => v.id === reqVer), `Brak wersji ${reqVer} w manifeście`);
    }
    console.log(`   -> Załadowano ${manifest.versions.length} wersji (latest release: ${manifest.latest.release}).`);

    console.log('3. Testowanie wykrywania Javy i metadanych Adoptium (8, 17, 21, 25)...');
    const javas = await detectInstalledJavas(dataDir);
    assert(javas.list.length >= 1, 'Nie wykryto lokalnej Javy');
    console.log(`   -> Wykryto lokalnie: ${javas.list.map((j) => `Java ${j.major} (${j.rawVersion})`).join(', ')}`);
    for (const major of [8, 17, 21, 25]) {
      const info = await getAdoptiumReleaseInfo(major);
      assert(info.url && info.checksum, `Brak danych Adoptium dla Java ${major}`);
      console.log(`   -> Adoptium Java ${major}: ${info.releaseName} (${(info.size / 1048576).toFixed(1)} MB)`);
    }

    console.log('4. Testowanie Fabric Meta i instalacji Fabric 1.21.4...');
    const fabricGames = await getFabricSupportedVersions(dataDir, true);
    assert(fabricGames.length > 400, 'Zbyt mało wersji gry Fabric');
    const loaders263 = await getFabricLoadersForMc('26.3');
    assert(loaders263.length > 0, 'Brak loaderów Fabric dla 26.3');
    const fabricRes1214 = await installFabric('1.21.4', 'latest', dataDir);
    assert(fs.existsSync(fabricRes1214.jsonPath), 'Nie zapisano profilu Fabric 1.21.4');
    const fabricRes263 = await installFabric('26.3', 'latest', dataDir);
    assert(fs.existsSync(fabricRes263.jsonPath), 'Nie zapisano profilu Fabric 26.3');
    console.log(`   -> Zainstalowano ${fabricRes1214.id} i ${fabricRes263.id}`);

    console.log('5. Testowanie bazy Modrinth (mody, shadery, paczki zasobów, paginacja, szczegóły, aktualizacje)...');
    const searchRes = await searchModrinth({ query: 'sodium', mcVersion: '1.21.4', limit: 5 });
    assert(searchRes.hits.length > 0, 'Brak wyników Modrinth dla Sodium 1.21.4');
    const page1 = await searchModrinth({ query: '', projectType: 'mod', mcVersion: '1.21.4', offset: 0, limit: 24, sort: 'downloads' });
    const page2 = await searchModrinth({ query: '', projectType: 'mod', mcVersion: '1.21.4', offset: 24, limit: 24, sort: 'downloads' });
    assert(page1.hits.length === 24 && page1.hasMore === true && page1.totalHits > 24, 'Paginacja strona 1 nie działa');
    assert(page2.hits.length > 0 && page2.hits[0].projectId !== page1.hits[0].projectId, 'Paginacja offset 24 zwróciła identyczne wyniki');

    const shaderSearch = await searchModrinth({ query: '', projectType: 'shader', mcVersion: '1.21.4', offset: 0, limit: 8, sort: 'downloads' });
    assert(shaderSearch.hits.length > 0, 'Brak wyników shaderów z Modrinth');
    const rpSearch = await searchModrinth({ query: '', projectType: 'resourcepack', mcVersion: '1.21.4', offset: 0, limit: 8, sort: 'downloads' });
    assert(rpSearch.hits.length > 0, 'Brak wyników resource packów z Modrinth');

    const sodiumHit = searchRes.hits[0];
    const sodiumDetails = await getModrinthProjectDetails(sodiumHit.projectId, '1.21.4', 'mod');
    assert(sodiumDetails && sodiumDetails.title && sodiumDetails.versions.length >= 1, 'Brak szczegółów projektu lub wersji z Modrinth');

    // Zainstaluj starszą wersję (jeśli dostępna), żeby przetestować też aktualizację 1 klikiem i brak duplikatów
    const olderVersion = sodiumDetails.versions.find((v, idx) => idx > 0 && v.versionType === 'release') || sodiumDetails.versions[1] || null;
    const installRes = await installModrinthContent({
      projectId: sodiumHit.projectId,
      versionId: olderVersion ? olderVersion.id : null,
      projectType: 'mod',
      mcVersion: '1.21.4',
      dataDir,
      profileId: 'peak-fabric-1214',
      projectMeta: sodiumHit
    });
    assert(installRes.installed.length >= 1, 'Nie zainstalowano pliku Sodium');
    let modsList = listProfileMods(dataDir, 'peak-fabric-1214');
    assert(modsList.length >= 1, 'Lista modów jest pusta');
    const firstMod = modsList.find((m) => m.projectId === sodiumHit.projectId) || modsList[0];
    assert(firstMod.enabled === true && firstMod.name, 'Brak metadanych moda');

    if (olderVersion && olderVersion.id !== sodiumDetails.versions[0].id) {
      const checkBefore = await checkAndUpdateProfileMods({ mcVersion: '1.21.4', dataDir, profileId: 'peak-fabric-1214', applyUpdates: false });
      assert(checkBefore.checked >= 1 && checkBefore.updatesAvailable.length >= 1, 'Nie wykryto dostępnej aktualizacji Sodium');
      const applyRes = await checkAndUpdateProfileMods({ mcVersion: '1.21.4', dataDir, profileId: 'peak-fabric-1214', applyUpdates: true });
      assert(applyRes.updated.length >= 1, 'Aktualizacja 1 klikiem nie zaktualizowała Sodium');
      const sodiumMatches = listProfileMods(dataDir, 'peak-fabric-1214').filter((m) => m.projectId === sodiumHit.projectId);
      assert.strictEqual(sodiumMatches.length, 1, `Wykryto duplikaty moda po aktualizacji: ${sodiumMatches.length}`);
    } else {
      const checkOnly = await checkAndUpdateProfileMods({ mcVersion: '1.21.4', dataDir, profileId: 'peak-fabric-1214', applyUpdates: false });
      assert(checkOnly.checked >= 1, 'checkAndUpdateProfileMods nie sprawdził zainstalowanego moda');
    }

    modsList = listProfileMods(dataDir, 'peak-fabric-1214');
    const currentSodium = modsList.find((m) => m.projectId === sodiumHit.projectId) || modsList[0];
    modsList = toggleMod(dataDir, 'peak-fabric-1214', currentSodium.fileName, false);
    const disabledMod = modsList.find((m) => m.baseFileName === currentSodium.baseFileName);
    assert(disabledMod && disabledMod.enabled === false && disabledMod.fileName.endsWith('.disabled'), 'Wyłączenie moda nie zadziałało');

    modsList = toggleMod(dataDir, 'peak-fabric-1214', disabledMod.fileName, true);
    const reenabledMod = modsList.find((m) => m.baseFileName === currentSodium.baseFileName);
    assert(reenabledMod && reenabledMod.enabled === true, 'Ponowne włączenie moda nie zadziałało');

    modsList = deleteMod(dataDir, 'peak-fabric-1214', reenabledMod.fileName);
    assert(!modsList.some((m) => m.baseFileName === currentSodium.baseFileName), 'Usunięcie moda nie zadziałało');

    // Przetestuj także shader/resourcepack content flow (installModrinthContent + listProfileContent + toggleContent + deleteContent)
    const testShader = shaderSearch.hits[0];
    const shaderInstall = await installModrinthContent({
      projectId: testShader.projectId,
      projectType: 'shader',
      mcVersion: '1.21.4',
      dataDir,
      profileId: 'peak-fabric-1214',
      projectMeta: testShader
    });
    assert(shaderInstall.installed.length >= 1, 'Nie zainstalowano shadera z Modrinth');
    let shaderList = listProfileContent(dataDir, 'peak-fabric-1214', 'shader');
    assert(shaderList.length >= 1, 'Lista shaderów jest pusta');
    shaderList = toggleContent(dataDir, 'peak-fabric-1214', shaderList[0].fileName, false, 'shader');
    assert(shaderList[0].enabled === false, 'Wyłączenie shadera nie zadziałało');
    shaderList = deleteContent(dataDir, 'peak-fabric-1214', shaderList[0].fileName, 'shader');
    assert.strictEqual(shaderList.length, 0, 'Usunięcie shadera nie zadziałało');
    console.log('   -> Mody, shadery, resource packi, paginacja, szczegóły i aktualizacje OK.');

    console.log('6. Testowanie budowania specyfikacji uruchomienia (26.3 Fabric, 1.21.4 Fabric, 1.12.2, b1.7.3)...');
    const account = store.getActiveAccount();
    const settings = store.getState().settings;
    const dummyJava = javas.list[0].path;

    const testCases = [
      { id: '26.3', childPath: fabricRes263.jsonPath, label: '26.3 Fabric', expectAsm: '9.10' },
      { id: '1.21.4', childPath: fabricRes1214.jsonPath, label: '1.21.4 Fabric', expectAsm: '9.10' },
      { id: '1.12.2', childPath: null, label: '1.12.2 Vanilla' },
      { id: 'b1.7.3', childPath: null, label: 'b1.7.3 Beta' }
    ];

    for (const tc of testCases) {
      const parentJson = await ensureVersionJson(tc.id, dataDir);
      const childJson = tc.childPath ? JSON.parse(fs.readFileSync(tc.childPath, 'utf8')) : null;
      const spec = buildLaunchSpec({
        profile: {
          id: `test-${tc.id}`,
          name: tc.label,
          mcVersion: tc.id,
          loader: childJson ? 'fabric' : 'vanilla'
        },
        account,
        settings: { ...settings, customResolution: true, width: 1600, height: 900 },
        dataDir,
        javaPath: dummyJava,
        parentJson,
        childJson
      });

      assertNoPlaceholders(spec.args, tc.label);
      assert(spec.args.includes(account.username), `[${tc.label}] Brak aktywnego nicku konta w argumentach uruchomienia`);
      if (tc.id !== 'b1.7.3') {
        assert(
          spec.args.some((a) => a.includes(account.uuid.replace(/-/g, ''))),
          `[${tc.label}] Brak UUID aktywnego konta w argumentach uruchomienia`
        );
      }
      ensureNativesTree(spec.nativesDir);
      assert(fs.existsSync(path.join(spec.nativesDir, 'lwjgl')), `[${tc.label}] Brak natives/lwjgl`);
      assert(fs.existsSync(path.join(spec.nativesDir, 'jna')), `[${tc.label}] Brak natives/jna`);

      if (childJson) {
        assert(spec.args.includes('net.fabricmc.loader.impl.launch.knot.KnotClient'), `[${tc.label}] Brak mainClass Fabric`);
        const cpIdx = spec.args.indexOf('-cp');
        assert(cpIdx !== -1, `[${tc.label}] Brak flagi -cp`);
        const cpValue = spec.args[cpIdx + 1];
        const asmMatches = cpValue.match(/asm-\d+\.\d+(?:\.\d+)?\.jar/g) || [];
        assert.strictEqual(asmMatches.length, 1, `[${tc.label}] Zduplikowany ASM na classpath: ${asmMatches.join(', ')}`);
      }
      console.log(`   -> [${tc.label}] OK (Java ${spec.javaMajor}, libs: ${spec.librariesToDownload.length}, args: ${spec.args.length})`);
    }

    console.log('7. Testowanie Studia Skinów, authlib-injector 1.2.8 i lokalnego serwera Yggdrasil...');
    assert.throws(
      () => validateMinecraftSkinPng(Buffer.from('not-a-png')),
      /PNG/i,
      'Nie odrzucono nieprawidłowego pliku skina'
    );
    const catalogBefore = listSkinCatalog(dataDir);
    assert(catalogBefore.presets.length === 4, `Oczekiwano 4 gotowych presetów skinów, jest: ${catalogBefore.presets.length}`);

    const presetRes = setAccountSkinFromPreset({
      dataDir,
      accountId: account.id,
      presetId: 'peak-climber'
    });
    store.updateAccountSkin(account.id, presetRes);
    const infoAfterPreset = getAccountSkinInfo(dataDir, store.getActiveAccount());
    assert(infoAfterPreset.hasCustomSkin && infoAfterPreset.skinDataUrl.startsWith('data:image/png;base64,'));

    const nickRes = await setAccountSkinFromUsername({
      dataDir,
      accountId: account.id,
      username: 'Notch',
      model: 'classic'
    });
    store.updateAccountSkin(account.id, nickRes);
    assert(listSkinCatalog(dataDir).library.length >= 2, 'Biblioteka skinów powinna zapisać pobrany i presetowy skin');

    const jarPath = await ensureAuthlibInjector(dataDir);
    assert(fs.existsSync(jarPath), 'Brak pobranego authlib-injector-1.2.8.jar');

    const skinServer = await startLocalSkinServer({
      dataDir,
      accounts: store.getState().accounts
    });
    try {
      const metaRes = await fetch(`${skinServer.apiUrl}/`);
      assert.strictEqual(metaRes.status, 200);
      const metaJson = await metaRes.json();
      assert(metaJson.signaturePublickey, 'Brak klucza signaturePublickey');

      const uuidHex = store.getActiveAccount().uuid.replace(/-/g, '').toLowerCase();
      const profRes = await fetch(`${skinServer.apiUrl}/sessionserver/session/minecraft/profile/${uuidHex}`);
      assert.strictEqual(profRes.status, 200);
      const profJson = await profRes.json();
      const prop = profJson.properties.find((p) => p.name === 'textures');
      assert(prop && prop.value && prop.signature, 'Brak podpisanej właściwości textures');

      const verifier = crypto.createVerify('RSA-SHA1');
      verifier.update(prop.value, 'utf8');
      assert.strictEqual(
        verifier.verify(metaJson.signaturePublickey, prop.signature, 'base64'),
        true,
        'Nieprawidłowy podpis RSA-SHA1 tekstury skina!'
      );

      const decodedTextures = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
      const texRes = await fetch(decodedTextures.textures.SKIN.url);
      assert.strictEqual(texRes.status, 200);
      assert.strictEqual(texRes.headers.get('content-type'), 'image/png');

      const attrRes = await fetch(`${skinServer.apiUrl}/minecraftservices/player/attributes`);
      assert.strictEqual(attrRes.status, 200);
      const attrJson = await attrRes.json();
      assert.strictEqual(attrJson.privileges.onlineChat.enabled, true);

      const parent1214 = await ensureVersionJson('1.21.4', dataDir);
      const skinSpec = buildLaunchSpec({
        profile: { id: 'test-skin-1214', name: 'Skin Test', mcVersion: '1.21.4', loader: 'vanilla' },
        account: store.getActiveAccount(),
        settings,
        dataDir,
        javaPath: dummyJava,
        parentJson: parent1214,
        skinAgent: {
          jarPath,
          apiUrl: skinServer.apiUrl,
          prefetchedBase64: skinServer.prefetchedBase64
        }
      });
      assert(skinSpec.args.some((a) => a.startsWith(`-javaagent:${jarPath}=http://127.0.0.1:`)));
      assert(skinSpec.args.some((a) => a.startsWith('-Dauthlibinjector.yggdrasil.prefetched=')));

      execFileSync(
        dummyJava,
        [
          `-javaagent:${jarPath}=${skinServer.apiUrl}`,
          `-Dauthlibinjector.yggdrasil.prefetched=${skinServer.prefetchedBase64}`,
          '-version'
        ],
        { stdio: 'pipe' }
      );
      console.log(`   -> Presety, pobieranie skina, podpis Yggdrasil, texture PNG i authlib-injector (Java ${javas.list[0].major}) OK.`);
    } finally {
      await skinServer.close();
    }

    const cleared = clearAccountSkin({ dataDir, accountId: account.id });
    store.updateAccountSkin(account.id, cleared);
    assert.strictEqual(getAccountSkinInfo(dataDir, store.getActiveAccount()).hasCustomSkin, false);

    console.log('\nWSZYSTKIE TESTY SILNIKA ZAKOŃCZONE SUKCESEM!');
  } finally {
    if (fs.existsSync(VERIFY_DIR)) {
      fs.rmSync(VERIFY_DIR, { recursive: true, force: true });
    }
  }
}

runVerification().catch((err) => {
  console.error('\nBŁĄD WERYFIKACJI SILNIKA:', err);
  process.exit(1);
});
