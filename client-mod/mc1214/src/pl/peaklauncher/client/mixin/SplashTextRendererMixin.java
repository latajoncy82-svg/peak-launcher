package pl.peaklauncher.client.mixin;

import net.minecraft.class_310;
import net.minecraft.class_327;
import net.minecraft.class_332;
import net.minecraft.class_442;
import net.minecraft.class_8519;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;

@Mixin(class_8519.class)
public class SplashTextRendererMixin {
  @Inject(method = "method_51453(Lnet/minecraft/class_332;ILnet/minecraft/class_327;I)V", at = @At("HEAD"), cancellable = true)
  private void peak$hideYellowSplashOnPeakTitle(class_332 context, int width, class_327 font, int alpha, CallbackInfo ci) {
    class_310 mc = class_310.method_1551();
    if (PeakClientConfig.get().peakMainMenu && mc != null && mc.field_1755 instanceof class_442) {
      ci.cancel();
    }
  }
}
