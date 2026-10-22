package com.lunarjjo.mooncheck;

import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.net.Uri;
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * mooncheck — jembatan JavaScript ⇄ native.
 *
 * Diekspos ke WebView sebagai window.AndroidBridge.
 * Semua metode berjalan di thread binder — jangan sentuh UI di sini;
 * gunakan activity.runOnUiThread bila perlu.
 */
public class Bridge {

    private final MainActivity activity;

    public Bridge(MainActivity activity) {
        this.activity = activity;
    }

    /** JSON {lat,lng,acc,provider} atau {err:"..."} — fix terbaik terakhir. */
    @JavascriptInterface
    public String getLocation() {
        try {
            LocationManager lm = (LocationManager)
                    activity.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return err("layanan lokasi tidak tersedia");
            if (!activity.hasLocation()) return err("izin lokasi belum diberikan");

            Location best = null;
            String[] providers = {
                    LocationManager.GPS_PROVIDER,
                    LocationManager.NETWORK_PROVIDER,
                    LocationManager.PASSIVE_PROVIDER
            };
            for (String p : providers) {
                try {
                    Location l = lm.getLastKnownLocation(p);
                    if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
                } catch (SecurityException | IllegalArgumentException ignored) {
                }
            }
            if (best == null) {
                // minta satu pembaruan segar (asinkron; fix berikutnya akan tersedia)
                requestOneShot(lm);
                return err("lokasi belum tersedia — aktifkan GPS/lokasi lalu coba lagi");
            }
            // pembaruan latar bila terlalu tua
            if (System.currentTimeMillis() - best.getTime() > 60000) requestOneShot(lm);

            JSONObject o = new JSONObject();
            o.put("lat", best.getLatitude());
            o.put("lng", best.getLongitude());
            o.put("acc", best.hasAccuracy() ? (double) best.getAccuracy() : -1.0);
            o.put("provider", best.getProvider());
            o.put("age", System.currentTimeMillis() - best.getTime());
            return o.toString();
        } catch (Exception e) {
            return err("kesalahan lokasi: " + e.getMessage());
        }
    }

    private void requestOneShot(LocationManager lm) {
        try {
            LocationListener listener = new LocationListener() {
                @Override public void onLocationChanged(Location l) {
                    try {
                        lm.removeUpdates(this);
                    } catch (SecurityException ignored) {
                    }
                }
                @Override public void onStatusChanged(String p, int s, Bundle e) {
                }
                @Override public void onProviderEnabled(String p) {
                }
                @Override public void onProviderDisabled(String p) {
                }
            };
            Looper looper = Looper.myLooper();
            if (looper == null) Looper.prepare();
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, Looper.myLooper());
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.myLooper());
            }
        } catch (Exception ignored) {
        }
    }

    private String err(String msg) {
        try {
            return new JSONObject().put("err", msg).toString();
        } catch (Exception e) {
            return "{\"err\":\"kesalahan\"}";
        }
    }

    /** Apakah sistem sedang mode gelap? */
    @JavascriptInterface
    public boolean isDarkMode() {
        return activity.isDarkMode();
    }

    /** Samakan warna bilah status/nav dengan tema web. */
    @JavascriptInterface
    public void applyNativeTheme(final boolean dark) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activity.applyNativeTheme(dark);
            }
        });
    }

    /** Simpan berkas hasil ekspor (backup JSON / CSV) dan umumkan lokasinya. */
    @JavascriptInterface
    public boolean download(final String filename, final String content) {
        try {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            final String where;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, sanitize(filename));
                cv.put(MediaStore.Downloads.MIME_TYPE, mimeOf(filename));
                cv.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = activity.getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return false;
                OutputStream os = activity.getContentResolver().openOutputStream(uri);
                os.write(bytes);
                os.close();
                cv.clear();
                cv.put(MediaStore.Downloads.IS_PENDING, 0);
                activity.getContentResolver().update(uri, cv, null, null);
                where = "Downloads/" + sanitize(filename);
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, sanitize(filename));
                FileOutputStream fo = new FileOutputStream(f);
                fo.write(bytes);
                fo.close();
                where = f.getAbsolutePath();
            }
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(activity, "Tersimpan: " + where, Toast.LENGTH_LONG).show();
                }
            });
            return true;
        } catch (Exception e) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(activity, "Gagal menyimpan berkas: " + e.getMessage(),
                            Toast.LENGTH_LONG).show();
                }
            });
            return false;
        }
    }

    private static String sanitize(String name) {
        return name == null ? "mooncheck.bin" : name.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private static String mimeOf(String name) {
        if (name == null) return "application/octet-stream";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".csv")) return "text/csv";
        return "application/octet-stream";
    }

    /** Getar pendek konfirmasi (mis. QR berhasil). */
    @JavascriptInterface
    public void vibrate(int ms) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(Math.max(20, ms),
                        VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(Math.max(20, ms));
            }
        } catch (Exception ignored) {
        }
    }

    /** Info versi untuk layar tentang. */
    @JavascriptInterface
    public String appInfo() {
        try {
            JSONObject o = new JSONObject();
            o.put("version", activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0).versionName);
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            return o.toString();
        } catch (Exception e) {
            return "{\"version\":\"?\"}";
        }
    }
}
