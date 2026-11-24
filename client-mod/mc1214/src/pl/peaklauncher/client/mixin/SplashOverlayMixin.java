package pl.peaklauncher.client.mixin;

import net.minecraft.class_332;
import net.minecraft.class_425;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakRenderUtil;

import java.util.function.IntSupplier;

@Mixin(class_425.class)
public class SplashOverlayMixin {
  @Mutable
  @Shadow
  @Final
  private static IntSupplier field_25041;

  @Shadow
  private float field_17770;

  @Inject(method = "<init>", at = @At("TAIL"))
  private void peak$setDarkLoadingBg(CallbackInfo ci) {
    if (PeakClientConfig.get().peakLoadingScreen) {
      field_25041 = () -> 0xFF070D17;
    }
  }

  @Inject(method = "method_18103(Lnet/minecraft/class_332;IIIIF)V", at = @At("HEAD"), cancellable = true)
  private void peak$drawPeakProgressBar(class_332 context, int minX, int minY, int maxX, int maxY, float opacity, CallbackInfo ci) {
    PeakClientConfig cfg = PeakClientConfig.get();
    if (!cfg.peakLoadingScreen) return;
    ci.cancel();
    int w = Math.max(20, maxX - minX);
    int h = Math.max(6, maxY - minY);
    PeakRenderUtil.drawGlassCard(context, minX, minY, w, h, Math.min(0.95F, opacity), PeakRenderUtil.withAlpha(cfg.getAccentRgb(), 0.75F * opacity));
    PeakRenderUtil.drawProgressBar(context, minX + 2, minY + 2, Math.max(1, w - 4), Math.max(2, h - 4), this.field_17770, cfg.getAccentRgb());
  }
}
