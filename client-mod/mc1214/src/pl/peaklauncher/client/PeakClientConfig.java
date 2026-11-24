package pl.peaklauncher.client;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.class_310;

import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public class PeakClientConfig {
  private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
  private static PeakClientConfig INSTANCE;

  public String language = "pl";
  public String accentColor = "#38BDF8";
  public float hudOpacity = 0.72F;
  public float hudScale = 1.0F;
  public boolean showWatermark = true;

  public boolean peakMainMenu = true;
  public boolean peakButtonStyle = true;
  public boolean peakLoadingScreen = true;

  public boolean betterF3Enabled = true;
  public boolean f3Performance = true;
  public boolean f3Position = true;
  public boolean f3NetherCoords = true;
  public boolean f3WorldServer = true;
  public boolean f3Target = true;
  public boolean f3Compact = false;

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

  public int fpsX = 10;
  public int fpsY = 10;
  public int coordsX = 10;
  public int coordsY = 34;
  public int cpsX = 10;
  public int cpsY = 92;
  public int sprintX = 10;
  public int sprintY = 116;
  public int pingX = 10;
  public int pingY = 140;
  public int clockX = 10;
  public int clockY = 164;
  public int keystrokesX = -1;
  public int keystrokesY = 10;
  public int armorX = -1;
  public int armorY = 112;
  public int effectsX = -1;
  public int effectsY = 200;

  public static PeakClientConfig get() {
    if (INSTANCE == null) {
      load();
    }
    return INSTANCE;
  }

  public static Path getConfigPath() {
    class_310 mc = class_310.method_1551();
    Path base = (mc != null && mc.field_1697 != null) ? mc.field_1697.toPath() : Path.of(".");
    return base.resolve("config").resolve("peak-client.json");
  }

  public static void load() {
    Path file = getConfigPath();
    if (Files.exists(file)) {
      try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
        PeakClientConfig loaded = GSON.fromJson(reader, PeakClientConfig.class);
        if (loaded != null) {
          loaded.sanitize();
          INSTANCE = loaded;
          return;
        }
      } catch (Exception e) {
        PeakClientMod.LOGGER.warn("Failed to read peak-client.json, restoring defaults: {}", e.getMessage());
      }
    }
    INSTANCE = new PeakClientConfig();
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
    if (Float.isNaN(hudScale) || hudScale < 0.7F || hudScale > 1.5F) {
      hudScale = 1.0F;
    }
  }

  public void resetPositions() {
    fpsX = 10;
    fpsY = 10;
    coordsX = 10;
    coordsY = 34;
    cpsX = 10;
    cpsY = 92;
    sprintX = 10;
    sprintY = 116;
    pingX = 10;
    pingY = 140;
    clockX = 10;
    clockY = 164;
    keystrokesX = -1;
    keystrokesY = 10;
    armorX = -1;
    armorY = 112;
    effectsX = -1;
    effectsY = 200;
    save();
  }

  public void resetAllDefaults() {
    String keepLang = this.language;
    PeakClientConfig fresh = new PeakClientConfig();
    fresh.language = keepLang;
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

  public boolean isPolish() {
    return !"en".equalsIgnoreCase(language);
  }
}
