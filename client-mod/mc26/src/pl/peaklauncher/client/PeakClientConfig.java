package pl.peaklauncher.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.client.Minecraft;

import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class PeakClientConfig {
  public static final int CURRENT_CONFIG_VERSION = 2;
  private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
  private static PeakClientConfig INSTANCE;

  // Global appearance & launcher sync
  public int configVersion = 0;
  public String language = "pl";
  public String accentColor = "#38BDF8";
  public float hudOpacity = 0.72F;
  public float hudScale = 0.72F;
  public boolean showWatermark = true;

  // Peak Look & Theme
  public boolean peakMainMenu = true;
  public boolean peakButtonStyle = true;
  public boolean peakLoadingScreen = true;

  // Better F3 ("Lepsze F3")
  public boolean betterF3Enabled = true;
  public boolean f3Performance = true;
  public boolean f3Position = true;
  public boolean f3NetherCoords = true;
  public boolean f3WorldServer = true;
  public boolean f3Target = true;
  public boolean f3Compact = false;

  // HUD Modules & Addons
  public boolean hudEnabled = true;
  public boolean hudFps = true;
  public boolean hudCoords = true;
  public boolean hudCps = true;
  public boolean hudKeystrokes = true;
  public boolean hudPing = true;
  public boolean hudArmor = true;
  public boolean hudEffects = true;
  public boolean hudClock = true;
  public boolean hudSprint = true;

  public boolean toggleSprintEnabled = true;
  public boolean zoomEnabled = true;
  public boolean fullbrightEnabled = false;

  // Draggable HUD Positions (unscaled screen coordinates, -1 = auto default)
  public int fpsX = 6;
  public int fpsY = 6;
  public int coordsX = 6;
  public int coordsY = 21;
  public int cpsX = 6;
  public int cpsY = 51;
  public int sprintX = 6;
  public int sprintY = 66;
  public int pingX = 6;
  public int pingY = 81;
  public int clockX = 6;
  public int clockY = 96;
  public int keystrokesX = -1;
  public int keystrokesY = 6;
  public int armorX = -1;
  public int armorY = 72;
  public int effectsX = -1;
  public int effectsY = 140;

  public static PeakClientConfig get() {
    if (INSTANCE == null) {
      load();
    }
    return INSTANCE;
  }

  public static Path getConfigPath() {
    Minecraft mc = Minecraft.getInstance();
    Path base = (mc != null && mc.gameDirectory != null) ? mc.gameDirectory.toPath() : Path.of(".");
    return base.resolve("config").resolve("peak-client.json");
  }

  public static void load() {
    Path file = getConfigPath();
    if (Files.exists(file)) {
      try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
        PeakClientConfig loaded = GSON.fromJson(reader, PeakClientConfig.class);
        if (loaded != null) {
          boolean needsSave = false;
          if (loaded.configVersion < CURRENT_CONFIG_VERSION) {
            boolean wasLegacyV170Layout = loaded.fpsX == 10 && loaded.fpsY == 10
              && loaded.coordsX == 10 && loaded.coordsY == 34
              && loaded.cpsX == 10 && loaded.cpsY == 92
              && loaded.sprintX == 10 && loaded.sprintY == 116
              && loaded.pingX == 10 && loaded.pingY == 140
              && loaded.clockX == 10 && loaded.clockY == 164;
            if (Math.abs(loaded.hudScale - 1.0F) < 0.01F) {
              loaded.hudScale = 0.72F;
            }
            if (wasLegacyV170Layout) {
              loaded.applyDefaultStackForScale();
            }
            loaded.configVersion = CURRENT_CONFIG_VERSION;
            needsSave = true;
          }
          loaded.sanitize();
          INSTANCE = loaded;
          if (needsSave) {
            save();
          }
          return;
        }
      } catch (Exception e) {
        PeakClientMod.LOGGER.warn("Failed to read peak-client.json, restoring defaults: {}", e.getMessage());
      }
    }
    INSTANCE = new PeakClientConfig();
    INSTANCE.configVersion = CURRENT_CONFIG_VERSION;
    save();
  }

  public static void save() {
    if (INSTANCE == null) INSTANCE = new PeakClientConfig();
    INSTANCE.sanitize();
    Path file = getConfigPath();
    try {
      Files.createDirectories(file.getParent());
      try (Writer writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
        GSON.toJson(INSTANCE, writer);
      }
    } catch (Exception e) {
      PeakClientMod.LOGGER.warn("Failed to save peak-client.json: {}", e.getMessage());
    }
  }

  public void sanitize() {
    if (language == null || (!language.equals("pl") && !language.equals("en"))) {
      language = "pl";
    }
    if (accentColor == null || !accentColor.matches("^#[0-9a-fA-F]{6}$")) {
      accentColor = "#38BDF8";
    }
    if (Float.isNaN(hudOpacity) || hudOpacity < 0.15F || hudOpacity > 0.98F) {
      hudOpacity = 0.72F;
    }
    if (Float.isNaN(hudScale) || hudScale < 0.50F || hudScale > 1.25F) {
      hudScale = 0.72F;
    }
  }

  public void applyDefaultStackForScale() {
    int stepSingle = Math.max(10, Math.round(16.0F * hudScale)) + 3;
    int stepCoords = Math.max(22, Math.round(38.0F * hudScale)) + 3;
    int y = 6;
    fpsX = 6; fpsY = y; y += stepSingle;
    coordsX = 6; coordsY = y; y += stepCoords;
    cpsX = 6; cpsY = y; y += stepSingle;
    sprintX = 6; sprintY = y; y += stepSingle;
    pingX = 6; pingY = y; y += stepSingle;
    clockX = 6; clockY = y;

    int ry = 6;
    keystrokesX = -1; keystrokesY = ry; ry += Math.max(40, Math.round(84.0F * hudScale)) + 5;
    armorX = -1; armorY = ry; ry += Math.max(40, Math.round(86.0F * hudScale)) + 5;
    effectsX = -1; effectsY = ry;
  }

  public boolean isUsingDefaultLayout() {
    int expectedStepSingle = Math.max(10, Math.round(16.0F * hudScale)) + 3;
    int expectedCoordsY = 6 + expectedStepSingle;
    return (fpsX == 6 && coordsX == 6 && cpsX == 6 && sprintX == 6 && pingX == 6 && clockX == 6)
      && Math.abs(fpsY - 6) <= 2
      && Math.abs(coordsY - expectedCoordsY) <= 2
      && keystrokesX < 0 && armorX < 0 && effectsX < 0;
  }

  public void resetPositions() {
    applyDefaultStackForScale();
    save();
  }

  public void resetAllDefaults() {
    String keepLang = this.language;
    PeakClientConfig fresh = new PeakClientConfig();
    fresh.language = keepLang;
    fresh.configVersion = CURRENT_CONFIG_VERSION;
    INSTANCE = fresh;
    save();
  }

  public int getAccentRgb() {
    try {
      return Integer.parseInt(accentColor.substring(1), 16) & 0xFFFFFF;
    } catch (Exception e) {
      return 0x38BDF8;
    }
  }

  public int getAccentArgb() {
    return 0xFF000000 | getAccentRgb();
  }

  public boolean isPolish() {
    return !"en".equalsIgnoreCase(language);
  }
}
