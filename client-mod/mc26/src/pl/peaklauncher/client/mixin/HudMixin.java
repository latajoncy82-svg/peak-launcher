package pl.peaklauncher.client.mixin;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.Hud;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakHudRenderer;

@Mixin(Hud.class)
public class HudMixin {
  @Inject(method = "extractRenderState", at = @At("TAIL"))
  private void peak$afterHudRender(GuiGraphicsExtractor g, DeltaTracker deltaTracker, CallbackInfo ci) {
    Hud self = (Hud) (Object) this;
    Minecraft mc = Minecraft.getInstance();
    if (!self.isHidden() && mc != null && mc.isGameLoadFinished()) {
      PeakHudRenderer.renderInGameHud(g, false);
    }
  }
}
