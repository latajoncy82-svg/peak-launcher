package pl.peaklauncher.client;

import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.ArrayList;
import java.util.List;

public final class PeakBetterF3Renderer {
  private PeakBetterF3Renderer() {}

  public static void render(GuiGraphicsExtractor g) {
    Minecraft mc = Minecraft.getInstance();
    if (mc == null || mc.font == null || mc.player == null || mc.level == null) return;

    PeakClientConfig cfg = PeakClientConfig.get();
    Font font = mc.font;
    int sw = g.guiWidth();
    int sh = g.guiHeight();
    int accent = cfg.getAccentRgb();
    boolean pl = cfg.isPolish();
    float opacity = Math.max(0.55F, cfg.hudOpacity);
    int colW = Math.min(228, Math.max(150, sw / 2 - 14));
    int leftX = 8;
    int rightX = sw - colW - 8;
    int leftY = 8;
    int rightY = 8;

    // LEFT COLUMN 1: PERFORMANCE
    if (cfg.f3Performance) {
      List<Line> lines = new ArrayList<>();
      int fps = mc.getFps();
      int minFps = PeakClientState.getMinFps();
      long usedMb = (Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()) / (1024L * 1024L);
      long maxMb = Math.max(1L, Runtime.getRuntime().maxMemory() / (1024L * 1024L));
      int ramPct = (int) Math.min(100L, (usedMb * 100L) / maxMb);
      double gpuPct = mc.getGpuUtilization();
      String ver = SharedConstants.getCurrentVersion() != null ? SharedConstants.getCurrentVersion().name() : "26.3";

      lines.add(new Line("FPS", fps + " fps" + (minFps > 0 ? " (min " + minFps + ")" : ""),
        fps >= 60 ? PeakRenderUtil.EMERALD : fps >= 30 ? PeakRenderUtil.AMBER : PeakRenderUtil.ROSE));
      if (gpuPct > 0.5D) {
        lines.add(new Line("GPU", String.format("%.0f%%", gpuPct), PeakRenderUtil.TEXT_PRIMARY));
      }
      lines.add(new Line("RAM", String.format("%d / %d MB (%d%%)", usedMb, maxMb, ramPct),
        ramPct > 85 ? PeakRenderUtil.ROSE : PeakRenderUtil.TEXT_PRIMARY));
      if (!cfg.f3Compact) {
        lines.add(new Line("Java", System.getProperty("java.version", "25") + " · " + ver, PeakRenderUtil.TEXT_MUTED));
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

    // LEFT COLUMN 2: POSITION & WORLD ENVIRONMENT
    if (cfg.f3Position) {
      BlockPos pos = mc.player.blockPosition();
      List<Line> lines = new ArrayList<>();
      lines.add(new Line("XYZ", String.format("%.2f / %.2f / %.2f", mc.player.getX(), mc.player.getY(), mc.player.getZ()), PeakRenderUtil.TEXT_PRIMARY));
      if (cfg.f3NetherCoords) {
        if (mc.level.dimension() == Level.NETHER) {
          lines.add(new Line("Overworld", String.format("%d / %d / %d", pos.getX() * 8, pos.getY(), pos.getZ() * 8), 0xFF38BDF8));
        } else {
          lines.add(new Line("Nether", String.format("%d / %d / %d", Math.floorDiv(pos.getX(), 8), pos.getY(), Math.floorDiv(pos.getZ(), 8)), 0xFFFB7185));
        }
      }
      lines.add(new Line(pl ? "Kierunek" : "Facing", formatFacingFull(mc.player.getYRot(), mc.player.getXRot(), pl), PeakRenderUtil.AMBER));
      if (!cfg.f3Compact) {
        lines.add(new Line("Chunk", String.format("%d, %d (sec %d)", pos.getX() >> 4, pos.getZ() >> 4, pos.getY() >> 4), PeakRenderUtil.TEXT_MUTED));
        String biome = mc.level.getBiome(pos).unwrapKey().map(k -> k.identifier().getPath()).orElse("plains");
        lines.add(new Line("Biom", biome, PeakRenderUtil.EMERALD));
        int skyLight = mc.level.getBrightness(LightLayer.SKY, pos);
        int blkLight = mc.level.getBrightness(LightLayer.BLOCK, pos);
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

    // RIGHT COLUMN 1: WORLD & SERVER
    if (cfg.f3WorldServer) {
      List<Line> lines = new ArrayList<>();
      ServerData srv = mc.getCurrentServer();
      String srvText = srv != null && srv.ip != null ? srv.ip : (pl ? "Świat lokalny (SP)" : "Local World (SP)");
      int pingMs = 0;
      ClientPacketListener conn = mc.getConnection();
      if (conn != null) {
        PlayerInfo pi = conn.getPlayerInfo(mc.player.getUUID());
        if (pi != null) pingMs = pi.getLatency();
      }
      long clockTime = mc.level.getOverworldClockTime();
      long day = clockTime / 24000L;
      int dayTick = (int) (clockTime % 24000L);
      int hour = (dayTick / 1000 + 6) % 24;
      int minute = ((dayTick % 1000) * 60) / 1000;
      String dimName = mc.level.dimension().identifier().getPath();
      String weather = mc.level.isThundering() ? (pl ? "Burza" : "Thunder") : mc.level.isRaining() ? (pl ? "Deszcz" : "Rain") : (pl ? "Czysto" : "Clear");

      lines.add(new Line(pl ? "Serwer" : "Server", srvText, PeakRenderUtil.TEXT_PRIMARY));
      if (srv != null) {
        lines.add(new Line("Ping", pingMs + " ms", pingMs < 60 ? PeakRenderUtil.EMERALD : pingMs < 130 ? PeakRenderUtil.AMBER : PeakRenderUtil.ROSE));
      }
      lines.add(new Line(pl ? "Wymiar" : "Dim", dimName, 0xFFA78BFA));
      lines.add(new Line(pl ? "Czas" : "Time", String.format("%s %d · %02d:%02d", pl ? "Dzień" : "Day", day, hour, minute), PeakRenderUtil.AMBER));
      if (!cfg.f3Compact) {
        lines.add(new Line(pl ? "Pogoda" : "Weather", weather, PeakRenderUtil.TEXT_MUTED));
        lines.add(new Line(pl ? "Byty" : "Entities", String.valueOf(mc.level.getEntityCount()), PeakRenderUtil.TEXT_MUTED));
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

    // RIGHT COLUMN 2: TARGET BLOCK / ENTITY
    if (cfg.f3Target) {
      List<Line> lines = new ArrayList<>();
      HitResult hit = mc.hitResult;
      if (hit instanceof BlockHitResult bhr && hit.getType() == HitResult.Type.BLOCK) {
        BlockPos bp = bhr.getBlockPos();
        BlockState bs = mc.level.getBlockState(bp);
        String id = BuiltInRegistries.BLOCK.getKey(bs.getBlock()).toString();
        String nice = bs.getBlock().getName().getString();
        lines.add(new Line(pl ? "Blok" : "Block", nice, PeakRenderUtil.TEXT_PRIMARY));
        lines.add(new Line("ID", id, PeakRenderUtil.AMBER));
        lines.add(new Line("XYZ", bp.getX() + ", " + bp.getY() + ", " + bp.getZ(), PeakRenderUtil.TEXT_MUTED));
        lines.add(new Line(pl ? "Ściana" : "Face", bhr.getDirection().getName(), PeakRenderUtil.TEXT_MUTED));
      } else if (hit instanceof EntityHitResult ehr && hit.getType() == HitResult.Type.ENTITY) {
        String name = ehr.getEntity().getName().getString();
        String type = BuiltInRegistries.ENTITY_TYPE.getKey(ehr.getEntity().getType()).toString();
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

    // Bottom center quick footer badge
    String footer = pl
      ? "Peak Lepsze F3  ·  RShift: Ustawienia  ·  C: Zoom  ·  G: Fullbright"
      : "Peak Better F3  ·  RShift: Peak GUI  ·  C: Zoom  ·  G: Fullbright";
    int fw = font.width(footer) + 18;
    if (fw < sw - 20) {
      int fx = (sw - fw) / 2;
      int fy = Math.max(8, sh - 20);
      PeakRenderUtil.drawGlassCard(g, fx, fy, fw, 15, opacity, PeakRenderUtil.withAlpha(accent, 0.55F));
      g.centeredText(font, footer, sw / 2, fy + 4, PeakRenderUtil.TEXT_MUTED);
    }
  }

  private static void drawKeyVal(GuiGraphicsExtractor g, Font font, int x, int y, int maxW, String key, String val, int valCol) {
    String kTxt = key + ": ";
    int kw = font.width(kTxt);
    g.text(font, kTxt, x, y, PeakRenderUtil.TEXT_MUTED, true);
    int avail = Math.max(24, maxW - kw);
    String clipped = val;
    if (font.width(clipped) > avail) {
      clipped = font.plainSubstrByWidth(clipped, Math.max(8, avail - 6)) + "..";
    }
    int vx = x + Math.max(kw, maxW - font.width(clipped));
    g.text(font, clipped, vx, y, valCol, true);
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
