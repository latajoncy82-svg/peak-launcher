package pl.peaklauncher.client.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.DebugScreenOverlay;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakBetterF3Renderer;
import pl.peaklauncher.client.PeakClientConfig;

@Mixin(DebugScreenOverlay.class)
public class DebugScreenOverlayMixin {
  @Inject(method = "extractRenderState", at = @At("HEAD"), cancellable = true)
  private void peak$replaceDebugOverlay(GuiGraphicsExtractor g, CallbackInfo ci) {
    PeakClientConfig cfg = PeakClientConfig.get();
    DebugScreenOverlay self = (DebugScreenOverlay) (Object) this;
    if (cfg.betterF3Enabled && self.showDebugScreen()) {
      g.nextStratum();
      PeakBetterF3Renderer.render(g);
      ci.cancel();
    }
  }
}
