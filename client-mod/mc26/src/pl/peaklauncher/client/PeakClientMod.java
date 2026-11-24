package pl.peaklauncher.client;

import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class PeakClientMod implements ClientModInitializer {
  public static final String MOD_ID = "peakclient";
  public static final String VERSION = "1.7.0";
  public static final Logger LOGGER = LoggerFactory.getLogger("PeakClient");

  @Override
  public void onInitializeClient() {
    PeakClientConfig.load();
    LOGGER.info("[PeakClient] Initialized Peak Client {} (MC 26.3 Fabric) — Better F3, Peak Alpine GUI & HUD ready.", VERSION);
  }

  public static void openPeakGui(Screen returnScreen) {
    Minecraft mc = Minecraft.getInstance();
    if (mc != null && mc.gui != null) {
      mc.gui.setScreen(new PeakGuiScreen(returnScreen));
    }
  }
}
