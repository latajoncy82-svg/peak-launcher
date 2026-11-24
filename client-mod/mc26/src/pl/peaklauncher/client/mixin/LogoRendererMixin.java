package pl.peaklauncher.client.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.LogoRenderer;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientConfig;

@Mixin(LogoRenderer.class)
public class LogoRendererMixin {
  @Inject(
    method = "extractRenderState(Lnet/minecraft/client/gui/GuiGraphicsExtractor;IFI)V",
    at = @At("HEAD"),
    cancellable = true
  )
  private void peak$hideVanillaLogoOnPeakTitle(GuiGraphicsExtractor g, int width, float alpha, int yOffset, CallbackInfo ci) {
    Minecraft mc = Minecraft.getInstance();
    if (PeakClientConfig.get().peakMainMenu && mc != null && mc.gui != null && mc.gui.screen() instanceof TitleScreen) {
      ci.cancel();
    }
  }
}
