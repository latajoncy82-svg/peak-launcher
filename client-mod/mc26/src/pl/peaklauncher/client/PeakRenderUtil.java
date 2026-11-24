package pl.peaklauncher.client;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;

public final class PeakRenderUtil {
  public static final int TEXT_PRIMARY = 0xFFF1F5F9;
  public static final int TEXT_MUTED = 0xFF94A3B8;
  public static final int TEXT_DIM = 0xFF64748B;
  public static final int EMERALD = 0xFF34D399;
  public static final int AMBER = 0xFFFBBF24;
  public static final int ROSE = 0xFFFB7185;
  public static final int VIOLET = 0xFFA78BFA;

  private PeakRenderUtil() {}

  public static int withAlpha(int rgb, float alpha) {
    int a = Math.max(0, Math.min(255, Math.round(alpha * 255.0F)));
    return (a << 24) | (rgb & 0xFFFFFF);
  }

  public static int mixColor(int rgbA, int rgbB, float t) {
    float clamped = Math.max(0.0F, Math.min(1.0F, t));
    int rA = (rgbA >> 16) & 0xFF, gA = (rgbA >> 8) & 0xFF, bA = rgbA & 0xFF;
    int rB = (rgbB >> 16) & 0xFF, gB = (rgbB >> 8) & 0xFF, bB = rgbB & 0xFF;
    int r = Math.round(rA + (rB - rA) * clamped);
    int g = Math.round(gA + (gB - gA) * clamped);
    int b = Math.round(bA + (bB - bA) * clamped);
    return (r << 16) | (g << 8) | b;
  }

  public static void drawGlassCard(GuiGraphicsExtractor g, int x, int y, int w, int h, float opacity, int borderArgb) {
    int bgTop = withAlpha(0x0B1322, Math.min(0.95F, opacity + 0.08F));
    int bgBot = withAlpha(0x070D17, Math.min(0.96F, opacity + 0.12F));
    g.fillGradient(x, y, x + w, y + h, bgTop, bgBot);
    g.fill(x + 1, y + 1, x + w - 1, y + 2, 0x18FFFFFF);
    g.outline(x, y, w, h, borderArgb);
  }

  public static void drawGlassPanel(GuiGraphicsExtractor g, int x, int y, int w, int h, int accentRgb, float opacity) {
    drawGlassCard(g, x, y, w, h, opacity, withAlpha(0x334155, 0.85F));
    g.fill(x, y + 2, x + 2, y + h - 2, withAlpha(accentRgb, 0.92F));
  }

  public static void drawHeaderCard(GuiGraphicsExtractor g, Font font, int x, int y, int w, int h, String title, int titleRgb, int borderRgb, float opacity) {
    drawGlassCard(g, x, y, w, h, opacity, borderRgb);
    g.fill(x + 1, y + 1, x + w - 1, y + 15, withAlpha(titleRgb, 0.16F));
    g.fill(x + 1, y + 15, x + w - 1, y + 16, withAlpha(titleRgb, 0.42F));
    g.text(font, title, x + 6, y + 4, withAlpha(titleRgb, 1.0F), true);
  }

  public static void drawProgressBar(GuiGraphicsExtractor g, int x, int y, int w, int h, float ratio, int accentRgb) {
    float r = Math.max(0.0F, Math.min(1.0F, ratio));
    g.fill(x, y, x + w, y + h, 0xAA0F172A);
    int fillW = Math.round(w * r);
    if (fillW > 0) {
      int bright = mixColor(accentRgb, 0xFFFFFF, 0.35F);
      g.fillGradient(x, y, x + fillW, y + h, withAlpha(bright, 0.98F), withAlpha(accentRgb, 0.98F));
    }
    g.outline(x, y, w, h, withAlpha(accentRgb, 0.45F));
  }

  public static void drawGlassButton(GuiGraphicsExtractor g, int x, int y, int w, int h, boolean hovered, boolean active, int accentRgb, float alpha) {
    int bgTop;
    int bgBot;
    int border;
    if (!active) {
      bgTop = withAlpha(0x0F172A, 0.50F * alpha);
      bgBot = withAlpha(0x090F1D, 0.56F * alpha);
      border = withAlpha(0x475569, 0.40F * alpha);
    } else if (hovered) {
      bgTop = withAlpha(0x132440, 0.90F * alpha);
      bgBot = withAlpha(0x0B172C, 0.94F * alpha);
      border = withAlpha(accentRgb, 0.98F * alpha);
    } else {
      bgTop = withAlpha(0x0E182A, 0.80F * alpha);
      bgBot = withAlpha(0x080F1C, 0.86F * alpha);
      border = withAlpha(0x64748B, 0.55F * alpha);
    }
    g.fillGradient(x + 1, y + 1, x + w - 1, y + h - 1, bgTop, bgBot);
    if (active) {
      g.fill(x + 2, y + 1, x + w - 2, y + 2, hovered ? withAlpha(accentRgb, 0.45F * alpha) : withAlpha(0xFFFFFF, 0.10F * alpha));
    }
    g.outline(x, y, w, h, border);
  }

  /**
   * Draws the procedural Peak Mountain Crest icon cleanly at (cx, cy).
   */
  public static void drawPeakCrest(GuiGraphicsExtractor g, int x, int y, int size, int accentRgb) {
    g.fillGradient(x, y, x + size, y + size, 0xE80E1B31, 0xE8070D17);
    g.outline(x, y, size, size, withAlpha(accentRgb, 0.85F));
    int midX = x + size / 2;
    int baseY = y + size - 3;
    int peakH = Math.max(6, size - 7);
    for (int row = 0; row < peakH; row++) {
      int halfW = Math.max(1, (row * (size - 6)) / (2 * peakH));
      int col = row < peakH / 3 ? 0xFFF8FAFC : withAlpha(accentRgb, 0.92F);
      g.fill(midX - halfW, y + 3 + row, midX + halfW + 1, y + 4 + row, col);
    }
    // Secondary alpine ridge shadow on right slope
    g.fill(x + 2, baseY - 1, x + size - 2, baseY, withAlpha(accentRgb, 0.55F));
  }
}
