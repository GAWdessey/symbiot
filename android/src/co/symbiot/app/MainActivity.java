package co.symbiot.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// Symbiot's own page, full screen. Until the service says where Symbiot is
// serving, it shows a small status page (with the log if starting fails).
public class MainActivity extends Activity {
    private static final int FILES = 1, STORAGE = 2;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView web;
    private String shown = "";       // the Symbiot URL loaded, or "" while the status page shows
    private String statusShown = "";
    private ValueCallback<Uri[]> pick;
    private boolean asked;
    private AlertDialog dialog;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.parseColor("#0E1A1F"));
        getWindow().setNavigationBarColor(Color.parseColor("#0E1A1F"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0E1A1F"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "SymbiotAndroid");
        web.setWebViewClient(new WebViewClient() {
            // Symbiot's page stays here; links out of it (a PR, the docs) open in the browser
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String host = r.getUrl().getHost();
                if ("127.0.0.1".equals(host) || "localhost".equals(host) || "about".equals(r.getUrl().getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (Exception ignored) {}
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // Screens' "Load image"
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pick != null) pick.onReceiveValue(null);
                pick = cb;
                try { startActivityForResult(p.createIntent(), FILES); } catch (Exception e) { pick = null; return false; }
                return true;
            }
        });
        setContentView(web);
        SymbiotService.channels(this);
        SymbiotService.start(this);
        tick();
    }

    @Override protected void onResume() {
        super.onResume();
        if (!hasStorage() && !asked) { asked = true; askStorage(); }
    }

    @Override protected void onDestroy() { if (dialog != null) dialog.dismiss(); ui.removeCallbacksAndMessages(null); web.destroy(); super.onDestroy(); }

    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else moveTaskToBack(true); }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == FILES && pick != null) { pick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); pick = null; }
    }

    // Follow the service: load Symbiot once it's serving, or show where it's at.
    private void tick() {
        String url = SymbiotService.url, state = SymbiotService.state;
        if (url != null) {
            if (!url.equals(shown)) { shown = url; statusShown = ""; web.loadUrl(url); }
        } else if (shown.isEmpty() || "stopped".equals(state) || "failed".equals(state)) {
            // (Symbiot's own page reconnects by itself across a restart, so it only
            // gives way to this once Symbiot has really stopped)
            String key = state + "\n" + SymbiotService.log();
            if (!key.equals(statusShown)) { statusShown = key; shown = ""; web.loadDataWithBaseURL("about:blank", status(state), "text/html", "utf-8", null); }
        }
        ui.postDelayed(this::tick, 500);
    }

    private String status(String state) {
        boolean down = "stopped".equals(state) || "failed".equals(state);
        String title = "failed".equals(state) ? "Symbiot couldn't start" : "stopped".equals(state) ? "Symbiot is stopped" : "Starting Symbiot&hellip;";
        String log = TextUtils.htmlEncode(SymbiotService.log());
        return "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<style>body{background:#0E1A1F;color:#B7C9C4;font:15px -apple-system,Roboto,sans-serif;margin:0;padding:28px 20px}"
            + "h1{color:#F4F1EA;font-size:20px;display:flex;align-items:center;gap:10px}.dot{width:10px;height:10px;border-radius:50%;background:#3DDC97;box-shadow:0 0 12px #3DDC97}"
            + "pre{white-space:pre-wrap;word-break:break-word;font-size:11.5px;color:#7E9690;background:#15262C;border:1px solid #24404A;border-radius:8px;padding:10px;max-height:60vh;overflow:auto}"
            + "button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:9px 16px;background:#3DDC97;color:#0E1A1F;margin:4px 8px 4px 0}"
            + "button.g{background:#1D333A;color:#F4F1EA}</style>"
            + "<h1><span class=dot></span>" + title + "</h1>"
            + (down ? "<button onclick='SymbiotAndroid.start()'>Start Symbiot</button>" : "")
            + (hasStorage() ? "" : "<p>Symbiot can't see your shared storage yet, so it can't find the repos there.</p><button class=g onclick='SymbiotAndroid.storage()'>Allow file access</button>")
            + (log.isEmpty() ? "" : "<pre>" + log + "</pre>");
    }

    // ---- shared storage (where your repos live) ---------------------------------
    private boolean hasStorage() {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }
    private void askStorage() {
        dialog = new AlertDialog.Builder(this)
            .setTitle("Let Symbiot read your repos")
            .setMessage("Symbiot looks for git repos in your phone's shared storage (for example the folders Termux's ~/storage/shared points at). Android calls this \"All files access\".")
            .setPositiveButton("Allow", (d, w) -> openStorageSettings())
            .setNegativeButton("Not now", null)
            .show();
    }
    private void openStorageSettings() {
        if (Build.VERSION.SDK_INT >= 30) {
            try { startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getPackageName()))); }
            catch (Exception e) { startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)); }
        } else requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE);
    }

    // window.SymbiotAndroid, for the status page's buttons
    private class Bridge {
        @JavascriptInterface public void start() { ui.post(() -> { statusShown = ""; SymbiotService.start(MainActivity.this); }); }
        @JavascriptInterface public void storage() { ui.post(MainActivity.this::openStorageSettings); }
    }
}
