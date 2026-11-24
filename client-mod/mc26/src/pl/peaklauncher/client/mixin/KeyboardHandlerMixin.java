package pl.peaklauncher.client.mixin;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakClientMod;
import pl.peaklauncher.client.PeakClientState;
import pl.peaklauncher.client.PeakGuiScreen;

@Mixin(KeyboardHandler.class)
public class KeyboardHandlerMixin {
  @Inject(method = "keyPress", at = @At("HEAD"), cancellable = true)
  private void peak$onKeyPress(long window, int action, KeyEvent event, CallbackInfo ci) {
    Minecraft mc = Minecraft.getInstance();
    if (mc == null || mc.getWindow() == null || window != mc.getWindow().handle()) return;

    int key = event.key();
    Screen screen = mc.gui != null ? mc.gui.screen() : null;
    PeakClientConfig cfg = PeakClientConfig.get();

    // Right Shift opens or closes Peak Client GUI from anywhere except chat/text editing
    if (key == InputConstants.KEY_RSHIFT && action == 1) {
      if (screen instanceof PeakGuiScreen) {
        screen.onClose();
        ci.cancel();
        return;
      }
      if (screen == null || screen.getFocused() == null) {
        PeakClientMod.openPeakGui(screen);
        ci.cancel();
        return;
      }
    }

    // Hold C to Zoom in-game
    if (key == InputConstants.KEY_C && cfg.zoomEnabled) {
      if (screen == null && action == 1) {
        PeakClientState.setZoomHeld(true);
      } else if (action == 0) {
        PeakClientState.setZoomHeld(false);
      }
    }

    // Press G to toggle Fullbright in-game
    if (key == InputConstants.KEY_G && action == 1 && screen == null) {
      cfg.fullbrightEnabled = !cfg.fullbrightEnabled;
      PeakClientConfig.save();
      boolean pl = cfg.isPolish();
      PeakClientState.showToast(
        (pl ? "Fullbright: " : "Fullbright: ") +
        (cfg.fullbrightEnabled ? (pl ? "WŁĄCZONY" : "ON") : (pl ? "WYŁĄCZONY" : "OFF"))
      );
    }
  }
}
