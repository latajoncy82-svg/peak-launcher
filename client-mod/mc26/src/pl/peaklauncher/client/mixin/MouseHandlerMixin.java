package pl.peaklauncher.client.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientState;

@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
  @Inject(method = "onButton", at = @At("HEAD"))
  private void peak$trackMouseCps(long window, MouseButtonInfo buttonInfo, int action, CallbackInfo ci) {
    Minecraft mc = Minecraft.getInstance();
    if (mc == null || mc.getWindow() == null || window != mc.getWindow().handle()) return;
    if (action != 1 || mc.gui == null || mc.gui.screen() != null) return;

    int btn = buttonInfo.button();
    if (btn == 0) {
      PeakClientState.recordLeftClick();
    } else if (btn == 1) {
      PeakClientState.recordRightClick();
    }
  }

  @Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
  private void peak$scrollZoom(long window, double horizontal, double vertical, CallbackInfo ci) {
    Minecraft mc = Minecraft.getInstance();
    if (mc == null || mc.getWindow() == null || window != mc.getWindow().handle()) return;
    if (PeakClientState.isZoomActive() && (mc.gui == null || mc.gui.screen() == null)) {
      PeakClientState.adjustZoomScroll(vertical);
      ci.cancel();
    }
  }
}
