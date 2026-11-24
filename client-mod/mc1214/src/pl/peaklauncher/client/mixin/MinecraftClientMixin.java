package pl.peaklauncher.client.mixin;

import net.minecraft.class_310;
import net.minecraft.class_437;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakClientState;

@Mixin(class_310.class)
public class MinecraftClientMixin {
  @Inject(method = "method_1574()V", at = @At("TAIL"))
  private void peak$onTick(CallbackInfo ci) {
    class_310 mc = (class_310) (Object) this;
    PeakClientState.tick(mc.method_47599());

    PeakClientConfig cfg = PeakClientConfig.get();
    class_437 screen = mc.field_1755;
    if (!cfg.zoomEnabled || screen != null) {
      PeakClientState.setZoomHeld(false);
    }

    if (cfg.toggleSprintEnabled
      && PeakClientState.isToggleSprintLatched()
      && mc.field_1724 != null
      && screen == null
      && mc.field_1690 != null
      && mc.field_1690.field_1894.method_1434()
      && !mc.field_1724.method_5715()) {
      mc.field_1724.method_5728(true);
    }
  }
}
