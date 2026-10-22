package com.lunarjjo.mooncheck;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * mooncheck — aktivitas utama.
 *
 * Arsitektur: WebView memuat aplikasi dari server loopback (127.0.0.1)
 * milik LocalServer. Skema http://127.0.0.1 adalah secure context di
 * WebView, sehingga crypto.subtle dan getUserMedia tersedia; jalur
 * token acak melindungi dari aplikasi lain di perangkat yang sama.
 */
public class MainActivity extends Activity {

    public static final int REQ_PERM = 4711;
    public static final int REQ_FILE = 4712;

    private WebView web;
    private LocalServer server;
    private Bridge bridge;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        server = new LocalServer(getAssets());
        server.start();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        web.setBackgroundColor(0xFF0E1017);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        bridge = new Bridge(this);
        web.addJavascriptInterface(bridge, "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // hanya loopback kami sendiri; tautan eksternal → browser
                if (url != null && url.startsWith(server.baseHttpUrl())) return false;
                if (url != null && url.startsWith("about:")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // izinkan kamera untuk origin loopback kami
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            for (String r : request.getResources()) {
                                if (!PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                                    request.deny();
                                    return;
                                }
                            }
                            if (hasCamera()) {
                                request.grant(request.getResources());
                            } else {
                                request.deny();
                            }
                        } catch (Exception ignored) {
                        }
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback cb) {
                cb.invoke(origin, hasLocation(), false);
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                    FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Pilih gambar"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        applyNativeTheme(isDarkMode());
        web.loadUrl(server.baseHttpUrl() + "/index.html");

        requestRuntimePermissions();
    }

    private void requestRuntimePermissions() {
        boolean cam = hasCamera();
        boolean loc = hasLocation();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && (!cam || !loc)) {
            String[] want = (!cam && !loc)
                    ? new String[]{android.Manifest.permission.CAMERA,
                            android.Manifest.permission.ACCESS_FINE_LOCATION}
                    : !cam ? new String[]{android.Manifest.permission.CAMERA}
                           : new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION};
            requestPermissions(want, REQ_PERM);
        }
    }

    boolean hasCamera() {
        return checkSelfPermission(android.Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    boolean hasLocation() {
        return checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == REQ_PERM) {
            if (!hasCamera()) {
                Toast.makeText(this, "Tanpa izin kamera: pemindai QR memakai mode pilih gambar.",
                        Toast.LENGTH_LONG).show();
            }
            if (!hasLocation()) {
                Toast.makeText(this, "Tanpa izin lokasi: absensi dicatat tanpa koordinat.",
                        Toast.LENGTH_LONG).show();
            }
            // sengaja TIDAK memaksa ulang halaman — aplikasi meredam sendiri
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] out = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                out = new Uri[]{data.getData()};
                // beri akses persisten agar ContentResolver terbaca nanti
                try {
                    getContentResolver().takePersistableUriPermission(data.getData(),
                            Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {
                }
            }
            fileCallback.onReceiveValue(out);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    public boolean isDarkMode() {
        int m = getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK;
        return m == Configuration.UI_MODE_NIGHT_YES;
    }

    /** dipanggil Bridge.applyNativeTheme */
    public void applyNativeTheme(boolean dark) {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            int bar = dark ? 0xFF0E1017 : 0xFFF4F5FA;
            w.setStatusBarColor(bar);
            w.setNavigationBarColor(dark ? 0xFF0B0D13 : 0xFFE9EBF3);
        }
        web.setBackgroundColor(dark ? 0xFF0E1017 : 0xFFF4F5FA);
    }

    @Override
    public void onConfigurationChanged(Configuration cfg) {
        super.onConfigurationChanged(cfg);
        // tema sistem berubah → kabari web (configChanges menangani uiMode)
        final boolean dark = (cfg.uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                applyNativeTheme(dark);
                if (web != null) {
                    web.evaluateJavascript(
                        "window.MC && MC._onNativeThemeChange && MC._onNativeThemeChange()", null);
                }
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (web != null) {
            web.removeJavascriptInterface("AndroidBridge");
            web.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
