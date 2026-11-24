package pl.peaklauncher.client.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.LoadingOverlay;
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

@Mixin(LoadingOverlay.class)
public class LoadingOverlayMixin {
  @Mutable
  @Shadow
  @Final
  private static IntSupplier BRAND_BACKGROUND;

  @Inject(method = "<init>", at = @At("TAIL"))
  private void peak$setDarkLoadingBackground(CallbackInfo ci) {
    if (PeakClientConfig.get().peakLoadingScreen) {
      BRAND_BACKGROUND = () -> 0xFF070D17;
    }
  }

  @Inject(method = "extractProgressBar", at = @At("HEAD"), cancellable = true)
  private void peak$drawPeakProgressBar(GuiGraphicsExtractor g, int minX, int minY, int maxX, int maxY, float opacity, CallbackInfo ci) {
    PeakClientConfig cfg = PeakClientConfig.get();
    if (!cfg.peakLoadingScreen) return;

    LoadingOverlay self = (LoadingOverlay) (Object) this;
    // Clamp current progress cleanly via reflection-free field access not needed if read from shadow? Let's keep simple:
    ci.cancel();
    int w = Math.max(20, maxX - minX);
    int h = Math.max(6, maxY - minY);
    PeakRenderUtil.drawGlassCard(g, minX, minY, w, h, Math.min(0.95F, opacity), PeakRenderUtil.withAlpha(cfg.getAccentRgb(), 0.75F * opacity));
    PeakRenderUtil.drawProgressBar(g, minX + 2, minY + 2, Math.max(1, w - 4), Math.max(2, h - 4), peak$getProgress(self), cfg.getAccentRgb());
  }

  @Shadow
  private float currentProgress;

  private static float peak$getProgress(LoadingOverlay self) {
    return ((LoadingOverlayMixin) (Object) self).currentProgress;
  }
}
