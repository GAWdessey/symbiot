package co.symbiot.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// The phone's half of its link to your computer (phone.mjs): its token and the key
// the two agreed when pairing, kept sealed by a key in Android's Keystore, which
// never leaves it. So the app's files alone (a backup, a copy) aren't enough to
// pose as this phone. Node hands it over in android-seal.json (for a few seconds,
// 0600); it's sealed into files/link.sealed and the plain file deleted, and at each
// start it's opened again and given to Node in SYMBIOT_COMPUTER_SECRET.
final class LinkKey {
    private static final String ALIAS = "symbiot-link";

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return g.generateKey();
    }

    // What Node left to seal: sealed (or, "{}" after Forget, the sealed one removed).
    static void take(Bootstrap b) {
        File plain = b.sealFile();
        if (!plain.exists()) return;
        try {
            String s = Bootstrap.read(plain).trim();
            if (s.isEmpty() || s.equals("{}")) b.sealedFile().delete();
            else {
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.ENCRYPT_MODE, key());
                byte[] iv = c.getIV(), ct = c.doFinal(s.getBytes(StandardCharsets.UTF_8));
                File tmp = new File(b.sealedFile().getPath() + ".new");
                try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(iv.length); out.write(iv); out.write(ct); }
                if (!tmp.renameTo(b.sealedFile())) throw new IOException("can't move " + tmp);
            }
        } catch (Exception e) {
            SymbiotService.log("Couldn't seal the link to your computer: " + e);
            return; // keep the plain file: better asked again than lost
        }
        plain.delete();
    }

    // The sealed one, opened for Node; null if there's none, or the Keystore's key is gone.
    static String open(Bootstrap b) {
        File f = b.sealedFile();
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            byte[] all = new byte[(int) f.length()];
            int n = 0; for (int r; n < all.length && (r = in.read(all, n, all.length - n)) > 0; ) n += r;
            int ivLen = all[0];
            byte[] iv = Arrays.copyOfRange(all, 1, 1 + ivLen), ct = Arrays.copyOfRange(all, 1 + ivLen, n);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            SymbiotService.log("Couldn't open the link to your computer (pair again): " + e);
            return null;
        }
    }
}
