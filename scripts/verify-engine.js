const assert = require('assert');
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
  installModrinthMod,
  listProfileMods,
  toggleMod,
  deleteMod
} = require('../src/engine/modsManager');
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
    console.log('1. Testowanie Store i offline UUID...');
    const store = new Store();
    const state = store.getState();
    assert(state.profiles.length >= 3, 'Brak domyślnych profili');
    const uuid = computeOfflineUuid('PeakPlayer');
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid), 'Niepoprawny UUID v3');
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

    console.log('5. Testowanie wyszukiwania Modrinth i instalacji + przełączania + usuwania moda...');
    const searchRes = await searchModrinth({ query: 'sodium', mcVersion: '1.21.4', limit: 5 });
    assert(searchRes.hits.length > 0, 'Brak wyników Modrinth dla Sodium 1.21.4');
    const sodiumHit = searchRes.hits[0];
    const installRes = await installModrinthMod({
      projectId: sodiumHit.projectId,
      mcVersion: '1.21.4',
      dataDir,
      profileId: 'peak-fabric-1214',
      projectMeta: sodiumHit
    });
    assert(installRes.installed.length >= 1, 'Nie zainstalowano pliku Sodium');
    let modsList = listProfileMods(dataDir, 'peak-fabric-1214');
    assert(modsList.length >= 1, 'Lista modów jest pusta');
    const firstMod = modsList[0];
    assert(firstMod.enabled === true && firstMod.name, 'Brak metadanych moda');

    modsList = toggleMod(dataDir, 'peak-fabric-1214', firstMod.fileName, false);
    const disabledMod = modsList.find((m) => m.baseFileName === firstMod.baseFileName);
    assert(disabledMod && disabledMod.enabled === false && disabledMod.fileName.endsWith('.disabled'), 'Wyłączenie moda nie zadziałało');

    modsList = toggleMod(dataDir, 'peak-fabric-1214', disabledMod.fileName, true);
    const reenabledMod = modsList.find((m) => m.baseFileName === firstMod.baseFileName);
    assert(reenabledMod && reenabledMod.enabled === true, 'Ponowne włączenie moda nie zadziałało');

    modsList = deleteMod(dataDir, 'peak-fabric-1214', reenabledMod.fileName);
    assert(!modsList.some((m) => m.baseFileName === firstMod.baseFileName), 'Usunięcie moda nie zadziałało');
    console.log('   -> Instalacja Modrinth, odczyt fabric.mod.json, wyłączanie/włączanie i usuwanie OK.');

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
