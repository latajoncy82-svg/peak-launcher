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

  private static int lerpArgb(int argbA, int argbB, float t) {
    float clamped = Math.max(0.0F, Math.min(1.0F, t));
    int aA = (argbA >>> 24) & 0xFF, rA = (argbA >> 16) & 0xFF, gA = (argbA >> 8) & 0xFF, bA = argbA & 0xFF;
    int aB = (argbB >>> 24) & 0xFF, rB = (argbB >> 16) & 0xFF, gB = (argbB >> 8) & 0xFF, bB = argbB & 0xFF;
    int a = Math.round(aA + (aB - aA) * clamped);
    int r = Math.round(rA + (rB - rA) * clamped);
    int g = Math.round(gA + (gB - gA) * clamped);
    int b = Math.round(bA + (bB - bA) * clamped);
    return (a << 24) | (r << 16) | (g << 8) | b;
  }

  private static int[] cornerInsets(int r) {
    if (r <= 1) return new int[0];
    return switch (r) {
      case 2 -> new int[]{1};
      case 3 -> new int[]{2, 1};
      case 4 -> new int[]{2, 1, 1};
      case 5 -> new int[]{3, 2, 1, 1};
      case 6 -> new int[]{4, 2, 1, 1, 1};
      case 7 -> new int[]{4, 3, 2, 1, 1, 1};
      default -> new int[]{5, 3, 2, 2, 1, 1, 1};
    };
  }

  public static void drawRoundedRect(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int argb) {
    if (w <= 0 || h <= 0) return;
    int cr = Math.min(r, Math.min(w / 2, h / 2));
    int[] ins = cornerInsets(cr);
    if (ins.length == 0) {
      g.fill(x, y, x + w, y + h, argb);
      return;
    }
    for (int i = 0; i < ins.length; i++) {
      int pad = ins[i];
      if (x + pad < x + w - pad) {
        g.fill(x + pad, y + i, x + w - pad, y + i + 1, argb);
        int by = y + h - 1 - i;
        if (by >= y + ins.length) {
          g.fill(x + pad, by, x + w - pad, by + 1, argb);
        }
      }
    }
    if (h > ins.length * 2) {
      g.fill(x, y + ins.length, x + w, y + h - ins.length, argb);
    }
  }

  public static void drawRoundedGradient(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int topArgb, int botArgb) {
    if (w <= 0 || h <= 0) return;
    int cr = Math.min(r, Math.min(w / 2, h / 2));
    int[] ins = cornerInsets(cr);
    if (ins.length == 0) {
      g.fillGradient(x, y, x + w, y + h, topArgb, botArgb);
      return;
    }
    float denom = Math.max(1.0F, (float) (h - 1));
    for (int i = 0; i < ins.length; i++) {
      int pad = ins[i];
      if (x + pad < x + w - pad) {
        g.fill(x + pad, y + i, x + w - pad, y + i + 1, lerpArgb(topArgb, botArgb, i / denom));
        int by = y + h - 1 - i;
        if (by >= y + ins.length) {
          g.fill(x + pad, by, x + w - pad, by + 1, lerpArgb(topArgb, botArgb, (h - 1 - i) / denom));
        }
      }
    }
    if (h > ins.length * 2) {
      int midTop = lerpArgb(topArgb, botArgb, ins.length / denom);
      int midBot = lerpArgb(topArgb, botArgb, (h - ins.length) / denom);
      g.fillGradient(x, y + ins.length, x + w, y + h - ins.length, midTop, midBot);
    }
  }

  public static void drawRoundedOutline(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int argb) {
    if (w <= 1 || h <= 1) return;
    int cr = Math.min(r, Math.min(w / 2, h / 2));
    int[] ins = cornerInsets(cr);
    if (ins.length == 0) {
      g.outline(x, y, w, h, argb);
      return;
    }
    g.fill(x + ins[0], y, x + w - ins[0], y + 1, argb);
    g.fill(x + ins[0], y + h - 1, x + w - ins[0], y + h, argb);
    if (h > ins.length * 2) {
      g.fill(x, y + ins.length, x + 1, y + h - ins.length, argb);
      g.fill(x + w - 1, y + ins.length, x + w, y + h - ins.length, argb);
    }
    for (int i = 1; i < ins.length; i++) {
      int cur = ins[i];
      int spanEnd = Math.max(cur + 1, ins[i - 1]);
      g.fill(x + cur, y + i, x + spanEnd, y + i + 1, argb);
      g.fill(x + w - spanEnd, y + i, x + w - cur, y + i + 1, argb);
      int by = y + h - 1 - i;
      if (by > y + i) {
        g.fill(x + cur, by, x + spanEnd, by + 1, argb);
        g.fill(x + w - spanEnd, by, x + w - cur, by + 1, argb);
      }
    }
  }

  public static void drawSoftShadow(GuiGraphicsExtractor g, int x, int y, int w, int h, int r) {
    int[][] layers = {
      {10, 0x1002060D},
      {6, 0x1A02060D},
      {3, 0x2602060D},
      {1, 0x3602060D}
    };
    for (int[] layer : layers) {
      int e = layer[0];
      int dy = Math.max(1, e / 2);
      drawRoundedRect(g, x - e, y - e + dy, w + e * 2, h + e * 2, Math.min(8, r + e / 2), layer[1]);
    }
  }

  public static void drawToggleSwitch(GuiGraphicsExtractor g, int x, int y, int w, int h, boolean enabled, boolean hovered, int accentRgb) {
    int r = Math.min(6, h / 2);
    if (enabled) {
      int topC = 0xFF000000 | mixColor(accentRgb, 0xFFFFFF, hovered ? 0.22F : 0.12F);
      int botC = 0xFF000000 | mixColor(accentRgb, 0x0B1322, 0.12F);
      drawRoundedGradient(g, x, y, w, h, r, topC, botC);
      drawRoundedOutline(g, x, y, w, h, r, withAlpha(0xFFFFFF, hovered ? 0.42F : 0.26F));
    } else {
      drawRoundedRect(g, x, y, w, h, r, hovered ? 0xFF283548 : 0xFF1B2638);
      drawRoundedOutline(g, x, y, w, h, r, hovered ? 0xFF64748B : 0xFF3A4A63);
    }
    int knob = Math.max(6, h - 4);
    int kr = Math.max(2, knob / 2);
    int kx = enabled ? (x + w - knob - 2) : (x + 2);
    int ky = y + (h - knob) / 2;
    drawRoundedRect(g, kx, ky + 1, knob, knob, kr, 0x4402060D);
    drawRoundedRect(g, kx, ky, knob, knob, kr, enabled ? 0xFFF8FAFC : 0xFFCBD5E1);
  }

  public static void drawGlassCard(GuiGraphicsExtractor g, int x, int y, int w, int h, float opacity, int borderArgb) {
    int bgTop = withAlpha(0x0B1322, Math.min(0.95F, opacity + 0.08F));
    int bgBot = withAlpha(0x070D17, Math.min(0.96F, opacity + 0.12F));
    drawRoundedGradient(g, x, y, w, h, 3, bgTop, bgBot);
    if (w > 8) {
      g.fill(x + 3, y + 1, x + w - 3, y + 2, 0x16FFFFFF);
    }
    drawRoundedOutline(g, x, y, w, h, 3, borderArgb);
  }

  public static void drawGlassPanel(GuiGraphicsExtractor g, int x, int y, int w, int h, int accentRgb, float opacity) {
    drawGlassCard(g, x, y, w, h, opacity, withAlpha(0x334155, 0.85F));
    if (h > 6) {
      g.fill(x + 2, y + 3, x + 4, y + h - 3, withAlpha(accentRgb, 0.92F));
    }
  }

  public static void drawHeaderCard(GuiGraphicsExtractor g, Font font, int x, int y, int w, int h, String title, int titleRgb, int borderRgb, float opacity) {
    drawGlassCard(g, x, y, w, h, opacity, borderRgb);
    if (w > 4 && h > 16) {
      g.fill(x + 2, y + 1, x + w - 2, y + 15, withAlpha(titleRgb, 0.16F));
      g.fill(x + 1, y + 15, x + w - 1, y + 16, withAlpha(titleRgb, 0.42F));
    }
    g.text(font, title, x + 6, y + 4, withAlpha(titleRgb, 1.0F), true);
  }

  public static void drawProgressBar(GuiGraphicsExtractor g, int x, int y, int w, int h, float ratio, int accentRgb) {
    float r = Math.max(0.0F, Math.min(1.0F, ratio));
    drawRoundedRect(g, x, y, w, h, Math.min(3, h / 2), 0xAA0F172A);
    int fillW = Math.round(w * r);
    if (fillW > 2) {
      int bright = mixColor(accentRgb, 0xFFFFFF, 0.35F);
      drawRoundedGradient(g, x, y, fillW, h, Math.min(3, h / 2), withAlpha(bright, 0.98F), withAlpha(accentRgb, 0.98F));
    }
    drawRoundedOutline(g, x, y, w, h, Math.min(3, h / 2), withAlpha(accentRgb, 0.45F));
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
      bgTop = withAlpha(0x132440, 0.92F * alpha);
      bgBot = withAlpha(0x0B172C, 0.96F * alpha);
      border = withAlpha(accentRgb, 0.96F * alpha);
    } else {
      bgTop = withAlpha(0x0E182A, 0.82F * alpha);
      bgBot = withAlpha(0x080F1C, 0.88F * alpha);
      border = withAlpha(0x64748B, 0.52F * alpha);
    }
    int rad = Math.min(4, Math.min(w / 4, h / 4));
    drawRoundedGradient(g, x, y, w, h, rad, bgTop, bgBot);
    if (active && w > 8) {
      g.fill(x + 3, y + 1, x + w - 3, y + 2, hovered ? withAlpha(accentRgb, 0.45F * alpha) : withAlpha(0xFFFFFF, 0.10F * alpha));
    }
    drawRoundedOutline(g, x, y, w, h, rad, border);
  }

  /**
   * Twin alpine mountain medallion icon inside a rounded glass badge.
   */
  public static void drawPeakCrest(GuiGraphicsExtractor g, int x, int y, int size, int accentRgb) {
    int r = Math.max(3, size / 4);
    drawRoundedGradient(g, x, y, size, size, r, 0xF010203B, 0xF0070E1C);
    if (size >= 14) {
      g.fill(x + 2, y + size / 2, x + size - 2, y + size - 3, withAlpha(accentRgb, 0.14F));
    }
    int baseY = y + size - 4;
    int peakH = Math.max(6, size - 8);
    // Secondary shoulder peak (right)
    int p2x = x + (size * 66) / 100;
    int p2Top = y + 4 + Math.max(2, peakH / 3);
    int p2H = baseY - p2Top + 1;
    for (int row = 0; row < p2H; row++) {
      int halfW = Math.max(1, (row * Math.max(4, size / 2 - 2)) / Math.max(1, p2H));
      int col = row < 2 ? withAlpha(0xE2F1FF, 0.85F) : withAlpha(accentRgb, 0.68F);
      g.fill(Math.max(x + 2, p2x - halfW), p2Top + row, Math.min(x + size - 2, p2x + halfW + 1), p2Top + row + 1, col);
    }
    // Primary alpine peak (left-center)
    int p1x = x + (size * 43) / 100;
    int p1Top = y + 4;
    int bright = mixColor(accentRgb, 0xFFFFFF, 0.25F);
    for (int row = 0; row <= peakH; row++) {
      int halfW = Math.max(1, (row * Math.max(5, size / 2)) / Math.max(1, peakH));
      int col = row <= peakH / 3 ? 0xFFF8FAFC : withAlpha(bright, 0.96F);
      g.fill(Math.max(x + 2, p1x - halfW), p1Top + row, Math.min(x + size - 2, p1x + halfW + 1), p1Top + row + 1, col);
    }
    drawRoundedOutline(g, x, y, size, size, r, withAlpha(accentRgb, 0.72F));
  }

  public static void drawModuleIcon(GuiGraphicsExtractor g, int x, int y, String icon, int accentRgb, boolean active) {
    int bg = active ? withAlpha(accentRgb, 0.16F) : 0x66131E30;
    int border = active ? withAlpha(accentRgb, 0.48F) : 0x55334155;
    int fg = active ? withAlpha(mixColor(accentRgb, 0xFFFFFF, 0.35F), 1.0F) : 0xFF94A3B8;
    int dim = active ? withAlpha(accentRgb, 0.55F) : 0xFF475569;

    drawRoundedRect(g, x, y, 16, 16, 4, bg);
    drawRoundedOutline(g, x, y, 16, 16, 4, border);

    switch (icon) {
      case "hud" -> {
        g.fill(x + 3, y + 3, x + 7, y + 7, fg);
        g.fill(x + 9, y + 3, x + 13, y + 7, dim);
        g.fill(x + 3, y + 9, x + 13, y + 13, dim);
      }
      case "fps" -> {
        g.fill(x + 3, y + 9, x + 5, y + 13, dim);
        g.fill(x + 7, y + 6, x + 9, y + 13, fg);
        g.fill(x + 11, y + 3, x + 13, y + 13, fg);
      }
      case "coords" -> {
        g.fill(x + 7, y + 3, x + 9, y + 13, dim);
        g.fill(x + 3, y + 7, x + 13, y + 9, dim);
        g.fill(x + 6, y + 5, x + 10, y + 8, fg);
        g.fill(x + 7, y + 8, x + 9, y + 11, fg);
      }
      case "cps" -> {
        g.outline(x + 4, y + 3, 8, 10, dim);
        g.fill(x + 5, y + 4, x + 8, y + 7, fg);
        g.fill(x + 8, y + 3, x + 9, y + 7, dim);
      }
      case "keys" -> {
        g.fill(x + 6, y + 4, x + 10, y + 7, fg);
        g.fill(x + 3, y + 8, x + 6, y + 11, dim);
        g.fill(x + 7, y + 8, x + 9, y + 11, fg);
        g.fill(x + 10, y + 8, x + 13, y + 11, dim);
      }
      case "armor" -> {
        g.fill(x + 4, y + 3, x + 12, y + 8, fg);
        g.fill(x + 5, y + 8, x + 11, y + 11, fg);
        g.fill(x + 6, y + 11, x + 10, y + 13, dim);
      }
      case "ping" -> {
        g.fill(x + 4, y + 10, x + 6, y + 12, fg);
        g.fill(x + 7, y + 7, x + 9, y + 12, fg);
        g.fill(x + 10, y + 4, x + 12, y + 12, dim);
      }
      case "effects" -> {
        g.fill(x + 6, y + 3, x + 10, y + 5, dim);
        g.fill(x + 5, y + 6, x + 11, y + 9, dim);
        g.fill(x + 4, y + 9, x + 12, y + 13, fg);
      }
      case "sprint" -> {
        g.fill(x + 3, y + 5, x + 5, y + 7, dim);
        g.fill(x + 5, y + 7, x + 7, y + 9, dim);
        g.fill(x + 3, y + 9, x + 5, y + 11, dim);
        g.fill(x + 8, y + 5, x + 10, y + 7, fg);
        g.fill(x + 10, y + 7, x + 12, y + 9, fg);
        g.fill(x + 8, y + 9, x + 10, y + 11, fg);
      }
      case "zoom" -> {
        g.outline(x + 3, y + 3, 7, 7, fg);
        g.fill(x + 9, y + 9, x + 11, y + 11, fg);
        g.fill(x + 11, y + 11, x + 13, y + 13, dim);
      }
      case "fullbright" -> {
        g.fill(x + 5, y + 5, x + 11, y + 11, fg);
        g.fill(x + 7, y + 2, x + 9, y + 4, dim);
        g.fill(x + 7, y + 12, x + 9, y + 14, dim);
        g.fill(x + 2, y + 7, x + 4, y + 9, dim);
        g.fill(x + 12, y + 7, x + 14, y + 9, dim);
      }
      case "watermark" -> {
        g.fill(x + 6, y + 5, x + 8, y + 12, fg);
        g.fill(x + 4, y + 8, x + 10, y + 12, fg);
        g.fill(x + 10, y + 7, x + 12, y + 12, dim);
      }
      case "f3" -> {
        g.fill(x + 3, y + 4, x + 8, y + 6, fg);
        g.fill(x + 3, y + 7, x + 7, y + 9, dim);
        g.fill(x + 3, y + 10, x + 8, y + 12, dim);
        g.fill(x + 10, y + 4, x + 13, y + 12, fg);
      }
      case "look" -> {
        g.fill(x + 5, y + 4, x + 9, y + 12, fg);
        g.fill(x + 4, y + 6, x + 6, y + 10, fg);
        g.fill(x + 11, y + 4, x + 13, y + 6, dim);
      }
      default -> {
        g.fill(x + 4, y + 4, x + 7, y + 7, fg);
        g.fill(x + 9, y + 4, x + 12, y + 7, dim);
        g.fill(x + 4, y + 9, x + 12, y + 12, fg);
      }
    }
  }
}
