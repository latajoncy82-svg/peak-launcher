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
  private final List<ClickRegion> regions = new ArrayList<>();

  public PeakGuiScreen(Screen parent) {
    super(Component.literal("Peak Client GUI"));
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
      g.fill(0, 0, this.width, this.height, 0x9E050B16);
    } else {
      PeakTitleScreenOverlay.renderBackdrop(g, this.width, this.height);
      g.fill(0, 0, this.width, this.height, 0x7A040812);
    }
  }

  @Override
  public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
    super.extractRenderState(g, mouseX, mouseY, partialTick);
    this.regions.clear();

    PeakClientConfig cfg = PeakClientConfig.get();
    boolean pl = cfg.isPolish();
    int accent = cfg.getAccentRgb();
    Font font = this.font;

    int winW = Math.min(548, this.width - 16);
    int winH = Math.min(316, this.height - 16);
    int wx = (this.width - winW) / 2;
    int wy = (this.height - winH) / 2;

    // Outer glass container
    PeakRenderUtil.drawGlassCard(g, wx, wy, winW, winH, 0.90F, PeakRenderUtil.withAlpha(accent, 0.65F));
    g.fill(wx + 1, wy + 1, wx + winW - 1, wy + 3, PeakRenderUtil.withAlpha(accent, 0.85F));

    // Left sidebar
    int sideW = Math.min(144, Math.max(108, winW / 4));
    g.fillGradient(wx + 1, wy + 3, wx + sideW, wy + winH - 1, 0xE609111F, 0xE6050A14);
    g.fill(wx + sideW, wy + 3, wx + sideW + 1, wy + winH - 1, PeakRenderUtil.withAlpha(0x334155, 0.75F));

    PeakRenderUtil.drawPeakCrest(g, wx + 10, wy + 11, 22, accent);
    g.text(font, "PEAK CLIENT", wx + 37, wy + 12, PeakRenderUtil.TEXT_PRIMARY, true);
    g.text(font, "v" + PeakClientMod.VERSION, wx + 37, wy + 23, PeakRenderUtil.withAlpha(accent, 1.0F), true);

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
      if (bg != 0) g.fill(tx, tabY, tx + tw, tabY + th, bg);
      if (sel) {
        g.fill(tx, tabY + 3, tx + 2, tabY + th - 3, PeakRenderUtil.withAlpha(accent, 1.0F));
        g.outline(tx, tabY, tw, th, PeakRenderUtil.withAlpha(accent, 0.60F));
      }
      g.text(font, tabLabels[i], tx + 7, tabY + 6, sel ? PeakRenderUtil.TEXT_PRIMARY : PeakRenderUtil.TEXT_MUTED, true);
      regions.add(new ClickRegion(tx, tabY, tw, th, () -> switchTab(idx)));
      tabY += 23;
    }

    // Sidebar bottom action buttons
    int editorY = wy + winH - 52;
    drawMiniActionButton(g, font, wx + 8, editorY, sideW - 16, 20,
      pl ? "Edytor HUD" : "HUD Editor", accent, true, mouseX, mouseY,
      () -> {
        if (minecraft != null && minecraft.gui != null) {
          minecraft.gui.setScreen(new PeakHudEditorScreen(this));
        }
      });

    drawMiniActionButton(g, font, wx + 8, wy + winH - 27, sideW - 16, 20,
      pl ? "Zamknij (ESC)" : "Close (ESC)", 0x64748B, false, mouseX, mouseY, this::onClose);

    // Content Header
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

    g.text(font, tabLabels[activeTab], cx, cy, PeakRenderUtil.TEXT_PRIMARY, true);
    g.text(font, headerDesc[activeTab], cx, cy + 11, PeakRenderUtil.TEXT_MUTED, true);

    // Language toggle pill at top-right of content area
    String langBadge = pl ? "PL" : "EN";
    int lw = font.width(langBadge) + 14;
    drawMiniActionButton(g, font, wx + winW - lw - 10, cy, lw, 16, langBadge, accent, false, mouseX, mouseY, () -> {
      cfg.language = cfg.isPolish() ? "en" : "pl";
      PeakClientConfig.save();
    });

    g.fill(cx, cy + 23, cx + cw, cy + 24, PeakRenderUtil.withAlpha(0x334155, 0.70F));

    int gridTop = cy + 28;
    int gridBottom = wy + winH - 8;
    this.contentClipLeft = cx - 2;
    this.contentClipTop = gridTop - 1;
    this.contentClipRight = cx + cw + 2;
    this.contentClipBottom = gridBottom;

    g.enableScissor(this.contentClipLeft, this.contentClipTop, this.contentClipRight, this.contentClipBottom);
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
      renderToggleGrid(g, font, items, cx, gridTop, cw, mouseX, mouseY, accent, pl);
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
      renderToggleGrid(g, font, items, cx, gridTop, cw, mouseX, mouseY, accent, pl);
    } else if (activeTab == 2) {
      List<ToggleItem> items = List.of(
        new ToggleItem(pl ? "Alpejskie Menu Główne" : "Alpine Main Menu", pl ? "Tło nocnych gór + karta gracza" : "Night mountain skybox & card", () -> cfg.peakMainMenu, () -> cfg.peakMainMenu = !cfg.peakMainMenu),
        new ToggleItem(pl ? "Szklane Przyciski Peak" : "Peak Glass Buttons", pl ? "Ciemne szkło z niebieską ramką" : "Dark glass buttons with accent rim", () -> cfg.peakButtonStyle, () -> cfg.peakButtonStyle = !cfg.peakButtonStyle),
        new ToggleItem(pl ? "Ciemny Ekran Ładowania" : "Peak Dark Loading", pl ? "Ciemny motyw ekranu Mojang" : "Dark #070D17 loading overlay", () -> cfg.peakLoadingScreen, () -> cfg.peakLoadingScreen = !cfg.peakLoadingScreen),
        new ToggleItem(pl ? "Znaczek Peak HUD" : "Peak HUD Badge", pl ? "Status Zoom / Fullbright w rogu" : "Zoom / Fullbright badge in corner", () -> cfg.showWatermark, () -> cfg.showWatermark = !cfg.showWatermark)
      );
      renderToggleGrid(g, font, items, cx, gridTop, cw, mouseX, mouseY, accent, pl);

      int infoY = gridTop + 98;
      PeakRenderUtil.drawGlassPanel(g, cx, infoY, cw, 56, accent, 0.72F);
      g.text(font, pl ? "Paczka zasobów Peak Alpine UI jest włączana automatycznie" : "Peak Alpine UI resource pack is managed automatically", cx + 10, infoY + 8, PeakRenderUtil.TEXT_PRIMARY, true);
      g.text(font, pl ? "Hotbar, panorama nocnych szczytów i czysty celownik działają" : "Custom hotbar, alpine panorama and crisp crosshair work on all", cx + 10, infoY + 22, PeakRenderUtil.TEXT_MUTED, true);
      g.text(font, pl ? "nawet w czystym Vanilla! Zmiany widać natychmiast." : "versions including Vanilla! Changes apply immediately.", cx + 10, infoY + 35, PeakRenderUtil.TEXT_MUTED, true);
    } else {
      // Tab 3: Accent Color, Opacity presets & Reset controls
      this.maxScroll = 0;
      this.scrollOffset = 0;
      g.text(font, pl ? "Kolor akcentu Peak Client" : "Peak Client Accent Color", cx, gridTop, PeakRenderUtil.TEXT_PRIMARY, true);
      int swX = cx;
      int swY = gridTop + 13;
      for (String hex : ACCENT_SWATCHES) {
        int rgb = Integer.parseInt(hex.substring(1), 16);
        boolean active = hex.equalsIgnoreCase(cfg.accentColor);
        boolean hov = isHover(mouseX, mouseY, swX, swY, 30, 20);
        g.fill(swX, swY, swX + 30, swY + 20, 0xFF000000 | rgb);
        g.outline(swX, swY, 30, 20, active ? 0xFFFFFFFF : hov ? 0xCCFFFFFF : 0x66000000);
        if (active) g.centeredText(font, "✓", swX + 15, swY + 6, 0xFF070D17);
        regions.add(new ClickRegion(swX, swY, 30, 20, () -> { cfg.accentColor = hex; PeakClientConfig.save(); }));
        swX += 35;
      }

      int opY = swY + 30;
      g.text(font, (pl ? "Przezroczystość paneli HUD: " : "HUD Panel Opacity: ") + Math.round(cfg.hudOpacity * 100.0F) + "%", cx, opY, PeakRenderUtil.TEXT_PRIMARY, true);
      float[] opacities = {0.35F, 0.55F, 0.72F, 0.88F};
      String[] opNames = {"35%", "55%", "72%", "88%"};
      int ox = cx;
      for (int i = 0; i < opacities.length; i++) {
        final float val = opacities[i];
        boolean act = Math.abs(cfg.hudOpacity - val) < 0.08F;
        drawMiniActionButton(g, font, ox, opY + 13, 52, 18, opNames[i], accent, act, mouseX, mouseY, () -> {
          cfg.hudOpacity = val;
          PeakClientConfig.save();
        });
        ox += 58;
      }

      int actY = opY + 40;
      int btnW = (cw - 8) / 2;
      drawMiniActionButton(g, font, cx, actY, btnW, 22,
        pl ? "Edytor Układu HUD" : "HUD Layout Editor", accent, true, mouseX, mouseY, () -> {
          if (minecraft != null && minecraft.gui != null) {
            minecraft.gui.setScreen(new PeakHudEditorScreen(this));
          }
        });
      drawMiniActionButton(g, font, cx + btnW + 8, actY, btnW, 22,
        pl ? "Resetuj pozycje" : "Reset Positions", 0xFBBF24, false, mouseX, mouseY, () -> {
          cfg.resetPositions();
          PeakClientState.showToast(pl ? "Zresetowano pozycje HUD" : "HUD positions reset");
        });

      drawMiniActionButton(g, font, cx, actY + 28, cw, 20,
        pl ? "Przywróć domyślne ustawienia Peak Client" : "Restore Peak Client defaults", 0xFB7185, false, mouseX, mouseY, () -> {
          cfg.resetAllDefaults();
          PeakClientState.showToast(pl ? "Przywrócono domyślne ustawienia" : "Restored default settings");
        });
    }
    g.disableScissor();
    if (this.maxScroll > 0) {
      int sbX = cx + cw - 2;
      int viewH = Math.max(20, this.contentClipBottom - gridTop);
      int totalH = viewH + this.maxScroll;
      int thumbH = Math.max(18, (viewH * viewH) / totalH);
      int thumbY = gridTop + ((viewH - thumbH) * this.scrollOffset) / Math.max(1, this.maxScroll);
      g.fill(sbX, gridTop, sbX + 2, this.contentClipBottom, 0x33FFFFFF);
      g.fill(sbX, thumbY, sbX + 2, thumbY + thumbH, PeakRenderUtil.withAlpha(accent, 0.85F));
    }
  }

  private void renderToggleGrid(GuiGraphicsExtractor g, Font font, List<ToggleItem> items, int x, int y, int w, int mx, int my, int accent, boolean pl) {
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
      if (font.width(title) > maxTitleW) title = font.plainSubstrByWidth(title, maxTitleW - 6) + "..";
      g.text(font, title, cx + 7, cardH < 30 ? cy + 5 : cy + 6, PeakRenderUtil.TEXT_PRIMARY, true);

      String sub = item.sub;
      if (font.width(sub) > cardW - 46) sub = font.plainSubstrByWidth(sub, cardW - 52) + "..";
      g.text(font, sub, cx + 7, cardH < 30 ? cy + 15 : cy + 18, PeakRenderUtil.TEXT_MUTED, true);

      // Pill status badge
      int pillW = 30;
      int pillH = 13;
      int px = cx + cardW - pillW - 7;
      int py = cy + (cardH - pillH) / 2;
      int pillBg = on ? PeakRenderUtil.withAlpha(accent, 0.90F) : 0xAA1E293B;
      g.fill(px, py, px + pillW, py + pillH, pillBg);
      g.outline(px, py, pillW, pillH, on ? PeakRenderUtil.withAlpha(0xFFFFFF, 0.45F) : 0xFF475569);
      g.centeredText(font, on ? "ON" : "OFF", px + pillW / 2, py + 3, on ? 0xFF070D17 : PeakRenderUtil.TEXT_MUTED);

      regions.add(new ClickRegion(cx, cy, cardW, cardH, () -> {
        item.toggle.run();
        PeakClientConfig.save();
      }, true));
    }
  }

  private void drawMiniActionButton(GuiGraphicsExtractor g, Font font, int x, int y, int w, int h, String label, int accent, boolean primary, int mx, int my, Runnable action) {
    boolean hov = isHover(mx, my, x, y, w, h);
    if (primary) {
      int bg = hov ? PeakRenderUtil.withAlpha(accent, 0.95F) : PeakRenderUtil.withAlpha(accent, 0.82F);
      g.fill(x, y, x + w, y + h, bg);
      g.outline(x, y, w, h, 0xCCFFFFFF);
      g.centeredText(font, label, x + w / 2, y + (h - 7) / 2, 0xFF070D17);
    } else {
      PeakRenderUtil.drawGlassButton(g, x, y, w, h, hov, true, accent, 1.0F);
      g.centeredText(font, label, x + w / 2, y + (h - 7) / 2, PeakRenderUtil.TEXT_PRIMARY);
    }
    regions.add(new ClickRegion(x, y, w, h, action, false));
  }

  private static boolean isHover(double mx, double my, int x, int y, int w, int h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  @Override
  public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
    if (this.maxScroll > 0 && isHover(mouseX, mouseY, this.contentClipLeft, this.contentClipTop, this.contentClipRight - this.contentClipLeft, this.contentClipBottom - this.contentClipTop)) {
      this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset - (int) Math.round(verticalAmount * 22.0D)));
      return true;
    }
    return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
  }

  @Override
  public boolean mouseClicked(MouseButtonEvent event, boolean doubled) {
    if (event.button() == 0) {
      for (int i = regions.size() - 1; i >= 0; i--) {
        ClickRegion r = regions.get(i);
        if (r.clipped && (event.y() < this.contentClipTop || event.y() > this.contentClipBottom)) {
          continue;
        }
        if (isHover(event.x(), event.y(), r.x, r.y, r.w, r.h)) {
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

  private record ToggleItem(String title, String sub, BooleanSupplier getter, Runnable toggle) {}
  private record ClickRegion(int x, int y, int w, int h, Runnable action, boolean clipped) {
    ClickRegion(int x, int y, int w, int h, Runnable action) {
      this(x, y, w, h, action, false);
    }
  }
}
