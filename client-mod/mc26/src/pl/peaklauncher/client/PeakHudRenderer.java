package pl.peaklauncher.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.core.BlockPos;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public final class PeakHudRenderer {
  private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");

  public static final String[] MODULE_IDS = {
    "fps", "coords", "cps", "sprint", "ping", "clock", "keystrokes", "armor", "effects"
  };

  public record Box(String id, int x, int y, int w, int h) {}

  private PeakHudRenderer() {}

  public static boolean isModuleEnabled(PeakClientConfig cfg, String id) {
    return switch (id) {
      case "fps" -> cfg.hudFps;
      case "coords" -> cfg.hudCoords;
      case "cps" -> cfg.hudCps;
      case "sprint" -> cfg.hudSprint;
      case "ping" -> cfg.hudPing;
      case "clock" -> cfg.hudClock;
      case "keystrokes" -> cfg.hudKeystrokes;
      case "armor" -> cfg.hudArmor;
      case "effects" -> cfg.hudEffects;
      default -> false;
    };
  }

  public static void setModulePos(PeakClientConfig cfg, String id, int x, int y) {
    switch (id) {
      case "fps" -> { cfg.fpsX = x; cfg.fpsY = y; }
      case "coords" -> { cfg.coordsX = x; cfg.coordsY = y; }
      case "cps" -> { cfg.cpsX = x; cfg.cpsY = y; }
      case "sprint" -> { cfg.sprintX = x; cfg.sprintY = y; }
      case "ping" -> { cfg.pingX = x; cfg.pingY = y; }
      case "clock" -> { cfg.clockX = x; cfg.clockY = y; }
      case "keystrokes" -> { cfg.keystrokesX = x; cfg.keystrokesY = y; }
      case "armor" -> { cfg.armorX = x; cfg.armorY = y; }
      case "effects" -> { cfg.effectsX = x; cfg.effectsY = y; }
    }
  }

  private static int[] getBaseSize(String id) {
    return switch (id) {
      case "fps" -> new int[]{108, 16};
      case "coords" -> new int[]{144, 38};
      case "cps" -> new int[]{76, 16};
      case "sprint" -> new int[]{98, 16};
      case "ping" -> new int[]{126, 16};
      case "clock" -> new int[]{92, 16};
      case "keystrokes" -> new int[]{88, 84};
      case "armor" -> new int[]{72, 86};
      case "effects" -> new int[]{118, 52};
      default -> new int[]{96, 16};
    };
  }

  public static Box getModuleBox(PeakClientConfig cfg, String id, int screenW, int screenH) {
    float scale = cfg.hudScale;
    int[] base = getBaseSize(id);
    int w = Math.max(24, Math.round(base[0] * scale));
    int h = Math.max(10, Math.round(base[1] * scale));
    int rawX;
    int rawY;
    switch (id) {
      case "fps" -> { rawX = cfg.fpsX; rawY = cfg.fpsY; }
      case "coords" -> { rawX = cfg.coordsX; rawY = cfg.coordsY; }
      case "cps" -> { rawX = cfg.cpsX; rawY = cfg.cpsY; }
      case "sprint" -> { rawX = cfg.sprintX; rawY = cfg.sprintY; }
      case "ping" -> { rawX = cfg.pingX; rawY = cfg.pingY; }
      case "clock" -> { rawX = cfg.clockX; rawY = cfg.clockY; }
      case "keystrokes" -> {
        rawX = cfg.keystrokesX < 0 ? Math.max(6, screenW - w - 6) : cfg.keystrokesX;
        rawY = cfg.keystrokesY;
      }
      case "armor" -> {
        rawX = cfg.armorX < 0 ? Math.max(6, screenW - w - 6) : cfg.armorX;
        rawY = cfg.armorY;
      }
      case "effects" -> {
        rawX = cfg.effectsX < 0 ? Math.max(6, screenW - w - 6) : cfg.effectsX;
        rawY = cfg.effectsY;
      }
      default -> { rawX = 6; rawY = 6; }
    }
    int cx = Math.max(4, Math.min(Math.max(4, screenW - w - 4), rawX));
    int cy = Math.max(4, Math.min(Math.max(4, screenH - h - 4), rawY));
    return new Box(id, cx, cy, w, h);
  }

  private static void beginScaled(GuiGraphicsExtractor g, int x, int y, float scale) {
    g.pose().pushMatrix();
    g.pose().translate(x, y);
    g.pose().scale(scale, scale);
  }

  private static void endScaled(GuiGraphicsExtractor g) {
    g.pose().popMatrix();
  }

  public static void renderInGameHud(GuiGraphicsExtractor g, boolean editorMode) {
    Minecraft mc = Minecraft.getInstance();
    if (mc == null || mc.font == null || mc.options == null) return;
    PeakClientConfig cfg = PeakClientConfig.get();
    if (!cfg.hudEnabled && !editorMode) return;

    int sw = g.guiWidth();
    int sh = g.guiHeight();
    Font font = mc.font;
    int accentRgb = cfg.getAccentRgb();
    boolean pl = cfg.isPolish();
    float scale = cfg.hudScale;

    // Do not overlap Better F3 / F3 when open (unless in editor mode)
    if (!editorMode && mc.gui != null && mc.gui.hud != null && mc.gui.hud.getDebugOverlay().showDebugScreen()) {
      renderWatermarkAndToast(g, font, mc, cfg, sw, sh, accentRgb, pl);
      return;
    }

    if (cfg.hudFps || editorMode) {
      Box b = getModuleBox(cfg, "fps", sw, sh);
      int[] base = getBaseSize("fps");
      beginScaled(g, b.x(), b.y(), scale);
      PeakRenderUtil.drawGlassPanel(g, 0, 0, base[0], base[1], accentRgb, cfg.hudOpacity);
      int fps = mc.getFps();
      int minFps = PeakClientState.getMinFps();
      String label = minFps > 0 ? String.format("FPS %d (%d min)", fps, minFps) : String.format("FPS %d", fps);
      if (font.width(label) > base[0] - 10) {
        label = font.plainSubstrByWidth(label, base[0] - 11);
      }
      int col = fps >= 60 ? PeakRenderUtil.TEXT_PRIMARY : fps >= 30 ? PeakRenderUtil.AMBER : PeakRenderUtil.ROSE;
      g.text(font, label, 6, 4, col, true);
      endScaled(g);
    }

    if (cfg.hudCoords || editorMode) {
      Box b = getModuleBox(cfg, "coords", sw, sh);
      int[] base = getBaseSize("coords");
      int bw = base[0];
      beginScaled(g, b.x(), b.y(), scale);
      PeakRenderUtil.drawGlassPanel(g, 0, 0, bw, base[1], accentRgb, cfg.hudOpacity);
      if (mc.player != null && mc.level != null) {
        BlockPos pos = mc.player.blockPosition();
        String xyz = String.format("XYZ %d %d %d", pos.getX(), pos.getY(), pos.getZ());
        String dir = getCompassShort(mc.player.getYRot(), pl);
        if (6 + font.width(xyz) + 4 + font.width(dir) + 5 > bw) {
          dir = dir.split(" ")[0];
        }
        String altCoords;
        if (mc.level.dimension() == Level.NETHER) {
          altCoords = String.format("OW %d / %d", pos.getX() * 8, pos.getZ() * 8);
        } else {
          altCoords = String.format("Nether %d / %d", Math.floorDiv(pos.getX(), 8), Math.floorDiv(pos.getZ(), 8));
        }
        String biome = mc.level.getBiome(pos).unwrapKey()
          .map(k -> formatBiomeName(k.identifier().getPath()))
          .orElse("Plains");
        if (biome.length() > 20) biome = biome.substring(0, 19) + ".";
        g.text(font, xyz, 6, 4, PeakRenderUtil.TEXT_PRIMARY, true);
        g.text(font, dir, bw - font.width(dir) - 5, 4, PeakRenderUtil.withAlpha(accentRgb, 1.0F), true);
        g.text(font, altCoords, 6, 15, PeakRenderUtil.TEXT_MUTED, true);
        g.text(font, biome, 6, 26, PeakRenderUtil.EMERALD, true);
      } else {
        g.text(font, "XYZ 128 74 -412", 6, 4, PeakRenderUtil.TEXT_PRIMARY, true);
        g.text(font, "N (-Z)", bw - font.width("N (-Z)") - 5, 4, PeakRenderUtil.withAlpha(accentRgb, 1.0F), true);
        g.text(font, "Nether 16 / -52", 6, 15, PeakRenderUtil.TEXT_MUTED, true);
        g.text(font, "Snowy Peaks", 6, 26, PeakRenderUtil.EMERALD, true);
      }
      endScaled(g);
    }

    if (cfg.hudCps || editorMode) {
      Box b = getModuleBox(cfg, "cps", sw, sh);
      int[] base = getBaseSize("cps");
      beginScaled(g, b.x(), b.y(), scale);
      PeakRenderUtil.drawGlassPanel(g, 0, 0, base[0], base[1], accentRgb, cfg.hudOpacity);
      String cps = String.format("CPS %d | %d", PeakClientState.getLeftCps(), PeakClientState.getRightCps());
      g.text(font, cps, 6, 4, PeakRenderUtil.TEXT_PRIMARY, true);
      endScaled(g);
    }

    if (cfg.hudSprint || editorMode) {
      Box b = getModuleBox(cfg, "sprint", sw, sh);
      int[] base = getBaseSize("sprint");
      beginScaled(g, b.x(), b.y(), scale);
      PeakRenderUtil.drawGlassPanel(g, 0, 0, base[0], base[1], accentRgb, cfg.hudOpacity);
      boolean sprinting = mc.player != null && mc.player.isSprinting();
      boolean toggled = cfg.toggleSprintEnabled && PeakClientState.isToggleSprintLatched();
      String text;
      int col;
      if (sprinting) {
        text = pl ? "[Sprint Aktywny]" : "[Sprinting]";
        col = PeakRenderUtil.EMERALD;
      } else if (toggled) {
        text = pl ? "[Toggle Sprint]" : "[Sprint: Toggle]";
        col = PeakRenderUtil.withAlpha(accentRgb, 1.0F);
      } else {
        text = pl ? "[Chód / Sprint]" : "[Walking]";
        col = PeakRenderUtil.TEXT_MUTED;
      }
      if (font.width(text) > base[0] - 10) {
        text = font.plainSubstrByWidth(text, base[0] - 11);
      }
      g.text(font, text, 6, 4, col, true);
      endScaled(g);
    }

    if (cfg.hudPing || editorMode) {
      Box b = getModuleBox(cfg, "ping", sw, sh);
      int[] base = getBaseSize("ping");
      beginScaled(g, b.x(), b.y(), scale);
      PeakRenderUtil.drawGlassPanel(g, 0, 0, base[0], base[1], accentRgb, cfg.hudOpacity);
      String info = getPingAndServerText(mc, pl);
      if (font.width(info) > base[0] - 11) {
        info = font.plainSubstrByWidth(info, base[0] - 13) + ".";
      }
      g.text(font, info, 6, 4, PeakRenderUtil.TEXT_PRIMARY, true);
      endScaled(g);
    }

    if (cfg.hudClock || editorMode) {
      Box b = getModuleBox(cfg, "clock", sw, sh);
      int[] base = getBaseSize("clock");
      beginScaled(g, b.x(), b.y(), scale);
      PeakRenderUtil.drawGlassPanel(g, 0, 0, base[0], base[1], accentRgb, cfg.hudOpacity);
      String timeStr = LocalTime.now().format(TIME_FMT) + " · " + PeakClientState.formatSessionDuration();
      g.text(font, timeStr, 6, 4, PeakRenderUtil.TEXT_MUTED, true);
      endScaled(g);
    }

    if (cfg.hudKeystrokes || editorMode) {
      Box b = getModuleBox(cfg, "keystrokes", sw, sh);
      beginScaled(g, b.x(), b.y(), scale);
      renderKeystrokes(g, font, mc, 0, 0, cfg.hudOpacity, accentRgb);
      endScaled(g);
    }

    if (cfg.hudArmor || editorMode) {
      Box b = getModuleBox(cfg, "armor", sw, sh);
      int[] base = getBaseSize("armor");
      beginScaled(g, b.x(), b.y(), scale);
      renderArmorAndHand(g, font, mc, 0, 0, base[0], base[1], cfg.hudOpacity, accentRgb, editorMode);
      endScaled(g);
    }

    if (cfg.hudEffects || editorMode) {
      Box b = getModuleBox(cfg, "effects", sw, sh);
      int[] base = getBaseSize("effects");
      beginScaled(g, b.x(), b.y(), scale);
      renderEffects(g, font, mc, 0, 0, base[0], cfg.hudOpacity, accentRgb, pl, editorMode);
      endScaled(g);
    }

    renderWatermarkAndToast(g, font, mc, cfg, sw, sh, accentRgb, pl);
  }

  private static void renderKeystrokes(GuiGraphicsExtractor g, Font font, Minecraft mc, int x, int y, float opacity, int accentRgb) {
    int keySize = 26;
    int gap = 3;
    boolean w = mc.options.keyUp.isDown();
    boolean a = mc.options.keyLeft.isDown();
    boolean s = mc.options.keyDown.isDown();
    boolean d = mc.options.keyRight.isDown();
    boolean lmb = mc.options.keyAttack.isDown();
    boolean rmb = mc.options.keyUse.isDown();
    boolean jump = mc.options.keyJump.isDown();

    drawKeyTile(g, font, x + keySize + gap, y, keySize, 22, "W", w, opacity, accentRgb);
    drawKeyTile(g, font, x, y + 25, keySize, 22, "A", a, opacity, accentRgb);
    drawKeyTile(g, font, x + keySize + gap, y + 25, keySize, 22, "S", s, opacity, accentRgb);
    drawKeyTile(g, font, x + (keySize + gap) * 2, y + 25, keySize, 22, "D", d, opacity, accentRgb);

    int mouseW = (keySize * 3 + gap * 2 - gap) / 2;
    drawKeyTile(g, font, x, y + 50, mouseW, 18, "L " + PeakClientState.getLeftCps(), lmb, opacity, accentRgb);
    drawKeyTile(g, font, x + mouseW + gap, y + 50, mouseW + 1, 18, "R " + PeakClientState.getRightCps(), rmb, opacity, accentRgb);
    drawKeyTile(g, font, x, y + 71, keySize * 3 + gap * 2, 13, "SPACE", jump, opacity, accentRgb);
  }

  private static void drawKeyTile(GuiGraphicsExtractor g, Font font, int x, int y, int w, int h, String label, boolean pressed, float opacity, int accentRgb) {
    int bg = pressed ? PeakRenderUtil.withAlpha(accentRgb, 0.85F) : PeakRenderUtil.withAlpha(0x0B1322, opacity);
    int border = pressed ? PeakRenderUtil.withAlpha(0xFFFFFF, 0.85F) : PeakRenderUtil.withAlpha(0x334155, 0.85F);
    int textCol = pressed ? 0xFF070D17 : PeakRenderUtil.TEXT_PRIMARY;
    g.fill(x, y, x + w, y + h, bg);
    g.outline(x, y, w, h, border);
    g.centeredText(font, label, x + w / 2, y + (h - 7) / 2, textCol);
  }

  private static void renderArmorAndHand(GuiGraphicsExtractor g, Font font, Minecraft mc, int x, int y, int w, int h, float opacity, int accentRgb, boolean editorMode) {
    if (mc.player == null && !editorMode) return;
    List<ItemStack> items = new ArrayList<>();
    if (mc.player != null) {
      for (EquipmentSlot slot : new EquipmentSlot[]{EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.MAINHAND}) {
        ItemStack st = mc.player.getItemBySlot(slot);
        if (!st.isEmpty()) items.add(st);
      }
    }
    if (items.isEmpty() && !editorMode) return;

    int boxH = editorMode && items.isEmpty() ? h : Math.max(20, items.size() * 17 + 4);
    PeakRenderUtil.drawGlassPanel(g, x, y, w, boxH, accentRgb, opacity);
    if (items.isEmpty()) {
      g.centeredText(font, "Armor HUD", x + w / 2, y + boxH / 2 - 4, PeakRenderUtil.TEXT_MUTED);
      return;
    }

    int rowY = y + 2;
    for (ItemStack st : items) {
      g.item(st, x + 4, rowY);
      String txt;
      int txtCol = PeakRenderUtil.TEXT_PRIMARY;
      if (st.isDamageableItem() && st.getMaxDamage() > 0) {
        int rem = st.getMaxDamage() - st.getDamageValue();
        int pct = Math.max(0, Math.min(100, (rem * 100) / st.getMaxDamage()));
        txt = pct + "%";
        txtCol = pct > 50 ? PeakRenderUtil.EMERALD : pct > 20 ? PeakRenderUtil.AMBER : PeakRenderUtil.ROSE;
      } else {
        txt = "x" + st.getCount();
      }
      g.text(font, txt, x + 23, rowY + 4, txtCol, true);
      rowY += 17;
    }
  }

  private static void renderEffects(GuiGraphicsExtractor g, Font font, Minecraft mc, int x, int y, int w, float opacity, int accentRgb, boolean pl, boolean editorMode) {
    Collection<MobEffectInstance> active = mc.player != null ? mc.player.getActiveEffects() : List.of();
    if (active.isEmpty() && !editorMode) return;

    int count = Math.min(4, active.size());
    int boxH = Math.max(20, count * 12 + 6);
    PeakRenderUtil.drawGlassPanel(g, x, y, w, boxH, PeakRenderUtil.withAlpha(0x34D399, 1.0F) & 0xFFFFFF, opacity);
    if (active.isEmpty()) {
      g.centeredText(font, pl ? "Efekty mikstur" : "Effects HUD", x + w / 2, y + boxH / 2 - 4, PeakRenderUtil.TEXT_MUTED);
      return;
    }

    int ry = y + 4;
    int shown = 0;
    for (MobEffectInstance eff : active) {
      if (shown >= 4) break;
      String name = eff.getEffect().value().getDisplayName().getString();
      if (name.length() > 11) name = name.substring(0, 10) + ".";
      String dur = eff.isInfiniteDuration() ? "inf" : formatDurationTicks(eff.getDuration());
      int lvl = eff.getAmplifier() + 1;
      String left = lvl > 1 ? name + " " + lvl : name;
      g.text(font, left, x + 6, ry, PeakRenderUtil.TEXT_PRIMARY, true);
      g.text(font, dur, x + w - font.width(dur) - 6, ry, PeakRenderUtil.withAlpha(accentRgb, 1.0F), true);
      ry += 12;
      shown++;
    }
  }

  private static void renderWatermarkAndToast(GuiGraphicsExtractor g, Font font, Minecraft mc, PeakClientConfig cfg, int sw, int sh, int accentRgb, boolean pl) {
    if (cfg.showWatermark) {
      String wm = "PEAK";
      if (PeakClientState.isZoomActive()) {
        wm += String.format(" · ZOOM %.1fx", PeakClientState.getZoomMultiplierPercent());
      }
      if (cfg.fullbrightEnabled) {
        wm += " · FB";
      }
      float wmScale = Math.min(0.80F, Math.max(0.65F, cfg.hudScale));
      int w = font.width(wm) + 12;
      int swW = Math.round(w * wmScale);
      int swH = Math.round(14 * wmScale);
      int x = sw - swW - 6;
      int y = sh - swH - 4;
      beginScaled(g, x, y, wmScale);
      PeakRenderUtil.drawGlassCard(g, 0, 0, w, 14, 0.50F, PeakRenderUtil.withAlpha(accentRgb, 0.45F));
      g.text(font, wm, 6, 3, PeakRenderUtil.withAlpha(accentRgb, 1.0F), true);
      endScaled(g);
    }

    String toast = PeakClientState.getActiveToast();
    if (toast != null) {
      int tw = font.width(toast) + 20;
      int tx = (sw - tw) / 2;
      int ty = Math.max(12, sh - 66);
      PeakRenderUtil.drawGlassPanel(g, tx, ty, tw, 18, accentRgb, 0.86F);
      g.centeredText(font, toast, sw / 2, ty + 5, PeakRenderUtil.TEXT_PRIMARY);
    }
  }

  private static String getPingAndServerText(Minecraft mc, boolean pl) {
    ServerData srv = mc.getCurrentServer();
    if (srv != null) {
      int pingMs = 0;
      ClientPacketListener conn = mc.getConnection();
      if (conn != null && mc.player != null) {
        PlayerInfo info = conn.getPlayerInfo(mc.player.getUUID());
        if (info != null) pingMs = info.getLatency();
      }
      String host = srv.ip != null ? srv.ip : "MP";
      return pingMs > 0 ? (pingMs + " ms · " + host) : host;
    }
    return pl ? "Singleplayer · 0 ms" : "Singleplayer · Local";
  }

  private static String getCompassShort(float yawDeg, boolean pl) {
    float norm = ((yawDeg % 360.0F) + 360.0F) % 360.0F;
    if (norm >= 337.5F || norm < 22.5F) return "S (+Z)";
    if (norm < 67.5F) return "SW";
    if (norm < 112.5F) return "W (-X)";
    if (norm < 157.5F) return "NW";
    if (norm < 202.5F) return "N (-Z)";
    if (norm < 247.5F) return "NE";
    if (norm < 292.5F) return "E (+X)";
    return "SE";
  }

  private static String formatBiomeName(String raw) {
    String[] parts = raw.replace("minecraft:", "").split("_");
    StringBuilder sb = new StringBuilder();
    for (String p : parts) {
      if (p.isEmpty()) continue;
      if (sb.length() > 0) sb.append(' ');
      sb.append(Character.toUpperCase(p.charAt(0))).append(p.substring(1));
    }
    return sb.toString();
  }

  private static String formatDurationTicks(int ticks) {
    int sec = Math.max(0, ticks / 20);
    return String.format("%d:%02d", sec / 60, sec % 60);
  }
}
