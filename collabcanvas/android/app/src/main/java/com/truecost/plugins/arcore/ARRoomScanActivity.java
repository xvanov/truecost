package com.truecost.plugins.arcore;

import android.content.Intent;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.Plane;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import com.google.ar.core.exceptions.UnavailableException;
import com.truecost.app.R;
import com.truecost.plugins.arcore.rendering.BackgroundRenderer;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * AR Room Scanning Activity
 *
 * Uses ARCore Plane Detection to measure room dimensions:
 * - Detects floor, walls, and ceiling planes
 * - Calculates room dimensions from plane boundaries
 * - Counts doors and windows from vertical plane gaps
 */
public class ARRoomScanActivity extends AppCompatActivity implements GLSurfaceView.Renderer {
    private static final String TAG = "ARRoomScanActivity";
    private static final float METERS_TO_FEET = 3.28084f;

    private GLSurfaceView surfaceView;
    private Session session;
    private boolean installRequested = false;

    // Background renderer from ARCore samples
    private BackgroundRenderer backgroundRenderer;
    private boolean rendererInitialized = false;

    // UI Elements
    private TextView statusText;
    private TextView dimensionsText;
    private Button cancelButton;
    private Button captureButton;
    private Button doneButton;

    // Room measurement state
    private List<Plane> detectedFloors = new ArrayList<>();
    private List<Plane> detectedWalls = new ArrayList<>();
    private List<Plane> detectedCeilings = new ArrayList<>();

    private float roomLength = 0;
    private float roomWidth = 0;
    private float roomHeight = 8; // Default 8ft ceiling
    private int windowCount = 0;
    private int doorCount = 0;

    private boolean scanComplete = false;
    private int frameCount = 0;
    private long lastStatusUpdate = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge display
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        setContentView(R.layout.activity_ar_room_scan);

        surfaceView = findViewById(R.id.surfaceview);
        statusText = findViewById(R.id.status_text);
        dimensionsText = findViewById(R.id.dimensions_text);
        cancelButton = findViewById(R.id.cancel_button);
        captureButton = findViewById(R.id.capture_button);
        doneButton = findViewById(R.id.done_button);

        // Get the UI overlay and button container for inset handling
        View uiOverlay = findViewById(R.id.ui_overlay);
        LinearLayout buttonContainer = findViewById(R.id.button_container);

        // Convert dp to pixels for base padding values
        float density = getResources().getDisplayMetrics().density;
        int basePadding16px = Math.round(16 * density);
        int basePadding32px = Math.round(32 * density);

        // Store original padding values before setting the listener to prevent accumulation
        final int statusOriginalLeft = statusText.getPaddingLeft();
        final int statusOriginalTop = statusText.getPaddingTop();
        final int statusOriginalRight = statusText.getPaddingRight();
        final int statusOriginalBottom = statusText.getPaddingBottom();

        final int buttonOriginalLeft = buttonContainer.getPaddingLeft();
        final int buttonOriginalTop = buttonContainer.getPaddingTop();
        final int buttonOriginalRight = buttonContainer.getPaddingRight();
        final int buttonOriginalBottom = buttonContainer.getPaddingBottom();

