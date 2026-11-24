package pl.peaklauncher.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;

public class PeakGuiScreen extends Screen {
  private static final int VIRTUAL_W = 580;
  private static final int VIRTUAL_H = 344;
  private static final String[] ACCENT_SWATCHES = {
    "#38BDF8", "#34D399", "#A78BFA", "#FB7185", "#FBBF24", "#60A5FA"
  };

  private final Screen parent;
  private int activeTab = 0; // 0: HUD & Addons, 1: Better F3, 2: Peak Look, 3: Layout & Style
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

  public PeakGuiScreen(Screen parent) {
    super(Component.literal("Peak Client GUI"));
    this.parent = parent;
  }

  private void computeLayout() {
    float sx = (this.width - 28.0F) / VIRTUAL_W;
    float sy = (this.height - 22.0F) / VIRTUAL_H;
    this.uiScale = Math.max(0.56F, Math.min(1.0F, Math.min(sx, sy)));
    this.originX = (this.width - VIRTUAL_W * this.uiScale) / 2.0F;
    this.originY = (this.height - VIRTUAL_H * this.uiScale) / 2.0F;
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
  public boolean isPauseScreen() {
    return true;
  }

  @Override
  public void onClose() {
    PeakClientConfig.save();
    if (this.minecraft != null && this.minecraft.gui != null) {
      this.minecraft.gui.setScreen(this.parent);
    }
  }

  @Override
  public void extractBackground(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
    if (this.minecraft != null && this.minecraft.level != null) {
      this.extractBlurredBackground(g);
      g.fill(0, 0, this.width, this.height, 0x7A040812);
    } else {
      PeakTitleScreenOverlay.renderBackdrop(g, this.width, this.height);
      g.fill(0, 0, this.width, this.height, 0x6E040812);
    }
  }

  @Override
  public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
    super.extractRenderState(g, mouseX, mouseY, partialTick);
    this.regions.clear();
    this.computeLayout();

    int vmx = (int) Math.round(toVirtualX(mouseX));
    int vmy = (int) Math.round(toVirtualY(mouseY));

    PeakClientConfig cfg = PeakClientConfig.get();
    boolean pl = cfg.isPolish();
    int accent = cfg.getAccentRgb();
    Font font = this.font;

    g.pose().pushMatrix();
    g.pose().translate(this.originX, this.originY);
    g.pose().scale(this.uiScale, this.uiScale);

    // Floating rounded glass container
    PeakRenderUtil.drawSoftShadow(g, 0, 0, VIRTUAL_W, VIRTUAL_H, 7);
    PeakRenderUtil.drawRoundedGradient(g, 0, 0, VIRTUAL_W, VIRTUAL_H, 7, 0xEE0B1322, 0xF4060B15);
    PeakRenderUtil.drawRoundedOutline(g, 0, 0, VIRTUAL_W, VIRTUAL_H, 7, 0x3894A3B8);
    g.fill(10, 1, VIRTUAL_W - 10, 2, 0x1EFFFFFF);
    g.fill(210, 0, 370, 2, PeakRenderUtil.withAlpha(accent, 0.85F));

    // Left sidebar
    int sideW = 148;
    PeakRenderUtil.drawRoundedGradient(g, 1, 1, sideW - 1, VIRTUAL_H - 2, 6, 0xCC070E1A, 0xDD050A13);
    g.fill(sideW, 8, sideW + 1, VIRTUAL_H - 8, 0x2294A3B8);
    drawSidebarMountains(g, sideW, accent);

    // Brand Crest & Header
    PeakRenderUtil.drawPeakCrest(g, 14, 14, 24, accent);
    g.text(font, "PEAK", 44, 14, 0xFFF8FAFC, true);
    g.text(font, "CLIENT", 44 + font.width("PEAK") + 3, 14, PeakRenderUtil.TEXT_MUTED, true);
    String verTag = "v" + PeakClientMod.VERSION;
    int verW = font.width(verTag) + 8;
    PeakRenderUtil.drawRoundedRect(g, 44, 26, verW, 11, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.text(font, verTag, 48, 28, PeakRenderUtil.withAlpha(accent, 1.0F), true);

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
        g.fill(tx + 2, tabY + 6, tx + 4, tabY + th - 6, PeakRenderUtil.withAlpha(accent, 1.0F));
      } else if (hov) {
        PeakRenderUtil.drawRoundedRect(g, tx, tabY, tw, th, 5, 0x12FFFFFF);
      }
      PeakRenderUtil.drawModuleIcon(g, tx + 8, tabY + 5, tabIcons[i], accent, sel || hov);
      int textCol = sel ? 0xFFF8FAFC : hov ? 0xFFE2E8F0 : 0xFF8A9BB2;
      g.text(font, tabLabels[i], tx + 29, tabY + 9, textCol, true);
      regions.add(new ClickRegion(tx, tabY, tw, th, () -> switchTab(idx)));
      tabY += 30;
    }

