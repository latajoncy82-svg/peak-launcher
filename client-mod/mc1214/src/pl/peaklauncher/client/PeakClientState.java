package pl.peaklauncher.client;

import java.util.ArrayDeque;
import java.util.Deque;

public final class PeakClientState {
  private static final Deque<Long> LEFT_CLICKS = new ArrayDeque<>();
  private static final Deque<Long> RIGHT_CLICKS = new ArrayDeque<>();
  private static final Deque<Integer> FPS_SAMPLES = new ArrayDeque<>();

  public static final long SESSION_START_MS = System.currentTimeMillis();

  private static boolean zoomHeld = false;
  private static float zoomTargetMultiplier = 0.28F;
  private static float currentFovScale = 1.0F;

  private static boolean toggleSprintLatched = true;
  private static long lastFpsSampleMs = 0L;
  private static int minFps = 0;

  private static String toastText = null;
  private static long toastUntilMs = 0L;

  private PeakClientState() {}

  public static void recordLeftClick() {
    long now = System.currentTimeMillis();
    synchronized (LEFT_CLICKS) {
      LEFT_CLICKS.addLast(now);
      prune(LEFT_CLICKS, now);
    }
  }

  public static void recordRightClick() {
    long now = System.currentTimeMillis();
    synchronized (RIGHT_CLICKS) {
      RIGHT_CLICKS.addLast(now);
      prune(RIGHT_CLICKS, now);
    }
  }

  public static int getLeftCps() {
    long now = System.currentTimeMillis();
    synchronized (LEFT_CLICKS) {
      prune(LEFT_CLICKS, now);
      return LEFT_CLICKS.size();
    }
  }

  public static int getRightCps() {
    long now = System.currentTimeMillis();
    synchronized (RIGHT_CLICKS) {
      prune(RIGHT_CLICKS, now);
      return RIGHT_CLICKS.size();
    }
  }

  private static void prune(Deque<Long> q, long now) {
    while (!q.isEmpty() && now - q.peekFirst() > 1000L) {
      q.removeFirst();
    }
  }

  public static boolean isZoomActive() {
    return PeakClientConfig.get().zoomEnabled && zoomHeld;
  }

  public static void setZoomHeld(boolean held) {
    if (held && !zoomHeld) {
      zoomTargetMultiplier = 0.28F;
    }
    zoomHeld = held;
  }

  public static void adjustZoomScroll(double verticalDelta) {
    if (!isZoomActive()) return;
    float next = zoomTargetMultiplier - (float) (verticalDelta * 0.035D);
    if (next < 0.08F) next = 0.08F;
    if (next > 0.65F) next = 0.65F;
    zoomTargetMultiplier = next;
  }

  public static float getSmoothedZoomFactor() {
    float target = isZoomActive() ? zoomTargetMultiplier : 1.0F;
    currentFovScale += (target - currentFovScale) * 0.22F;
    if (Math.abs(target - currentFovScale) < 0.002F) {
      currentFovScale = target;
    }
    return currentFovScale;
  }

  public static float getZoomMultiplierPercent() {
    return 1.0F / Math.max(0.08F, zoomTargetMultiplier);
  }

  public static boolean isToggleSprintLatched() {
    return toggleSprintLatched;
  }

  public static void tick(int currentFps) {
    long now = System.currentTimeMillis();
    if (now - lastFpsSampleMs >= 400L && currentFps > 0) {
      lastFpsSampleMs = now;
      FPS_SAMPLES.addLast(currentFps);
      while (FPS_SAMPLES.size() > 30) {
        FPS_SAMPLES.removeFirst();
      }
      int lowest = Integer.MAX_VALUE;
      for (int s : FPS_SAMPLES) {
        if (s < lowest) lowest = s;
      }
      minFps = lowest == Integer.MAX_VALUE ? currentFps : lowest;
    }
  }

  public static int getMinFps() {
    return minFps;
  }

  public static void showToast(String msg) {
    toastText = msg;
    toastUntilMs = System.currentTimeMillis() + 2400L;
  }

  public static String getActiveToast() {
    if (toastText == null) return null;
    if (System.currentTimeMillis() > toastUntilMs) {
      toastText = null;
      return null;
    }
    return toastText;
  }

  public static String formatSessionDuration() {
    long totalSec = Math.max(0L, (System.currentTimeMillis() - SESSION_START_MS) / 1000L);
    long h = totalSec / 3600L;
    long m = (totalSec % 3600L) / 60L;
    long s = totalSec % 60L;
    if (h > 0) {
      return String.format("%d:%02d:%02d", h, m, s);
    }
    return String.format("%02d:%02d", m, s);
  }
}
