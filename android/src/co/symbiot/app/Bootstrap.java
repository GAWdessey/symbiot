package co.symbiot.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Environment;
import android.system.Os;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

// Unpacks what the APK carries into the app's private files and builds the
// environment Symbiot runs in:
//   files/usr     Node, git and gh (assets/runtime.zip), redone when the APK changes
//   files/global  npm's global prefix: Symbiot itself (assets/symbiot.zip), which
//                 Settings' "Update & restart" can then update with npm as usual
//   files/home    HOME: Symbiot's config (~/.config/symbiot), git's ~/.gitconfig
final class Bootstrap {
    final File files, usr, global, home, app;

    Bootstrap(Context ctx) {
        files = ctx.getFilesDir();
        usr = new File(files, "usr");
        global = new File(files, "global");
        home = new File(files, "home");
        app = new File(global, "lib/node_modules/symbiot");
    }

    File node() { return new File(usr, "bin/node"); }
    File script() { return new File(app, "index.mjs"); }
    // Settings' "start when the phone starts" writes this file (desktop.mjs)
    File bootFlag() { return new File(home, ".config/symbiot/android-boot"); }
    // and the weekly write-up's notification lands here for the service to post
    File notifyFile() { return new File(home, ".config/symbiot/android-notify.jsonl"); }