    // Sidebar bottom action buttons
    drawMiniActionButton(g, font, 10, 282, sideW - 20, 24,
      pl ? "Edytor HUD" : "HUD Editor", accent, true, vmx, vmy,
      () -> {
        if (minecraft != null && minecraft.gui != null) {
          minecraft.gui.setScreen(new PeakHudEditorScreen(this));
        }
      });

    drawMiniActionButton(g, font, 10, 312, sideW - 20, 22,
      pl ? "Zamknij (ESC)" : "Close (ESC)", 0x64748B, false, vmx, vmy, this::onClose);

    // Content Header
    int cx = 162;
    int cw = VIRTUAL_W - cx - 14; // 404
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

    g.text(font, tabLabels[activeTab], cx, 14, 0xFFF8FAFC, true);
    g.text(font, headerDesc[activeTab], cx, 26, 0xFF8A9BB2, true);

    // Build active tab toggle lists up front so header badge reflects live count
    List<ToggleItem> tab0Items = activeTab == 0 ? buildTab0Items(cfg, pl) : List.of();
    List<ToggleItem> tab1Items = activeTab == 1 ? buildTab1Items(cfg, pl) : List.of();
    List<ToggleItem> tab2Items = activeTab == 2 ? buildTab2Items(cfg, pl) : List.of();

