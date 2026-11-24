package pl.peaklauncher.client.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakClientState;

@Mixin(Minecraft.class)
public class MinecraftMixin {
  @Inject(method = "tick", at = @At("TAIL"))
  private void peak$onTick(CallbackInfo ci) {
    Minecraft mc = (Minecraft) (Object) this;
    PeakClientState.tick(mc.getFps());

    PeakClientConfig cfg = PeakClientConfig.get();
    Screen currentScreen = mc.gui != null ? mc.gui.screen() : null;
    if (!cfg.zoomEnabled || currentScreen != null) {
      PeakClientState.setZoomHeld(false);
    }

    if (cfg.toggleSprintEnabled
      && PeakClientState.isToggleSprintLatched()
      && mc.player != null
      && currentScreen == null
      && mc.options != null
      && mc.options.keyUp.isDown()
      && !mc.player.isShiftKeyDown()) {
      mc.player.setSprinting(true);
    }
  }
}
