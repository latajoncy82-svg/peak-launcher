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
  private final List<ClickRegion> regions = new ArrayList<>();

  public PeakGuiScreen(class_437 parent) {
    super(class_2561.method_43470("Peak Client GUI"));
    this.parent = parent;
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
      g.method_25294(0, 0, this.field_22789, this.field_22790, 0x9E050B16);
    } else {
      PeakTitleScreenOverlay.renderBackdrop(g, this.field_22789, this.field_22790);
      g.method_25294(0, 0, this.field_22789, this.field_22790, 0x7A040812);
    }
  }

  @Override
  public void method_25394(class_332 g, int mouseX, int mouseY, float partialTick) {
    super.method_25394(g, mouseX, mouseY, partialTick);
    this.regions.clear();

    PeakClientConfig cfg = PeakClientConfig.get();
    boolean pl = cfg.isPolish();
    int accent = cfg.getAccentRgb();
    class_327 font = this.field_22793;

    int winW = Math.min(548, this.field_22789 - 16);
    int winH = Math.min(316, this.field_22790 - 16);
    int wx = (this.field_22789 - winW) / 2;
    int wy = (this.field_22790 - winH) / 2;

    PeakRenderUtil.drawGlassCard(g, wx, wy, winW, winH, 0.90F, PeakRenderUtil.withAlpha(accent, 0.65F));
    g.method_25294(wx + 1, wy + 1, wx + winW - 1, wy + 3, PeakRenderUtil.withAlpha(accent, 0.85F));

    int sideW = Math.min(144, Math.max(108, winW / 4));
    g.method_25296(wx + 1, wy + 3, wx + sideW, wy + winH - 1, 0xE609111F, 0xE6050A14);
    g.method_25294(wx + sideW, wy + 3, wx + sideW + 1, wy + winH - 1, PeakRenderUtil.withAlpha(0x334155, 0.75F));

    PeakRenderUtil.drawPeakCrest(g, wx + 10, wy + 11, 22, accent);
    g.method_25303(font, "PEAK CLIENT", wx + 37, wy + 12, PeakRenderUtil.TEXT_PRIMARY);
    g.method_25303(font, "v" + PeakClientMod.VERSION, wx + 37, wy + 23, PeakRenderUtil.withAlpha(accent, 1.0F));

    String[] tabLabels = pl
      ? new String[]{"HUD i Dodatki", "Lepsze F3", "Wygląd Peak", "Układ i Kolor"}
      : new String[]{"HUD & Addons", "Better F3", "Peak Look", "Layout & Style"};

    int tabY = wy + 44;
    for (int i = 0; i < tabLabels.length; i++) {
      final int idx = i;
      int tx = wx + 8;
      int tw = sideW - 16;
      int th = 20;
      boolean sel = activeTab == i;
      boolean hov = isHover(mouseX, mouseY, tx, tabY, tw, th);
      int bg = sel ? PeakRenderUtil.withAlpha(accent, 0.22F) : hov ? 0x26FFFFFF : 0x00000000;
      if (bg != 0) g.method_25294(tx, tabY, tx + tw, tabY + th, bg);
      if (sel) {
        g.method_25294(tx, tabY + 3, tx + 2, tabY + th - 3, PeakRenderUtil.withAlpha(accent, 1.0F));
        g.method_49601(tx, tabY, tw, th, PeakRenderUtil.withAlpha(accent, 0.60F));
      }
      g.method_25303(font, tabLabels[i], tx + 7, tabY + 6, sel ? PeakRenderUtil.TEXT_PRIMARY : PeakRenderUtil.TEXT_MUTED);
      regions.add(new ClickRegion(tx, tabY, tw, th, () -> switchTab(idx)));
      tabY += 23;
    }

    int editorY = wy + winH - 52;
    drawMiniActionButton(g, font, wx + 8, editorY, sideW - 16, 20,
      pl ? "Edytor HUD" : "HUD Editor", accent, true, mouseX, mouseY,
      () -> {
        if (field_22787 != null) field_22787.method_1507(new PeakHudEditorScreen(this));
      });

    drawMiniActionButton(g, font, wx + 8, wy + winH - 27, sideW - 16, 20,
      pl ? "Zamknij (ESC)" : "Close (ESC)", 0x64748B, false, mouseX, mouseY, this::method_25419);

    int cx = wx + sideW + 10;
    int cw = winW - sideW - 20;
    int cy = wy + 10;
    String[] headerDesc = pl
      ? new String[]{
          "Moduły HUD i szybkie dodatki rozgrywki",
          "Nowoczesny ekran diagnostyczny Lepsze F3",
          "Ciemny alpejski motyw Peak wewnątrz gry",
          "Personalizacja koloru, skali i układu HUD"
        }
      : new String[]{
          "In-game HUD modules and utility addons",
          "Modular color-coded Better F3 overlay",
          "Alpine Peak visual styling inside Minecraft",
          "Accent color, opacity and HUD layout controls"
        };

    g.method_25303(font, tabLabels[activeTab], cx, cy, PeakRenderUtil.TEXT_PRIMARY);
    g.method_25303(font, headerDesc[activeTab], cx, cy + 11, PeakRenderUtil.TEXT_MUTED);

    String langBadge = pl ? "PL" : "EN";
    int lw = font.method_1727(langBadge) + 14;
    drawMiniActionButton(g, font, wx + winW - lw - 10, cy, lw, 16, langBadge, accent, false, mouseX, mouseY, () -> {
      cfg.language = cfg.isPolish() ? "en" : "pl";
      PeakClientConfig.save();
    });

    g.method_25294(cx, cy + 23, cx + cw, cy + 24, PeakRenderUtil.withAlpha(0x334155, 0.70F));

    int gridTop = cy + 28;
    int gridBottom = wy + winH - 8;
    this.contentClipLeft = cx - 2;
    this.contentClipTop = gridTop - 1;
    this.contentClipRight = cx + cw + 2;
    this.contentClipBottom = gridBottom;

    g.method_44379(this.contentClipLeft, this.contentClipTop, this.contentClipRight, this.contentClipBottom);
    if (activeTab == 0) {
      List<ToggleItem> items = List.of(
        new ToggleItem(pl ? "HUD w grze (Master)" : "In-game HUD (Master)", pl ? "Pokaż nakładkę Peak HUD" : "Show Peak HUD overlay", () -> cfg.hudEnabled, () -> cfg.hudEnabled = !cfg.hudEnabled),
        new ToggleItem("FPS HUD", pl ? "Bieżące i min. klatki" : "Current & min framerate", () -> cfg.hudFps, () -> cfg.hudFps = !cfg.hudFps),
        new ToggleItem(pl ? "Koordynaty + Nether" : "Coords + Nether", pl ? "XYZ, biom, kierunek, Nether" : "XYZ, biome, facing, Nether", () -> cfg.hudCoords, () -> cfg.hudCoords = !cfg.hudCoords),
        new ToggleItem("CPS Counter", pl ? "Kliknięcia LMB | RMB na sek." : "Live LMB | RMB clicks/sec", () -> cfg.hudCps, () -> cfg.hudCps = !cfg.hudCps),
        new ToggleItem("Keystrokes", pl ? "Klawisze WASD, LMB, RMB, Spacja" : "WASD, LMB, RMB, Space tiles", () -> cfg.hudKeystrokes, () -> cfg.hudKeystrokes = !cfg.hudKeystrokes),
        new ToggleItem("Armor & Hand HUD", pl ? "Pancerz i trwałość narzędzi %" : "Armor & item durability %", () -> cfg.hudArmor, () -> cfg.hudArmor = !cfg.hudArmor),
        new ToggleItem("Ping & Server/.peak", pl ? "Opóźnienie ms i adres serwera" : "Server host & latency ms", () -> cfg.hudPing, () -> cfg.hudPing = !cfg.hudPing),
        new ToggleItem(pl ? "Efekty i Zegar" : "Effects & Clock", pl ? "Aktywne mikstury" : "Active potion timers", () -> cfg.hudEffects, () -> { cfg.hudEffects = !cfg.hudEffects; cfg.hudClock = cfg.hudEffects; }),
        new ToggleItem("Toggle Sprint", pl ? "Automatyczny sprint przy W" : "Auto sprint while moving", () -> cfg.toggleSprintEnabled, () -> { cfg.toggleSprintEnabled = !cfg.toggleSprintEnabled; cfg.hudSprint = cfg.toggleSprintEnabled; }),
        new ToggleItem("Zoom (C) + Scroll", pl ? "Przybliżenie kamerą pod C" : "Smooth camera zoom on C", () -> cfg.zoomEnabled, () -> cfg.zoomEnabled = !cfg.zoomEnabled),
        new ToggleItem("Fullbright (G)", pl ? "Maksymalne światło w jaskiniach" : "Maximum cave brightness", () -> cfg.fullbrightEnabled, () -> cfg.fullbrightEnabled = !cfg.fullbrightEnabled),
        new ToggleItem("Peak Watermark", pl ? "Znaczek PEAK w rogu ekranu" : "Subtle corner badge", () -> cfg.showWatermark, () -> cfg.showWatermark = !cfg.showWatermark)
      );
      renderToggleGrid(g, font, items, cx, gridTop, cw, mouseX, mouseY, accent);
    } else if (activeTab == 1) {
      List<ToggleItem> items = List.of(
        new ToggleItem(pl ? "Lepsze F3 (Aktywne)" : "Better F3 (Enabled)", pl ? "Karty Peak zamiast zwykłego F3" : "Replace vanilla F3 text wall", () -> cfg.betterF3Enabled, () -> cfg.betterF3Enabled = !cfg.betterF3Enabled),
        new ToggleItem(pl ? "Karta: Wydajność" : "Card: Performance", pl ? "FPS, min FPS, pasek RAM, GPU" : "FPS, min FPS, RAM bar, GPU", () -> cfg.f3Performance, () -> cfg.f3Performance = !cfg.f3Performance),
        new ToggleItem(pl ? "Karta: Pozycja i Biom" : "Card: Location & Biome", pl ? "XYZ, kierunek, chunk, światło" : "XYZ, facing, chunk, light", () -> cfg.f3Position, () -> cfg.f3Position = !cfg.f3Position),
        new ToggleItem(pl ? "Przelicznik Netheru" : "Nether Converter", pl ? "Automatyczne coords 1:8" : "Live Overworld/Nether 1:8", () -> cfg.f3NetherCoords, () -> cfg.f3NetherCoords = !cfg.f3NetherCoords),
        new ToggleItem(pl ? "Karta: Świat i Serwer" : "Card: World & Server", pl ? "Serwer, ping, dzień, pogoda" : "Server, ping, day time, weather", () -> cfg.f3WorldServer, () -> cfg.f3WorldServer = !cfg.f3WorldServer),
        new ToggleItem(pl ? "Karta: Celowanie (Target)" : "Card: Target Inspector", pl ? "ID bloku lub bytu na celowniku" : "Block or entity ID on crosshair", () -> cfg.f3Target, () -> cfg.f3Target = !cfg.f3Target),
        new ToggleItem(pl ? "Tryb Kompaktowy F3" : "Compact F3 Mode", pl ? "Mniej wierszy na słabszych PC" : "Fewer rows for minimal screen", () -> cfg.f3Compact, () -> cfg.f3Compact = !cfg.f3Compact)
      );
      renderToggleGrid(g, font, items, cx, gridTop, cw, mouseX, mouseY, accent);
    } else if (activeTab == 2) {
      List<ToggleItem> items = List.of(
        new ToggleItem(pl ? "Alpejskie Menu Główne" : "Alpine Main Menu", pl ? "Tło nocnych gór + karta gracza" : "Night mountain skybox & card", () -> cfg.peakMainMenu, () -> cfg.peakMainMenu = !cfg.peakMainMenu),
        new ToggleItem(pl ? "Szklane Przyciski Peak" : "Peak Glass Buttons", pl ? "Ciemne szkło z niebieską ramką" : "Dark glass buttons with accent rim", () -> cfg.peakButtonStyle, () -> cfg.peakButtonStyle = !cfg.peakButtonStyle),
        new ToggleItem(pl ? "Ciemny Ekran Ładowania" : "Peak Dark Loading", pl ? "Ciemny motyw ekranu Mojang" : "Dark #070D17 loading overlay", () -> cfg.peakLoadingScreen, () -> cfg.peakLoadingScreen = !cfg.peakLoadingScreen),
        new ToggleItem(pl ? "Znaczek Peak HUD" : "Peak HUD Badge", pl ? "Status Zoom / Fullbright w rogu" : "Zoom / Fullbright badge in corner", () -> cfg.showWatermark, () -> cfg.showWatermark = !cfg.showWatermark)
      );
      renderToggleGrid(g, font, items, cx, gridTop, cw, mouseX, mouseY, accent);

      int infoY = gridTop + 92;
      PeakRenderUtil.drawGlassPanel(g, cx, infoY, cw, 54, accent, 0.72F);
      g.method_25303(font, pl ? "Paczka zasobów Peak Alpine UI jest włączana automatycznie" : "Peak Alpine UI resource pack is managed automatically", cx + 10, infoY + 8, PeakRenderUtil.TEXT_PRIMARY);
      g.method_25303(font, pl ? "Hotbar, panorama nocnych szczytów i czysty celownik działają" : "Custom hotbar, alpine panorama and crisp crosshair work on all", cx + 10, infoY + 21, PeakRenderUtil.TEXT_MUTED);
      g.method_25303(font, pl ? "nawet w czystym Vanilla! Zmiany widać natychmiast." : "versions including Vanilla! Changes apply immediately.", cx + 10, infoY + 34, PeakRenderUtil.TEXT_MUTED);
    } else {
      this.maxScroll = 0;
      this.scrollOffset = 0;
      g.method_25303(font, pl ? "Kolor akcentu Peak Client" : "Peak Client Accent Color", cx, gridTop, PeakRenderUtil.TEXT_PRIMARY);
      int swX = cx;
      int swY = gridTop + 13;
      for (String hex : ACCENT_SWATCHES) {
        int rgb = Integer.parseInt(hex.substring(1), 16);
        boolean active = hex.equalsIgnoreCase(cfg.accentColor);
        boolean hov = isHover(mouseX, mouseY, swX, swY, 30, 20);
        g.method_25294(swX, swY, swX + 30, swY + 20, 0xFF000000 | rgb);
        g.method_49601(swX, swY, 30, 20, active ? 0xFFFFFFFF : hov ? 0xCCFFFFFF : 0x66000000);
        if (active) g.method_25300(font, "✓", swX + 15, swY + 6, 0xFF070D17);
        regions.add(new ClickRegion(swX, swY, 30, 20, () -> { cfg.accentColor = hex; PeakClientConfig.save(); }));
        swX += 35;
      }

      int scY = swY + 26;
      g.method_25303(font, (pl ? "Skala HUD: " : "HUD Scale: ") + Math.round(cfg.hudScale * 100.0F) + "%", cx, scY, PeakRenderUtil.TEXT_PRIMARY);
      float[] scales = {0.60F, 0.72F, 0.85F, 1.00F};
      String[] scaleNames = {"60%", "72%", "85%", "100%"};
      int sx = cx;
      for (int i = 0; i < scales.length; i++) {
        final float val = scales[i];
        boolean act = Math.abs(cfg.hudScale - val) < 0.05F;
        drawMiniActionButton(g, font, sx, scY + 12, 52, 17, scaleNames[i], accent, act, mouseX, mouseY, () -> {
          boolean autoStack = cfg.isUsingDefaultLayout();
          cfg.hudScale = val;
          if (autoStack) cfg.applyDefaultStackForScale();
          PeakClientConfig.save();
        });
        sx += 58;
      }

      int opY = scY + 36;
      g.method_25303(font, (pl ? "Przezroczystość paneli HUD: " : "HUD Panel Opacity: ") + Math.round(cfg.hudOpacity * 100.0F) + "%", cx, opY, PeakRenderUtil.TEXT_PRIMARY);
      float[] opacities = {0.35F, 0.55F, 0.72F, 0.88F};
      String[] opNames = {"35%", "55%", "72%", "88%"};
      int ox = cx;
      for (int i = 0; i < opacities.length; i++) {
        final float val = opacities[i];
        boolean act = Math.abs(cfg.hudOpacity - val) < 0.08F;
        drawMiniActionButton(g, font, ox, opY + 12, 52, 17, opNames[i], accent, act, mouseX, mouseY, () -> {
          cfg.hudOpacity = val;
          PeakClientConfig.save();
        });
        ox += 58;
      }

      int actY = opY + 36;
      int btnW = (cw - 8) / 2;
      drawMiniActionButton(g, font, cx, actY, btnW, 20,
        pl ? "Edytor Układu HUD" : "HUD Layout Editor", accent, true, mouseX, mouseY, () -> {
          if (field_22787 != null) field_22787.method_1507(new PeakHudEditorScreen(this));
        });
      drawMiniActionButton(g, font, cx + btnW + 8, actY, btnW, 20,
        pl ? "Resetuj pozycje" : "Reset Positions", 0xFBBF24, false, mouseX, mouseY, () -> {
          cfg.resetPositions();
          PeakClientState.showToast(pl ? "Zresetowano pozycje HUD" : "HUD positions reset");
        });

      drawMiniActionButton(g, font, cx, actY + 25, cw, 19,
        pl ? "Przywróć domyślne ustawienia Peak Client" : "Restore Peak Client defaults", 0xFB7185, false, mouseX, mouseY, () -> {
          cfg.resetAllDefaults();
          PeakClientState.showToast(pl ? "Przywrócono domyślne ustawienia" : "Restored default settings");
        });
    }
    g.method_44380();
    if (this.maxScroll > 0) {
      int sbX = cx + cw - 2;
      int viewH = Math.max(20, this.contentClipBottom - gridTop);
      int totalH = viewH + this.maxScroll;
      int thumbH = Math.max(18, (viewH * viewH) / totalH);
      int thumbY = gridTop + ((viewH - thumbH) * this.scrollOffset) / Math.max(1, this.maxScroll);
      g.method_25294(sbX, gridTop, sbX + 2, this.contentClipBottom, 0x33FFFFFF);
      g.method_25294(sbX, thumbY, sbX + 2, thumbY + thumbH, PeakRenderUtil.withAlpha(accent, 0.85F));
    }
  }

  private void renderToggleGrid(class_332 g, class_327 font, List<ToggleItem> items, int x, int y, int w, int mx, int my, int accent) {
    int cols = 2;
    int gap = 6;
    int availH = Math.max(60, this.contentClipBottom - y);
    int rows = (items.size() + 1) / cols;
    int cardH = availH < 200 ? 27 : 34;
    int stepY = cardH + 5;
    int contentH = rows * stepY - 5;
    this.maxScroll = Math.max(0, contentH - availH);
    this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset));
    int effectiveW = this.maxScroll > 0 ? w - 6 : w;
    int cardW = (effectiveW - gap) / cols;

    for (int i = 0; i < items.size(); i++) {
      ToggleItem item = items.get(i);
      int col = i % cols;
      int row = i / cols;
      int cx = x + col * (cardW + gap);
      int cy = y + row * stepY - this.scrollOffset;
      if (cy + cardH < this.contentClipTop || cy > this.contentClipBottom) {
        continue;
      }
      boolean on = item.getter.getAsBoolean();
      boolean inClip = my >= this.contentClipTop && my <= this.contentClipBottom;
      boolean hov = inClip && isHover(mx, my, cx, cy, cardW, cardH);

      int border = on ? PeakRenderUtil.withAlpha(accent, hov ? 0.95F : 0.72F) : PeakRenderUtil.withAlpha(0x475569, hov ? 0.85F : 0.55F);
      PeakRenderUtil.drawGlassCard(g, cx, cy, cardW, cardH, hov ? 0.85F : 0.72F, border);

      String title = item.title;
      int maxTitleW = cardW - 46;
      if (font.method_1727(title) > maxTitleW) title = font.method_27523(title, maxTitleW - 6) + "..";
      g.method_25303(font, title, cx + 7, cardH < 30 ? cy + 5 : cy + 6, PeakRenderUtil.TEXT_PRIMARY);

      String sub = item.sub;
      if (font.method_1727(sub) > cardW - 46) sub = font.method_27523(sub, cardW - 52) + "..";
      g.method_25303(font, sub, cx + 7, cardH < 30 ? cy + 15 : cy + 18, PeakRenderUtil.TEXT_MUTED);

      int pillW = 30;
      int pillH = 13;
      int px = cx + cardW - pillW - 7;
      int py = cy + (cardH - pillH) / 2;
      int pillBg = on ? PeakRenderUtil.withAlpha(accent, 0.90F) : 0xAA1E293B;
      g.method_25294(px, py, px + pillW, py + pillH, pillBg);
      g.method_49601(px, py, pillW, pillH, on ? PeakRenderUtil.withAlpha(0xFFFFFF, 0.45F) : 0xFF475569);
      g.method_25300(font, on ? "ON" : "OFF", px + pillW / 2, py + 3, on ? 0xFF070D17 : PeakRenderUtil.TEXT_MUTED);

      regions.add(new ClickRegion(cx, cy, cardW, cardH, () -> {
        item.toggle.run();
        PeakClientConfig.save();
      }, true));
    }
  }

  private void drawMiniActionButton(class_332 g, class_327 font, int x, int y, int w, int h, String label, int accent, boolean primary, int mx, int my, Runnable action) {
    boolean hov = isHover(mx, my, x, y, w, h);
    if (primary) {
      int bg = hov ? PeakRenderUtil.withAlpha(accent, 0.95F) : PeakRenderUtil.withAlpha(accent, 0.82F);
      g.method_25294(x, y, x + w, y + h, bg);
      g.method_49601(x, y, w, h, 0xCCFFFFFF);
      g.method_25300(font, label, x + w / 2, y + (h - 7) / 2, 0xFF070D17);
    } else {
      PeakRenderUtil.drawGlassButton(g, x, y, w, h, hov, true, accent, 1.0F);
      g.method_25300(font, label, x + w / 2, y + (h - 7) / 2, PeakRenderUtil.TEXT_PRIMARY);
    }
    regions.add(new ClickRegion(x, y, w, h, action, false));
  }

  private static boolean isHover(double mx, double my, int x, int y, int w, int h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  @Override
  public boolean method_25401(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
    if (this.maxScroll > 0 && isHover(mouseX, mouseY, this.contentClipLeft, this.contentClipTop, this.contentClipRight - this.contentClipLeft, this.contentClipBottom - this.contentClipTop)) {
      this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset - (int) Math.round(verticalAmount * 22.0D)));
      return true;
    }
    return super.method_25401(mouseX, mouseY, horizontalAmount, verticalAmount);
  }

  @Override
  public boolean method_25402(double mouseX, double mouseY, int button) {
    if (button == 0) {
      for (int i = regions.size() - 1; i >= 0; i--) {
        ClickRegion r = regions.get(i);
        if (r.clipped && (mouseY < this.contentClipTop || mouseY > this.contentClipBottom)) {
          continue;
        }
        if (isHover(mouseX, mouseY, r.x, r.y, r.w, r.h)) {
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

  private record ToggleItem(String title, String sub, BooleanSupplier getter, Runnable toggle) {}
  private record ClickRegion(int x, int y, int w, int h, Runnable action, boolean clipped) {
    ClickRegion(int x, int y, int w, int h, Runnable action) {
      this(x, y, w, h, action, false);
    }
  }
}
