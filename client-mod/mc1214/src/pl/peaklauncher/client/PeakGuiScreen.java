package pl.peaklauncher.client;

import net.minecraft.class_1109;
import net.minecraft.class_2561;
import net.minecraft.class_310;
import net.minecraft.class_327;
import net.minecraft.class_332;
import net.minecraft.class_3417;
import net.minecraft.class_437;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;

public class PeakGuiScreen extends class_437 {
  private static final int VIRTUAL_W = 580;
  private static final int VIRTUAL_H = 344;
  private static final String[] ACCENT_SWATCHES = {
    "#38BDF8", "#34D399", "#A78BFA", "#FB7185", "#FBBF24", "#60A5FA"
  };

  private final class_437 parent;
  private int activeTab = 0;
  private int scrollOffset = 0;
  private int maxScroll = 0;
  private int contentClipTop = 0;
  private int contentClipBottom = 0;
  private int contentClipLeft = 0;
  private int contentClipRight = 0;
  private float uiScale = 1.0F;
  private float originX = 0.0F;
  private float originY = 0.0F;
  private final List<ClickRegion> regions = new ArrayList<>();

  public PeakGuiScreen(class_437 parent) {
    super(class_2561.method_43470("Peak Client GUI"));
    this.parent = parent;
  }

  private void computeLayout() {
    float sx = (this.field_22789 - 28.0F) / VIRTUAL_W;
    float sy = (this.field_22790 - 22.0F) / VIRTUAL_H;
    this.uiScale = Math.max(0.56F, Math.min(1.0F, Math.min(sx, sy)));
    this.originX = (this.field_22789 - VIRTUAL_W * this.uiScale) / 2.0F;
    this.originY = (this.field_22790 - VIRTUAL_H * this.uiScale) / 2.0F;
  }

  private double toVirtualX(double screenX) {
    return (screenX - this.originX) / this.uiScale;
  }

  private double toVirtualY(double screenY) {
    return (screenY - this.originY) / this.uiScale;
  }

  private void switchTab(int idx) {
    if (this.activeTab != idx) {
      this.activeTab = idx;
      this.scrollOffset = 0;
      this.maxScroll = 0;
    }
  }

  @Override
  public boolean method_25421() {
    return true;
  }

  @Override
  public void method_25419() {
    PeakClientConfig.save();
    if (this.field_22787 != null) {
      this.field_22787.method_1507(this.parent);
    }
  }

  @Override
  public void method_25420(class_332 g, int mouseX, int mouseY, float partialTick) {
    if (this.field_22787 != null && this.field_22787.field_1687 != null) {
      this.method_57734();
      g.method_25294(0, 0, this.field_22789, this.field_22790, 0x7A040812);
    } else {
      PeakTitleScreenOverlay.renderBackdrop(g, this.field_22789, this.field_22790);
      g.method_25294(0, 0, this.field_22789, this.field_22790, 0x6E040812);
    }
  }