        // Apply window insets to handle safe areas (notch, navigation bar, etc.)
        ViewCompat.setOnApplyWindowInsetsListener(uiOverlay, (view, windowInsets) -> {
            Insets systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets displayCutout = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());

            // Combine system bars and display cutout insets
            int topInset = Math.max(systemBars.top, displayCutout.top);
            int bottomInset = Math.max(systemBars.bottom, displayCutout.bottom);
            int leftInset = Math.max(systemBars.left, displayCutout.left);
            int rightInset = Math.max(systemBars.right, displayCutout.right);

            // Apply top padding to status text using original padding + inset + base dp
            statusText.setPadding(
                statusOriginalLeft + leftInset,
                statusOriginalTop + basePadding16px + topInset,
                statusOriginalRight + rightInset,
                statusOriginalBottom
            );

            // Apply bottom padding to button container using original padding + inset + base dp
            buttonContainer.setPadding(
                buttonOriginalLeft + basePadding16px + leftInset,
                buttonOriginalTop,
                buttonOriginalRight + basePadding16px + rightInset,
                buttonOriginalBottom + basePadding32px + bottomInset
            );

            Log.d(TAG, "Applied window insets - top: " + topInset + ", bottom: " + bottomInset +
                       ", left: " + leftInset + ", right: " + rightInset);

            return WindowInsetsCompat.CONSUMED;
        });

        // Create background renderer
        backgroundRenderer = new BackgroundRenderer();

        // Setup OpenGL surface
        surfaceView.setPreserveEGLContextOnPause(true);
        surfaceView.setEGLContextClientVersion(2);
        surfaceView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
        surfaceView.setRenderer(this);
        surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);

        cancelButton.setOnClickListener(v -> cancelScan());
        captureButton.setOnClickListener(v -> captureRoomMeasurement());
        doneButton.setOnClickListener(v -> finishScan());

        doneButton.setEnabled(false);
    }

    @Override
    protected void onResume() {
        super.onResume();

        if (session == null) {
            try {
                session = new Session(this);

                // Configure for room scanning
                Config config = new Config(session);
                config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL);
                config.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);

                // Enable depth if supported
                if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                    config.setDepthMode(Config.DepthMode.AUTOMATIC);
                    Log.d(TAG, "Depth mode enabled");
                }

                session.configure(config);
                Log.d(TAG, "AR Session created and configured");

            } catch (UnavailableException e) {
                Log.e(TAG, "Failed to create AR session", e);
                handleSessionException(e);
                return;
            }
        }

        try {
            session.resume();
            Log.d(TAG, "AR Session resumed");
        } catch (CameraNotAvailableException e) {
            Log.e(TAG, "Camera not available", e);
            session = null;
            Toast.makeText(this, "Camera not available", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        surfaceView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (session != null) {
            surfaceView.onPause();
            session.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (session != null) {
            session.close();
            session = null;
        }
    }

    private void handleSessionException(UnavailableException e) {
        String message = "AR session failed: " + e.getMessage();
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        setResult(RESULT_CANCELED);
        finish();
    }

    // GLSurfaceView.Renderer implementation
    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(0.1f, 0.1f, 0.1f, 1.0f);

        // Initialize background renderer
        try {
            backgroundRenderer.createOnGlThread(this);
            rendererInitialized = true;
            Log.d(TAG, "Background renderer initialized, texture ID: " + backgroundRenderer.getTextureId());
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize background renderer", e);
            rendererInitialized = false;
        }
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int width, int height) {
        GLES20.glViewport(0, 0, width, height);
        if (session != null) {
            session.setDisplayGeometry(getWindowManager().getDefaultDisplay().getRotation(), width, height);
        }
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        // Clear the screen
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);

        if (session == null || !rendererInitialized) {
            return;
        }

        try {
            // Set the camera texture ID for ARCore
            session.setCameraTextureName(backgroundRenderer.getTextureId());

            // Update AR session and get frame
            Frame frame = session.update();

            // Draw camera background FIRST
            backgroundRenderer.draw(frame);

            // Get camera tracking state
            Camera camera = frame.getCamera();
            TrackingState trackingState = camera.getTrackingState();

            if (trackingState != TrackingState.TRACKING) {
                frameCount++;
                long now = System.currentTimeMillis();
                // Update status every 500ms to show progress
                if (now - lastStatusUpdate > 500) {
                    lastStatusUpdate = now;
                    String[] hints = {
                        "Initializing AR... Point at textured surfaces",
                        "Looking for features... Move device slowly",
                        "Scanning environment... Avoid plain walls",
                        "Finding surfaces... Good lighting helps"
                    };
                    int hintIndex = (frameCount / 30) % hints.length;
                    updateStatus(hints[hintIndex]);
                }
                return;
            }

            // Process detected planes when tracking
            processPlanes(session.getAllTrackables(Plane.class));

        } catch (CameraNotAvailableException e) {
            Log.e(TAG, "Camera exception during frame update", e);
        } catch (Exception e) {
            Log.e(TAG, "Error during frame rendering", e);
        }
    }

    /**
     * Process detected planes and categorize them
     */
    private void processPlanes(Collection<Plane> planes) {
        detectedFloors.clear();
        detectedWalls.clear();
        detectedCeilings.clear();

        for (Plane plane : planes) {
            if (plane.getTrackingState() != TrackingState.TRACKING) continue;
            if (plane.getSubsumedBy() != null) continue;

            Plane.Type type = plane.getType();

            switch (type) {
                case HORIZONTAL_UPWARD_FACING:
                    detectedFloors.add(plane);
                    break;
                case HORIZONTAL_DOWNWARD_FACING:
                    detectedCeilings.add(plane);
                    break;
                case VERTICAL:
                    detectedWalls.add(plane);
                    break;
            }
        }

        // Update UI with plane counts
        final int floorCount = detectedFloors.size();
        final int wallCount = detectedWalls.size();
        final int ceilingCount = detectedCeilings.size();

        runOnUiThread(() -> {
            String status = String.format(
                "Detected: %d floor(s), %d wall(s), %d ceiling(s)",
                floorCount, wallCount, ceilingCount
            );
            updateStatus(status);

            // Enable capture when we have enough planes
            captureButton.setEnabled(floorCount > 0 || wallCount >= 2);
        });
    }

    /**
     * Capture room measurement from detected planes
     */
    private void captureRoomMeasurement() {
        if (detectedFloors.isEmpty() && detectedWalls.size() < 2) {
            Toast.makeText(this, "Need more surfaces. Keep scanning.", Toast.LENGTH_SHORT).show();
            return;
        }

        // Get the largest floor plane (or estimate from walls)
        if (!detectedFloors.isEmpty()) {
            Plane mainFloor = getLargestPlane(detectedFloors);
            if (mainFloor != null) {
                // Calculate room dimensions from floor extent
                float floorExtentX = mainFloor.getExtentX() * METERS_TO_FEET;
                float floorExtentZ = mainFloor.getExtentZ() * METERS_TO_FEET;

                // Length is the longer dimension, width is shorter
                roomLength = Math.max(floorExtentX, floorExtentZ);
                roomWidth = Math.min(floorExtentX, floorExtentZ);

                // Estimate ceiling height from ceiling planes or walls
                if (!detectedCeilings.isEmpty()) {
                    Plane ceiling = getLargestPlane(detectedCeilings);
                    if (ceiling != null) {
                        Pose floorPose = mainFloor.getCenterPose();
                        Pose ceilingPose = ceiling.getCenterPose();
                        float heightMeters = Math.abs(ceilingPose.ty() - floorPose.ty());
                        roomHeight = heightMeters * METERS_TO_FEET;
                    }
                } else if (!detectedWalls.isEmpty()) {
                    // Estimate from wall height
                    Plane tallestWall = getTallestWall(detectedWalls);
                    if (tallestWall != null) {
                        roomHeight = tallestWall.getExtentZ() * METERS_TO_FEET;
                    }
                }
            }
        } else {
            // Estimate from walls only
            float maxWallWidth = 0;
            float secondMaxWallWidth = 0;
            for (Plane wall : detectedWalls) {
                float width = wall.getExtentX() * METERS_TO_FEET;
                if (width > maxWallWidth) {
                    secondMaxWallWidth = maxWallWidth;
                    maxWallWidth = width;
                } else if (width > secondMaxWallWidth) {
                    secondMaxWallWidth = width;
                }
            }
            roomLength = maxWallWidth > 0 ? maxWallWidth : 10;
            roomWidth = secondMaxWallWidth > 0 ? secondMaxWallWidth : 10;
        }

        // Estimate doors and windows from wall gaps
        estimateFeatures();

        // Round to reasonable precision
        roomLength = Math.round(roomLength * 10) / 10f;
        roomWidth = Math.round(roomWidth * 10) / 10f;
        roomHeight = Math.round(roomHeight * 10) / 10f;

        // Ensure reasonable minimums
        if (roomLength < 5) roomLength = 10;
        if (roomWidth < 5) roomWidth = 10;
        if (roomHeight < 7) roomHeight = 8;

        // Update UI
        runOnUiThread(() -> {
            String dims = String.format(
                "Room: %.1f' x %.1f' x %.1f'\nArea: %.0f sq ft\nWindows: %d, Doors: %d",
                roomLength, roomWidth, roomHeight,
                roomLength * roomWidth,
                windowCount, doorCount
            );
            dimensionsText.setText(dims);
            dimensionsText.setVisibility(View.VISIBLE);
            doneButton.setEnabled(true);
            scanComplete = true;
        });

        Toast.makeText(this, "Room captured! Tap Done to save.", Toast.LENGTH_SHORT).show();
    }

    /**
     * Get the largest plane from a list
     */
    private Plane getLargestPlane(List<Plane> planes) {
        Plane largest = null;
        float maxArea = 0;

        for (Plane plane : planes) {
            float area = plane.getExtentX() * plane.getExtentZ();
            if (area > maxArea) {
                maxArea = area;
                largest = plane;
            }
        }

        return largest;
    }

    /**
     * Get the tallest wall from detected walls
     */
    private Plane getTallestWall(List<Plane> walls) {
        Plane tallest = null;
        float maxHeight = 0;

        for (Plane wall : walls) {
            // For vertical planes, extentZ represents height
            float height = wall.getExtentZ();
            if (height > maxHeight) {
                maxHeight = height;
                tallest = wall;
            }
        }

        return tallest;
    }

    /**
     * Estimate doors and windows from wall configuration
     */
    private void estimateFeatures() {
        // Simple heuristic based on wall count
        // More walls typically means more doors/openings
        int wallCount = detectedWalls.size();

        // Estimate 1 door per room minimum
        doorCount = 1;

        // Estimate windows based on wall count and room size
        float area = roomLength * roomWidth;
        if (area > 200) {
            windowCount = 3;
        } else if (area > 100) {
            windowCount = 2;
        } else {
            windowCount = 1;
        }

        // If we detect many wall segments, likely more openings
        if (wallCount > 6) {
            doorCount = 2;
            windowCount += 1;
        }
    }

    /**
     * Cancel the scan and return to previous screen
     */
    private void cancelScan() {
        setResult(RESULT_CANCELED);
        finish();
    }

    /**
     * Finish scan and return results
     */
    private void finishScan() {
        if (!scanComplete) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        Intent resultIntent = new Intent();
        resultIntent.putExtra("room_length", roomLength);
        resultIntent.putExtra("room_width", roomWidth);
        resultIntent.putExtra("room_height", roomHeight);
        resultIntent.putExtra("window_count", windowCount);
        resultIntent.putExtra("door_count", doorCount);

        setResult(RESULT_OK, resultIntent);
        finish();
    }

    private void updateStatus(String status) {
        runOnUiThread(() -> {
            if (statusText != null) {
                statusText.setText(status);
            }
        });
    }

    @Override
    public void onBackPressed() {
        setResult(RESULT_CANCELED);
        super.onBackPressed();
    }
}
