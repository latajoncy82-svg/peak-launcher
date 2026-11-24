package pl.peaklauncher.client.mixin;

import net.minecraft.class_2561;
import net.minecraft.class_332;
import net.minecraft.class_4185;
import net.minecraft.class_437;
import net.minecraft.class_442;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import pl.peaklauncher.client.PeakClientConfig;
import pl.peaklauncher.client.PeakClientMod;
import pl.peaklauncher.client.PeakTitleScreenOverlay;

@Mixin(class_442.class)
public abstract class TitleScreenMixin extends class_437 {
  protected TitleScreenMixin(class_2561 title) {
    super(title);
  }

  @Inject(method = "method_25426()V", at = @At("TAIL"))
  private void peak$addPeakGuiButton(CallbackInfo ci) {
    int bw = this.field_22789 < 480 ? 96 : 122;
    int bx = Math.max(8, this.field_22789 - bw - 8);
    this.method_37063(
      class_4185.method_46430(class_2561.method_43470("★ Peak Client"), (btn) -> PeakClientMod.openPeakGui(this))
        .method_46434(bx, 42, bw, 20)
        .method_46431()
    );
  }

  @Inject(method = "method_2253()Z", at = @At("HEAD"), cancellable = true)
  private void peak$hideRealmsBadge(CallbackInfoReturnable<Boolean> cir) {
    if (PeakClientConfig.get().peakMainMenu) {
      cir.setReturnValue(false);
    }
  }

  @Redirect(
    method = "method_25394(Lnet/minecraft/class_332;IIF)V",
    at = @At(
      value = "INVOKE",
      target = "Lnet/minecraft/class_442;method_57728(Lnet/minecraft/class_332;F)V"
    )
  )
  private void peak$replacePanorama(class_442 instance, class_332 context, float delta) {
    if (PeakClientConfig.get().peakMainMenu) {
      PeakTitleScreenOverlay.renderBackdrop(context, this.field_22789, this.field_22790);
    } else {
      this.method_57728(context, delta);
    }
  }

  @Inject(method = "method_25394(Lnet/minecraft/class_332;IIF)V", at = @At("TAIL"))
  private void peak$afterTitleRender(class_332 context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
    if (PeakClientConfig.get().peakMainMenu) {
      PeakTitleScreenOverlay.renderForeground(context, this.field_22793, this.field_22789, this.field_22790);
    }
  }
}
