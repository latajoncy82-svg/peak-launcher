package pl.peaklauncher.client.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractButton;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakRenderUtil;

@Mixin(AbstractButton.class)
public class AbstractButtonMixin {
  @Inject(method = "extractDefaultSprite", at = @At("HEAD"), cancellable = true)
  private void peak$drawGlassButton(GuiGraphicsExtractor g, CallbackInfo ci) {
    PeakClientConfig cfg = PeakClientConfig.get();
    if (!cfg.peakButtonStyle) return;

    AbstractButton self = (AbstractButton) (Object) this;
    PeakRenderUtil.drawGlassButton(
      g,
      self.getX(),
      self.getY(),
      self.getWidth(),
      self.getHeight(),
      self.isHoveredOrFocused(),
      self.isActive(),
      cfg.getAccentRgb(),
      self.getAlpha()
    );
    ci.cancel();
  }
}
