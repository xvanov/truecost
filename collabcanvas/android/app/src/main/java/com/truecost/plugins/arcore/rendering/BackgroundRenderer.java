/*
 * Copyright 2017 Google LLC
 * Licensed under the Apache License, Version 2.0
 *
 * Adapted from ARCore SDK samples for TrueCost app
 */
package com.truecost.plugins.arcore.rendering;

import android.content.Context;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;

import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * Renders the camera background using OpenGL.
 * Based on Google ARCore SDK samples.
 */
public class BackgroundRenderer {
    private static final String TAG = "BackgroundRenderer";

    // Vertex shader for camera background
    private static final String VERTEX_SHADER =
        "attribute vec4 a_Position;\n" +
        "attribute vec2 a_TexCoord;\n" +
        "varying vec2 v_TexCoord;\n" +
        "void main() {\n" +
        "   gl_Position = a_Position;\n" +
        "   v_TexCoord = a_TexCoord;\n" +
        "}";

    // Fragment shader for external OES texture (camera)
    private static final String FRAGMENT_SHADER =
        "#extension GL_OES_EGL_image_external : require\n" +
        "precision mediump float;\n" +
        "varying vec2 v_TexCoord;\n" +
        "uniform samplerExternalOES sTexture;\n" +
        "void main() {\n" +
        "    gl_FragColor = texture2D(sTexture, v_TexCoord);\n" +
        "}";

    private static final int COORDS_PER_VERTEX = 2;
    private static final int TEXCOORDS_PER_VERTEX = 2;
    private static final int FLOAT_SIZE = 4;

    private FloatBuffer quadCoords;
    private FloatBuffer quadTexCoords;

    private int quadProgram;
    private int quadPositionParam;
    private int quadTexCoordParam;
    private int textureId = -1;

    // Full-screen quad coordinates
    private static final float[] QUAD_COORDS = new float[] {
        -1.0f, -1.0f,
        +1.0f, -1.0f,
        -1.0f, +1.0f,
        +1.0f, +1.0f,
    };

    public BackgroundRenderer() {}

    /**
     * Get the texture ID for ARCore to render the camera feed into
     */
    public int getTextureId() {
        return textureId;
    }

    /**
     * Create OpenGL resources for rendering
     */
    public void createOnGlThread(Context context) {
        // Generate external texture
        int[] textures = new int[1];
        GLES20.glGenTextures(1, textures, 0);
        textureId = textures[0];

        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);

        // Create vertex buffer
        int numVertices = 4;
        ByteBuffer bbCoords = ByteBuffer.allocateDirect(QUAD_COORDS.length * FLOAT_SIZE);
        bbCoords.order(ByteOrder.nativeOrder());
        quadCoords = bbCoords.asFloatBuffer();
        quadCoords.put(QUAD_COORDS);
        quadCoords.position(0);

        // Create texture coordinate buffer
        ByteBuffer bbTexCoords = ByteBuffer.allocateDirect(numVertices * TEXCOORDS_PER_VERTEX * FLOAT_SIZE);
        bbTexCoords.order(ByteOrder.nativeOrder());
        quadTexCoords = bbTexCoords.asFloatBuffer();

        // Compile and link shaders
        int vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER);
        int fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER);

        quadProgram = GLES20.glCreateProgram();
        GLES20.glAttachShader(quadProgram, vertexShader);
        GLES20.glAttachShader(quadProgram, fragmentShader);
        GLES20.glLinkProgram(quadProgram);

        // Check program link status
        int[] linkStatus = new int[1];
        GLES20.glGetProgramiv(quadProgram, GLES20.GL_LINK_STATUS, linkStatus, 0);
        if (linkStatus[0] == 0) {
            String infoLog = GLES20.glGetProgramInfoLog(quadProgram);
            GLES20.glDeleteProgram(quadProgram);
            quadProgram = 0;
            throw new RuntimeException("Program linking failed: " + infoLog);
        }

        GLES20.glUseProgram(quadProgram);

        quadPositionParam = GLES20.glGetAttribLocation(quadProgram, "a_Position");
        quadTexCoordParam = GLES20.glGetAttribLocation(quadProgram, "a_TexCoord");

        checkGlError("Background renderer setup");
    }

    /**
     * Draw the camera background
     */
    public void draw(Frame frame) {
        if (frame.hasDisplayGeometryChanged()) {
            frame.transformCoordinates2d(
                Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
                quadCoords,
                Coordinates2d.TEXTURE_NORMALIZED,
                quadTexCoords);
        }

        if (frame.getTimestamp() == 0) {
            // Frame not ready yet
            return;
        }

        // Save GL state
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(false);

        GLES20.glUseProgram(quadProgram);

        // Bind texture
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);

        // Set vertex attributes
        GLES20.glVertexAttribPointer(
            quadPositionParam, COORDS_PER_VERTEX, GLES20.GL_FLOAT, false, 0, quadCoords);
        GLES20.glVertexAttribPointer(
            quadTexCoordParam, TEXCOORDS_PER_VERTEX, GLES20.GL_FLOAT, false, 0, quadTexCoords);

        GLES20.glEnableVertexAttribArray(quadPositionParam);
        GLES20.glEnableVertexAttribArray(quadTexCoordParam);

        // Draw quad
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);

        // Restore GL state
        GLES20.glDisableVertexAttribArray(quadPositionParam);
        GLES20.glDisableVertexAttribArray(quadTexCoordParam);

        GLES20.glDepthMask(true);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);

        checkGlError("BackgroundRenderer.draw");
    }

    private static int loadShader(int type, String shaderCode) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, shaderCode);
        GLES20.glCompileShader(shader);

        // Check compile status
        int[] compiled = new int[1];
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0);
        if (compiled[0] == 0) {
            String log = GLES20.glGetShaderInfoLog(shader);
            GLES20.glDeleteShader(shader);
            throw new RuntimeException("Shader compilation failed: " + log);
        }

        return shader;
    }

    private static void checkGlError(String label) {
        int error = GLES20.glGetError();
        if (error != GLES20.GL_NO_ERROR) {
            throw new RuntimeException(label + ": glError " + error);
        }
    }
}
