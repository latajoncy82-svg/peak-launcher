package pl.peaklauncher.client;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

public class PeakHudEditorScreen extends Screen {
  private final Screen parent;
  private String draggingId = null;
  private int dragOffsetX = 0;
  private int dragOffsetY = 0;

  public PeakHudEditorScreen(Screen parent) {
    super(Component.literal("Peak HUD Editor"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    super.init();
    boolean pl = PeakClientConfig.get().isPolish();
    int bw = 110;
    int cx = this.width / 2;
    int by = this.height - 32;
    this.addRenderableWidget(Button.builder(Component.literal(pl ? "Resetuj układ" : "Reset Layout"), (btn) -> {
      PeakClientConfig.get().resetPositions();
    }).bounds(cx - bw - 4, by, bw, 20).build());

    this.addRenderableWidget(Button.builder(Component.literal(pl ? "Gotowe" : "Done"), (btn) -> {
      this.onClose();
    }).bounds(cx + 4, by, bw, 20).build());
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
      g.fill(0, 0, this.width, this.height, 0x55050B16);
    } else {
      PeakTitleScreenOverlay.renderBackdrop(g, this.width, this.height);
    }
  }

  @Override
  public void extractRenderState(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick) {
    super.extractRenderState(g, mouseX, mouseY, partialTick);

    PeakClientConfig cfg = PeakClientConfig.get();
    boolean pl = cfg.isPolish();
    int accent = cfg.getAccentRgb();

    // Alignment center cross-guides when dragging
    if (draggingId != null) {
      g.fill(this.width / 2, 0, this.width / 2 + 1, this.height, PeakRenderUtil.withAlpha(accent, 0.25F));
      g.fill(0, this.height / 2, this.width, this.height / 2 + 1, PeakRenderUtil.withAlpha(accent, 0.25F));
    }

    PeakHudRenderer.renderInGameHud(g, true);

    // Selection outlines & drag hints on all modules
    for (String id : PeakHudRenderer.MODULE_IDS) {
      PeakHudRenderer.Box b = PeakHudRenderer.getModuleBox(cfg, id, this.width, this.height);
      boolean active = id.equals(draggingId);
      boolean hovered = mouseX >= b.x() && mouseX <= b.x() + b.w() && mouseY >= b.y() && mouseY <= b.y() + b.h();
      int outline = active ? 0xFFFFFFFF : hovered ? PeakRenderUtil.withAlpha(accent, 0.95F) : PeakRenderUtil.withAlpha(accent, 0.40F);
      g.outline(b.x() - 1, b.y() - 1, b.w() + 2, b.h() + 2, outline);
    }

    String hint = pl ? "Przeciągnij dowolny element HUD myszką, aby ustawić układ" : "Drag any HUD widget to position it";
    int hw = this.font.width(hint) + 18;
    PeakRenderUtil.drawGlassCard(g, (this.width - hw) / 2, this.height - 56, hw, 18, 0.85F, PeakRenderUtil.withAlpha(accent, 0.6F));
    g.centeredText(this.font, hint, this.width / 2, this.height - 51, PeakRenderUtil.TEXT_PRIMARY);
  }

  @Override
  public boolean mouseClicked(MouseButtonEvent event, boolean doubled) {
    if (super.mouseClicked(event, doubled)) return true;
    if (event.button() == 0) {
      PeakClientConfig cfg = PeakClientConfig.get();
      for (int i = PeakHudRenderer.MODULE_IDS.length - 1; i >= 0; i--) {
        String id = PeakHudRenderer.MODULE_IDS[i];
        PeakHudRenderer.Box b = PeakHudRenderer.getModuleBox(cfg, id, this.width, this.height);
        if (event.x() >= b.x() && event.x() <= b.x() + b.w() && event.y() >= b.y() && event.y() <= b.y() + b.h()) {
          draggingId = id;
          dragOffsetX = (int) Math.round(event.x()) - b.x();
          dragOffsetY = (int) Math.round(event.y()) - b.y();
          return true;
        }
      }
    }
    return false;
  }

  @Override
  public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
    if (draggingId != null && event.button() == 0) {
      PeakClientConfig cfg = PeakClientConfig.get();
      int nx = ((int) Math.round(event.x()) - dragOffsetX);
      int ny = ((int) Math.round(event.y()) - dragOffsetY);
      // Light 2px snap for clean alignment
      nx = Math.round(nx / 2.0F) * 2;
      ny = Math.round(ny / 2.0F) * 2;
      PeakHudRenderer.setModulePos(cfg, draggingId, nx, ny);
      return true;
    }
    return super.mouseDragged(event, dx, dy);
  }

  @Override
  public boolean mouseReleased(MouseButtonEvent event) {
    if (draggingId != null) {
      draggingId = null;
      PeakClientConfig.save();
      return true;
    }
    return super.mouseReleased(event);
  }

  @Override
  public boolean keyPressed(KeyEvent event) {
    if (event.key() == InputConstants.KEY_ESCAPE) {
      this.onClose();
      return true;
    }
    return super.keyPressed(event);
  }
}
