package co.symbiot.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
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
    private static final ArrayDeque<String> LOG = new ArrayDeque<>();
    private static final Pattern URL_RE = Pattern.compile("(http://127\\.0\\.0\\.1:\\d+/\\?t=[0-9a-f]+)");
    private static final int ONGOING = 1;
    private volatile Process proc;
    private volatile boolean stopping;
    private Thread worker;

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
        if (worker == null || !worker.isAlive()) {
            state = "starting"; url = null; stopping = false;
            worker = new Thread(this::run, "symbiot");
            worker.start();
        }
        return START_STICKY;
    }

    @Override public void onDestroy() { if (proc != null) proc.destroy(); super.onDestroy(); }

    private void run() {
        Bootstrap b = new Bootstrap(this);
        try {
            b.install(this, SymbiotService::log);
            if (stopping) throw new InterruptedException("stopped while unpacking");
            ProcessBuilder pb = new ProcessBuilder(b.node().getAbsolutePath(), b.script().getAbsolutePath(), "app")
                .directory(b.home).redirectErrorStream(true);
            pb.environment().putAll(b.env());
            proc = pb.start();
            Thread out = new Thread(() -> read(proc), "symbiot-out"); out.start();
            while (!proc.waitFor(3, TimeUnit.SECONDS)) poll(b);
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
            state = code == 0 || stopping ? "stopped" : "failed";
        } catch (Exception e) {
            log("Couldn't start Symbiot: " + e);
            state = stopping ? "stopped" : "failed";
        }
        url = null;
        stopForeground(true);
        stopSelf();
    }

    private void read(Process p) {
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            for (String l; (l = r.readLine()) != null; ) {
                log(l);
                Matcher m = URL_RE.matcher(l);
                if (m.find()) { url = m.group(1); state = "running"; }
            }
        } catch (Exception ignored) {}
    }

    // the weekly write-up's notifications, as desktop.mjs writes them in this app
    private void poll(Bootstrap b) {
        File f = b.notifyFile(), taken = new File(f.getPath() + ".taken");
        if (!f.exists() || !f.renameTo(taken)) return;
        for (String l : Bootstrap.read(taken).split("\n")) {
            try { JSONObject j = new JSONObject(l); notify(j.optString("title", "Symbiot"), j.optString("body", "")); } catch (Exception ignored) {}
        }
        taken.delete();
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

    private void stop() {
        stopping = true;
        String u = url;
        if (u != null) new Thread(() -> {
            try {
                Matcher m = Pattern.compile("^(http://[^/]+)/\\?t=(\\w+)").matcher(u);
                if (m.find()) { HttpURLConnection c = (HttpURLConnection) new URL(m.group(1) + "/api/quit").openConnection(); c.setRequestProperty("x-symbiot-token", m.group(2)); c.getResponseCode(); c.disconnect(); }
            } catch (Exception ignored) {}
        }).start();
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
        nm.createNotificationChannel(new NotificationChannel("week", "Weekly write-up", NotificationManager.IMPORTANCE_DEFAULT));
    }
    private Notification.Builder builder(String channel) {
        Notification.Builder n = new Notification.Builder(this, channel);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return n.setSmallIcon(R.drawable.ic_symbiot).setContentIntent(open);
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
