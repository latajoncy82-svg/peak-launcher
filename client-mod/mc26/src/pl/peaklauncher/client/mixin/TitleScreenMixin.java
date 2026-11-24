package pl.peaklauncher.client.mixin;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakClientMod;
import pl.peaklauncher.client.PeakTitleScreenOverlay;

@Mixin(TitleScreen.class)
public abstract class TitleScreenMixin extends Screen {
  protected TitleScreenMixin(Component title) {
    super(title);
  }

  @Inject(method = "init", at = @At("TAIL"))
  private void peak$addPeakGuiButton(CallbackInfo ci) {
    int bw = this.width < 480 ? 96 : 122;
    int bx = Math.max(8, this.width - bw - 8);
    int by = 42;
    this.addRenderableWidget(
      Button.builder(Component.literal("★ Peak Client"), (btn) -> PeakClientMod.openPeakGui(this))
        .bounds(bx, by, bw, 20)
        .build()
    );
  }

  @Inject(method = "realmsNotificationsEnabled", at = @At("HEAD"), cancellable = true)
  private void peak$hideRealmsBadge(CallbackInfoReturnable<Boolean> cir) {
    if (PeakClientConfig.get().peakMainMenu) {
      cir.setReturnValue(false);
    }
  }

  @Redirect(
    method = "extractRenderState",
    at = @At(
      value = "INVOKE",
      target = "Lnet/minecraft/client/gui/screens/TitleScreen;extractPanorama(Lnet/minecraft/client/gui/GuiGraphicsExtractor;F)V"
    )
  )
  private void peak$replacePanorama(TitleScreen instance, GuiGraphicsExtractor g, float partialTick) {
    if (PeakClientConfig.get().peakMainMenu) {
      PeakTitleScreenOverlay.renderBackdrop(g, this.width, this.height);
    } else {
      this.extractPanorama(g, partialTick);
    }
  }

  @Inject(method = "extractRenderState", at = @At("TAIL"))
  private void peak$afterTitleRender(GuiGraphicsExtractor g, int mouseX, int mouseY, float partialTick, CallbackInfo ci) {
    if (PeakClientConfig.get().peakMainMenu) {
      PeakTitleScreenOverlay.renderForeground(g, this.font, this.width, this.height);
    }
  }
}
