#!/usr/bin/env bash
# ============================================================
# mooncheck — build APK tanpa Gradle (aapt2 + javac + d8 + apksigner)
# Aman dijalankan lokal (SDK di ~/android-sdk) maupun CI GitHub (SDK bawaan runner).
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
APP_WWW="$ROOT/app"
BUILD="$ROOT/build"
OUT="$ROOT/release"

# ---- lokasi SDK ----
if [ -n "${ANDROID_HOME:-}" ] && [ -d "${ANDROID_HOME:-}" ]; then
  SDK="${ANDROID_HOME}"
elif [ -d "/home/z/my-project/android-sdk" ]; then
  SDK="/home/z/my-project/android-sdk"
elif [ -d "/usr/local/lib/android/sdk" ]; then
  SDK="/usr/local/lib/android/sdk"
else
  echo "ERROR: Android SDK tidak ditemukan (set ANDROID_HOME)." >&2
  exit 1
fi
PLATFORM="$SDK/platforms/android-34/android.jar"
# d8 build-tools 34.0.0 menyertakan snapshot 8.2.2-dev yang berbug (NPE pada kelas anonim)
# → utamakan build-tools 35.0.0; jatuh ke versi lain bila hanya itu yang ada.
BT=""
for cand in "$SDK/build-tools/35.0.0" "$SDK/build-tools/34.0.0" "$SDK/build-tools/33.0.2"; do
  if [ -x "$cand/d8" ]; then BT="$cand"; break; fi
done
if [ -z "$BT" ]; then
  echo "ERROR: build-tools (d8) tidak ditemukan di $SDK/build-tools." >&2
  exit 1
fi
for f in "$PLATFORM" "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner"; do
  [ -e "$f" ] || { echo "ERROR: komponen SDK hilang: $f" >&2; exit 1; }
done

# ---- javac (JDK portabel bila javac sistem tak ada) ----
JAVAC="$(command -v javac || true)"
if [ -z "$JAVAC" ]; then
  if [ -x /home/z/my-project/android-tools/jdk/usr/lib/jvm/java-21-openjdk-amd64/bin/javac ]; then
    export LD_LIBRARY_PATH=/usr/lib/jvm/java-21-openjdk-amd64/lib
    JAVAC=/home/z/my-project/android-tools/jdk/usr/lib/jvm/java-21-openjdk-amd64/bin/javac
  else
    echo "ERROR: javac tidak tersedia." >&2; exit 1
  fi
fi
JAR_TOOL="$(dirname "$JAVAC")/jar"

# ---- parameter ----
VERSION_NAME="0.1.0"
VERSION_CODE="1"
KEYSTORE="$ROOT/android/mooncheck.keystore"
KS_ALIAS="mooncheck"
KS_PASS="${MOONCHECK_KS_PASS:-mooncheck-dev-key}"
APK_NAME="mooncheck-v${VERSION_NAME}.apk"

echo "==> SDK       : $SDK"
echo "==> javac     : $JAVAC"
rm -rf "$BUILD" "$OUT"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$OUT"

# ---- 1. kompilasi resource ----
echo "==> aapt2 compile"
"$BT/aapt2" compile --dir "$ANDROID_DIR/res" -o "$BUILD/res.zip"

# ---- 2. link: manifest + resource + assets ----
echo "==> aapt2 link"
"$BT/aapt2" link \
  -o "$BUILD/mooncheck-unsigned.apk" \
  -I "$PLATFORM" \
  --manifest "$ANDROID_DIR/AndroidManifest.xml" \
  -A "$APP_WWW" \
  --java "$BUILD/gen" \
  --auto-add-overlay \
  --min-sdk-version 21 \
  --target-sdk-version 34 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  "$BUILD/res.zip"

# ---- 3. kompilasi Java ----
echo "==> javac"
find "$ANDROID_DIR/java" -name '*.java' > "$BUILD/sources.txt"
echo "$BUILD/gen/com/lunarjjo/mooncheck/R.java" >> "$BUILD/sources.txt"
"$JAVAC" -source 8 -target 8 -Xlint:-options \
  -classpath "$PLATFORM" \
  -d "$BUILD/classes" \
  @"$BUILD/sources.txt"

# ---- 4. dex (d8, min API 21) ----
echo "==> d8 ($BT)"
find "$BUILD/classes" -name '*.class' > "$BUILD/classlist.txt"
"$BT/d8" --release \
  --lib "$PLATFORM" \
  --min-api 21 \
  --output "$BUILD/dex" \
  $(cat "$BUILD/classlist.txt")

# ---- 5. masukkan classes.dex ke APK ----
echo "==> sisipkan dex"
(cd "$BUILD/dex" && zip -q -j "$BUILD/mooncheck-unsigned.apk" classes.dex)

# ---- 6. zipalign ----
echo "==> zipalign"
"$BT/zipalign" -f -p 4 "$BUILD/mooncheck-unsigned.apk" "$BUILD/mooncheck-aligned.apk"

# ---- 7. keystore (buat sekali bila belum ada) ----
if [ ! -f "$KEYSTORE" ]; then
  echo "==> buat keystore dev baru"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" -storetype PKCS12 \
    -alias "$KS_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=mooncheck dev, OU=lunarjjo, O=lunarjjo, L=Jakarta, C=ID" >/dev/null 2>&1
fi

# ---- 8. sign ----
echo "==> apksigner sign"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" \
  --key-pass "pass:$KS_PASS" \
  --out "$OUT/$APK_NAME" \
  "$BUILD/mooncheck-aligned.apk"

# ---- 9. verifikasi ----
echo "==> apksigner verify"
"$BT/apksigner" verify --print-certs "$OUT/$APK_NAME" | head -4

echo ""
echo "APK SIAP: $OUT/$APK_NAME ($(du -h "$OUT/$APK_NAME" | cut -f1))"
