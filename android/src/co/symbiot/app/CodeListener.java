package co.symbiot.app;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// A code a site sends (an SMS, an email, an authenticator's): when you've given Symbiot
// Notification access, a notification that looks like one is handed to this phone's own
// Symbiot, over 127.0.0.1 (phone.mjs heardCode). There it goes on to your computer only when
// one of its agents is waiting for that site's code and you switched that site on, and then
// only the code. Nothing else in the notification leaves the phone, and nothing is kept.
public class CodeListener extends NotificationListenerService {
    private static final Pattern CODE_WORD = Pattern.compile("(?i)\\b(code|otp|pin|passcode|verification|verify|one[- ]time)\\b");
    private static final Pattern DIGITS = Pattern.compile("\\b(\\d{3}[ -]\\d{3}|\\d{4,8}|[A-Z0-9]{3,5}-[A-Z0-9]{3,5})\\b");
    private static final Pattern BASE = Pattern.compile("^(http://[^/]+)/\\?t=(\\w+)");

    // Whether you've switched it on in Android's Settings (Notification access).
    static boolean allowed(Context ctx) {
        String on = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        return on != null && on.contains(new ComponentName(ctx, CodeListener.class).flattenToString());
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || getPackageName().equals(sbn.getPackageName())) return;
            Bundle x = sbn.getNotification().extras; if (x == null) return;
            String title = str(x.getCharSequence(Notification.EXTRA_TITLE));
            CharSequence big = x.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String text = str(big != null ? big : x.getCharSequence(Notification.EXTRA_TEXT));
            String all = title + "\n" + text;
            if (!CODE_WORD.matcher(all).find() || !DIGITS.matcher(all).find()) return; // not a code: nothing is sent anywhere
            String u = SymbiotService.url; if (u == null) return;
            Matcher m = BASE.matcher(u); if (!m.find()) return;
            JSONObject body = new JSONObject().put("app", sbn.getPackageName()).put("title", cut(title, 200)).put("text", cut(text, 600));
            new Thread(() -> post(m.group(1) + "/api/phone/heard", m.group(2), body.toString()), "symbiot-code").start();
        } catch (Exception ignored) {}
    }

    private static void post(String url, String token, String json) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST"); c.setDoOutput(true); c.setConnectTimeout(2000); c.setReadTimeout(10000);
            c.setRequestProperty("x-symbiot-token", token); c.setRequestProperty("content-type", "application/json");
            c.getOutputStream().write(json.getBytes(StandardCharsets.UTF_8));
            c.getResponseCode(); c.disconnect();
        } catch (Exception ignored) {}
    }
    private static String str(CharSequence s) { return s == null ? "" : s.toString(); }
    private static String cut(String s, int n) { return s.length() > n ? s.substring(0, n) : s; }
}
