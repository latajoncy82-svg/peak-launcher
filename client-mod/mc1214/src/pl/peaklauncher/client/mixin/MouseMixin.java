package pl.peaklauncher.client.mixin;

import net.minecraft.class_310;
import net.minecraft.class_312;
import org.lwjgl.glfw.GLFW;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientState;

@Mixin(class_312.class)
public class MouseMixin {
  @Inject(method = "method_1601(JIII)V", at = @At("HEAD"))
  private void peak$trackMouseCps(long window, int button, int action, int mods, CallbackInfo ci) {
    class_310 mc = class_310.method_1551();
    if (mc == null || mc.method_22683() == null || window != mc.method_22683().method_4490()) return;
    if (action != GLFW.GLFW_PRESS || mc.field_1755 != null) return;

    if (button == GLFW.GLFW_MOUSE_BUTTON_LEFT) {
      PeakClientState.recordLeftClick();
    } else if (button == GLFW.GLFW_MOUSE_BUTTON_RIGHT) {
      PeakClientState.recordRightClick();
    }
  }

  @Inject(method = "method_1598(JDD)V", at = @At("HEAD"), cancellable = true)
  private void peak$scrollZoom(long window, double horizontal, double vertical, CallbackInfo ci) {
    class_310 mc = class_310.method_1551();
    if (mc == null || mc.method_22683() == null || window != mc.method_22683().method_4490()) return;
    if (PeakClientState.isZoomActive() && mc.field_1755 == null) {
      PeakClientState.adjustZoomScroll(vertical);
      ci.cancel();
    }
  }
}
