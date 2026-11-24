package pl.peaklauncher.client;

import net.minecraft.class_155;
import net.minecraft.class_310;
import net.minecraft.class_327;
import net.minecraft.class_332;

public final class PeakTitleScreenOverlay {
  private static final int[] STAR_SEEDS = new int[110];
  private static final int[] SNOW_SEEDS = new int[55];

  static {
    long s = 0x5EED1214L;
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

  public static void renderBackdrop(class_332 g, int width, int height) {
    PeakClientConfig cfg = PeakClientConfig.get();
    int accentRgb = cfg.getAccentRgb();
    long now = System.currentTimeMillis();

    g.method_25296(0, 0, width, height, 0xFF050A14, 0xFF0C182D);
    int horizonY = Math.round(height * 0.64F);
    g.method_25296(0, horizonY - 55, width, horizonY + 15, 0x00000000, PeakRenderUtil.withAlpha(accentRgb, 0.14F));

    for (int i = 0; i < STAR_SEEDS.length; i++) {
      int h = STAR_SEEDS[i];
      int sx = Math.floorMod(h, Math.max(1, width));
      int sy = Math.floorMod(h * 31, Math.max(1, Math.round(height * 0.58F)));
      float pulse = 0.45F + 0.55F * (float) Math.sin((now * 0.0022D) + (i * 0.77D));
      int col = (i % 5 == 0) ? PeakRenderUtil.withAlpha(accentRgb, pulse * 0.85F) : PeakRenderUtil.withAlpha(0xE2F1FF, pulse * 0.75F);
      g.method_25294(sx, sy, sx + 1, sy + 1, col);
      if (i % 13 == 0 && pulse > 0.78F) {
        g.method_25294(sx - 1, sy, sx + 2, sy + 1, PeakRenderUtil.withAlpha(0xFFFFFF, 0.25F));
      }
    }

    int step = 3;
    for (int x = 0; x < width; x += step) {
      double nx = x / (double) Math.max(1, width);
      double peakMain = Math.exp(-Math.pow((nx - 0.50D) / 0.16D, 2.0D)) * (height * 0.22D);
      double peakLeft = Math.exp(-Math.pow((nx - 0.18D) / 0.19D, 2.0D)) * (height * 0.14D);
      double peakRight = Math.exp(-Math.pow((nx - 0.84D) / 0.18D, 2.0D)) * (height * 0.16D);
      double crag = Math.abs(Math.sin(nx * 29.0D)) * 7.0D + Math.abs(Math.cos(nx * 61.0D)) * 4.0D;

      int ridgeBackY = (int) Math.round(horizonY + 18 - peakLeft - peakRight - peakMain * 0.85D - crag);
      int ridgeFrontY = (int) Math.round(horizonY + 34 - peakMain * 0.65D - Math.sin(nx * 14.0D + 0.8D) * 14.0D - crag * 0.6D);

      g.method_25294(x, Math.max(0, ridgeBackY), x + step, height, 0xFF0A1322);
      if (ridgeBackY < horizonY - 8) {
        g.method_25294(x, ridgeBackY, x + step, ridgeBackY + 2, PeakRenderUtil.withAlpha(accentRgb, 0.22F));
      }
      g.method_25294(x, Math.max(0, ridgeFrontY), x + step, height, 0xFF060B15);
    }

    for (int i = 0; i < SNOW_SEEDS.length; i++) {
      int h = SNOW_SEEDS[i];
      double speed = 14.0D + Math.floorMod(h, 22);
      double drift = Math.sin(now * 0.0009D + i) * 18.0D;
      int sx = Math.floorMod((int) (Math.floorMod(h, Math.max(1, width)) + drift + (now * 0.01D * ((i % 3) - 1))), Math.max(1, width));
      int sy = Math.floorMod((int) (Math.floorMod(h * 17, Math.max(1, height)) + (now * speed / 1000.0D)), Math.max(1, height));
      int a = i % 2 == 0 ? 0x66FFFFFF : 0x40BAE6FD;
      g.method_25294(sx, sy, sx + 1, sy + 1, a);
    }

    g.method_25296(0, 0, width, 46, 0x99040810, 0x00040810);
    g.method_25296(0, height - 48, width, height, 0x00040810, 0xB8040810);
  }

  public static void renderForeground(class_332 g, class_327 font, int width, int height) {
    PeakClientConfig cfg = PeakClientConfig.get();
    int accentRgb = cfg.getAccentRgb();
    class_310 mc = class_310.method_1551();
    boolean pl = cfg.isPolish();

    int titleY = Math.max(16, height / 4 - 22);
    int crestSize = 26;
    String brand = "PEAK CLIENT";
    int brandW = font.method_1727(brand);
    int headerW = Math.max(190, crestSize + 10 + brandW + 18);
    int headerX = (width - headerW) / 2;

    PeakRenderUtil.drawPeakCrest(g, headerX + 6, titleY, crestSize, accentRgb);
    g.method_25303(font, brand, headerX + crestSize + 14, titleY + 3, 0xFFF8FAFC);
    String mcVer = class_155.method_16673() != null ? class_155.method_16673().method_48019() : "1.21.4";
    String sub = "MINECRAFT " + mcVer + " · v" + PeakClientMod.VERSION;
    g.method_25303(font, sub, headerX + crestSize + 14, titleY + 15, PeakRenderUtil.withAlpha(accentRgb, 1.0F));

    String playerName = (mc != null && mc.method_1548() != null) ? mc.method_1548().method_1676() : "PeakPlayer";
    String badgeText = pl ? "Konto aktywne" : "Active Account";
    int maxCardW = width < 480 ? 96 : 122;
    int cardW = Math.min(maxCardW, Math.max(96, font.method_1727(playerName) + 34));
    String visibleName = font.method_1727(playerName) > cardW - 32
      ? font.method_27523(playerName, Math.max(24, cardW - 36)) + ".."
      : playerName;
    int cardX = width - cardW - 8;
    int cardY = 10;
    PeakRenderUtil.drawGlassPanel(g, cardX, cardY, cardW, 28, accentRgb, 0.72F);
    g.method_25294(cardX + 7, cardY + 6, cardX + 23, cardY + 22, 0xFF1E293B);
    g.method_25294(cardX + 9, cardY + 8, cardX + 21, cardY + 20, PeakRenderUtil.withAlpha(accentRgb, 0.35F));
    g.method_25294(cardX + 11, cardY + 12, cardX + 13, cardY + 14, 0xFFFFFFFF);
    g.method_25294(cardX + 17, cardY + 12, cardX + 19, cardY + 14, 0xFFFFFFFF);
    g.method_25303(font, visibleName, cardX + 28, cardY + 5, PeakRenderUtil.TEXT_PRIMARY);
    g.method_25303(font, badgeText, cardX + 28, cardY + 16, PeakRenderUtil.withAlpha(accentRgb, 1.0F));

    if (width >= 520) {
      String hint = pl
        ? "RShift: Peak GUI  ·  F3: Lepsze F3  ·  C: Zoom  ·  G: Fullbright"
        : "RShift: Peak GUI  ·  F3: Better F3  ·  C: Zoom  ·  G: Fullbright";
      int hw = font.method_1727(hint) + 14;
      PeakRenderUtil.drawGlassCard(g, 10, 10, hw, 18, 0.58F, PeakRenderUtil.withAlpha(accentRgb, 0.38F));
      g.method_25303(font, hint, 17, 15, PeakRenderUtil.TEXT_MUTED);
    }

    g.method_25303(font, "Peak Launcher · Alpine Edition v" + PeakClientMod.VERSION, 6, height - 21, 0xCC94A3B8);
  }
}
