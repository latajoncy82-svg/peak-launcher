package pl.peaklauncher.client.mixin;

import net.minecraft.client.renderer.LightmapRenderStateExtractor;
import net.minecraft.client.renderer.state.LightmapRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;

@Mixin(LightmapRenderStateExtractor.class)
public class LightmapRenderStateExtractorMixin {
  @Inject(method = "extract", at = @At("TAIL"))
  private void peak$applyFullbright(LightmapRenderState state, float partialTick, CallbackInfo ci) {
    if (PeakClientConfig.get().fullbrightEnabled && state != null) {
      state.brightness = 15.0F;
      state.darknessEffectScale = 0.0F;
      state.needsUpdate = true;
    }
  }
}
