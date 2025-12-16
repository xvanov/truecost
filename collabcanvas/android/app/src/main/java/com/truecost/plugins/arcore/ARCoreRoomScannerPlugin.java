package com.truecost.plugins.arcore;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.exceptions.UnavailableException;

/**
 * ARCore Room Scanner Plugin for Capacitor
 *
 * Provides room scanning capabilities using ARCore's Depth API and Plane Detection.
 * Uses ARCore SDK 1.47.0 for stable room measurement features.
 */
@CapacitorPlugin(
    name = "ARCoreRoomScanner",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        )
    }
)
public class ARCoreRoomScannerPlugin extends Plugin {
    private static final String TAG = "ARCoreRoomScanner";
    private static final int AR_SCANNER_REQUEST_CODE = 9001;

    private boolean isARCoreSupported = false;
    private boolean availabilityChecked = false;

    @Override
    public void load() {
        super.load();
        // Don't check ARCore availability here - it can crash during app init
        // The check will be performed lazily when checkAvailability() is called
        Log.d(TAG, "ARCoreRoomScannerPlugin loaded");
    }

    /**
     * Check if ARCore is available on this device (lazy initialization)
     * This is called only when the user explicitly checks availability
     */
    private void checkARCoreAvailabilityAsync(final AvailabilityCallback callback) {
        // Use a background thread to avoid blocking UI
        new Thread(() -> {
            try {
                ArCoreApk.Availability availability = ArCoreApk.getInstance().checkAvailability(getContext());

                // If transient, wait and retry (max 3 times)
                int retryCount = 0;
                while (availability.isTransient() && retryCount < 3) {
                    try {
                        Thread.sleep(200);
                    } catch (InterruptedException e) {
                        Log.e(TAG, "Sleep interrupted", e);
                    }
                    availability = ArCoreApk.getInstance().checkAvailability(getContext());
                    retryCount++;
                }

                isARCoreSupported = availability.isSupported();
                availabilityChecked = true;
                Log.d(TAG, "ARCore supported: " + isARCoreSupported);

                // Callback on main thread
                final boolean supported = isARCoreSupported;
                getActivity().runOnUiThread(() -> callback.onResult(supported));

            } catch (Exception e) {
                Log.e(TAG, "Error checking ARCore availability", e);
                getActivity().runOnUiThread(() -> callback.onResult(false));
            }
        }).start();
    }

    /**
     * Callback interface for async availability check
     */
    private interface AvailabilityCallback {
        void onResult(boolean isSupported);
    }

    /**
     * Check if ARCore is available and device supports room scanning
     * Note: Depth support check is deferred until camera permission is granted
     * and an AR session is created during scanning.
     */
    @PluginMethod
    public void checkAvailability(PluginCall call) {
        // If already checked, return cached result
        if (availabilityChecked) {
            JSObject result = new JSObject();
            result.put("isSupported", isARCoreSupported);
            // Don't check depth support here - it requires camera permission
            // Depth will be checked/enabled during actual scanning
            result.put("hasDepthSupport", isARCoreSupported); // Assume true if ARCore supported

            if (!isARCoreSupported) {
                result.put("reason", "ARCore not supported on this device");
            }

            call.resolve(result);
            return;
        }

        // Perform async check
        checkARCoreAvailabilityAsync(isSupported -> {
            JSObject result = new JSObject();
            result.put("isSupported", isSupported);
            // Don't check depth support here - it requires camera permission
            result.put("hasDepthSupport", isSupported); // Assume true if ARCore supported

            if (!isSupported) {
                result.put("reason", "ARCore not supported on this device");
            }

            call.resolve(result);
        });
    }

    /**
     * Request camera permission for AR scanning
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
        }
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            JSObject result = new JSObject();
            result.put("granted", false);
            result.put("reason", "Camera permission denied");
            call.resolve(result);
        }
    }

    /**
     * Start the AR room scanning activity
     */
    @PluginMethod
    public void startScan(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Camera permission required");
            return;
        }

        // If not checked yet, check first then start scan
        if (!availabilityChecked) {
            checkARCoreAvailabilityAsync(isSupported -> {
                if (!isSupported) {
                    call.reject("ARCore not supported on this device");
                    return;
                }
                launchScanActivity(call);
            });
            return;
        }

        if (!isARCoreSupported) {
            call.reject("ARCore not supported on this device");
            return;
        }

        launchScanActivity(call);
    }

    /**
     * Launch the AR scanning activity
     */
    private void launchScanActivity(PluginCall call) {
        Intent intent = new Intent(getContext(), ARRoomScanActivity.class);
        startActivityForResult(call, intent, "handleScanResult");
    }

    /**
     * Handle the result from AR scanning activity
     * This method is called by Capacitor when the AR activity returns
     */
    @ActivityCallback
    private void handleScanResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) {
            Log.e(TAG, "handleScanResult: call is null");
            return;
        }

        int resultCode = activityResult.getResultCode();
        Intent data = activityResult.getData();

        Log.d(TAG, "handleScanResult: resultCode=" + resultCode + ", hasData=" + (data != null));

        if (resultCode == Activity.RESULT_OK && data != null) {
            JSObject result = new JSObject();

            // Extract room data from intent
            float length = data.getFloatExtra("room_length", 0);
            float width = data.getFloatExtra("room_width", 0);
            float height = data.getFloatExtra("room_height", 8); // Default 8ft
            int windowCount = data.getIntExtra("window_count", 0);
            int doorCount = data.getIntExtra("door_count", 0);

            Log.d(TAG, "Scan result - length: " + length + ", width: " + width +
                       ", height: " + height + ", windows: " + windowCount + ", doors: " + doorCount);

            JSObject dimensions = new JSObject();
            dimensions.put("length", length);
            dimensions.put("width", width);
            dimensions.put("height", height);
            dimensions.put("area", length * width);
            dimensions.put("volume", length * width * height);

            JSArray features = new JSArray();
            if (windowCount > 0) {
                JSObject windowFeature = new JSObject();
                windowFeature.put("type", "window");
                windowFeature.put("count", windowCount);
                features.put(windowFeature);
            }
            if (doorCount > 0) {
                JSObject doorFeature = new JSObject();
                doorFeature.put("type", "door");
                doorFeature.put("count", doorCount);
                features.put(doorFeature);
            }

            result.put("success", true);
            result.put("dimensions", dimensions);
            result.put("features", features);
            result.put("sourceApp", "arcore");

            call.resolve(result);
        } else if (resultCode == Activity.RESULT_CANCELED) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("reason", "Scan cancelled by user");
            call.resolve(result);
        } else {
            call.reject("Scan failed");
        }
    }

    /**
     * Install or update ARCore if needed
     */
    @PluginMethod
    public void installARCore(PluginCall call) {
        try {
            ArCoreApk.InstallStatus installStatus = ArCoreApk.getInstance()
                .requestInstall(getActivity(), true);

            JSObject result = new JSObject();
            result.put("status", installStatus.name());
            result.put("installed", installStatus == ArCoreApk.InstallStatus.INSTALLED);
            call.resolve(result);
        } catch (UnavailableException e) {
            call.reject("Failed to install ARCore: " + e.getMessage());
        }
    }
}
