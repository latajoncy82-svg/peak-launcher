package pl.peaklauncher.client;

import net.minecraft.class_155;
import net.minecraft.class_1937;
import net.minecraft.class_1944;
import net.minecraft.class_2338;
import net.minecraft.class_239;
import net.minecraft.class_2680;
import net.minecraft.class_310;
import net.minecraft.class_327;
import net.minecraft.class_332;
import net.minecraft.class_3965;
import net.minecraft.class_3966;
import net.minecraft.class_634;
import net.minecraft.class_640;
import net.minecraft.class_642;
import net.minecraft.class_7923;

import java.util.ArrayList;
import java.util.List;

public final class PeakBetterF3Renderer {
  private PeakBetterF3Renderer() {}

  public static void render(class_332 g) {
    class_310 mc = class_310.method_1551();
    if (mc == null || mc.field_1772 == null || mc.field_1724 == null || mc.field_1687 == null) return;

    PeakClientConfig cfg = PeakClientConfig.get();
    class_327 font = mc.field_1772;
    int sw = g.method_51421();
    int sh = g.method_51443();
    int accent = cfg.getAccentRgb();
    boolean pl = cfg.isPolish();
    float opacity = Math.max(0.55F, cfg.hudOpacity);
    int colW = Math.min(228, Math.max(150, sw / 2 - 14));
    int leftX = 8;
    int rightX = sw - colW - 8;
    int leftY = 8;
    int rightY = 8;

    if (cfg.f3Performance) {
      List<Line> lines = new ArrayList<>();
      int fps = mc.method_47599();
      int minFps = PeakClientState.getMinFps();
      long usedMb = (Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()) / (1024L * 1024L);
      long maxMb = Math.max(1L, Runtime.getRuntime().maxMemory() / (1024L * 1024L));
      int ramPct = (int) Math.min(100L, (usedMb * 100L) / maxMb);
      double gpuPct = mc.method_41734();
      String ver = class_155.method_16673() != null ? class_155.method_16673().method_48019() : "1.21.4";

      lines.add(new Line("FPS", fps + " fps" + (minFps > 0 ? " (min " + minFps + ")" : ""),
        fps >= 60 ? PeakRenderUtil.EMERALD : fps >= 30 ? PeakRenderUtil.AMBER : PeakRenderUtil.ROSE));
      if (gpuPct > 0.5D) {
        lines.add(new Line("GPU", String.format("%.0f%%", gpuPct), PeakRenderUtil.TEXT_PRIMARY));
      }
      lines.add(new Line("RAM", String.format("%d / %d MB (%d%%)", usedMb, maxMb, ramPct),
        ramPct > 85 ? PeakRenderUtil.ROSE : PeakRenderUtil.TEXT_PRIMARY));
      if (!cfg.f3Compact) {
        lines.add(new Line("Java", System.getProperty("java.version", "21") + " · " + ver, PeakRenderUtil.TEXT_MUTED));
      }

      int cardH = 22 + lines.size() * 11 + 8;
      PeakRenderUtil.drawHeaderCard(g, font, leftX, leftY, colW, cardH, pl ? "WYDAJNOŚĆ · PEAK F3" : "PERFORMANCE · PEAK F3", accent, accent, opacity);
      int y = leftY + 19;
      for (Line l : lines) {
        drawKeyVal(g, font, leftX + 7, y, colW - 14, l.key, l.val, l.valColor);
        y += 11;
      }
      PeakRenderUtil.drawProgressBar(g, leftX + 7, y + 1, colW - 14, 4, ramPct / 100.0F, accent);
      leftY += cardH + 6;
    }

    if (cfg.f3Position) {
      class_2338 pos = mc.field_1724.method_24515();
      List<Line> lines = new ArrayList<>();
      lines.add(new Line("XYZ", String.format("%.2f / %.2f / %.2f", mc.field_1724.method_23317(), mc.field_1724.method_23318(), mc.field_1724.method_23321()), PeakRenderUtil.TEXT_PRIMARY));
      if (cfg.f3NetherCoords) {
        if (mc.field_1687.method_27983() == class_1937.field_25180) {
          lines.add(new Line("Overworld", String.format("%d / %d / %d", pos.method_10263() * 8, pos.method_10264(), pos.method_10260() * 8), 0xFF38BDF8));
        } else {
          lines.add(new Line("Nether", String.format("%d / %d / %d", Math.floorDiv(pos.method_10263(), 8), pos.method_10264(), Math.floorDiv(pos.method_10260(), 8)), 0xFFFB7185));
        }
      }
      lines.add(new Line(pl ? "Kierunek" : "Facing", formatFacingFull(mc.field_1724.method_36454(), mc.field_1724.method_36455(), pl), PeakRenderUtil.AMBER));
      if (!cfg.f3Compact) {
        lines.add(new Line("Chunk", String.format("%d, %d (sec %d)", pos.method_10263() >> 4, pos.method_10260() >> 4, pos.method_10264() >> 4), PeakRenderUtil.TEXT_MUTED));
        String biome = mc.field_1687.method_23753(pos).method_40230().map(k -> k.method_29177().method_12832()).orElse("plains");
        lines.add(new Line("Biom", biome, PeakRenderUtil.EMERALD));
        int skyLight = mc.field_1687.method_8314(class_1944.field_9284, pos);
        int blkLight = mc.field_1687.method_8314(class_1944.field_9282, pos);
        lines.add(new Line(pl ? "Światło" : "Light", String.format("Sky %d · Block %d", skyLight, blkLight), PeakRenderUtil.TEXT_PRIMARY));
      }

      int cardH = 22 + lines.size() * 11;
      PeakRenderUtil.drawHeaderCard(g, font, leftX, leftY, colW, cardH, pl ? "POZYCJA I BIOM" : "LOCATION & BIOME", 0x34D399, 0x34D399, opacity);
      int y = leftY + 19;
      for (Line l : lines) {
        drawKeyVal(g, font, leftX + 7, y, colW - 14, l.key, l.val, l.valColor);
        y += 11;
      }
      leftY += cardH + 6;
    }

    if (cfg.f3WorldServer) {
      List<Line> lines = new ArrayList<>();
      class_642 srv = mc.method_1558();
      String srvText = srv != null && srv.field_3761 != null ? srv.field_3761 : (pl ? "Świat lokalny (SP)" : "Local World (SP)");
      int pingMs = 0;
      class_634 conn = mc.method_1562();
      if (conn != null) {
        class_640 pi = conn.method_2871(mc.field_1724.method_5667());
        if (pi != null) pingMs = pi.method_2959();
      }
      long clockTime = mc.field_1687.method_8532();
      long day = clockTime / 24000L;
      int dayTick = (int) (clockTime % 24000L);
      int hour = (dayTick / 1000 + 6) % 24;
      int minute = ((dayTick % 1000) * 60) / 1000;
      String dimName = mc.field_1687.method_27983().method_29177().method_12832();
      String weather = mc.field_1687.method_8546() ? (pl ? "Burza" : "Thunder") : mc.field_1687.method_8419() ? (pl ? "Deszcz" : "Rain") : (pl ? "Czysto" : "Clear");

      lines.add(new Line(pl ? "Serwer" : "Server", srvText, PeakRenderUtil.TEXT_PRIMARY));
      if (srv != null) {
        lines.add(new Line("Ping", pingMs + " ms", pingMs < 60 ? PeakRenderUtil.EMERALD : pingMs < 130 ? PeakRenderUtil.AMBER : PeakRenderUtil.ROSE));
      }
      lines.add(new Line(pl ? "Wymiar" : "Dim", dimName, 0xFFA78BFA));
      lines.add(new Line(pl ? "Czas" : "Time", String.format("%s %d · %02d:%02d", pl ? "Dzień" : "Day", day, hour, minute), PeakRenderUtil.AMBER));
      if (!cfg.f3Compact) {
        lines.add(new Line(pl ? "Pogoda" : "Weather", weather, PeakRenderUtil.TEXT_MUTED));
        lines.add(new Line(pl ? "Byty" : "Entities", String.valueOf(mc.field_1687.method_18120()), PeakRenderUtil.TEXT_MUTED));
      }

      int cardH = 22 + lines.size() * 11;
      PeakRenderUtil.drawHeaderCard(g, font, rightX, rightY, colW, cardH, pl ? "ŚWIAT I SERWER" : "WORLD & SERVER", 0xA78BFA, 0xA78BFA, opacity);
      int y = rightY + 19;
      for (Line l : lines) {
        drawKeyVal(g, font, rightX + 7, y, colW - 14, l.key, l.val, l.valColor);
        y += 11;
      }
      rightY += cardH + 6;
    }

    if (cfg.f3Target) {
      List<Line> lines = new ArrayList<>();
      class_239 hit = mc.field_1765;
      if (hit instanceof class_3965 bhr && hit.method_17783() == class_239.class_240.field_1332) {
        class_2338 bp = bhr.method_17777();
        class_2680 bs = mc.field_1687.method_8320(bp);
        String id = class_7923.field_41175.method_10221(bs.method_26204()).toString();
        String nice = bs.method_26204().method_9518().getString();
        lines.add(new Line(pl ? "Blok" : "Block", nice, PeakRenderUtil.TEXT_PRIMARY));
        lines.add(new Line("ID", id, PeakRenderUtil.AMBER));
        lines.add(new Line("XYZ", bp.method_10263() + ", " + bp.method_10264() + ", " + bp.method_10260(), PeakRenderUtil.TEXT_MUTED));
        lines.add(new Line(pl ? "Ściana" : "Face", bhr.method_17780().method_15434(), PeakRenderUtil.TEXT_MUTED));
      } else if (hit instanceof class_3966 ehr && hit.method_17783() == class_239.class_240.field_1331) {
        String name = ehr.method_17782().method_5477().getString();
        String type = class_7923.field_41177.method_10221(ehr.method_17782().method_5864()).toString();
        lines.add(new Line(pl ? "Cel" : "Entity", name, PeakRenderUtil.TEXT_PRIMARY));
        lines.add(new Line("ID", type, PeakRenderUtil.AMBER));
      } else {
        lines.add(new Line(pl ? "Cel" : "Target", pl ? "Brak bloku w zasięgu" : "No target in range", PeakRenderUtil.TEXT_DIM));
      }

      int cardH = 22 + lines.size() * 11;
      PeakRenderUtil.drawHeaderCard(g, font, rightX, rightY, colW, cardH, pl ? "CELOWANIE (TARGET)" : "TARGET INSPECTOR", 0xFBBF24, 0xFBBF24, opacity);
      int y = rightY + 19;
      for (Line l : lines) {
        drawKeyVal(g, font, rightX + 7, y, colW - 14, l.key, l.val, l.valColor);
        y += 11;
      }
    }

    String footer = pl
      ? "Peak Lepsze F3  ·  RShift: Ustawienia  ·  C: Zoom  ·  G: Fullbright"
      : "Peak Better F3  ·  RShift: Peak GUI  ·  C: Zoom  ·  G: Fullbright";
    int fw = font.method_1727(footer) + 18;
    if (fw < sw - 20) {
      int fx = (sw - fw) / 2;
      int fy = Math.max(8, sh - 20);
      PeakRenderUtil.drawGlassCard(g, fx, fy, fw, 15, opacity, PeakRenderUtil.withAlpha(accent, 0.55F));
      g.method_25300(font, footer, sw / 2, fy + 4, PeakRenderUtil.TEXT_MUTED);
    }
  }

