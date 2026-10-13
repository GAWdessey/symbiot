package co.symbiot.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
import android.webkit.WebBackForwardList;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.regex.Pattern;

// Symbiot's own page, full screen. Until the service says where Symbiot is
// serving, it shows a small status page (with the log if starting fails).
//
// Or the Symbiot running in Termux: Termux keeps its home folder private, so
// only a Symbiot running there sees the projects in it. `symbiot app` in Termux
// opens its link here as symbiot://127.0.0.1:<port>/?t=<token> (a scheme only this
// app takes, where Android gives an http link to the browser), and the app shows
// that Symbiot instead of its own (until "Use the app's own Symbiot").
public class MainActivity extends Activity {
    private static final int FILES = 1, STORAGE = 2;
    private static final Pattern LINK = Pattern.compile("^(?:http|symbiot)://(?:127\\.0\\.0\\.1|localhost):\\d+/\\?t=[0-9a-f]+$");
    // your computer's pairing link (its QR, scanned), for the page to pair with (phone.mjs)
    private static final Pattern PAIR = Pattern.compile("^(?:symbiot://pair/?\\?|https://(?:www\\.)?symbiot\\.co\\.za/pair/?[#?]).+");
    private volatile String pair;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView web;
    private String shown = "";       // the Symbiot URL loaded, or "" while the status page shows
    private String statusShown = "";
    private ValueCallback<Uri[]> pick;
    private boolean asked, hadStorage = true;
    private AlertDialog dialog;
    private volatile String external;      // the Termux Symbiot's link, or null for the app's own
    private volatile String externalState = "connecting"; // connecting | up | down
    private volatile long externalSeen;
    private volatile boolean destroyed;
    private boolean waitingForTermux;      // "Open Termux" tapped: its link may come back on the clipboard

