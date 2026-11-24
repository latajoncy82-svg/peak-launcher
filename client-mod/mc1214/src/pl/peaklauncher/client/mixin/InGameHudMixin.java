package pl.peaklauncher.client.mixin;

import net.minecraft.class_310;
import net.minecraft.class_329;
import net.minecraft.class_332;
import net.minecraft.class_9779;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakHudRenderer;

@Mixin(class_329.class)
public class InGameHudMixin {
  @Inject(method = "method_1753(Lnet/minecraft/class_332;Lnet/minecraft/class_9779;)V", at = @At("TAIL"))
  private void peak$afterHudRender(class_332 context, class_9779 tickCounter, CallbackInfo ci) {
    class_310 mc = class_310.method_1551();
    if (mc != null && mc.field_1690 != null && !mc.field_1690.field_1842) {
      PeakHudRenderer.renderInGameHud(context, false);
    }
  }
}
