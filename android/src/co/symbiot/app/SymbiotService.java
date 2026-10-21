package co.symbiot.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Runs `symbiot app` (Node, in this app's files) as a foreground service, so it
// keeps going with the window closed: the weekly write-up, agent runs, Approve.
// The activity reads `url` / `state` / log() to show it.
public class SymbiotService extends Service {
    static final String STOP = "co.symbiot.app.STOP";
    static volatile String url;           // http://127.0.0.1:<port>/?t=<token>, once Symbiot says so
    static volatile String state = "stopped"; // starting | running | stopped | failed
    static volatile boolean keptStopping;  // failed because it started but kept stopping, not because it couldn't start
    private static final ArrayDeque<String> LOG = new ArrayDeque<>();
    // the start line ("Symbiot is running at http://127.0.0.1:7391/"): since 0.66.0 it has no ?t=<token>,
    // which would land in app.log, so the token comes from this app's own secrets.json (tokenIn)
    private static final Pattern URL_RE = Pattern.compile("is (?:already )?running\\b.*?(http://127\\.0\\.0\\.1:\\d+/)(?:\\?t=([0-9a-f]+))?");
    private static final int ONGOING = 1;
    private volatile Process proc;
    private volatile boolean stopping;
    private Thread worker;
    private ConnectivityManager.NetworkCallback net;
    private volatile boolean finding;
    private static volatile long poked;

    static void start(Context ctx) {
        ctx.startForegroundService(new Intent(ctx, SymbiotService.class));
    }
    // (while the app shows the Symbiot running in Termux instead)
    static void stop(Context ctx) {
        if ("stopped".equals(state) || "failed".equals(state)) return;
        ctx.startService(new Intent(ctx, SymbiotService.class).setAction(STOP));
    }
    static synchronized void log(String s) { LOG.addLast(s); while (LOG.size() > 80) LOG.removeFirst(); }
    static synchronized String log() { return String.join("\n", LOG); }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        channels(this);
        if (intent != null && STOP.equals(intent.getAction())) { stop(); return START_NOT_STICKY; }
        startForeground(ONGOING, ongoing());
        // the phone moved between Wi-Fi and mobile data, or got its network back: ask
        // your computer now (phone.mjs), rather than "can't reach" until the next round
        if (net == null) try {
            net = new ConnectivityManager.NetworkCallback() { @Override public void onAvailable(Network n) { poke(url); } };
            getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(net);
        } catch (Exception e) { net = null; }
        if (worker == null || !worker.isAlive()) {
            state = "starting"; url = null; stopping = false; keptStopping = false;
            worker = new Thread(this::run, "symbiot");
            worker.start();
        }
        return START_STICKY;
    }

    @Override public void onDestroy() {
        if (net != null) try { getSystemService(ConnectivityManager.class).unregisterNetworkCallback(net); } catch (Exception ignored) {}
        if (proc != null) proc.destroy();
        super.onDestroy();
    }

    // Node dying (a crash, or Android 12+'s phantom-process killer, which the agents it
    // starts make likelier) is started again by itself, after 2 s, 10 s, then 30 s; a run
    // that lasted RAN_OK counts as fine again. Past that, or a clean exit (Quit, or
    // Update & restart's copy gone too), it shows as stopped or failed, with Start.
    private static final long[] AGAIN_MS = { 2000, 10000, 30000 };
    private static final long RAN_OK = 5 * 60 * 1000;

    private void run() {
        Bootstrap b = new Bootstrap(this);
        try {
            b.install(this, SymbiotService::log);
            if (stopping) throw new InterruptedException("stopped while unpacking");
            for (int tries = 0; ; ) {
                long began = System.currentTimeMillis();
                int code = runOnce(b);
                if (code == 0 || stopping) { state = "stopped"; break; }
                if (System.currentTimeMillis() - began > RAN_OK) tries = 0;
                if (tries >= AGAIN_MS.length) { log("Symbiot stopped " + (tries + 1) + " times in a row, so it's left stopped: tap Start to try again."); keptStopping = true; state = "failed"; break; }
                long wait = AGAIN_MS[tries++];
                log("Symbiot stopped (code " + code + "); starting it again in " + (wait / 1000) + " s (" + tries + " of " + AGAIN_MS.length + ").");
                state = "starting"; url = null;
                Thread.sleep(wait);
                if (stopping) { state = "stopped"; break; }
            }
        } catch (Exception e) {
            log("Couldn't start Symbiot: " + e);
            state = stopping ? "stopped" : "failed";
        }
        url = null;
        stopForeground(true);
        stopSelf();
    }

    // One run of `symbiot app`: its exit code, once nothing serves its address any more.
    private int runOnce(Bootstrap b) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(b.node().getAbsolutePath(), b.script().getAbsolutePath(), "app")
            .directory(b.home).redirectErrorStream(true);
        pb.environment().putAll(b.env());
        // the link to your computer, opened from the Keystore for this run only (LinkKey)
        LinkKey.take(b);
        String link = LinkKey.open(b);
        if (link != null) pb.environment().put("SYMBIOT_COMPUTER_SECRET", link);
        proc = pb.start();
        Thread out = new Thread(() -> read(proc, b.home), "symbiot-out"); out.start();
        // every second: a look for your computer (phone.mjs findComputers) waits on this
        while (!proc.waitFor(1, TimeUnit.SECONDS)) poll(b);
        int code = proc.exitValue();
        out.join(2000);
        log("(symbiot app exited with code " + code + ")");
        // "Update & restart" starts a fresh copy on the same address and exits
        // with 0, so only call it stopped once nothing has answered there for a while.
        long until = System.currentTimeMillis() + 10000;
        while (code == 0 && !stopping && url != null) {
            if (alive(url)) { state = "running"; until = System.currentTimeMillis() + 6000; }
            else if (System.currentTimeMillis() > until) break;
            poll(b); Thread.sleep(1500);
        }
        poll(b);
        return code;
    }

    private void read(Process p, File home) {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            for (String l; (l = r.readLine()) != null; ) {
                log(l);
                Matcher m = URL_RE.matcher(l);
                if (!m.find()) continue;
                String t = m.group(2) != null ? m.group(2) : tokenIn(home);
                if (t.isEmpty()) { log("Symbiot started, but its token isn't in its settings, so the page can't open."); continue; }
                url = m.group(1) + "?t=" + t; state = "running";
            }
        } catch (Exception ignored) {}
    }

    // the app's token, as server.mjs saved it before printing its address (secrets.json, or config.json from before)
    static String tokenIn(File home) {
        for (String f : new String[] { "secrets.json", "config.json" }) {
            try { String t = new JSONObject(Bootstrap.read(new File(home, ".config/symbiot/" + f))).optString("appToken", ""); if (t.matches("[0-9a-f]+")) return t; } catch (Exception ignored) {}
        }
        return "";
    }

    // notifications (the weekly write-up, Watch's news, what needs you), as desktop.mjs writes them in this app;
    // the link's key to seal, and a look for your computer on the network, when asked
    private void poll(Bootstrap b) {
        LinkKey.take(b);
        if (b.nsdWant().exists() && !finding) { b.nsdWant().delete(); finding = true; new Thread(() -> { try { find(b); } finally { finding = false; } }, "symbiot-nsd").start(); }
        File f = b.notifyFile(), taken = new File(f.getPath() + ".taken");
        if (!f.exists() || !f.renameTo(taken)) return;
        for (String l : Bootstrap.read(taken).split("\n")) {
            try { JSONObject j = new JSONObject(l); notify(j.optString("title", "Symbiot"), j.optString("body", "")); } catch (Exception ignored) {}
        }
        taken.delete();
    }

    // Your computer, where it says it is on this network now (mdns.mjs announces it):
    // Android's own discovery, for a few seconds, each found one resolved in turn.
    // Written for Node as [{ name, port, addresses, fp }] (phone.mjs findComputers).
    private void find(Bootstrap b) {
        NsdManager nsd = getSystemService(NsdManager.class);
        final List<NsdServiceInfo> seen = new ArrayList<>();
        NsdManager.DiscoveryListener l = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String t) {}
            @Override public void onDiscoveryStopped(String t) {}
            @Override public void onStartDiscoveryFailed(String t, int e) {}
            @Override public void onStopDiscoveryFailed(String t, int e) {}
            @Override public void onServiceFound(NsdServiceInfo s) { synchronized (seen) { seen.add(s); } }
            @Override public void onServiceLost(NsdServiceInfo s) {}
        };
        JSONArray out = new JSONArray();
        try {
            nsd.discoverServices("_symbiot._tcp", NsdManager.PROTOCOL_DNS_SD, l);
            Thread.sleep(3500);
            try { nsd.stopServiceDiscovery(l); } catch (Exception ignored) {}
            List<NsdServiceInfo> all; synchronized (seen) { all = new ArrayList<>(seen); }
            for (NsdServiceInfo s : all) {
                final NsdServiceInfo[] got = { null };
                final CountDownLatch done = new CountDownLatch(1);
                nsd.resolveService(s, new NsdManager.ResolveListener() {
                    @Override public void onResolveFailed(NsdServiceInfo i, int e) { done.countDown(); }
                    @Override public void onServiceResolved(NsdServiceInfo i) { got[0] = i; done.countDown(); }
                });
                done.await(3, TimeUnit.SECONDS);
                NsdServiceInfo r = got[0];
                if (r == null || !(r.getHost() instanceof Inet4Address)) continue;
                JSONObject j = new JSONObject();
                j.put("name", r.getServiceName()); j.put("port", r.getPort());
                j.put("addresses", new JSONArray().put(((InetAddress) r.getHost()).getHostAddress()));
                Map<String, byte[]> a = r.getAttributes(); byte[] fp = a == null ? null : a.get("fp");
                j.put("fp", fp == null ? "" : new String(fp, StandardCharsets.UTF_8));
                out.put(j);
            }
        } catch (Exception e) { log("Couldn't look for your computer on this network: " + e); }
        try (FileOutputStream f = new FileOutputStream(b.nsdFile())) { f.write(out.toString().getBytes(StandardCharsets.UTF_8)); } catch (Exception ignored) {}
    }

    // Ask your computer now (Symbiot's own /api/phone/check, behind its token): the
    // network changed, or the window came to the front. At most every few seconds.
    static void poke(String u) {
        long now = System.currentTimeMillis();
        if (u == null || now - poked < 4000) return;
        poked = now;
        new Thread(() -> {
            try {
                Matcher m = Pattern.compile("^(http://[^/]+)/\\?t=(\\w+)").matcher(u);
                if (!m.find()) return;
                HttpURLConnection c = (HttpURLConnection) new URL(m.group(1) + "/api/phone/check").openConnection();
                c.setRequestMethod("POST"); c.setDoOutput(true); c.setConnectTimeout(2000); c.setReadTimeout(30000);
                c.setRequestProperty("x-symbiot-token", m.group(2)); c.setRequestProperty("content-type", "application/json");
                c.getOutputStream().write("{}".getBytes(StandardCharsets.UTF_8));
                c.getResponseCode(); c.disconnect();
            } catch (Exception ignored) {}
        }, "symbiot-poke").start();
    }

    static boolean alive(String u) {
        try {
            Matcher m = Pattern.compile("^(http://[^/]+)/\\?t=(\\w+)").matcher(u);
            if (!m.find()) return false;
            HttpURLConnection c = (HttpURLConnection) new URL(m.group(1) + "/api/ping").openConnection();
            c.setConnectTimeout(1500); c.setReadTimeout(1500);
            c.setRequestProperty("x-symbiot-token", m.group(2));
            int code = c.getResponseCode(); c.disconnect();
            return code == 200;
        } catch (Exception e) { return false; }
    }

    // Ask the Symbiot at a link to quit (its own /api/quit, behind its token): this app's,
    // or Termux's when the app switches to its own.
    static void quit(String u) {
        try {
            Matcher m = Pattern.compile("^(http://[^/]+)/\\?t=(\\w+)").matcher(u);
            if (m.find()) { HttpURLConnection c = (HttpURLConnection) new URL(m.group(1) + "/api/quit").openConnection(); c.setConnectTimeout(2000); c.setReadTimeout(5000); c.setRequestProperty("x-symbiot-token", m.group(2)); c.getResponseCode(); c.disconnect(); }
        } catch (Exception ignored) {}
    }

    private void stop() {
        stopping = true;
        String u = url;
        if (u != null) new Thread(() -> quit(u)).start();
        if (proc != null) proc.destroy();
        url = null; state = "stopped";
        stopForeground(true);
        stopSelf();
    }

    // ---- notifications -------------------------------------------------------
    // The activity creates these too: on Android 13+, that is what shows the
    // notification permission prompt for an app targeting 28.
    static void channels(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("running", "Symbiot running", NotificationManager.IMPORTANCE_MIN));
        // "week" kept as the id (its settings stay yours); named for all it carries now:
        // the weekly write-up, Watch's news and what needs you on your computer
        nm.createNotificationChannel(new NotificationChannel("week", "What's new and what needs you", NotificationManager.IMPORTANCE_DEFAULT));
    }
    private Notification.Builder builder(String channel) {
        Notification.Builder n = new Notification.Builder(this, channel);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return n.setSmallIcon(R.drawable.ic_stat_symbiot).setContentIntent(open);
    }
    private Notification ongoing() {
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, SymbiotService.class).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return builder("running").setContentTitle("Symbiot is running").setContentText("Tap to open it")
            .setOngoing(true).addAction(new Notification.Action.Builder(null, "Stop", stop).build()).build();
    }
    private void notify(String title, String body) {
        Notification n = builder("week").setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setAutoCancel(true).build();
        getSystemService(NotificationManager.class).notify((int) (System.currentTimeMillis() & 0xffffff) + 2, n);
    }
}
