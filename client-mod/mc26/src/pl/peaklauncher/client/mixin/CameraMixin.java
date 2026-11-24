package pl.peaklauncher.client.mixin;

import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import pl.peaklauncher.client.PeakClientState;

@Mixin(Camera.class)
public class CameraMixin {
  @Inject(method = "calculateFov", at = @At("RETURN"), cancellable = true)
  private void peak$applyZoomFov(float partialTick, CallbackInfoReturnable<Float> cir) {
    float scale = PeakClientState.getSmoothedZoomFactor();
    if (scale < 0.999F) {
      cir.setReturnValue(cir.getReturnValue() * scale);
    }
  }
}
