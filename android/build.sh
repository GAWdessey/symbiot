#!/usr/bin/env bash
# Builds the Symbiot Android app: android/build/symbiot-<version>-<arch>.apk
#
#   android/build.sh [aarch64|x86_64|arm|i686]    (default aarch64: nearly every phone)
#
# It carries Node, git and gh from Termux's package repo (android/runtime.mjs)
# and this checkout of Symbiot. FRESH=1 re-fetches the runtime; otherwise only
# Symbiot is repacked once android/build/<arch>/runtime.zip exists. DEBUG=1 builds
# a debuggable APK, so `adb shell run-as co.symbiot.app` works (for testing).
#
# Needs Node and npm, the Android SDK (ANDROID_HOME, default ~/Android/Sdk, with a
# platform and build-tools) and a JDK 17+. With no javac on PATH, the Java steps
# run in Docker (eclipse-temurin:17-jdk) instead.
#
# Signing: android/build signs with ~/.android/symbiot.jks (made on first build;
# SYMBIOT_KEYSTORE / SYMBIOT_KEYSTORE_PASS to use another). Keep that file: an
# update has to be signed with the same key, or Android makes you uninstall first.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$HERE")"
ARCH="${1:-aarch64}"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
OUT="$HERE/build/$ARCH"
KS="${SYMBIOT_KEYSTORE:-$HOME/.android/symbiot.jks}"
KS_PASS="${SYMBIOT_KEYSTORE_PASS:-symbiot}"

inner() {
  # the newest platform, and the newest build-tools that has d8 + apksigner
  PLATFORM="$(ls -d "$SDK"/platforms/android-* | sort -V | tail -1)"
  BT="$(for d in $(ls -d "$SDK"/build-tools/* | sort -V); do [ -x "$d/d8" ] && [ -x "$d/apksigner" ] && echo "$d"; done | tail -1)"
  [ -n "$BT" ] || { echo "no build-tools with d8 and apksigner in $SDK" >&2; exit 1; }
  W="$OUT/apk"; rm -rf "$W"; mkdir -p "$W/gen" "$W/classes" "$W/assets"
  cp "$OUT/runtime.zip" "$OUT/symbiot.zip" "$OUT/symbiot.version" "$W/assets/"

  "$BT/aapt2" compile --dir "$HERE/res" -o "$W/res.zip"
  # -0: the zips are already compressed, so store them as they are
  "$BT/aapt2" link -o "$W/base.apk" -I "$PLATFORM/android.jar" --manifest "$HERE/AndroidManifest.xml" \
    --min-sdk-version 26 --target-sdk-version 28 --version-code "$VCODE" --version-name "$VNAME" \
    -A "$W/assets" -0 zip -0 version --java "$W/gen" ${DEBUG:+--debug-mode} "$W/res.zip"
  javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$PLATFORM/android.jar:$BT/core-lambda-stubs.jar" -d "$W/classes" \
    $(find "$HERE/src" "$W/gen" -name '*.java')
  "$BT/d8" --release --min-api 26 --lib "$PLATFORM/android.jar" --output "$W" $(find "$W/classes" -name '*.class')
  (cd "$W" && cp base.apk unsigned.apk && "$BT/aapt" add -v unsigned.apk classes.dex >/dev/null)
  "$BT/zipalign" -p -f 4 "$W/unsigned.apk" "$W/aligned.apk"

  if [ ! -f "$KS" ]; then
    mkdir -p "$(dirname "$KS")"
    keytool -genkeypair -keystore "$KS" -alias symbiot -keyalg RSA -keysize 4096 -validity 36500 \
      -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Symbiot" >/dev/null
    echo "made a signing key: $KS (keep it; updates need the same key)"
  fi
  APK="$HERE/build/symbiot-$VNAME-$ARCH.apk"
  "$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --ks-key-alias symbiot --out "$APK" "$W/aligned.apk"
  "$BT/apksigner" verify "$APK"
  rm -f "$APK.idsig"; rm -rf "$W"
  echo "$APK ($(du -h "$APK" | cut -f1))"
}

if [ "${SYMBIOT_APK_INNER:-}" = 1 ]; then inner; exit; fi

# 1. what the app carries
# (the runtime is refetched when runtime.mjs or node-shell.cjs is newer than it:
# a stale one starts nowhere, since Node preloads node-shell.cjs)
if [ -f "$OUT/runtime.zip" ] && [ -z "${FRESH:-}" ] \
  && [ "$OUT/runtime.zip" -nt "$HERE/runtime.mjs" ] && [ "$OUT/runtime.zip" -nt "$HERE/node-shell.cjs" ]; then
  node "$HERE/runtime.mjs" --arch "$ARCH" --symbiot-only
else node "$HERE/runtime.mjs" --arch "$ARCH"; fi

# 2. the APK. versionCode from the version: 0.39.1 -> 39001, so each release is higher.
VNAME="$(node -p "require('$REPO/package.json').version")"
VCODE="$(node -p "const [a,b,c]='$VNAME'.split(/[.-]/).map(Number); a*1000000+b*1000+c")"
export VNAME VCODE ANDROID_HOME="$SDK" SYMBIOT_KEYSTORE="$KS" SYMBIOT_KEYSTORE_PASS="$KS_PASS" SYMBIOT_APK_INNER=1
if command -v javac >/dev/null; then inner
else
  mkdir -p "$(dirname "$KS")"
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -e VNAME -e VCODE -e DEBUG -e ANDROID_HOME -e SYMBIOT_KEYSTORE -e SYMBIOT_KEYSTORE_PASS -e SYMBIOT_APK_INNER \
    -v "$SDK:$SDK:ro" -v "$REPO:$REPO" -v "$(dirname "$KS"):$(dirname "$KS")" \
    eclipse-temurin:17-jdk bash "$HERE/build.sh" "$ARCH"
fi