    // Language toggle pill at top-right
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
      int cbw = font.width(countBadge) + 12;
      int cbx = langX - 6 - cbw;
      PeakRenderUtil.drawRoundedRect(g, cbx, 14, cbw, 18, 4, PeakRenderUtil.withAlpha(accent, 0.14F));
      PeakRenderUtil.drawRoundedOutline(g, cbx, 14, cbw, 18, 4, PeakRenderUtil.withAlpha(accent, 0.36F));
      g.centeredText(font, countBadge, cbx + cbw / 2, 19, PeakRenderUtil.withAlpha(PeakRenderUtil.mixColor(accent, 0xFFFFFF, 0.30F), 1.0F));
    }

    g.fill(cx, 44, cx + cw, 45, 0x1E94A3B8);

    int gridTop = 52;
    int gridBottom = 308;
    this.contentClipLeft = cx - 2;
    this.contentClipTop = gridTop - 2;
    this.contentClipRight = cx + cw + 2;
    this.contentClipBottom = gridBottom;

    g.enableScissor(this.contentClipLeft, this.contentClipTop, this.contentClipRight, this.contentClipBottom);
    if (activeTab == 0) {
      renderToggleGrid(g, font, tab0Items, cx, gridTop, cw, 38, vmx, vmy, accent);
    } else if (activeTab == 1) {
      renderToggleGrid(g, font, tab1Items, cx, gridTop, cw, 38, vmx, vmy, accent);
      int tipY = 228;
      PeakRenderUtil.drawRoundedGradient(g, cx, tipY, cw, 64, 5, 0xCC0D182C, 0xD808101E);
      PeakRenderUtil.drawRoundedOutline(g, cx, tipY, cw, 64, 5, PeakRenderUtil.withAlpha(accent, 0.32F));
      PeakRenderUtil.drawModuleIcon(g, cx + 10, tipY + 10, "f3", accent, true);
      g.text(font, pl ? "Lepsze F3 aktywuje się klasycznym klawiszem F3" : "Better F3 replaces the debug screen under F3", cx + 32, tipY + 12, 0xFFF8FAFC, true);
      g.text(font, pl ? "Grupuje FPS, wykres RAM, GPU, kierunek świata," : "Groups FPS, RAM bar, GPU info, Nether converter,", cx + 12, tipY + 32, PeakRenderUtil.TEXT_MUTED, true);
      g.text(font, pl ? "koordynaty 1:8 Nether oraz blok na celowniku." : "biome details and targeted block/entity ID cleanly.", cx + 12, tipY + 45, PeakRenderUtil.TEXT_MUTED, true);
    } else if (activeTab == 2) {
      renderToggleGrid(g, font, tab2Items, cx, gridTop, cw, 42, vmx, vmy, accent);
      int infoY = 152;
      PeakRenderUtil.drawRoundedGradient(g, cx, infoY, cw, 74, 5, 0xCC0D182C, 0xD808101E);
      PeakRenderUtil.drawRoundedOutline(g, cx, infoY, cw, 74, 5, PeakRenderUtil.withAlpha(accent, 0.35F));
      PeakRenderUtil.drawPeakCrest(g, cx + 10, infoY + 10, 22, accent);
      g.text(font, pl ? "Paczka zasobów Peak Alpine UI" : "Peak Alpine UI Resource Pack", cx + 38, infoY + 11, 0xFFF8FAFC, true);
      g.text(font, pl ? "Automatycznie zarządzana przez launcher" : "Automatically synced by Peak Launcher", cx + 38, infoY + 22, PeakRenderUtil.withAlpha(accent, 0.95F), true);
      String statusStr = pl ? "Aktywna" : "Active";
      int sbw = font.width(statusStr) + 12;
      PeakRenderUtil.drawRoundedRect(g, cx + cw - sbw - 10, infoY + 11, sbw, 15, 4, 0x2634D399);
      PeakRenderUtil.drawRoundedOutline(g, cx + cw - sbw - 10, infoY + 11, sbw, 15, 4, 0x7034D399);
      g.centeredText(font, statusStr, cx + cw - sbw / 2 - 10, infoY + 15, PeakRenderUtil.EMERALD);

      g.text(font, pl ? "Alpejski hotbar, panorama nocnych gór i celownik" : "Custom dark glass hotbar, alpine panorama & crosshair", cx + 10, infoY + 42, PeakRenderUtil.TEXT_MUTED, true);
      g.text(font, pl ? "działają na wszystkich wersjach (także Vanilla)!" : "work across modern versions including Vanilla!", cx + 10, infoY + 55, PeakRenderUtil.TEXT_MUTED, true);
    } else {
      renderLayoutAndStyleTab(g, font, cfg, cx, gridTop, cw, vmx, vmy, accent, pl);
    }
    g.disableScissor();

    if (this.maxScroll > 0) {
      int sbX = cx + cw + 2;
      int viewH = Math.max(20, this.contentClipBottom - gridTop);
      int totalH = viewH + this.maxScroll;
      int thumbH = Math.max(18, (viewH * viewH) / totalH);
      int thumbY = gridTop + ((viewH - thumbH) * this.scrollOffset) / Math.max(1, this.maxScroll);
      g.fill(sbX, gridTop, sbX + 2, this.contentClipBottom, 0x22FFFFFF);
      g.fill(sbX, thumbY, sbX + 2, thumbY + thumbH, PeakRenderUtil.withAlpha(accent, 0.85F));
    }

    // Bottom shortcut keycap strip
    g.fill(cx, 314, cx + cw, 315, 0x1694A3B8);
    int kx = cx;
    kx = drawFooterKeycap(g, font, kx, 320, "RShift", pl ? "Menu Peak" : "Peak GUI", accent) + 10;
    kx = drawFooterKeycap(g, font, kx, 320, "F3", pl ? "Lepsze F3" : "Better F3", accent) + 10;
    kx = drawFooterKeycap(g, font, kx, 320, "C", "Zoom", accent) + 10;
    drawFooterKeycap(g, font, kx, 320, "G", "Fullbright", accent);

    g.pose().popMatrix();
  }

  private void drawSidebarMountains(GuiGraphicsExtractor g, int sideW, int accent) {
    int baseY = 278;
    int col = PeakRenderUtil.withAlpha(accent, 0.06F);
    int ridgeCol = PeakRenderUtil.withAlpha(accent, 0.14F);
    for (int x = 8; x < sideW - 8; x += 2) {
      double nx = (x - 8) / (double) Math.max(1, sideW - 16);
      double h1 = Math.max(0.0D, 1.0D - Math.abs(nx - 0.36D) * 2.5D) * 28.0D;
      double h2 = Math.max(0.0D, 1.0D - Math.abs(nx - 0.72D) * 2.9D) * 20.0D;
      int peakY = baseY - (int) Math.round(Math.max(h1, h2));
      if (peakY < baseY) {
        g.fill(x, peakY, x + 2, baseY, col);
        g.fill(x, peakY, x + 2, peakY + 1, ridgeCol);
      }
    }
  }

  private int drawFooterKeycap(GuiGraphicsExtractor g, Font font, int x, int y, String key, String label, int accent) {
    int kw = font.width(key) + 10;
    PeakRenderUtil.drawRoundedRect(g, x, y, kw, 14, 3, 0xCC111C30);
    PeakRenderUtil.drawRoundedOutline(g, x, y, kw, 14, 3, PeakRenderUtil.withAlpha(accent, 0.42F));
    g.centeredText(font, key, x + kw / 2, y + 3, PeakRenderUtil.withAlpha(PeakRenderUtil.mixColor(accent, 0xFFFFFF, 0.35F), 1.0F));
    int lx = x + kw + 5;
    g.text(font, label, lx, y + 3, PeakRenderUtil.TEXT_MUTED, true);
    return lx + font.width(label);
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

  private void renderLayoutAndStyleTab(GuiGraphicsExtractor g, Font font, PeakClientConfig cfg, int cx, int gridTop, int cw, int vmx, int vmy, int accent, boolean pl) {
    this.maxScroll = 0;
    this.scrollOffset = 0;

    // Section 1: Accent Color Card
    int y1 = gridTop;
    PeakRenderUtil.drawRoundedGradient(g, cx, y1, cw, 58, 5, 0xCC0D182C, 0xD808101E);
    PeakRenderUtil.drawRoundedOutline(g, cx, y1, cw, 58, 5, 0x3264748B);
    g.text(font, pl ? "Kolor akcentu Peak Client" : "Peak Client Accent Color", cx + 10, y1 + 8, 0xFFF8FAFC, true);
    String hexBadge = cfg.accentColor.toUpperCase();
    int hbw = font.width(hexBadge) + 10;
    PeakRenderUtil.drawRoundedRect(g, cx + cw - hbw - 10, y1 + 6, hbw, 13, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.centeredText(font, hexBadge, cx + cw - hbw / 2 - 10, y1 + 9, PeakRenderUtil.withAlpha(accent, 1.0F));

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
      if (active) g.centeredText(font, "✓", swX + swW / 2, swY + 7, 0xFF070D17);
      regions.add(new ClickRegion(swX, swY, swW, 22, () -> { cfg.accentColor = hex; PeakClientConfig.save(); }));
      swX += swW + swGap;
    }

    // Section 2: HUD Scale Segmented Rail
    int y2 = y1 + 66;
    PeakRenderUtil.drawRoundedGradient(g, cx, y2, cw, 58, 5, 0xCC0D182C, 0xD808101E);
    PeakRenderUtil.drawRoundedOutline(g, cx, y2, cw, 58, 5, 0x3264748B);
    g.text(font, pl ? "Skala HUD" : "HUD Scale", cx + 10, y2 + 8, 0xFFF8FAFC, true);
    String scaleText = Math.round(cfg.hudScale * 100.0F) + "%";
    int stw = font.width(scaleText) + 10;
    PeakRenderUtil.drawRoundedRect(g, cx + cw - stw - 10, y2 + 6, stw, 13, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.centeredText(font, scaleText, cx + cw - stw / 2 - 10, y2 + 9, PeakRenderUtil.withAlpha(accent, 1.0F));

    int railW = cw - 20; // 384
    int railX = cx + 10;
    PeakRenderUtil.drawRoundedRect(g, railX, y2 + 25, railW, 24, 5, 0xCC070E1A);
    PeakRenderUtil.drawRoundedOutline(g, railX, y2 + 25, railW, 24, 5, 0x26475569);

    float[] scales = {0.60F, 0.72F, 0.85F, 1.00F};
    String[] scaleNames = {"60%", "72%", "85%", "100%"};
    int segW = (railW - 18) / 4; // 91
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

    // Section 3: HUD Opacity Segmented Rail
    int y3 = y2 + 66;
    PeakRenderUtil.drawRoundedGradient(g, cx, y3, cw, 58, 5, 0xCC0D182C, 0xD808101E);
    PeakRenderUtil.drawRoundedOutline(g, cx, y3, cw, 58, 5, 0x3264748B);
    g.text(font, pl ? "Przezroczystość paneli HUD" : "HUD Panel Opacity", cx + 10, y3 + 8, 0xFFF8FAFC, true);
    String opText = Math.round(cfg.hudOpacity * 100.0F) + "%";
    int otw = font.width(opText) + 10;
    PeakRenderUtil.drawRoundedRect(g, cx + cw - otw - 10, y3 + 6, otw, 13, 3, PeakRenderUtil.withAlpha(accent, 0.16F));
    g.centeredText(font, opText, cx + cw - otw / 2 - 10, y3 + 9, PeakRenderUtil.withAlpha(accent, 1.0F));

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

    // Bottom Actions
    int actY = y3 + 68;
    int halfW = (cw - 8) / 2;
    drawMiniActionButton(g, font, cx, actY, halfW, 22,
      pl ? "Edytor Układu HUD" : "HUD Layout Editor", accent, true, vmx, vmy, () -> {
        if (minecraft != null && minecraft.gui != null) {
          minecraft.gui.setScreen(new PeakHudEditorScreen(this));
        }
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

  private void renderToggleGrid(GuiGraphicsExtractor g, Font font, List<ToggleItem> items, int x, int y, int w, int cardH, int mx, int my, int accent) {
    int cols = 2;
    int gapX = 8;
    int gapY = 5;
    int availH = Math.max(60, this.contentClipBottom - y);
    int rows = (items.size() + 1) / cols;
    int stepY = cardH + gapY;
    int contentH = rows * stepY - gapY;
    this.maxScroll = Math.max(0, contentH - availH);
    this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset));
    int cardW = (w - gapX) / cols; // 198

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
        g.fill(cx + 2, cy + 7, cx + 3, cy + cardH - 7, PeakRenderUtil.withAlpha(accent, 0.85F));
      }

      PeakRenderUtil.drawModuleIcon(g, cx + 8, cy + (cardH - 16) / 2, item.icon, accent, on);

      int textX = cx + 30;
      int toggleW = 26;
      int toggleH = 13;
      int toggleX = cx + cardW - toggleW - 8;
      int toggleY = cy + (cardH - toggleH) / 2;
      int maxTextW = toggleX - textX - 6;

      String title = item.title;
      if (font.width(title) > maxTextW) title = font.plainSubstrByWidth(title, maxTextW - 4) + ".";
      int titleY = cardH >= 40 ? cy + 9 : cy + 7;
      int subY = cardH >= 40 ? cy + 22 : cy + 19;
      g.text(font, title, textX, titleY, on ? 0xFFF8FAFC : 0xFFCBD5E1, true);

      String sub = item.sub;
      if (font.width(sub) > maxTextW) sub = font.plainSubstrByWidth(sub, maxTextW - 4) + ".";
      g.text(font, sub, textX, subY, PeakRenderUtil.TEXT_MUTED, true);

      PeakRenderUtil.drawToggleSwitch(g, toggleX, toggleY, toggleW, toggleH, on, hov, accent);

      regions.add(new ClickRegion(cx, cy, cardW, cardH, () -> {
        item.toggle.run();
        PeakClientConfig.save();
      }, true));
    }
  }

  private void drawMiniActionButton(GuiGraphicsExtractor g, Font font, int x, int y, int w, int h, String label, int accent, boolean primary, int mx, int my, Runnable action) {
    boolean hov = isHover(mx, my, x, y, w, h);
    int r = Math.min(5, Math.min(w / 3, h / 2));
    if (primary) {
      int topC = 0xFF000000 | PeakRenderUtil.mixColor(accent, 0xFFFFFF, hov ? 0.20F : 0.08F);
      int botC = 0xFF000000 | PeakRenderUtil.mixColor(accent, 0x070D17, 0.14F);
      PeakRenderUtil.drawRoundedGradient(g, x, y, w, h, r, topC, botC);
      PeakRenderUtil.drawRoundedOutline(g, x, y, w, h, r, PeakRenderUtil.withAlpha(0xFFFFFF, hov ? 0.45F : 0.24F));
      g.centeredText(font, label, x + w / 2, y + (h - 7) / 2, 0xFF060D18);
    } else {
      int topBg = hov ? 0xD2182842 : 0xAA101B2E;
      int botBg = hov ? 0xDE111D32 : 0xBB0A1220;
      int border = accent == 0xFB7185 || accent == 0xFBBF24
        ? PeakRenderUtil.withAlpha(accent, hov ? 0.72F : 0.40F)
        : (hov ? PeakRenderUtil.withAlpha(accent, 0.65F) : 0x3864748B);
      PeakRenderUtil.drawRoundedGradient(g, x, y, w, h, r, topBg, botBg);
      PeakRenderUtil.drawRoundedOutline(g, x, y, w, h, r, border);
      g.centeredText(font, label, x + w / 2, y + (h - 7) / 2, PeakRenderUtil.TEXT_PRIMARY);
    }
    regions.add(new ClickRegion(x, y, w, h, action, false));
  }

  private static boolean isHover(double mx, double my, int x, int y, int w, int h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  @Override
  public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
    this.computeLayout();
    double vmx = toVirtualX(mouseX);
    double vmy = toVirtualY(mouseY);
    if (this.maxScroll > 0 && isHover(vmx, vmy, this.contentClipLeft, this.contentClipTop, this.contentClipRight - this.contentClipLeft, this.contentClipBottom - this.contentClipTop)) {
      this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset - (int) Math.round(verticalAmount * 22.0D)));
      return true;
    }
    return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
  }

  @Override
  public boolean mouseClicked(MouseButtonEvent event, boolean doubled) {
    this.computeLayout();
    if (event.button() == InputConstants.MOUSE_BUTTON_LEFT) {
      double vmx = toVirtualX(event.x());
      double vmy = toVirtualY(event.y());
      for (int i = regions.size() - 1; i >= 0; i--) {
        ClickRegion r = regions.get(i);
        if (r.clipped && (vmy < this.contentClipTop || vmy > this.contentClipBottom)) {
          continue;
        }
        if (isHover(vmx, vmy, r.x, r.y, r.w, r.h)) {
          Minecraft mc = Minecraft.getInstance();
          if (mc != null && mc.getSoundManager() != null) {
            mc.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK, 1.0F));
          }
          r.action.run();
          return true;
        }
      }
    }
    return super.mouseClicked(event, doubled);
  }

  @Override
  public boolean keyPressed(KeyEvent event) {
    if (event.key() == InputConstants.KEY_ESCAPE || event.key() == InputConstants.KEY_RSHIFT) {
      this.onClose();
      return true;
    }
    return super.keyPressed(event);
  }

  private record ToggleItem(String icon, String title, String sub, BooleanSupplier getter, Runnable toggle) {}
  private record ClickRegion(int x, int y, int w, int h, Runnable action, boolean clipped) {
    ClickRegion(int x, int y, int w, int h, Runnable action) {
      this(x, y, w, h, action, false);
    }
  }
}
