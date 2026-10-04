package com.rotazro.entregador;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Standard AOSP battery-optimization exemption (API 23+), identical on every
    // manufacturer -- not a vendor-specific hack. Without it, Doze/App Standby can
    // still defer network access for a backgrounded app even while our foreground
    // location service keeps running, which was part of BUG 3 (GPS appearing to
    // stop syncing after a while on a real device). The system dialog itself
    // explains the request to the user; asked once per app open, skipped
    // entirely once already granted.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestIgnoreBatteryOptimizations();
    }

    private void requestIgnoreBatteryOptimizations() {
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager == null || powerManager.isIgnoringBatteryOptimizations(getPackageName())) {
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
    }
}
