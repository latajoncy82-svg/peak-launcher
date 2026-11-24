package pl.peaklauncher.client;

import net.minecraft.class_2561;
import net.minecraft.class_332;
import net.minecraft.class_4185;
import net.minecraft.class_437;
import org.lwjgl.glfw.GLFW;

public class PeakHudEditorScreen extends class_437 {
  private final class_437 parent;
  private String draggingId = null;
  private int dragOffsetX = 0;
  private int dragOffsetY = 0;

  public PeakHudEditorScreen(class_437 parent) {
    super(class_2561.method_43470("Peak HUD Editor"));
    this.parent = parent;
  }

  @Override
  protected void method_25426() {
    super.method_25426();
    boolean pl = PeakClientConfig.get().isPolish();
    int bw = 110;
    int cx = this.field_22789 / 2;
    int by = this.field_22790 - 32;
    this.method_37063(
      class_4185.method_46430(class_2561.method_43470(pl ? "Resetuj układ" : "Reset Layout"), (btn) -> PeakClientConfig.get().resetPositions())
        .method_46434(cx - bw - 4, by, bw, 20)
        .method_46431()
    );
    this.method_37063(
      class_4185.method_46430(class_2561.method_43470(pl ? "Gotowe" : "Done"), (btn) -> this.method_25419())
        .method_46434(cx + 4, by, bw, 20)
        .method_46431()
    );
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
      g.method_25294(0, 0, this.field_22789, this.field_22790, 0x55050B16);
    } else {
      PeakTitleScreenOverlay.renderBackdrop(g, this.field_22789, this.field_22790);
    }
  }

  @Override
  public void method_25394(class_332 g, int mouseX, int mouseY, float partialTick) {
    super.method_25394(g, mouseX, mouseY, partialTick);

    PeakClientConfig cfg = PeakClientConfig.get();
    boolean pl = cfg.isPolish();
    int accent = cfg.getAccentRgb();

    if (draggingId != null) {
      g.method_25294(this.field_22789 / 2, 0, this.field_22789 / 2 + 1, this.field_22790, PeakRenderUtil.withAlpha(accent, 0.25F));
      g.method_25294(0, this.field_22790 / 2, this.field_22789, this.field_22790 / 2 + 1, PeakRenderUtil.withAlpha(accent, 0.25F));
    }

    PeakHudRenderer.renderInGameHud(g, true);

    for (String id : PeakHudRenderer.MODULE_IDS) {
      PeakHudRenderer.Box b = PeakHudRenderer.getModuleBox(cfg, id, this.field_22789, this.field_22790);
      boolean active = id.equals(draggingId);
      boolean hovered = mouseX >= b.x() && mouseX <= b.x() + b.w() && mouseY >= b.y() && mouseY <= b.y() + b.h();
      int outline = active ? 0xFFFFFFFF : hovered ? PeakRenderUtil.withAlpha(accent, 0.95F) : PeakRenderUtil.withAlpha(accent, 0.40F);
      g.method_49601(b.x() - 1, b.y() - 1, b.w() + 2, b.h() + 2, outline);
    }

    String hint = pl ? "Przeciągnij dowolny element HUD myszką, aby ustawić układ" : "Drag any HUD widget to position it";
    int hw = this.field_22793.method_1727(hint) + 20;
    int hx = (this.field_22789 - hw) / 2;
    int hy = this.field_22790 - 58;
    PeakRenderUtil.drawRoundedGradient(g, hx, hy, hw, 19, 5, 0xDF0C1628, 0xE6070E1C);
    PeakRenderUtil.drawRoundedOutline(g, hx, hy, hw, 19, 5, PeakRenderUtil.withAlpha(accent, 0.55F));
    g.method_25300(this.field_22793, hint, this.field_22789 / 2, hy + 6, PeakRenderUtil.TEXT_PRIMARY);
  }

  @Override
  public boolean method_25402(double mouseX, double mouseY, int button) {
    if (super.method_25402(mouseX, mouseY, button)) return true;
    if (button == 0) {
      PeakClientConfig cfg = PeakClientConfig.get();
      for (int i = PeakHudRenderer.MODULE_IDS.length - 1; i >= 0; i--) {
        String id = PeakHudRenderer.MODULE_IDS[i];
        PeakHudRenderer.Box b = PeakHudRenderer.getModuleBox(cfg, id, this.field_22789, this.field_22790);
        if (mouseX >= b.x() && mouseX <= b.x() + b.w() && mouseY >= b.y() && mouseY <= b.y() + b.h()) {
          draggingId = id;
          dragOffsetX = (int) Math.round(mouseX) - b.x();
          dragOffsetY = (int) Math.round(mouseY) - b.y();
          return true;
        }
      }
    }
    return false;
  }

  @Override
  public boolean method_25403(double mouseX, double mouseY, int button, double dx, double dy) {
    if (draggingId != null && button == 0) {
      PeakClientConfig cfg = PeakClientConfig.get();
      int nx = Math.round(((int) Math.round(mouseX) - dragOffsetX) / 2.0F) * 2;
      int ny = Math.round(((int) Math.round(mouseY) - dragOffsetY) / 2.0F) * 2;
      PeakHudRenderer.setModulePos(cfg, draggingId, nx, ny);
      return true;
    }
    return super.method_25403(mouseX, mouseY, button, dx, dy);
  }

  @Override
  public boolean method_25406(double mouseX, double mouseY, int button) {
    if (draggingId != null) {
      draggingId = null;
      PeakClientConfig.save();
      return true;
    }
    return super.method_25406(mouseX, mouseY, button);
  }

  @Override
  public boolean method_25404(int keyCode, int scanCode, int modifiers) {
    if (keyCode == GLFW.GLFW_KEY_ESCAPE) {
      this.method_25419();
      return true;
    }
    return super.method_25404(keyCode, scanCode, modifiers);
  }
}
