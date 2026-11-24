package pl.peaklauncher.client;

import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;

public final class PeakTitleScreenOverlay {
  private static final int[] STAR_SEEDS = new int[110];
  private static final int[] SNOW_SEEDS = new int[55];

  static {
    long s = 0x5EED2026L;
    for (int i = 0; i < STAR_SEEDS.length; i++) {
      s = s * 6364136223846793005L + 1442695040888963407L;
      STAR_SEEDS[i] = (int) (s >>> 32);
    }
    for (int i = 0; i < SNOW_SEEDS.length; i++) {
      s = s * 6364136223846793005L + 1442695040888963407L;
      SNOW_SEEDS[i] = (int) (s >>> 32);
    }
  }

  private PeakTitleScreenOverlay() {}

  public static void renderBackdrop(GuiGraphicsExtractor g, int width, int height) {
    PeakClientConfig cfg = PeakClientConfig.get();
    int accentRgb = cfg.getAccentRgb();
    long now = System.currentTimeMillis();

    // Deep alpine twilight sky gradient
    g.fillGradient(0, 0, width, height, 0xFF050A14, 0xFF0C182D);
    int horizonY = Math.round(height * 0.64F);
    g.fillGradient(0, horizonY - 55, width, horizonY + 15, 0x00000000, PeakRenderUtil.withAlpha(accentRgb, 0.14F));

    // Twinkling stars
    for (int i = 0; i < STAR_SEEDS.length; i++) {
      int h = STAR_SEEDS[i];
      int sx = Math.floorMod(h, Math.max(1, width));
      int sy = Math.floorMod(h * 31, Math.max(1, Math.round(height * 0.58F)));
      float pulse = 0.45F + 0.55F * (float) Math.sin((now * 0.0022D) + (i * 0.77D));
      int col = (i % 5 == 0) ? PeakRenderUtil.withAlpha(accentRgb, pulse * 0.85F) : PeakRenderUtil.withAlpha(0xE2F1FF, pulse * 0.75F);
      g.fill(sx, sy, sx + 1, sy + 1, col);
      if (i % 13 == 0 && pulse > 0.78F) {
        g.fill(sx - 1, sy, sx + 2, sy + 1, PeakRenderUtil.withAlpha(0xFFFFFF, 0.25F));
      }
    }

    // Procedural jagged Alpine ridge silhouette (back + front mountain layers)
    int step = 3;
    for (int x = 0; x < width; x += step) {
      double nx = x / (double) Math.max(1, width);
      double peakMain = Math.exp(-Math.pow((nx - 0.50D) / 0.16D, 2.0D)) * (height * 0.22D);
      double peakLeft = Math.exp(-Math.pow((nx - 0.18D) / 0.19D, 2.0D)) * (height * 0.14D);
      double peakRight = Math.exp(-Math.pow((nx - 0.84D) / 0.18D, 2.0D)) * (height * 0.16D);
      double crag = Math.abs(Math.sin(nx * 29.0D)) * 7.0D + Math.abs(Math.cos(nx * 61.0D)) * 4.0D;

      int ridgeBackY = (int) Math.round(horizonY + 18 - peakLeft - peakRight - peakMain * 0.85D - crag);
      int ridgeFrontY = (int) Math.round(horizonY + 34 - peakMain * 0.65D - Math.sin(nx * 14.0D + 0.8D) * 14.0D - crag * 0.6D);

      g.fill(x, Math.max(0, ridgeBackY), x + step, height, 0xFF0A1322);
      // Subtle snow/ice highlight along upper ridge
      if (ridgeBackY < horizonY - 8) {
        g.fill(x, ridgeBackY, x + step, ridgeBackY + 2, PeakRenderUtil.withAlpha(accentRgb, 0.22F));
      }
      g.fill(x, Math.max(0, ridgeFrontY), x + step, height, 0xFF060B15);
    }

    // Soft drifting alpine snow particles
    for (int i = 0; i < SNOW_SEEDS.length; i++) {
      int h = SNOW_SEEDS[i];
      double speed = 14.0D + Math.floorMod(h, 22);
      double drift = Math.sin(now * 0.0009D + i) * 18.0D;
      int sx = Math.floorMod((int) (Math.floorMod(h, Math.max(1, width)) + drift + (now * 0.01D * ((i % 3) - 1))), Math.max(1, width));
      int sy = Math.floorMod((int) (Math.floorMod(h * 17, Math.max(1, height)) + (now * speed / 1000.0D)), Math.max(1, height));
      int a = i % 2 == 0 ? 0x66FFFFFF : 0x40BAE6FD;
      g.fill(sx, sy, sx + 1, sy + 1, a);
    }

    // Cinema bottom & top vignette
    g.fillGradient(0, 0, width, 46, 0x99040810, 0x00040810);
    g.fillGradient(0, height - 48, width, height, 0x00040810, 0xB8040810);
  }