    void install(Context ctx, Log log) throws IOException {
        mkdirs(home); mkdirs(global);
        PackageInfo pi;
        try { pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0); } catch (Exception e) { throw new IOException(e); }
        String stamp = pi.versionName + "/" + pi.lastUpdateTime;
        File stampFile = new File(usr, ".apk");
        if (!usr.isDirectory() || !stamp.equals(read(stampFile))) {
            log.line("Unpacking Node, git and gh (first start after an install or update)...");
            File tmp = new File(files, "usr.new");
            unzip(ctx.getAssets().open("runtime.zip"), tmp);
            mkdirs(new File(tmp, "tmp"));
            write(new File(tmp, ".apk"), stamp);
            File old = new File(files, "usr.old");
            delete(old);
            if (usr.exists() && !usr.renameTo(old)) throw new IOException("can't replace " + usr);
            if (!tmp.renameTo(usr)) throw new IOException("can't move " + tmp);
            delete(old);
        }
        String bundled = read(ctx.getAssets().open("symbiot.version")).trim();
        String installed = packageVersion(app);
        if (installed == null || newer(bundled, installed)) {
            log.line("Installing Symbiot " + bundled + (installed == null ? "" : " (over " + installed + ")") + "...");
            File tmp = new File(files, "symbiot.new");
            unzip(ctx.getAssets().open("symbiot.zip"), tmp);
            mkdirs(app.getParentFile());
            delete(app);
            if (!tmp.renameTo(app)) throw new IOException("can't move " + tmp);
        }
    }

    Map<String, String> env() {
        String u = usr.getAbsolutePath();
        Map<String, String> e = new HashMap<>();
        e.put("HOME", home.getAbsolutePath());
        e.put("PREFIX", u);
        e.put("PATH", global.getAbsolutePath() + "/bin:" + u + "/bin:/system/bin:/system/xbin");
        e.put("TMPDIR", u + "/tmp");
        e.put("LANG", "en_US.UTF-8");
        // Android's shell for child_process (node-shell.cjs), and longer than
        // Node's 250 ms per address to connect, which slow mobile data can miss
        e.put("NODE_OPTIONS", "--require=" + u + "/lib/node-shell.cjs --network-family-autoselection-attempt-timeout=2500");
        // Termux built these for its own prefix; point them at ours
        e.put("GIT_EXEC_PATH", u + "/libexec/git-core");
        e.put("GIT_TEMPLATE_DIR", u + "/share/git-core/templates");
        e.put("GIT_CONFIG_NOSYSTEM", "1");
        e.put("GIT_SSL_CAINFO", u + "/etc/tls/cert.pem");
        e.put("SSL_CERT_FILE", u + "/etc/tls/cert.pem");
        e.put("CURL_CA_BUNDLE", u + "/etc/tls/cert.pem");
        // Repos in shared storage belong to another user id and have no file modes:
        // without these, git refuses them ("dubious ownership") or calls every file changed.
        e.put("GIT_CONFIG_COUNT", "2");
        e.put("GIT_CONFIG_KEY_0", "safe.directory"); e.put("GIT_CONFIG_VALUE_0", "*");
        e.put("GIT_CONFIG_KEY_1", "core.fileMode"); e.put("GIT_CONFIG_VALUE_1", "false");
        e.put("NPM_CONFIG_PREFIX", global.getAbsolutePath());
        e.put("SYMBIOT_ANDROID_APP", "1");
        e.put("SYMBIOT_NO_OPEN", "1");
        // HOME is private to this app, so the repo scan starts in shared storage
        e.put("SYMBIOT_SCAN_HOME", Environment.getExternalStorageDirectory().getAbsolutePath());
        return e;
    }

    // ---- helpers ----------------------------------------------------------------
    interface Log { void line(String s); }

    // A zip from runtime.mjs: plain files, then .symlinks (path<TAB>target) and
    // .executables (one path per line) to apply.
    static void unzip(InputStream in, File dest) throws IOException {
        delete(dest); mkdirs(dest);
        String links = "", execs = "";
        byte[] buf = new byte[1 << 16];
        try (ZipInputStream z = new ZipInputStream(in)) {
            for (ZipEntry en; (en = z.getNextEntry()) != null; ) {
                String name = en.getName();
                if (name.contains("..")) throw new IOException("bad zip entry " + name);
                if (name.equals(".symlinks")) { links = read(z); continue; }
                if (name.equals(".executables")) { execs = read(z); continue; }
                File f = new File(dest, name);
                if (en.isDirectory()) { mkdirs(f); continue; }
                mkdirs(f.getParentFile());
                try (FileOutputStream out = new FileOutputStream(f)) { for (int n; (n = z.read(buf)) > 0; ) out.write(buf, 0, n); }
            }
        }
        for (String l : links.split("\n")) {
            int tab = l.indexOf('\t'); if (tab < 0) continue;
            File f = new File(dest, l.substring(0, tab));
            mkdirs(f.getParentFile());
            try { Os.symlink(l.substring(tab + 1), f.getAbsolutePath()); } catch (Exception e) { throw new IOException("symlink " + f + ": " + e); }
        }
        for (String l : execs.split("\n")) {
            if (l.isEmpty()) continue;
            try { Os.chmod(new File(dest, l).getAbsolutePath(), 0700); } catch (Exception e) { throw new IOException("chmod " + l + ": " + e); }
        }
    }

    static String packageVersion(File dir) {
        String pkg = read(new File(dir, "package.json"));
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"version\"\\s*:\\s*\"([^\"]+)\"").matcher(pkg);
        return m.find() ? m.group(1) : null;
    }
    // a.b.c numeric compare, as index.mjs's semverGt
    static boolean newer(String a, String b) {
        String[] x = a.split("[.-]"), y = b.split("[.-]");
        for (int i = 0; i < 3; i++) {
            int p = i < x.length ? num(x[i]) : 0, q = i < y.length ? num(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }
    static int num(String s) { try { return Integer.parseInt(s); } catch (NumberFormatException e) { return 0; } }

    static String read(File f) { try (InputStream in = new FileInputStream(f)) { return read(in); } catch (IOException e) { return ""; } }
    static String read(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder(); char[] buf = new char[8192];
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        for (int n; (n = r.read(buf)) > 0; ) sb.append(buf, 0, n);
        return sb.toString();
    }
    static void write(File f, String s) throws IOException { try (FileOutputStream out = new FileOutputStream(f)) { out.write(s.getBytes(StandardCharsets.UTF_8)); } }
    static void mkdirs(File d) throws IOException { if (!d.isDirectory() && !d.mkdirs()) throw new IOException("can't create " + d); }
    // deletes a tree without following symlinks out of it
    static void delete(File f) {
        boolean link;
        try { link = android.system.OsConstants.S_ISLNK(Os.lstat(f.getAbsolutePath()).st_mode); } catch (Exception e) { return; } // not there
        if (!link && f.isDirectory()) { File[] kids = f.listFiles(); if (kids != null) for (File k : kids) delete(k); }
        f.delete();
    }
}
