package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented tests for TrueCost app.
 * These tests run on an Android device and verify core app functionality.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    private Context appContext;

    @Before
    public void setUp() {
        appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Test
    public void appContext_hasCorrectPackageName() {
        assertEquals("com.truecost.app", appContext.getPackageName());
    }

    @Test
    public void appContext_isNotNull() {
        assertNotNull("App context should not be null", appContext);
    }

    @Test
    public void app_hasValidPackageInfo() throws PackageManager.NameNotFoundException {
        PackageManager pm = appContext.getPackageManager();
        PackageInfo packageInfo = pm.getPackageInfo(appContext.getPackageName(), 0);

        assertNotNull("Package info should exist", packageInfo);
        assertNotNull("Version name should be set", packageInfo.versionName);
        assertTrue("Version code should be positive", packageInfo.versionCode > 0);
    }

    @Test
    public void app_hasRequiredPermissions() throws PackageManager.NameNotFoundException {
        PackageManager pm = appContext.getPackageManager();
        PackageInfo packageInfo = pm.getPackageInfo(
            appContext.getPackageName(),
            PackageManager.GET_PERMISSIONS
        );

        assertNotNull("Package should have permissions declared", packageInfo.requestedPermissions);
    }
}