  public static void renderForeground(GuiGraphicsExtractor g, Font font, int width, int height) {
    PeakClientConfig cfg = PeakClientConfig.get();
    int accentRgb = cfg.getAccentRgb();
    Minecraft mc = Minecraft.getInstance();
    boolean pl = cfg.isPolish();

    // Centered Peak Client brand crest + header above main button stack
    int titleY = Math.max(16, height / 4 - 22);
    int crestSize = 26;
    String brand = "PEAK CLIENT";
    int brandW = font.width(brand);
    int headerW = Math.max(190, crestSize + 10 + brandW + 18);
    int headerX = (width - headerW) / 2;

    PeakRenderUtil.drawPeakCrest(g, headerX + 6, titleY, crestSize, accentRgb);
    g.text(font, brand, headerX + crestSize + 14, titleY + 3, 0xFFF8FAFC, true);
    String mcVer = SharedConstants.getCurrentVersion() != null ? SharedConstants.getCurrentVersion().name() : "26.3";
    String sub = "MINECRAFT " + mcVer + " · v" + PeakClientMod.VERSION;
    g.text(font, sub, headerX + crestSize + 14, titleY + 15, PeakRenderUtil.withAlpha(accentRgb, 1.0F), true);

    // Top-right player badge card
    String playerName = (mc != null && mc.getUser() != null) ? mc.getUser().getName() : "PeakPlayer";
    String badgeText = pl ? "Konto aktywne" : "Active Account";
    int maxCardW = width < 480 ? 96 : 122;
    int cardW = Math.min(maxCardW, Math.max(96, font.width(playerName) + 34));
    String visibleName = font.width(playerName) > cardW - 32
      ? font.plainSubstrByWidth(playerName, Math.max(24, cardW - 36)) + ".."
      : playerName;
    int cardX = width - cardW - 8;
    int cardY = 10;
    PeakRenderUtil.drawGlassPanel(g, cardX, cardY, cardW, 28, accentRgb, 0.72F);
    // Tiny stylized player head square
    g.fill(cardX + 7, cardY + 6, cardX + 23, cardY + 22, 0xFF1E293B);
    g.fill(cardX + 9, cardY + 8, cardX + 21, cardY + 20, PeakRenderUtil.withAlpha(accentRgb, 0.35F));
    g.fill(cardX + 11, cardY + 12, cardX + 13, cardY + 14, 0xFFFFFFFF);
    g.fill(cardX + 17, cardY + 12, cardX + 19, cardY + 14, 0xFFFFFFFF);
    g.text(font, visibleName, cardX + 28, cardY + 5, PeakRenderUtil.TEXT_PRIMARY, true);
    g.text(font, badgeText, cardX + 28, cardY + 16, PeakRenderUtil.withAlpha(accentRgb, 1.0F), true);

    // Top-left Peak quick keybind strip
    if (width >= 520) {
      String hint = pl
        ? "RShift: Peak GUI  ·  F3: Lepsze F3  ·  C: Zoom  ·  G: Fullbright"
        : "RShift: Peak GUI  ·  F3: Better F3  ·  C: Zoom  ·  G: Fullbright";
      int hw = font.width(hint) + 14;
      PeakRenderUtil.drawGlassCard(g, 10, 10, hw, 18, 0.58F, PeakRenderUtil.withAlpha(accentRgb, 0.38F));
      g.text(font, hint, 17, 15, PeakRenderUtil.TEXT_MUTED, true);
    }

    // Clean bottom-left watermark above vanilla version line
    g.text(font, "Peak Launcher · Alpine Edition v" + PeakClientMod.VERSION, 6, height - 21, 0xCC94A3B8, true);
  }
}
