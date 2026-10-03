package co.symbiot.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Settings → "Start Symbiot in the background when the phone starts" leaves a
// flag file (desktop.mjs); with it, start the service at boot.
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (new Bootstrap(ctx).bootFlag().exists()) SymbiotService.start(ctx);
    }
}