    // the Termux Symbiot's link while the app shows that one (BootReceiver reads it too)
    static String termuxUrl(Context ctx) { return prefs(ctx).getString("termuxUrl", null); }
    private static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences("symbiot", MODE_PRIVATE); }

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
        external = termuxUrl(this);
        if (!take(getIntent()) && external == null) SymbiotService.start(this);
        new Thread(this::watchExternal, "symbiot-termux").start();
        tick();
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); take(i); }

    // A Symbiot link (symbiot:// or http://127.0.0.1:<port>/?t=<token>) opened with this app.
    // A pairing link isn't one: it's kept for the page (tick), and Symbiot starts as usual.
    private boolean take(Intent i) {
        Uri d = i != null && Intent.ACTION_VIEW.equals(i.getAction()) ? i.getData() : null;
        if (d == null) return false;
        if (PAIR.matcher(d.toString()).matches()) { approvePair(d); return false; }
        if (!LINK.matcher(d.toString()).matches()) { Toast.makeText(this, "That isn't a Symbiot link", Toast.LENGTH_SHORT).show(); return false; }
        useExternal(http(d.toString()));
        return true;
    }
    // A pairing link, from a camera scan or pushed over USB (adb), is only handed on once the
    // user taps Approve: "Link to <computer>?". Capped in size, like Orca's pairing input.
    private static final int PAIR_MAX = 2048;
    private void approvePair(final Uri d) {
        final String link = d.toString();
        if (link.length() > PAIR_MAX) { Toast.makeText(this, "That isn't a Symbiot link", Toast.LENGTH_SHORT).show(); return; }
        String n = null;
        try { n = d.getQueryParameter("n"); } catch (Exception e) { /* opaque link: no name */ }
        n = n == null ? "" : n.replaceAll("[^\\p{L}\\p{N} ._-]", "");
        if (n.length() > 40) n = n.substring(0, 40);
        final String name = n.isEmpty() ? "your computer" : n;
        new AlertDialog.Builder(this)
            .setTitle("Link to " + name + "?")
            .setMessage("Approve to pair this phone with Symbiot on " + name + ".")
            .setPositiveButton("Approve", (dlg, w) -> { pair = link; })
            .setNegativeButton("Cancel", null)
            .show();
    }
    private static String http(String link) { return link.replaceFirst("^symbiot://", "http://"); }

    // Show the Termux Symbiot, and stop the app's own, so the two don't both run
    // the weekly write-up or agents.
    private void useExternal(String url) {
        if (url.equals(SymbiotService.url)) return; // the app's own
        prefs(this).edit().putString("termuxUrl", url).apply();
        external = url; externalState = "connecting"; waitingForTermux = false;
        shown = ""; statusShown = "";
        SymbiotService.stop(this);
    }
    private void useBuiltIn() {
        prefs(this).edit().remove("termuxUrl").apply();
        external = null; shown = ""; statusShown = "";
        SymbiotService.start(this);
    }

    // Is the Termux Symbiot answering? Its port and token are stable, so after a
    // restart it's back at the same link, or at the default port if it was on
    // another one only because the app's own Symbiot held that.
    private void watchExternal() {
        while (!destroyed) {
            String u = external;
            if (u != null) {
                boolean ok = SymbiotService.alive(u);
                String alt = u.replaceFirst(":\\d+/", ":7391/");
                if (!ok && !alt.equals(u) && SymbiotService.alive(alt) && u.equals(external)) {
                    prefs(this).edit().putString("termuxUrl", alt).apply();
                    external = u = alt; ok = true;
                }
                if (u.equals(external)) {
                    long now = System.currentTimeMillis();
                    if (ok) { externalSeen = now; externalState = "up"; }
                    // (an "Update & restart" there is back within seconds)
                    else if (!"up".equals(externalState) || now - externalSeen > 12000) externalState = "down";
                }
            }
            try { Thread.sleep(2000); } catch (InterruptedException e) { return; }
        }
    }

    // "Open Termux": copy the command that starts Symbiot there, and open it.
    private void openTermux() {
        Intent i = getPackageManager().getLaunchIntentForPackage("com.termux");
        if (i == null) { Toast.makeText(this, "Termux isn't installed", Toast.LENGTH_LONG).show(); return; }
        getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("Start Symbiot in Termux", startInTermux()));
        Toast.makeText(this, "Copied the command: paste it in Termux. It opens Symbiot here.", Toast.LENGTH_LONG).show();
        waitingForTermux = true;
        startActivity(i);
    }
    // What "Open Termux" copies: installs Node there if it's missing, and Symbiot
    // if it's missing or older than this app's (an older one opens its link in the
    // browser, not here), then starts it.
    String startInTermux() {
        String v;
        try { v = Bootstrap.read(getAssets().open("symbiot.version")).trim(); } catch (Exception e) { v = ""; }
        String update = v.matches("\\d+\\.\\d+\\.\\d+") ? "v=$(node -p \"require(process.env.PREFIX+'/lib/node_modules/symbiot/package.json').version\" 2>/dev/null); "
            + "[ -n \"$v\" ] && [ \"$(printf '%s\\n' " + v + " \"$v\" | sort -V | head -1)\" = " + v + " ] || npm install -g symbiot@latest; "
            : "command -v symbiot >/dev/null || npm install -g symbiot; ";
        return "command -v node >/dev/null || pkg install -y nodejs git; " + update + "symbiot app";
    }
    private boolean termuxInstalled() {
        try { getPackageManager().getPackageInfo("com.termux", 0); return true; } catch (PackageManager.NameNotFoundException e) { return false; }
    }

    // Back from Termux with Symbiot's link copied (if Termux couldn't open it):
    // use that. Only then, and once the window has focus, which Android needs to read it.
    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (!focus || !waitingForTermux) return;
        ClipData c = getSystemService(ClipboardManager.class).getPrimaryClip();
        CharSequence t = c != null && c.getItemCount() > 0 ? c.getItemAt(0).getText() : null;
        if (t != null && LINK.matcher(t.toString().trim()).matches()) useExternal(http(t.toString().trim()));
    }

    @Override protected void onResume() {
        super.onResume();
        // back in front: ask your computer now, so what it shows is fresh (phone.mjs)
        SymbiotService.poke(external != null ? external : SymbiotService.url);
        boolean has = hasStorage();
        if (!has && !asked && external == null) { asked = true; askStorage(); }
        // back from Settings with file access allowed: the map Symbiot drew without
        // it is empty, so have the page scan again
        if (has && !hadStorage && !shown.isEmpty()) web.evaluateJavascript("window.symbiotStorageGranted&&symbiotStorageGranted()", null);
        hadStorage = has;
    }

    @Override protected void onDestroy() { destroyed = true; if (dialog != null) dialog.dismiss(); ui.removeCallbacksAndMessages(null); web.destroy(); super.onDestroy(); }

    // Back within Symbiot's page only: the entry before it can be the status page
    // ("Starting Symbiot…"), which going back to would leave showing for good.
    @Override public void onBackPressed() {
        WebBackForwardList h = web.copyBackForwardList();
        int i = h.getCurrentIndex();
        if (i > 0 && h.getItemAtIndex(i - 1).getUrl().startsWith("http://127.0.0.1")) web.goBack();
        else moveTaskToBack(true);
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == FILES && pick != null) { pick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); pick = null; }
    }

    // Follow the service: load Symbiot once it's serving, or show where it's at.
    private void tick() {
        String url = SymbiotService.url, state = SymbiotService.state, ext = external;
        if (ext != null) {
            String st = externalState;
            if ("up".equals(st)) { if (!ext.equals(shown)) { shown = ext; statusShown = ""; web.loadUrl(ext); } else if (pair != null) handPair(); }
            else if (shown.isEmpty() || "down".equals(st)) {
                String key = "termux\n" + st;
                if (!key.equals(statusShown)) { statusShown = key; shown = ""; web.loadDataWithBaseURL("about:blank", termuxStatus(st), "text/html", "utf-8", null); }
            }
        } else if (url != null) {
            if (!url.equals(shown)) { shown = url; statusShown = ""; web.loadUrl(url); }
            else if (pair != null) handPair();
        } else if (shown.isEmpty() || "stopped".equals(state) || "failed".equals(state)) {
            // (Symbiot's own page reconnects by itself across a restart, so it only
            // gives way to this once Symbiot has really stopped)
            String key = state + "\n" + hasStorage() + "\n" + SymbiotService.log();
            if (!key.equals(statusShown)) { statusShown = key; shown = ""; web.loadDataWithBaseURL("about:blank", status(state), "text/html", "utf-8", null); }
        }
        ui.postDelayed(this::tick, 500);
    }

    // The scanned pairing link, to the page once it's ready for it (window.symbiotPairLink).
    private boolean handing; // (once: a code pairs one phone, so a second try would only say it's used)
    private void handPair() {
        if (handing) return;
        handing = true;
        final String p = pair;
        web.evaluateJavascript("window.symbiotPairLink?(symbiotPairLink(" + JSONObject.quote(p) + "),'ok'):''", r -> { handing = false; if ("\"ok\"".equals(r) && p.equals(pair)) pair = null; });
    }

    private String status(String state) {
        boolean down = "stopped".equals(state) || "failed".equals(state);
        String title = "failed".equals(state) ? "Symbiot couldn't start" : "stopped".equals(state) ? "Symbiot is stopped" : "Starting Symbiot&hellip;";
        String log = TextUtils.htmlEncode(SymbiotService.log());
        return page(title, (down ? "<button onclick='SymbiotAndroid.start()'>Start Symbiot</button>" : "")
            + (hasStorage() ? "" : "<p>Symbiot can't see your shared storage yet, so it can't find the repos there.</p><button class=g onclick='SymbiotAndroid.storage()'>Allow file access</button>")
            + (log.isEmpty() ? "" : "<pre>" + log + "</pre>"));
    }

    private String termuxStatus(String st) {
        if (!"down".equals(st)) return page("Connecting to Symbiot in Termux&hellip;", "");
        return page("Symbiot in Termux isn't running",
            "<p>Start it in Termux with <code>symbiot app</code>. It opens Symbiot here.</p>"
            + (termuxInstalled() ? "<p>Or tap <b>Open Termux</b>: it copies a command that starts it, installing Node and Symbiot there first if they're missing. Paste it in Termux.</p>"
                + "<button onclick='SymbiotAndroid.openTermux()'>Open Termux</button>" : "")
            + "<button class=g onclick='SymbiotAndroid.builtIn()'>Use the app's own Symbiot</button>"
            + "<p class=m>The app's own Symbiot sees your shared storage, but not Termux's home folder.</p>");
    }

    private static String page(String title, String body) {
        return "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<style>body{background:#0E1A1F;color:#B7C9C4;font:15px -apple-system,Roboto,sans-serif;margin:0;padding:28px 20px}"
            + "h1{color:#F4F1EA;font-size:20px;display:flex;align-items:center;gap:10px}.dot{width:10px;height:10px;border-radius:50%;background:#3DDC97;box-shadow:0 0 12px #3DDC97}"
            + "pre{white-space:pre-wrap;word-break:break-word;font-size:11.5px;color:#7E9690;background:#15262C;border:1px solid #24404A;border-radius:8px;padding:10px;max-height:60vh;overflow:auto}"
            + "button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:9px 16px;background:#3DDC97;color:#0E1A1F;margin:4px 8px 4px 0}"
            + "button.g{background:#1D333A;color:#F4F1EA}code{color:#F4F1EA;background:#15262C;border-radius:4px;padding:1px 5px;word-break:break-word}.m{font-size:13px;color:#7E9690}</style>"
            + "<h1><span class=dot></span>" + title + "</h1>" + body;
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

    // window.SymbiotAndroid, for the status page's buttons and Symbiot's own page
    private class Bridge {
        @JavascriptInterface public void start() { ui.post(() -> { statusShown = ""; SymbiotService.start(MainActivity.this); }); }
        @JavascriptInterface public void storage() { ui.post(MainActivity.this::openStorageSettings); }
        // {"installed": Termux is on the phone, "on": showing the Termux Symbiot}
        @JavascriptInterface public String termux() { return "{\"installed\":" + termuxInstalled() + ",\"on\":" + (external != null) + "}"; }
        @JavascriptInterface public void openTermux() { ui.post(MainActivity.this::openTermux); }
        @JavascriptInterface public void builtIn() { ui.post(MainActivity.this::useBuiltIn); }
    }
}