  @Override
  public void method_25394(class_332 g, int mouseX, int mouseY, float partialTick) {
    super.method_25394(g, mouseX, mouseY, partialTick);
    this.regions.clear();
    this.computeLayout();

    int vmx = (int) Math.round(toVirtualX(mouseX));
    int vmy = (int) Math.round(toVirtualY(mouseY));

    PeakClientConfig cfg = PeakClientConfig.get();
    boolean pl = cfg.isPolish();
    int accent = cfg.getAccentRgb();
    class_327 font = this.field_22793;

    g.method_51448().method_22903();
    g.method_51448().method_46416(this.originX, this.originY, 0.0F);
    g.method_51448().method_22905(this.uiScale, this.uiScale, 1.0F);

    PeakRenderUtil.drawSoftShadow(g, 0, 0, VIRTUAL_W, VIRTUAL_H, 7);
    PeakRenderUtil.drawRoundedGradient(g, 0, 0, VIRTUAL_W, VIRTUAL_H, 7, 0xEE0B1322, 0xF4060B15);
    PeakRenderUtil.drawRoundedOutline(g, 0, 0, VIRTUAL_W, VIRTUAL_H, 7, 0x3894A3B8);
    g.method_25294(10, 1, VIRTUAL_W - 10, 2, 0x1EFFFFFF);
    g.method_25294(210, 0, 370, 2, PeakRenderUtil.withAlpha(accent, 0.85F));

    int sideW = 148;
    PeakRenderUtil.drawRoundedGradient(g, 1, 1, sideW - 1, VIRTUAL_H - 2, 6, 0xCC070E1A, 0xDD050A13);
    g.method_25294(sideW, 8, sideW + 1, VIRTUAL_H - 8, 0x2294A3B8);
    drawSidebarMountains(g, sideW, accent);

    PeakRenderUtil.drawPeakCrest(g, 14, 14, 24, accent);
    g.method_25303(font, "PEAK", 44, 14, 0xFFF8FAFC);
    g.method_25303(font, "CLIENT", 44 + font.method_1727("PEAK") + 3, 14, PeakRenderUtil.TEXT_MUTED);
    String verTag = "v" + PeakClientMod.VERSION;
    int verW = font.method_1727(verTag) + 8;
    PeakRenderUtil.drawRoundedRect(g, 44, 26, verW, 11, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.method_25303(font, verTag, 48, 28, PeakRenderUtil.withAlpha(accent, 1.0F));

    String[] tabLabels = pl
      ? new String[]{"HUD i Dodatki", "Lepsze F3", "Wygląd Peak", "Układ i Kolor"}
      : new String[]{"HUD & Addons", "Better F3", "Peak Look", "Layout & Style"};
    String[] tabIcons = {"hud", "f3", "look", "style"};

    int tabY = 52;
    for (int i = 0; i < tabLabels.length; i++) {
      final int idx = i;
      int tx = 10;
      int tw = sideW - 20;
      int th = 26;
      boolean sel = activeTab == i;
      boolean hov = isHover(vmx, vmy, tx, tabY, tw, th);
      if (sel) {
        PeakRenderUtil.drawRoundedRect(g, tx, tabY, tw, th, 5, PeakRenderUtil.withAlpha(accent, 0.15F));
        PeakRenderUtil.drawRoundedOutline(g, tx, tabY, tw, th, 5, PeakRenderUtil.withAlpha(accent, 0.42F));
        g.method_25294(tx + 2, tabY + 6, tx + 4, tabY + th - 6, PeakRenderUtil.withAlpha(accent, 1.0F));
      } else if (hov) {
        PeakRenderUtil.drawRoundedRect(g, tx, tabY, tw, th, 5, 0x12FFFFFF);
      }
      PeakRenderUtil.drawModuleIcon(g, tx + 8, tabY + 5, tabIcons[i], accent, sel || hov);
      int textCol = sel ? 0xFFF8FAFC : hov ? 0xFFE2E8F0 : 0xFF8A9BB2;
      g.method_25303(font, tabLabels[i], tx + 29, tabY + 9, textCol);
      regions.add(new ClickRegion(tx, tabY, tw, th, () -> switchTab(idx)));
      tabY += 30;
    }

    drawMiniActionButton(g, font, 10, 282, sideW - 20, 24,
      pl ? "Edytor HUD" : "HUD Editor", accent, true, vmx, vmy,
      () -> {
        if (field_22787 != null) field_22787.method_1507(new PeakHudEditorScreen(this));
      });

    drawMiniActionButton(g, font, 10, 312, sideW - 20, 22,
      pl ? "Zamknij (ESC)" : "Close (ESC)", 0x64748B, false, vmx, vmy, this::method_25419);

    int cx = 162;
    int cw = VIRTUAL_W - cx - 14;
    String[] headerDesc = pl
      ? new String[]{
          "Moduły nakładki HUD i szybkie dodatki rozgrywki",
          "Nowoczesne, czytelne karty diagnostyczne zamiast ściany tekstu",
          "Ciemny alpejski motyw Peak wewnątrz Minecrafta",
          "Personalizacja koloru akcentu, skali oraz pozycji HUD"
        }
      : new String[]{
          "In-game HUD widgets and gameplay utility addons",
          "Clean color-coded cards instead of the vanilla F3 wall",
          "Alpine Peak dark visual theme inside Minecraft",
          "Accent color, HUD scale, opacity and layout tools"
        };

    g.method_25303(font, tabLabels[activeTab], cx, 14, 0xFFF8FAFC);
    g.method_25303(font, headerDesc[activeTab], cx, 26, 0xFF8A9BB2);

    List<ToggleItem> tab0Items = activeTab == 0 ? buildTab0Items(cfg, pl) : List.of();
    List<ToggleItem> tab1Items = activeTab == 1 ? buildTab1Items(cfg, pl) : List.of();
    List<ToggleItem> tab2Items = activeTab == 2 ? buildTab2Items(cfg, pl) : List.of();

    int langW = 28;
    int langX = cx + cw - langW;
    drawMiniActionButton(g, font, langX, 14, langW, 18, pl ? "PL" : "EN", accent, false, vmx, vmy, () -> {
      cfg.language = cfg.isPolish() ? "en" : "pl";
      PeakClientConfig.save();
    });

    List<ToggleItem> activeList = activeTab == 0 ? tab0Items : activeTab == 1 ? tab1Items : activeTab == 2 ? tab2Items : List.of();
    if (!activeList.isEmpty()) {
      long enabledCount = activeList.stream().filter(t -> t.getter.getAsBoolean()).count();
      String countBadge = enabledCount + "/" + activeList.size() + (pl ? " WŁ." : " ON");
      int cbw = font.method_1727(countBadge) + 12;
      int cbx = langX - 6 - cbw;
      PeakRenderUtil.drawRoundedRect(g, cbx, 14, cbw, 18, 4, PeakRenderUtil.withAlpha(accent, 0.14F));
      PeakRenderUtil.drawRoundedOutline(g, cbx, 14, cbw, 18, 4, PeakRenderUtil.withAlpha(accent, 0.36F));
      g.method_25300(font, countBadge, cbx + cbw / 2, 19, PeakRenderUtil.withAlpha(PeakRenderUtil.mixColor(accent, 0xFFFFFF, 0.30F), 1.0F));
    }

    g.method_25294(cx, 44, cx + cw, 45, 0x1E94A3B8);

    int gridTop = 52;
    int gridBottom = 308;
    this.contentClipLeft = cx - 2;
    this.contentClipTop = gridTop - 2;
    this.contentClipRight = cx + cw + 2;
    this.contentClipBottom = gridBottom;

    g.method_44379(this.contentClipLeft, this.contentClipTop, this.contentClipRight, this.contentClipBottom);
    if (activeTab == 0) {
      renderToggleGrid(g, font, tab0Items, cx, gridTop, cw, 38, vmx, vmy, accent);
    } else if (activeTab == 1) {
      renderToggleGrid(g, font, tab1Items, cx, gridTop, cw, 38, vmx, vmy, accent);
      int tipY = 228;
      PeakRenderUtil.drawRoundedGradient(g, cx, tipY, cw, 64, 5, 0xCC0D182C, 0xD808101E);
      PeakRenderUtil.drawRoundedOutline(g, cx, tipY, cw, 64, 5, PeakRenderUtil.withAlpha(accent, 0.32F));
      PeakRenderUtil.drawModuleIcon(g, cx + 10, tipY + 10, "f3", accent, true);
      g.method_25303(font, pl ? "Lepsze F3 aktywuje się klasycznym klawiszem F3" : "Better F3 replaces the debug screen under F3", cx + 32, tipY + 12, 0xFFF8FAFC);
      g.method_25303(font, pl ? "Grupuje FPS, wykres RAM, GPU, kierunek świata," : "Groups FPS, RAM bar, GPU info, Nether converter,", cx + 12, tipY + 32, PeakRenderUtil.TEXT_MUTED);
      g.method_25303(font, pl ? "koordynaty 1:8 Nether oraz blok na celowniku." : "biome details and targeted block/entity ID cleanly.", cx + 12, tipY + 45, PeakRenderUtil.TEXT_MUTED);
    } else if (activeTab == 2) {
      renderToggleGrid(g, font, tab2Items, cx, gridTop, cw, 42, vmx, vmy, accent);
      int infoY = 152;
      PeakRenderUtil.drawRoundedGradient(g, cx, infoY, cw, 74, 5, 0xCC0D182C, 0xD808101E);
      PeakRenderUtil.drawRoundedOutline(g, cx, infoY, cw, 74, 5, PeakRenderUtil.withAlpha(accent, 0.35F));
      PeakRenderUtil.drawPeakCrest(g, cx + 10, infoY + 10, 22, accent);
      g.method_25303(font, pl ? "Paczka zasobów Peak Alpine UI" : "Peak Alpine UI Resource Pack", cx + 38, infoY + 11, 0xFFF8FAFC);
      g.method_25303(font, pl ? "Automatycznie zarządzana przez launcher" : "Automatically synced by Peak Launcher", cx + 38, infoY + 22, PeakRenderUtil.withAlpha(accent, 0.95F));
      String statusStr = pl ? "Aktywna" : "Active";
      int sbw = font.method_1727(statusStr) + 12;
      PeakRenderUtil.drawRoundedRect(g, cx + cw - sbw - 10, infoY + 11, sbw, 15, 4, 0x2634D399);
      PeakRenderUtil.drawRoundedOutline(g, cx + cw - sbw - 10, infoY + 11, sbw, 15, 4, 0x7034D399);
      g.method_25300(font, statusStr, cx + cw - sbw / 2 - 10, infoY + 15, PeakRenderUtil.EMERALD);

      g.method_25303(font, pl ? "Alpejski hotbar, panorama nocnych gór i celownik" : "Custom dark glass hotbar, alpine panorama & crosshair", cx + 10, infoY + 42, PeakRenderUtil.TEXT_MUTED);
      g.method_25303(font, pl ? "działają na wszystkich wersjach (także Vanilla)!" : "work across modern versions including Vanilla!", cx + 10, infoY + 55, PeakRenderUtil.TEXT_MUTED);
    } else {
      renderLayoutAndStyleTab(g, font, cfg, cx, gridTop, cw, vmx, vmy, accent, pl);
    }
    g.method_44380();

    if (this.maxScroll > 0) {
      int sbX = cx + cw + 2;
      int viewH = Math.max(20, this.contentClipBottom - gridTop);
      int totalH = viewH + this.maxScroll;
      int thumbH = Math.max(18, (viewH * viewH) / totalH);
      int thumbY = gridTop + ((viewH - thumbH) * this.scrollOffset) / Math.max(1, this.maxScroll);
      g.method_25294(sbX, gridTop, sbX + 2, this.contentClipBottom, 0x22FFFFFF);
      g.method_25294(sbX, thumbY, sbX + 2, thumbY + thumbH, PeakRenderUtil.withAlpha(accent, 0.85F));
    }

    g.method_25294(cx, 314, cx + cw, 315, 0x1694A3B8);
    int kx = cx;
    kx = drawFooterKeycap(g, font, kx, 320, "RShift", pl ? "Menu Peak" : "Peak GUI", accent) + 10;
    kx = drawFooterKeycap(g, font, kx, 320, "F3", pl ? "Lepsze F3" : "Better F3", accent) + 10;
    kx = drawFooterKeycap(g, font, kx, 320, "C", "Zoom", accent) + 10;
    drawFooterKeycap(g, font, kx, 320, "G", "Fullbright", accent);

    g.method_51448().method_22909();
  }

  private void drawSidebarMountains(class_332 g, int sideW, int accent) {
    int baseY = 278;
    int col = PeakRenderUtil.withAlpha(accent, 0.06F);
    int ridgeCol = PeakRenderUtil.withAlpha(accent, 0.14F);
    for (int x = 8; x < sideW - 8; x += 2) {
      double nx = (x - 8) / (double) Math.max(1, sideW - 16);
      double h1 = Math.max(0.0D, 1.0D - Math.abs(nx - 0.36D) * 2.5D) * 28.0D;
      double h2 = Math.max(0.0D, 1.0D - Math.abs(nx - 0.72D) * 2.9D) * 20.0D;
      int peakY = baseY - (int) Math.round(Math.max(h1, h2));
      if (peakY < baseY) {
        g.method_25294(x, peakY, x + 2, baseY, col);
        g.method_25294(x, peakY, x + 2, peakY + 1, ridgeCol);
      }
    }
  }

  private int drawFooterKeycap(class_332 g, class_327 font, int x, int y, String key, String label, int accent) {
    int kw = font.method_1727(key) + 10;
    PeakRenderUtil.drawRoundedRect(g, x, y, kw, 14, 3, 0xCC111C30);
    PeakRenderUtil.drawRoundedOutline(g, x, y, kw, 14, 3, PeakRenderUtil.withAlpha(accent, 0.42F));
    g.method_25300(font, key, x + kw / 2, y + 3, PeakRenderUtil.withAlpha(PeakRenderUtil.mixColor(accent, 0xFFFFFF, 0.35F), 1.0F));
    int lx = x + kw + 5;
    g.method_25303(font, label, lx, y + 3, PeakRenderUtil.TEXT_MUTED);
    return lx + font.method_1727(label);
  }

  private List<ToggleItem> buildTab0Items(PeakClientConfig cfg, boolean pl) {
    return List.of(
      new ToggleItem("hud", pl ? "HUD (Master)" : "HUD (Master)", pl ? "Nakładka Peak HUD" : "Show Peak HUD", () -> cfg.hudEnabled, () -> cfg.hudEnabled = !cfg.hudEnabled),
      new ToggleItem("fps", "FPS HUD", pl ? "Klatki FPS i min" : "Live & min FPS", () -> cfg.hudFps, () -> cfg.hudFps = !cfg.hudFps),
      new ToggleItem("coords", pl ? "Koordynaty + Nether" : "Coords + Nether", pl ? "XYZ, biom i Nether" : "XYZ, biome & 1:8", () -> cfg.hudCoords, () -> cfg.hudCoords = !cfg.hudCoords),
      new ToggleItem("cps", pl ? "Licznik CPS" : "CPS Counter", pl ? "Kliknięcia LPM | PPM" : "LMB | RMB clicks", () -> cfg.hudCps, () -> cfg.hudCps = !cfg.hudCps),
      new ToggleItem("keys", "Keystrokes", pl ? "WASD, mysz, Spacja" : "WASD, mouse, Space", () -> cfg.hudKeystrokes, () -> cfg.hudKeystrokes = !cfg.hudKeystrokes),
      new ToggleItem("armor", pl ? "Zbroja i Ręka" : "Armor HUD", pl ? "Wytrzymałość %" : "Gear durability %", () -> cfg.hudArmor, () -> cfg.hudArmor = !cfg.hudArmor),
      new ToggleItem("ping", pl ? "Ping i Serwer" : "Ping & Server", pl ? "Adres .peak i ping" : "Host & latency", () -> cfg.hudPing, () -> cfg.hudPing = !cfg.hudPing),
      new ToggleItem("effects", pl ? "Efekty i Zegar" : "Effects & Clock", pl ? "Mikstury oraz czas" : "Potions & clock", () -> cfg.hudEffects, () -> { cfg.hudEffects = !cfg.hudEffects; cfg.hudClock = cfg.hudEffects; }),
      new ToggleItem("sprint", "Toggle Sprint", pl ? "Stały sprint (W)" : "Auto sprint (W)", () -> cfg.toggleSprintEnabled, () -> { cfg.toggleSprintEnabled = !cfg.toggleSprintEnabled; cfg.hudSprint = cfg.toggleSprintEnabled; }),
      new ToggleItem("zoom", "Zoom (C)", pl ? "Przybliżenie kółkiem" : "Scroll to zoom", () -> cfg.zoomEnabled, () -> cfg.zoomEnabled = !cfg.zoomEnabled),
      new ToggleItem("fullbright", "Fullbright (G)", pl ? "Jasność w jaskiniach" : "Full lighting", () -> cfg.fullbrightEnabled, () -> cfg.fullbrightEnabled = !cfg.fullbrightEnabled),
      new ToggleItem("watermark", pl ? "Znaczek Peak" : "Peak Badge", pl ? "Logo PEAK w rogu" : "Corner HUD badge", () -> cfg.showWatermark, () -> cfg.showWatermark = !cfg.showWatermark)
    );
  }

  private List<ToggleItem> buildTab1Items(PeakClientConfig cfg, boolean pl) {
    return List.of(
      new ToggleItem("f3", pl ? "Lepsze F3" : "Better F3", pl ? "Karty zamiast F3" : "Replace F3 wall", () -> cfg.betterF3Enabled, () -> cfg.betterF3Enabled = !cfg.betterF3Enabled),
      new ToggleItem("fps", pl ? "Karta Wydajności" : "Performance Card", pl ? "FPS, RAM bar, GPU" : "FPS, RAM bar, GPU", () -> cfg.f3Performance, () -> cfg.f3Performance = !cfg.f3Performance),
      new ToggleItem("coords", pl ? "Karta Pozycji" : "Location Card", pl ? "XYZ, chunk i biom" : "XYZ, chunk & biome", () -> cfg.f3Position, () -> cfg.f3Position = !cfg.f3Position),
      new ToggleItem("coords", pl ? "Przelicznik 1:8" : "Nether 1:8", pl ? "Overworld / Nether" : "Overworld / Nether", () -> cfg.f3NetherCoords, () -> cfg.f3NetherCoords = !cfg.f3NetherCoords),
      new ToggleItem("ping", pl ? "Świat i Serwer" : "World & Server", pl ? "Ping, czas i pogoda" : "Ping, time, weather", () -> cfg.f3WorldServer, () -> cfg.f3WorldServer = !cfg.f3WorldServer),
      new ToggleItem("zoom", pl ? "Celownik (Target)" : "Target Inspector", pl ? "Blok / byt pod cel." : "Crosshair block ID", () -> cfg.f3Target, () -> cfg.f3Target = !cfg.f3Target),
      new ToggleItem("hud", pl ? "Kompaktowe F3" : "Compact F3", pl ? "Mniej wierszy F3" : "Fewer F3 rows", () -> cfg.f3Compact, () -> cfg.f3Compact = !cfg.f3Compact)
    );
  }

  private List<ToggleItem> buildTab2Items(PeakClientConfig cfg, boolean pl) {
    return List.of(
      new ToggleItem("look", pl ? "Menu Główne Peak" : "Alpine Main Menu", pl ? "Nocne góry i karta" : "Sky & player card", () -> cfg.peakMainMenu, () -> cfg.peakMainMenu = !cfg.peakMainMenu),
      new ToggleItem("hud", pl ? "Szklane Przyciski" : "Glass Buttons", pl ? "Alpejskie szkło UI" : "Dark glass style", () -> cfg.peakButtonStyle, () -> cfg.peakButtonStyle = !cfg.peakButtonStyle),
      new ToggleItem("look", pl ? "Ciemne Ładowanie" : "Dark Loading", pl ? "Ekran startowy Peak" : "Dark load screen", () -> cfg.peakLoadingScreen, () -> cfg.peakLoadingScreen = !cfg.peakLoadingScreen),
      new ToggleItem("watermark", pl ? "Znaczek Peak HUD" : "Peak HUD Badge", pl ? "Status Zoom / FB" : "Zoom / FB status", () -> cfg.showWatermark, () -> cfg.showWatermark = !cfg.showWatermark)
    );
  }

  private void renderLayoutAndStyleTab(class_332 g, class_327 font, PeakClientConfig cfg, int cx, int gridTop, int cw, int vmx, int vmy, int accent, boolean pl) {
    this.maxScroll = 0;
    this.scrollOffset = 0;

    int y1 = gridTop;
    PeakRenderUtil.drawRoundedGradient(g, cx, y1, cw, 58, 5, 0xCC0D182C, 0xD808101E);
    PeakRenderUtil.drawRoundedOutline(g, cx, y1, cw, 58, 5, 0x3264748B);
    g.method_25303(font, pl ? "Kolor akcentu Peak Client" : "Peak Client Accent Color", cx + 10, y1 + 8, 0xFFF8FAFC);
    String hexBadge = cfg.accentColor.toUpperCase();
    int hbw = font.method_1727(hexBadge) + 10;
    PeakRenderUtil.drawRoundedRect(g, cx + cw - hbw - 10, y1 + 6, hbw, 13, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.method_25300(font, hexBadge, cx + cw - hbw / 2 - 10, y1 + 9, PeakRenderUtil.withAlpha(accent, 1.0F));

    int swW = 58;
    int swGap = 6;
    int swTotal = ACCENT_SWATCHES.length * swW + (ACCENT_SWATCHES.length - 1) * swGap;
    int swX = cx + (cw - swTotal) / 2;
    int swY = y1 + 26;
    for (String hex : ACCENT_SWATCHES) {
      int rgb = Integer.parseInt(hex.substring(1), 16);
      boolean active = hex.equalsIgnoreCase(cfg.accentColor);
      boolean hov = isHover(vmx, vmy, swX, swY, swW, 22);
      if (active) {
        PeakRenderUtil.drawRoundedOutline(g, swX - 2, swY - 2, swW + 4, 26, 6, 0xEEFFFFFF);
      }
      PeakRenderUtil.drawRoundedGradient(g, swX, swY, swW, 22, 5,
        0xFF000000 | PeakRenderUtil.mixColor(rgb, 0xFFFFFF, hov ? 0.18F : 0.08F),
        0xFF000000 | PeakRenderUtil.mixColor(rgb, 0x070D17, 0.16F));
      PeakRenderUtil.drawRoundedOutline(g, swX, swY, swW, 22, 5, active ? 0xFFFFFFFF : hov ? 0xCCFFFFFF : 0x55000000);
      if (active) g.method_25300(font, "✓", swX + swW / 2, swY + 7, 0xFF070D17);
      regions.add(new ClickRegion(swX, swY, swW, 22, () -> { cfg.accentColor = hex; PeakClientConfig.save(); }));
      swX += swW + swGap;
    }

    int y2 = y1 + 66;
    PeakRenderUtil.drawRoundedGradient(g, cx, y2, cw, 58, 5, 0xCC0D182C, 0xD808101E);
    PeakRenderUtil.drawRoundedOutline(g, cx, y2, cw, 58, 5, 0x3264748B);
    g.method_25303(font, pl ? "Skala HUD" : "HUD Scale", cx + 10, y2 + 8, 0xFFF8FAFC);
    String scaleText = Math.round(cfg.hudScale * 100.0F) + "%";
    int stw = font.method_1727(scaleText) + 10;
    PeakRenderUtil.drawRoundedRect(g, cx + cw - stw - 10, y2 + 6, stw, 13, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.method_25300(font, scaleText, cx + cw - stw / 2 - 10, y2 + 9, PeakRenderUtil.withAlpha(accent, 1.0F));

    int railW = cw - 20;
    int railX = cx + 10;
    PeakRenderUtil.drawRoundedRect(g, railX, y2 + 25, railW, 24, 5, 0xCC070E1A);
    PeakRenderUtil.drawRoundedOutline(g, railX, y2 + 25, railW, 24, 5, 0x26475569);

    float[] scales = {0.60F, 0.72F, 0.85F, 1.00F};
    String[] scaleNames = {"60%", "72%", "85%", "100%"};
    int segW = (railW - 18) / 4;
    int sx = railX + 3;
    for (int i = 0; i < scales.length; i++) {
      final float val = scales[i];
      boolean act = Math.abs(cfg.hudScale - val) < 0.05F;
      drawMiniActionButton(g, font, sx, y2 + 28, segW, 18, scaleNames[i], accent, act, vmx, vmy, () -> {
        boolean autoStack = cfg.isUsingDefaultLayout();
        cfg.hudScale = val;
        if (autoStack) cfg.applyDefaultStackForScale();
        PeakClientConfig.save();
      });
      sx += segW + 4;
    }

    int y3 = y2 + 66;
    PeakRenderUtil.drawRoundedGradient(g, cx, y3, cw, 58, 5, 0xCC0D182C, 0xD808101E);
    PeakRenderUtil.drawRoundedOutline(g, cx, y3, cw, 58, 5, 0x3264748B);
    g.method_25303(font, pl ? "Przezroczystość paneli HUD" : "HUD Panel Opacity", cx + 10, y3 + 8, 0xFFF8FAFC);
    String opText = Math.round(cfg.hudOpacity * 100.0F) + "%";
    int otw = font.method_1727(opText) + 10;
    PeakRenderUtil.drawRoundedRect(g, cx + cw - otw - 10, y3 + 6, otw, 13, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.method_25300(font, opText, cx + cw - otw / 2 - 10, y3 + 9, PeakRenderUtil.withAlpha(accent, 1.0F));

    PeakRenderUtil.drawRoundedRect(g, railX, y3 + 25, railW, 24, 5, 0xCC070E1A);
    PeakRenderUtil.drawRoundedOutline(g, railX, y3 + 25, railW, 24, 5, 0x26475569);

    float[] opacities = {0.35F, 0.55F, 0.72F, 0.88F};
    String[] opNames = {"35%", "55%", "72%", "88%"};
    int ox = railX + 3;
    for (int i = 0; i < opacities.length; i++) {
      final float val = opacities[i];
      boolean act = Math.abs(cfg.hudOpacity - val) < 0.08F;
      drawMiniActionButton(g, font, ox, y3 + 28, segW, 18, opNames[i], accent, act, vmx, vmy, () -> {
        cfg.hudOpacity = val;
        PeakClientConfig.save();
      });
      ox += segW + 4;
    }

    int actY = y3 + 68;
    int halfW = (cw - 8) / 2;
    drawMiniActionButton(g, font, cx, actY, halfW, 22,
      pl ? "Edytor Układu HUD" : "HUD Layout Editor", accent, true, vmx, vmy, () -> {
        if (field_22787 != null) field_22787.method_1507(new PeakHudEditorScreen(this));
      });
    drawMiniActionButton(g, font, cx + halfW + 8, actY, halfW, 22,
      pl ? "Resetuj pozycje" : "Reset Positions", 0xFBBF24, false, vmx, vmy, () -> {
        cfg.resetPositions();
        PeakClientState.showToast(pl ? "Zresetowano pozycje HUD" : "HUD positions reset");
      });

    drawMiniActionButton(g, font, cx, actY + 27, cw, 20,
      pl ? "Przywróć domyślne ustawienia Peak Client" : "Restore Peak Client defaults", 0xFB7185, false, vmx, vmy, () -> {
        cfg.resetAllDefaults();
        PeakClientState.showToast(pl ? "Przywrócono domyślne ustawienia" : "Restored default settings");
      });
  }

  private void renderToggleGrid(class_332 g, class_327 font, List<ToggleItem> items, int x, int y, int w, int cardH, int mx, int my, int accent) {
    int cols = 2;
    int gapX = 8;
    int gapY = 5;
    int availH = Math.max(60, this.contentClipBottom - y);
    int rows = (items.size() + 1) / cols;
    int stepY = cardH + gapY;
    int contentH = rows * stepY - gapY;
    this.maxScroll = Math.max(0, contentH - availH);
    this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset));
    int cardW = (w - gapX) / cols;

    for (int i = 0; i < items.size(); i++) {
      ToggleItem item = items.get(i);
      int col = i % cols;
      int row = i / cols;
      int cx = x + col * (cardW + gapX);
      int cy = y + row * stepY - this.scrollOffset;
      if (cy + cardH < this.contentClipTop || cy > this.contentClipBottom) {
        continue;
      }
      boolean on = item.getter.getAsBoolean();
      boolean inClip = my >= this.contentClipTop && my <= this.contentClipBottom;
      boolean hov = inClip && isHover(mx, my, cx, cy, cardW, cardH);

      int topBg = on ? (hov ? 0xDC162742 : 0xD2111F36) : (hov ? 0xCE101B2E : 0xB80C1424);
      int botBg = on ? 0xDC0C1628 : 0xC409101D;
      int border = on
        ? PeakRenderUtil.withAlpha(accent, hov ? 0.72F : 0.38F)
        : (hov ? 0x5594A3B8 : 0x26475569);

      PeakRenderUtil.drawRoundedGradient(g, cx, cy, cardW, cardH, 5, topBg, botBg);
      PeakRenderUtil.drawRoundedOutline(g, cx, cy, cardW, cardH, 5, border);
      if (on) {
        g.method_25294(cx + 2, cy + 7, cx + 3, cy + cardH - 7, PeakRenderUtil.withAlpha(accent, 0.85F));
      }

      PeakRenderUtil.drawModuleIcon(g, cx + 8, cy + (cardH - 16) / 2, item.icon, accent, on);

      int textX = cx + 30;
      int toggleW = 26;
      int toggleH = 13;
      int toggleX = cx + cardW - toggleW - 8;
      int toggleY = cy + (cardH - toggleH) / 2;
      int maxTextW = toggleX - textX - 6;

      String title = item.title;
      if (font.method_1727(title) > maxTextW) title = font.method_27523(title, maxTextW - 4) + ".";
      int titleY = cardH >= 40 ? cy + 9 : cy + 7;
      int subY = cardH >= 40 ? cy + 22 : cy + 19;
      g.method_25303(font, title, textX, titleY, on ? 0xFFF8FAFC : 0xFFCBD5E1);

      String sub = item.sub;
      if (font.method_1727(sub) > maxTextW) sub = font.method_27523(sub, maxTextW - 4) + ".";
      g.method_25303(font, sub, textX, subY, PeakRenderUtil.TEXT_MUTED);

      PeakRenderUtil.drawToggleSwitch(g, toggleX, toggleY, toggleW, toggleH, on, hov, accent);

      regions.add(new ClickRegion(cx, cy, cardW, cardH, () -> {
        item.toggle.run();
        PeakClientConfig.save();
      }, true));
    }
  }

  private void drawMiniActionButton(class_332 g, class_327 font, int x, int y, int w, int h, String label, int accent, boolean primary, int mx, int my, Runnable action) {
    boolean hov = isHover(mx, my, x, y, w, h);
    int r = Math.min(5, Math.min(w / 3, h / 2));
    if (primary) {
      int topC = 0xFF000000 | PeakRenderUtil.mixColor(accent, 0xFFFFFF, hov ? 0.20F : 0.08F);
      int botC = 0xFF000000 | PeakRenderUtil.mixColor(accent, 0x070D17, 0.14F);
      PeakRenderUtil.drawRoundedGradient(g, x, y, w, h, r, topC, botC);
      PeakRenderUtil.drawRoundedOutline(g, x, y, w, h, r, PeakRenderUtil.withAlpha(0xFFFFFF, hov ? 0.45F : 0.24F));
      g.method_25300(font, label, x + w / 2, y + (h - 7) / 2, 0xFF060D18);
    } else {
      int topBg = hov ? 0xD2182842 : 0xAA101B2E;
      int botBg = hov ? 0xDE111D32 : 0xBB0A1220;
      int border = accent == 0xFB7185 || accent == 0xFBBF24
        ? PeakRenderUtil.withAlpha(accent, hov ? 0.72F : 0.40F)
        : (hov ? PeakRenderUtil.withAlpha(accent, 0.65F) : 0x3864748B);
      PeakRenderUtil.drawRoundedGradient(g, x, y, w, h, r, topBg, botBg);
      PeakRenderUtil.drawRoundedOutline(g, x, y, w, h, r, border);
      g.method_25300(font, label, x + w / 2, y + (h - 7) / 2, PeakRenderUtil.TEXT_PRIMARY);
    }
    regions.add(new ClickRegion(x, y, w, h, action, false));
  }

  private static boolean isHover(double mx, double my, int x, int y, int w, int h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  @Override
  public boolean method_25401(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
    this.computeLayout();
    double vmx = toVirtualX(mouseX);
    double vmy = toVirtualY(mouseY);
    if (this.maxScroll > 0 && isHover(vmx, vmy, this.contentClipLeft, this.contentClipTop, this.contentClipRight - this.contentClipLeft, this.contentClipBottom - this.contentClipTop)) {
      this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset - (int) Math.round(verticalAmount * 22.0D)));
      return true;
    }
    return super.method_25401(mouseX, mouseY, horizontalAmount, verticalAmount);
  }

  @Override
  public boolean method_25402(double mouseX, double mouseY, int button) {
    this.computeLayout();
    if (button == GLFW.GLFW_MOUSE_BUTTON_LEFT) {
      double vmx = toVirtualX(mouseX);
      double vmy = toVirtualY(mouseY);
      for (int i = regions.size() - 1; i >= 0; i--) {
        ClickRegion r = regions.get(i);
        if (r.clipped && (vmy < this.contentClipTop || vmy > this.contentClipBottom)) {
          continue;
        }
        if (isHover(vmx, vmy, r.x, r.y, r.w, r.h)) {
          class_310 mc = class_310.method_1551();
          if (mc != null && mc.method_1483() != null) {
            mc.method_1483().method_4873(class_1109.method_47978(class_3417.field_15015, 1.0F));
          }
          r.action.run();
          return true;
        }
      }
    }
    return super.method_25402(mouseX, mouseY, button);
  }

  @Override
  public boolean method_25404(int keyCode, int scanCode, int modifiers) {
    if (keyCode == GLFW.GLFW_KEY_ESCAPE || keyCode == GLFW.GLFW_KEY_RIGHT_SHIFT) {
      this.method_25419();
      return true;
    }
    return super.method_25404(keyCode, scanCode, modifiers);
  }

  private record ToggleItem(String icon, String title, String sub, BooleanSupplier getter, Runnable toggle) {}
  private record ClickRegion(int x, int y, int w, int h, Runnable action, boolean clipped) {
    ClickRegion(int x, int y, int w, int h, Runnable action) {
      this(x, y, w, h, action, false);
    }
  }
}
