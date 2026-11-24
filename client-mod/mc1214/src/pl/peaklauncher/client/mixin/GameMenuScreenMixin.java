package pl.peaklauncher.client.mixin;

import net.minecraft.class_2561;
import net.minecraft.class_4185;
import net.minecraft.class_433;
import net.minecraft.class_437;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientMod;

@Mixin(class_433.class)
public abstract class GameMenuScreenMixin extends class_437 {
  protected GameMenuScreenMixin(class_2561 title) {
    super(title);
  }

  @Inject(method = "method_25426()V", at = @At("TAIL"))
  private void peak$addPauseMenuButton(CallbackInfo ci) {
    int bw = this.field_22789 < 480 ? 100 : 124;
    int bx = Math.max(8, this.field_22789 - bw - 8);
    this.method_37063(
      class_4185.method_46430(class_2561.method_43470("★ Peak Client"), (btn) -> PeakClientMod.openPeakGui(this))
        .method_46434(bx, 10, bw, 20)
        .method_46431()
    );
  }
}
