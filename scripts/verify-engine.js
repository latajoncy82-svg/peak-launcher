const assert = require('assert');
const { execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const VERIFY_DIR = path.resolve(__dirname, '..', '.verify-tmp');
process.env.PEAK_VERIFY_DIR = VERIFY_DIR;

const { Store, computeOfflineUuid, sanitizePeakSlug } = require('../src/store');
const { getProfileDirs, getServerDirs } = require('../src/engine/paths');
const { readServersDat, upsertServerEntry } = require('../src/engine/nbtServers');
const { getManifest, ensureVersionJson } = require('../src/engine/versions');
const { detectInstalledJavas, findJavaForMajor, getAdoptiumReleaseInfo } = require('../src/engine/javaManager');
const {
  claimAndPublishPeakDomain,
  clearDirectoryCache,
  isAllowedPublicTarget,
  lookupPublicPeakDomain,
  unpublishPeakDomain
} = require('../src/engine/peakDirectory');
const {
  PeakDomainRouter,
  readVarInt,
  encodeVarInt,
  encodeMcString,
  encodePacket
} = require('../src/engine/peakRouter');
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
  installModrinthModToDirectory,
  listModsInDirectory,
  toggleModInDirectory,
  deleteModInDirectory,
  copyProfileModsToServerDir,
  syncServerModsToProfile,
  listProfileContent,
  listProfileMods,
  toggleContent,
  toggleMod,
  deleteContent,
  deleteMod,
  checkAndUpdateProfileMods
} = require('../src/engine/modsManager');
const {
  readServerProperties,
  writeServerProperties,
  writeEulaFile,
  prepareServerRuntime,
  buildPeakInvitePayload,
  parsePeakInviteFile
} = require('../src/engine/serverManager');
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
const { buildLaunchSpec, ensureNativesTree, resolvePeakDnsJarPath } = require('../src/engine/launcher');

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

    console.log('8. Testowanie Hostingu .peak, NBT servers.dat, server.properties, Fabric Server JAR, modów serwerowych i zaproszeń .peak...');
    assert.strictEqual(sanitizePeakSlug('Górski Świat .peak'), 'gorski-swiat');
    const defaultServers = store.listServers();
    assert(defaultServers.length >= 1 && defaultServers[0].peakDomain === 'szczyt.peak', 'Brak domyślnego serwera szczyt.peak');

    const createdSrv = store.createServer({
      name: 'Alpejski Test',
      slug: 'szczyt',
      mcVersion: '1.21.4',
      loader: 'fabric',
      port: 25565,
      eulaAccepted: true
    });
    assert.strictEqual(createdSrv.slug, 'szczyt-2', `Oczekiwano unikalnego sluga szczyt-2, otrzymano ${createdSrv.slug}`);
    assert.strictEqual(createdSrv.peakDomain, 'szczyt-2.peak');
    assert.strictEqual(createdSrv.port, 25566, `Oczekiwano automatycznego wolnego portu 25566, otrzymano ${createdSrv.port}`);

    const updatedSrv = store.updateServer(createdSrv.id, { slug: 'alpy-test', maxPlayers: 16 });
    assert.strictEqual(updatedSrv.peakDomain, 'alpy-test.peak');
    assert.strictEqual(updatedSrv.maxPlayers, 16);

    const srvDirs = getServerDirs(dataDir, updatedSrv.id);
    writeEulaFile(srvDirs.eulaPath, true);
    assert(fs.readFileSync(srvDirs.eulaPath, 'utf8').includes('eula=true'));

    writeServerProperties(srvDirs.propertiesPath, updatedSrv);
    const propsRead = readServerProperties(srvDirs.propertiesPath);
    assert.strictEqual(propsRead['server-port'], '25566');
    assert.strictEqual(propsRead['max-players'], '16');
    assert.strictEqual(propsRead['online-mode'], 'false');

    const runtimeRes = await prepareServerRuntime({
      server: updatedSrv,
      settings,
      dataDir
    });
    assert(fs.existsSync(runtimeRes.jarPath) && fs.statSync(runtimeRes.jarPath).size > 50000, 'Brak lub uszkodzony Fabric Server JAR');

    const srvModSearch = await searchModrinth({ mcVersion: '1.21.4', limit: 6, serverCompatible: true });
    assert(srvModSearch.hits.length >= 1, 'Pusty wynik Modrinth (serverCompatible)');
    assert(srvModSearch.hits.every((h) => h.serverSide !== 'unsupported'), 'Modrinth serverCompatible zwrócił mod bez obsługi serwera');

    await installModrinthModToDirectory({
      projectId: 'gvQqBUqZ',
      mcVersion: '1.21.4',
      modsDir: srvDirs.modsDir,
      metaPath: srvDirs.modsMetaPath
    });
    let srvMods = listModsInDirectory(srvDirs.modsDir, srvDirs.modsMetaPath);
    assert(srvMods.some((m) => /lithium/i.test(m.name)), 'Lithium nie został zainstalowany na serwer');

    srvMods = toggleModInDirectory(srvDirs.modsDir, srvDirs.modsMetaPath, srvMods[0].fileName, false);
    assert(srvMods[0].enabled === false, 'Wyłączenie moda serwerowego nie powiodło się');
    srvMods = toggleModInDirectory(srvDirs.modsDir, srvDirs.modsMetaPath, srvMods[0].fileName, true);
    assert(srvMods[0].enabled === true, 'Ponowne włączenie moda serwerowego nie powiodło się');

    const syncClientRes = syncServerModsToProfile({
      dataDir,
      serverModsDir: srvDirs.modsDir,
      serverMetaPath: srvDirs.modsMetaPath,
      profileId: 'peak-fabric-1214'
    });
    assert(syncClientRes.copied.length >= 1, 'Synchronizacja moda serwera na profil klienta nie powiodła się');

    // Umieść atrapę modu wyłącznie klienckiego w profilu i sprawdź filtrację przy kopiowaniu na serwer
    const profDirs = getProfileDirs(dataDir, 'peak-fabric-1214');
    fs.writeFileSync(path.join(profDirs.modsDir, 'sodium-fabric-test.jar'), 'dummy', 'utf8');
    const copySrvRes = copyProfileModsToServerDir({
      dataDir,
      profileId: 'peak-fabric-1214',
      serverModsDir: srvDirs.modsDir,
      serverMetaPath: srvDirs.modsMetaPath
    });
    assert(copySrvRes.skippedClientOnly.some((s) => /sodium/i.test(s)), 'Kopiowanie z profilu powinno pominąć kliencki mod Sodium');

    const datPath = path.join(profDirs.instanceDir, 'servers.dat');
    upsertServerEntry(datPath, { name: 'Szczyt A', ip: '127.0.0.1:25565', acceptTextures: 1 });
    upsertServerEntry(datPath, { name: 'Alpy B', ip: '192.168.1.5:25566', acceptTextures: 0 });
    upsertServerEntry(datPath, { name: 'Alpy B Nowy', ip: '192.168.1.5:25566', acceptTextures: 1 });
    const datRead = readServersDat(datPath);
    assert.strictEqual(datRead.entries.length, 2, 'Oczekiwano 2 wpisów w servers.dat po upsert');
    assert.strictEqual(datRead.entries.find((e) => e.ip === '192.168.1.5:25566')?.name, 'Alpy B Nowy');

    const invitePayload = buildPeakInvitePayload({ server: updatedSrv, dataDir });
    const invitePath = path.join(VERIFY_DIR, 'test-invite.peak');
    fs.writeFileSync(invitePath, JSON.stringify(invitePayload, null, 2), 'utf8');
    const parsedInvite = parsePeakInviteFile(invitePath);
    assert.strictEqual(parsedInvite.peakDomain, 'alpy-test.peak');
    assert(parsedInvite.mods.some((m) => m.projectId === 'gvQqBUqZ'), 'Brak Lithium w wyeksportowanym zaproszeniu .peak');

    const parent1214ForQp = await ensureVersionJson('1.21.4', dataDir);
    const qpModern = buildLaunchSpec({
      profile: { id: 'qp-1214', name: 'QP Modern', mcVersion: '1.21.4', loader: 'vanilla' },
      account,
      settings,
      dataDir,
      javaPath: dummyJava,
      parentJson: parent1214ForQp,
      quickPlayServer: '127.0.0.1:25566'
    });
    assert(qpModern.args.includes('--quickPlayMultiplayer') && qpModern.args.includes('127.0.0.1:25566'), 'Brak argumentu --quickPlayMultiplayer dla 1.21.4');

    const parent1122ForQp = await ensureVersionJson('1.12.2', dataDir);
    const qpLegacy = buildLaunchSpec({
      profile: { id: 'qp-1122', name: 'QP Legacy', mcVersion: '1.12.2', loader: 'vanilla' },
      account,
      settings,
      dataDir,
      javaPath: dummyJava,
      parentJson: parent1122ForQp,
      quickPlayServer: '127.0.0.1:25566'
    });
    assert(qpLegacy.args.includes('--server') && qpLegacy.args.includes('--port') && qpLegacy.args.includes('25566'), 'Brak --server/--port dla MC 1.12.2');

    deleteModInDirectory(srvDirs.modsDir, srvDirs.modsMetaPath, srvMods[0].fileName);
    store.deleteServer(updatedSrv.id);
    console.log('   -> Store .peak, server.properties, EULA, Fabric Server JAR, Modrinth (serwerowe), NBT servers.dat, .peak i QuickPlay OK.');

    console.log('9. Testowanie prawdziwej domeny .peak (Java 21 & 25 DNS SPI + authlib-injector + PeakDomainRouter)...');
    const peakDnsJar = resolvePeakDnsJarPath();
    assert(peakDnsJar && fs.existsSync(peakDnsJar), 'Brak assets/peak-dns.jar');
    const javacExe = path.join(path.dirname((await findJavaForMajor(21, dataDir))?.path || ''), 'javac.exe');
    const probeDir = path.join(VERIFY_DIR, 'dns-probe');
    fs.mkdirSync(probeDir, { recursive: true });
    const probeJavaPath = path.join(probeDir, 'PeakDnsProbe.java');
    fs.writeFileSync(
      probeJavaPath,
      `import java.net.InetAddress;
public class PeakDnsProbe {
  public static void main(String[] args) throws Exception {
    System.out.println("SZCZYT=" + InetAddress.getByName("szczyt.peak").getHostAddress());
    System.out.println("EKIPA=" + InetAddress.getByName("moja-ekipa.peak").getHostAddress());
    System.out.println("LOCAL=" + InetAddress.getByName("localhost").getHostAddress());
    System.out.println("EXT=" + InetAddress.getByName("api.modrinth.com").getHostAddress());
  }
}
`,
      'utf8'
    );
    execFileSync(fs.existsSync(javacExe) ? javacExe : 'javac', ['--release', '18', '-d', probeDir, probeJavaPath], {
      windowsHide: true
    });

    const probeSkinAcc = store.getActiveAccount();
    store.updateAccountSkin(
      probeSkinAcc.id,
      setAccountSkinFromPreset({ dataDir, accountId: probeSkinAcc.id, presetId: 'peak-climber' })
    );
    const probeAuthlibJar = await ensureAuthlibInjector(dataDir);
    const probeSkinSrv = await startLocalSkinServer({ dataDir, accounts: store.getState().accounts });
    let testedJavaMajors = 0;
    try {
      const cpSep = process.platform === 'win32' ? ';' : ':';
      const probeCp = `${peakDnsJar}${cpSep}${probeDir}`;
      for (const major of [21, 25]) {
        const jInfo = await findJavaForMajor(major, dataDir);
        if (!jInfo) continue;
        testedJavaMajors += 1;
        const { stdout: out } = await execFileAsync(
          jInfo.path,
          [
            `-javaagent:${probeAuthlibJar}=${probeSkinSrv.apiUrl}`,
            '-Dauthlibinjector.side=client',
            '-cp',
            probeCp,
            'PeakDnsProbe'
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 15000 }
        );
        assert(/SZCZYT=127\.0\.0\.1/.test(out), `[Java ${major}] szczyt.peak nie rozwiązał się do 127.0.0.1:\n${out}`);
        assert(/EKIPA=127\.0\.0\.1/.test(out), `[Java ${major}] moja-ekipa.peak nie rozwiązał się do 127.0.0.1:\n${out}`);
        const extMatch = out.match(/EXT=([^\r\n]+)/);
        assert(extMatch && extMatch[1] && extMatch[1] !== '127.0.0.1', `[Java ${major}] Delegacja builtin DNS nie zadziałała:\n${out}`);
      }
      assert(testedJavaMajors >= 1, 'Nie znaleziono Java 21 ani Java 25 do testu DNS SPI');
    } finally {
      probeSkinSrv.close();
      store.updateAccountSkin(probeSkinAcc.id, clearAccountSkin({ dataDir, accountId: probeSkinAcc.id }));
    }

    // 9b: PeakDomainRouter TCP Handshake + Status + Ping + Login Disconnect
    const mockReceived = [];
    const mockBackend = net.createServer((sock) => {
      sock.on('data', (chunk) => {
        mockReceived.push(chunk.toString('utf8'));
        sock.write(Buffer.from('BACKEND_OK'));
      });
    });
    await new Promise((resolve) => mockBackend.listen(0, '127.0.0.1', resolve));
    const backendPort = mockBackend.address().port;

    const router = new PeakDomainRouter();
    await router.start(0, '127.0.0.1');
    const routerPort = router.getStatus().port;
    assert(routerPort > 0, 'PeakDomainRouter nie uruchomił się poprawnie');

    router.setRoutes([
      {
        domain: 'alpha.peak',
        name: 'Alpha Summit',
        serverId: 'srv-alpha',
        targetHost: '127.0.0.1',
        targetPort: backendPort,
        running: true,
        isDefault: true
      },
      {
        domain: 'beta.peak',
        name: 'Beta Offline',
        serverId: 'srv-beta',
        targetHost: '127.0.0.1',
        targetPort: 25999,
        running: false,
        maxPlayers: 12
      },
      {
        domain: 'kolega.peak',
        name: 'Kolega LAN',
        targetHost: '127.0.0.1',
        targetPort: backendPort,
        running: true,
        isExternal: true
      }
    ]);

    const buildHandshake = (addr, nextState) =>
      encodePacket(
        0x00,
        Buffer.concat([
          encodeVarInt(769),
          encodeMcString(addr),
          Buffer.from([(routerPort >> 8) & 0xff, routerPort & 0xff]),
          encodeVarInt(nextState)
        ])
      );

    const readPacketsUntil = (socket, expectedCount = 1) =>
      new Promise((resolve, reject) => {
        let buf = Buffer.alloc(0);
        const pkts = [];
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error('Timeout oczekiwania na pakiety z PeakDomainRouter'));
        }, 4000);
        socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length > 0) {
            const lenInfo = readVarInt(buf, 0);
            if (!lenInfo) break;
            const total = lenInfo.bytesRead + lenInfo.value;
            if (buf.length < total) break;
            const body = buf.subarray(lenInfo.bytesRead, total);
            buf = buf.subarray(total);
            const idInfo = readVarInt(body, 0);
            pkts.push({ id: idInfo.value, data: body.subarray(idInfo.bytesRead) });
          }
          if (pkts.length >= expectedCount) {
            clearTimeout(timer);
            socket.destroy();
            resolve(pkts);
          }
        });
        socket.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

    try {
      // Online Forge/Fabric FML3 suffix routing
      await new Promise((resolve, reject) => {
        const c = net.createConnection({ host: '127.0.0.1', port: routerPort }, () => {
          c.write(Buffer.concat([buildHandshake('alpha.peak\0FML3\0', 2), Buffer.from('TRAIL_PING')]));
        });
        c.once('data', (chunk) => {
          assert(chunk.toString('utf8').includes('BACKEND_OK'), 'alpha.peak nie połączył z backendem');
          c.destroy();
          resolve();
        });
        c.once('error', reject);
      });
      assert(mockReceived.join('').includes('alpha.peak\0FML3\0'), 'Backend nie otrzymał surowych bajtów Handshake FML3');
      assert(mockReceived.join('').includes('TRAIL_PING'), 'Backend nie otrzymał pipelined bajtów po Handshake');

      // External .peak route
      await new Promise((resolve, reject) => {
        const c = net.createConnection({ host: '127.0.0.1', port: routerPort }, () => {
          c.write(buildHandshake('kolega.peak', 2));
        });
        c.once('data', (chunk) => {
          assert(chunk.toString('utf8').includes('BACKEND_OK'), 'kolega.peak nie przekierował do zewnętrznego celu');
          c.destroy();
          resolve();
        });
        c.once('error', reject);
      });

      // Default LAN fallback routing
      await new Promise((resolve, reject) => {
        const c = net.createConnection({ host: '127.0.0.1', port: routerPort }, () => {
          c.write(buildHandshake('192.168.1.99', 2));
        });
        c.once('data', (chunk) => {
          assert(chunk.toString('utf8').includes('BACKEND_OK'), 'Adres LAN nie przekierował do domyślnego serwera');
          c.destroy();
          resolve();
        });
        c.once('error', reject);
      });

      // Offline .peak Status + Ping/Pong
      const pingBytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
      const statusPkts = await new Promise((resolve, reject) => {
        const c = net.createConnection({ host: '127.0.0.1', port: routerPort }, () => {
          c.write(
            Buffer.concat([
              buildHandshake('beta.peak', 1),
              encodePacket(0x00),
              encodePacket(0x01, pingBytes)
            ])
          );
        });
        readPacketsUntil(c, 2).then(resolve).catch(reject);
      });
      assert.strictEqual(statusPkts[0].id, 0x00, 'Brak pakietu Status Response');
      const strLen = readVarInt(statusPkts[0].data, 0);
      const statusJson = JSON.parse(statusPkts[0].data.subarray(strLen.bytesRead, strLen.bytesRead + strLen.value).toString('utf8'));
      assert.strictEqual(statusJson.players.max, 12);
      assert(statusJson.description.text.includes('beta.peak'), 'MOTD offline powinien wymieniać domenę beta.peak');
      assert.strictEqual(statusPkts[1].id, 0x01, 'Brak pakietu Pong');
      assert(statusPkts[1].data.equals(pingBytes), 'Pong nie zwrócił dokładnych 8 bajtów ping payloadu');

      // Offline .peak Login Disconnect
      const discPkts = await new Promise((resolve, reject) => {
        const c = net.createConnection({ host: '127.0.0.1', port: routerPort }, () => {
          c.write(buildHandshake('beta.peak', 2));
        });
        readPacketsUntil(c, 1).then(resolve).catch(reject);
      });
      assert.strictEqual(discPkts[0].id, 0x00, 'Brak pakietu Login Disconnect');
      const dLen = readVarInt(discPkts[0].data, 0);
      const discJson = JSON.parse(discPkts[0].data.subarray(dLen.bytesRead, dLen.bytesRead + dLen.value).toString('utf8'));
      assert(discJson.text.includes('beta.peak'), 'Komunikat rozłączenia offline nie zawiera domeny beta.peak');

      // Unknown .peak domain Status
      const unkPkts = await new Promise((resolve, reject) => {
        const c = net.createConnection({ host: '127.0.0.1', port: routerPort }, () => {
          c.write(Buffer.concat([buildHandshake('nieznany.peak', 1), encodePacket(0x00)]));
        });
        readPacketsUntil(c, 1).then(resolve).catch(reject);
      });
      const uLen = readVarInt(unkPkts[0].data, 0);
      const unkJson = JSON.parse(unkPkts[0].data.subarray(uLen.bytesRead, uLen.bytesRead + uLen.value).toString('utf8'));
      assert(unkJson.description.text.includes('nieznany.peak'), 'Nieznana domena .peak powinna być opisana w Status JSON');
    } finally {
      await router.stop();
      await new Promise((resolve) => mockBackend.close(resolve));
    }

    // 9c: Store peakRoutes persistence
    const savedRoute = store.savePeakRoute({
      domain: 'kolega',
      targetHost: '192.168.1.44:25570',
      name: 'Kolega LAN'
    });
    assert.strictEqual(savedRoute.domain, 'kolega.peak');
    assert.strictEqual(savedRoute.targetHost, '192.168.1.44');
    assert.strictEqual(savedRoute.targetPort, 25570);
    assert(store.listPeakRoutes().some((r) => r.domain === 'kolega.peak'));
    store.deletePeakRoute('kolega.peak');
    assert(!store.listPeakRoutes().some((r) => r.domain === 'kolega.peak'));

    // 9d: buildLaunchSpec Java 18+ peak-dns.jar classpath + szczyt.peak quickPlay
    const qpPeakDomainSpec = buildLaunchSpec({
      profile: { id: 'qp-peak', name: 'QP Peak Domain', mcVersion: '1.21.4', loader: 'vanilla' },
      account,
      settings,
      dataDir,
      javaPath: dummyJava,
      parentJson: parent1214ForQp,
      quickPlayServer: 'szczyt.peak'
    });
    const cpIndexModern = qpPeakDomainSpec.args.indexOf('-cp');
    assert(cpIndexModern !== -1, 'Brak -cp dla 1.21.4');
    assert(qpPeakDomainSpec.args[cpIndexModern + 1].includes('peak-dns.jar'), 'MC 1.21.4 (Java 21) musi wstrzykiwać peak-dns.jar do classpath');
    assert(
      qpPeakDomainSpec.args.includes('--quickPlayMultiplayer') && qpPeakDomainSpec.args.includes('szczyt.peak'),
      'Brak --quickPlayMultiplayer szczyt.peak'
    );
    const cpIndexLegacy = qpLegacy.args.indexOf('-cp');
    assert(
      cpIndexLegacy !== -1 && !qpLegacy.args[cpIndexLegacy + 1].includes('peak-dns.jar'),
      'MC 1.12.2 (Java 8) nie może ładować klas Java 18 peak-dns.jar'
    );

    // 9e: Global public .peak Directory + SSRF + async PeakDomainRouter + live ntfy.sh round-trip
    assert.strictEqual(isAllowedPublicTarget('127.0.0.1', 25565), false, 'SSRF powinien odrzucić 127.0.0.1');
    assert.strictEqual(isAllowedPublicTarget('192.168.1.44', 25565), false, 'SSRF powinien odrzucić RFC1918');
    assert.strictEqual(isAllowedPublicTarget('szczyt.peak', 25565), false, 'SSRF powinien odrzucić pętlę .peak');
    assert.strictEqual(isAllowedPublicTarget('auftw-81-219-156-118.run.pinggy.link', 41234), true, 'Host Pinggy musi być dozwolony');

    const topicStore = new Map();
    const mockDirHttp = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0].replace(/^\/+/, '');
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c.toString('utf8')));
        req.on('end', () => {
          const list = topicStore.get(urlPath) || [];
          list.push(body.trim());
          topicStore.set(urlPath, list);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        });
        return;
      }
      if (req.method === 'GET' && urlPath.endsWith('/json')) {
        const topic = urlPath.slice(0, -5);
        const list = topicStore.get(topic) || [];
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.end(list.map((m) => JSON.stringify({ event: 'message', message: m })).join('\n') + (list.length ? '\n' : ''));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise((resolve) => mockDirHttp.listen(0, '127.0.0.1', resolve));
    const mockDirUrl = `http://127.0.0.1:${mockDirHttp.address().port}`;

    const mockRemoteBackend = net.createServer((sock) => {
      sock.on('data', () => sock.write(Buffer.from('REMOTE_PEAK_OK')));
    });
    await new Promise((resolve) => mockRemoteBackend.listen(0, '127.0.0.1', resolve));
    const mockRemotePort = mockRemoteBackend.address().port;

    const remoteRouter = new PeakDomainRouter();
    await remoteRouter.start(0, '127.0.0.1');
    const remoteRouterPort = remoteRouter.getStatus().port;
    remoteRouter.setRemoteResolver((d) =>
      lookupPublicPeakDomain(d, { baseUrl: mockDirUrl, allowPrivate: true })
    );
    remoteRouter.setRoutes([
      {
        domain: 'szczyt.peak',
        name: 'Lokalny offline',
        serverId: 'srv-local',
        targetHost: '127.0.0.1',
        targetPort: 25998,
        running: false,
        isExternal: false
      }
    ]);

    try {
      clearDirectoryCache();
      const c1 = await claimAndPublishPeakDomain({
        domain: 'public-test.peak',
        slug: 'public-test',
        rawAddress: `127.0.0.1:${mockRemotePort}`,
        serverName: 'Public Test',
        mcVersion: '1.21.4',
        loader: 'fabric',
        ownerId: 'owner-aaa',
        baseUrl: mockDirUrl,
        allowPrivate: true
      });
      assert.strictEqual(c1.domain, 'public-test.peak');

      // Drugi host na ten sam slug dostaje sufiks właściciela
      const c2 = await claimAndPublishPeakDomain({
        domain: 'public-test.peak',
        slug: 'public-test',
        rawAddress: `127.0.0.1:${mockRemotePort}`,
        serverName: 'Public Test 2',
        ownerId: 'owner-bbb',
        baseUrl: mockDirUrl,
        allowPrivate: true
      });
      assert.strictEqual(c2.domain, 'public-test-owne.peak');

      // Opublikuj także szczyt.peak (przesłonięty lokalnie jako offline) -> globalny resolver musi przejąć ruch
      await claimAndPublishPeakDomain({
        domain: 'szczyt.peak',
        slug: 'szczyt',
        rawAddress: `127.0.0.1:${mockRemotePort}`,
        serverName: 'Global Szczyt',
        ownerId: 'owner-ccc',
        baseUrl: mockDirUrl,
        allowPrivate: true
      });

      const sendHsk = (addr) =>
        encodePacket(
          0x00,
          Buffer.concat([
            encodeVarInt(769),
            encodeMcString(addr),
            Buffer.from([(remoteRouterPort >> 8) & 0xff, remoteRouterPort & 0xff]),
            encodeVarInt(2)
          ])
        );

      for (const testDomain of ['public-test.peak', 'szczyt.peak']) {
        await new Promise((resolve, reject) => {
          const c = net.createConnection({ host: '127.0.0.1', port: remoteRouterPort }, () => {
            c.write(sendHsk(testDomain));
          });
          c.once('data', (chunk) => {
            assert(chunk.toString('utf8').includes('REMOTE_PEAK_OK'), `${testDomain} nie połączył z globalnym celem`);
            c.destroy();
            resolve();
          });
          c.once('error', reject);
        });
      }

      await unpublishPeakDomain({ domain: 'public-test.peak', ownerId: 'owner-aaa', baseUrl: mockDirUrl });
      const afterTombstone = await lookupPublicPeakDomain('public-test.peak', {
        bypassCache: true,
        baseUrl: mockDirUrl,
        allowPrivate: true
      });
      assert.strictEqual(afterTombstone, null, 'Tombstone po zamknięciu tunelu powinien wyłączyć domenę');

      // Prawdziwy test publikacji i odczytu w globalnym katalogu ntfy.sh
      const liveRandDomain = `peakverify-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}.peak`;
      await claimAndPublishPeakDomain({
        domain: liveRandDomain,
        slug: liveRandDomain.replace(/\.peak$/, ''),
        rawAddress: 'relay.pinggy.link:41234',
        serverName: 'Peak Live Verify',
        mcVersion: '1.21.4',
        loader: 'fabric',
        ownerId: 'verify-suite'
      });
      await new Promise((r) => setTimeout(r, 1500));
      clearDirectoryCache();
      const liveFound = await lookupPublicPeakDomain(liveRandDomain, { bypassCache: true });
      assert(liveFound && liveFound.targetHost === 'relay.pinggy.link' && liveFound.targetPort === 41234, 'Live globalny odczyt ntfy.sh nie zwrócił rekordu');
      await unpublishPeakDomain({ domain: liveRandDomain, ownerId: 'verify-suite' });
    } finally {
      clearDirectoryCache();
      await remoteRouter.stop();
      await new Promise((r) => mockRemoteBackend.close(r));
      await new Promise((r) => mockDirHttp.close(r));
    }

    console.log(`   -> Domena .peak DNS SPI (Java majors: ${testedJavaMajors}) + authlib-injector + PeakDomainRouter + globalny katalog OK.`);

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
