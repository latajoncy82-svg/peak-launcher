package pl.peaklauncher.client.mixin;

import net.minecraft.class_2561;
import net.minecraft.class_310;
import net.minecraft.class_327;
import net.minecraft.class_332;
import net.minecraft.class_339;
import net.minecraft.class_4264;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakRenderUtil;

@Mixin(class_4264.class)
public abstract class PressableWidgetMixin extends class_339 {
  protected PressableWidgetMixin(int x, int y, int width, int height, class_2561 message) {
    super(x, y, width, height, message);
  }

  @Shadow
  public abstract void method_48589(class_332 context, class_327 textRenderer, int color);

  @Inject(method = "method_48579(Lnet/minecraft/class_332;IIF)V", at = @At("HEAD"), cancellable = true)
  private void peak$drawGlassButton(class_332 context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
    PeakClientConfig cfg = PeakClientConfig.get();
    if (!cfg.peakButtonStyle) return;

    PeakRenderUtil.drawGlassButton(
      context,
      this.method_46426(),
      this.method_46427(),
      this.method_25368(),
      this.method_25364(),
      this.method_25367(),
      this.field_22763,
      cfg.getAccentRgb(),
      this.field_22765
    );

    class_310 mc = class_310.method_1551();
    if (mc != null && mc.field_1772 != null) {
      int alphaByte = Math.max(4, Math.min(255, Math.round(this.field_22765 * 255.0F)));
      int rgb = this.field_22763 ? 0xF8FAFC : 0x94A3B8;
      this.method_48589(context, mc.field_1772, (alphaByte << 24) | rgb);
    }
    ci.cancel();
  }
}
