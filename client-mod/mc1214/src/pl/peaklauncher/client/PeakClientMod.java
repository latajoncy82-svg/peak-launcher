package pl.peaklauncher.client;

import net.fabricmc.api.ClientModInitializer;
import net.minecraft.class_310;
import net.minecraft.class_437;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class PeakClientMod implements ClientModInitializer {
  public static final String MOD_ID = "peakclient";
  public static final String VERSION = "1.7.2";
  public static final Logger LOGGER = LoggerFactory.getLogger("PeakClient");

  @Override
  public void onInitializeClient() {
    PeakClientConfig.load();
    LOGGER.info("[PeakClient] Initialized Peak Client {} (MC 1.21.4 Fabric) — Better F3, Peak Alpine GUI & HUD ready.", VERSION);
  }

  public static void openPeakGui(class_437 returnScreen) {
    class_310 mc = class_310.method_1551();
    if (mc != null) {
      mc.method_1507(new PeakGuiScreen(returnScreen));
    }
  }
}
