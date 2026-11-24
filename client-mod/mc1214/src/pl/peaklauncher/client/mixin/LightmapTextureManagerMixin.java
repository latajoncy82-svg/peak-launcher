package pl.peaklauncher.client.mixin;

import net.minecraft.class_310;
import net.minecraft.class_7172;
import net.minecraft.class_765;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;
import pl.peaklauncher.client.PeakClientConfig;

@Mixin(class_765.class)
public class LightmapTextureManagerMixin {
  @Redirect(
    method = "method_3313(F)V",
    at = @At(
      value = "INVOKE",
      target = "Lnet/minecraft/class_7172;method_41753()Ljava/lang/Object;"
    )
  )
  private Object peak$overrideGammaForFullbright(class_7172<?> option) {
    class_310 mc = class_310.method_1551();
    if (PeakClientConfig.get().fullbrightEnabled && mc != null && mc.field_1690 != null && option == mc.field_1690.method_42473()) {
      return Double.valueOf(15.0D);
    }
    return option.method_41753();
  }
}
