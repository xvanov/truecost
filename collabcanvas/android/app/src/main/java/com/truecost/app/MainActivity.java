package com.truecost.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.truecost.plugins.arcore.ARCoreRoomScannerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register plugins BEFORE calling super.onCreate()
        // This ensures plugins are ready when the bridge initializes
        registerPlugin(ARCoreRoomScannerPlugin.class);

        super.onCreate(savedInstanceState);
    }
}
