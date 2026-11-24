package pl.peaklauncher.client.mixin;

import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import pl.peaklauncher.client.PeakClientMod;

@Mixin(PauseScreen.class)
public abstract class PauseScreenMixin extends Screen {
  protected PauseScreenMixin(Component title) {
    super(title);
  }

  @Inject(method = "init", at = @At("TAIL"))
  private void peak$addPauseMenuButton(CallbackInfo ci) {
    int bw = this.width < 480 ? 100 : 124;
    int bx = Math.max(8, this.width - bw - 8);
    this.addRenderableWidget(
      Button.builder(Component.literal("★ Peak Client"), (btn) -> PeakClientMod.openPeakGui(this))
        .bounds(bx, 10, bw, 20)
        .build()
    );
  }
}
