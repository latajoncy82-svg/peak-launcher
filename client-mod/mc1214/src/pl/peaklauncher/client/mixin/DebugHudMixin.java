package pl.peaklauncher.client.mixin;

import net.minecraft.class_332;
import net.minecraft.class_340;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakBetterF3Renderer;
import pl.peaklauncher.client.PeakClientConfig;

@Mixin(class_340.class)
public class DebugHudMixin {
  @Inject(method = "method_1846(Lnet/minecraft/class_332;)V", at = @At("HEAD"), cancellable = true)
  private void peak$replaceDebugHud(class_332 context, CallbackInfo ci) {
    PeakClientConfig cfg = PeakClientConfig.get();
    class_340 self = (class_340) (Object) this;
    if (cfg.betterF3Enabled && self.method_53536()) {
      PeakBetterF3Renderer.render(context);
      ci.cancel();
    }
  }
}
