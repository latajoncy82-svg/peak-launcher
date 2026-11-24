package pl.peaklauncher.client.mixin;

import net.minecraft.class_309;
import net.minecraft.class_310;
import net.minecraft.class_437;
import org.lwjgl.glfw.GLFW;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakClientMod;
import pl.peaklauncher.client.PeakClientState;
import pl.peaklauncher.client.PeakGuiScreen;

@Mixin(class_309.class)
public class KeyboardMixin {
  @Inject(method = "method_1466(JIIII)V", at = @At("HEAD"), cancellable = true)
  private void peak$onKey(long window, int key, int scancode, int action, int modifiers, CallbackInfo ci) {
    class_310 mc = class_310.method_1551();
    if (mc == null || mc.method_22683() == null || window != mc.method_22683().method_4490()) return;

    class_437 screen = mc.field_1755;
    PeakClientConfig cfg = PeakClientConfig.get();

    if (key == GLFW.GLFW_KEY_RIGHT_SHIFT && action == GLFW.GLFW_PRESS) {
      if (screen instanceof PeakGuiScreen) {
        screen.method_25419();
        ci.cancel();
        return;
      }
      if (screen == null || screen.method_25399() == null) {
        PeakClientMod.openPeakGui(screen);
        ci.cancel();
        return;
      }
    }

    if (key == GLFW.GLFW_KEY_C && cfg.zoomEnabled) {
      if (screen == null && action == GLFW.GLFW_PRESS) {
        PeakClientState.setZoomHeld(true);
      } else if (action == GLFW.GLFW_RELEASE) {
        PeakClientState.setZoomHeld(false);
      }
    }

    if (key == GLFW.GLFW_KEY_G && action == GLFW.GLFW_PRESS && screen == null) {
      cfg.fullbrightEnabled = !cfg.fullbrightEnabled;
      PeakClientConfig.save();
      boolean pl = cfg.isPolish();
      PeakClientState.showToast(
        "Fullbright: " + (cfg.fullbrightEnabled ? (pl ? "WŁĄCZONY" : "ON") : (pl ? "WYŁĄCZONY" : "OFF"))
      );
    }
  }
}
