package pl.peaklauncher.client.mixin;

import net.minecraft.class_4184;
import net.minecraft.class_757;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import pl.peaklauncher.client.PeakClientState;

@Mixin(class_757.class)
public class GameRendererMixin {
  @Inject(method = "method_3196(Lnet/minecraft/class_4184;FZ)F", at = @At("RETURN"), cancellable = true)
  private void peak$applyZoomFov(class_4184 camera, float tickDelta, boolean changingFov, CallbackInfoReturnable<Float> cir) {
    float scale = PeakClientState.getSmoothedZoomFactor();
    if (scale < 0.999F) {
      cir.setReturnValue(cir.getReturnValue() * scale);
    }
  }
}