  private static void drawKeyVal(class_332 g, class_327 font, int x, int y, int maxW, String key, String val, int valCol) {
    String kTxt = key + ": ";
    int kw = font.method_1727(kTxt);
    g.method_25303(font, kTxt, x, y, PeakRenderUtil.TEXT_MUTED);
    int avail = Math.max(24, maxW - kw);
    String clipped = val;
    if (font.method_1727(clipped) > avail) {
      clipped = font.method_27523(clipped, Math.max(8, avail - 6)) + "..";
    }
    int vx = x + Math.max(kw, maxW - font.method_1727(clipped));
    g.method_25303(font, clipped, vx, y, valCol);
  }

  private static String formatFacingFull(float yawDeg, float pitchDeg, boolean pl) {
    float norm = ((yawDeg % 360.0F) + 360.0F) % 360.0F;
    String card;
    if (norm >= 315.0F || norm < 45.0F) card = pl ? "Południe (+Z)" : "South (+Z)";
    else if (norm < 135.0F) card = pl ? "Zachód (-X)" : "West (-X)";
    else if (norm < 225.0F) card = pl ? "Północ (-Z)" : "North (-Z)";
    else card = pl ? "Wschód (+X)" : "East (+X)";
    return String.format("%s (%.0f / %.0f)", card, norm - 180.0F, pitchDeg);
  }

  private record Line(String key, String val, int valColor) {}
}
