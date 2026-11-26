package net.nimay.chatompomp;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

final class BridgeClient {
    private static final String KEY = "chat-omp-bridge-v1";
    private static final int BASE64 = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;
    private static final Set<String> GET = routes(
        "/api/health", "/api/machine/resources", "/api/projects", "/api/projects/registry", "/api/sessions", "/api/session/messages",
        "/api/state", "/api/approval", "/api/models", "/api/omp/providers", "/api/git/status", "/api/git/diff", "/api/git/log",
        "/api/git/branches", "/api/files/read", "/api/fs/list", "/api/events", "/api/omp/turns", "/api/omp/turn-diff",
        "/api/trash", "/api/omp/workspace/resources", "/api/omp/workspace/plugins", "/api/adb/status", "/api/voice/local"
    );
    private static final Set<String> POST = routes(
        "/api/sessions/open", "/api/sessions/new", "/api/sessions/name", "/api/sessions/archive", "/api/prompt",
        "/api/abort", "/api/ask", "/api/approval", "/api/model", "/api/bash", "/api/git/stage", "/api/git/unstage",
        "/api/git/commit", "/api/projects/create", "/api/projects/move-session", "/api/omp/turn-undo", "/api/trash/restore",
        "/api/projects/register", "/api/omp/workspace/resources", "/api/omp/workspace/plugins", "/api/adb/install",
        "/api/voice/local", "/api/voice/start", "/api/voice/stop", "/api/voice/transcribe", "/api/voice/speak", "/api/poweroff"
    );
    private final SharedPreferences settings;
    private volatile JSONObject connection;
    private JSONObject computers = new JSONObject();

    private static Set<String> routes(String... values) {
        return new java.util.HashSet<>(Arrays.asList(values));
    }

    BridgeClient(Context context) {
        settings = context.getSharedPreferences("pairing", Context.MODE_PRIVATE);
        try {
            String encoded = settings.getString("encrypted", "");
            if (!encoded.isEmpty()) {
                JSONObject saved = new JSONObject(decrypt(Base64.decode(encoded, BASE64), key()));
                JSONObject entries = saved.optJSONObject("computers");
                if (entries == null) {
                    connection = saved;
                    computers.put(saved.getString("origin"), saved);
                } else {
                    computers = entries;
                    connection = entries.optJSONObject(saved.optString("active"));
                }
            }
        } catch (Exception ignored) {}
    }

    String origin() {
        JSONObject current = connection;
        return current == null ? "" : current.optString("origin");
    }

    synchronized JSONArray computers() throws Exception {
        JSONArray result = new JSONArray();
        java.util.Iterator<String> ids = computers.keys();
        while (ids.hasNext()) {
            String id = ids.next();
            JSONObject item = computers.getJSONObject(id);
            JSONObject wol = item.optJSONObject("wol");
            result.put(new JSONObject().put("id", id).put("name", item.optString("name", new URL(id).getHost()))
                .put("wakeReady", wol != null && !wol.optString("mac").isEmpty() && !wol.optString("relayUrl").isEmpty())
                .put("allowShutdown", wol != null && wol.optBoolean("allowShutdown"))
                .put("active", id.equals(origin())));
        }
        return result;
    }

    synchronized void select(String id) throws Exception {
        JSONObject current = computers.optJSONObject(id);
        if (current == null) throw new IOException("PC-en er ikke registrert.");
        persist(computers, id);
    }

    synchronized void rename(String id, String label) throws Exception {
        String name = label.trim();
        if (name.isEmpty() || name.length() > 48) throw new IOException("Velg et navn på 1–48 tegn.");
        JSONObject updated = new JSONObject(computers.toString());
        updated.getJSONObject(id).put("name", name);
        persist(updated, origin());
    }

    synchronized void remove(String id) throws Exception {
        JSONObject updated = new JSONObject(computers.toString());
        updated.remove(id);
        persist(updated, id.equals(origin()) ? "" : origin());
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey) store.getKey(KEY, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private static String decrypt(byte[] bytes, SecretKey secret) throws Exception {
        if (bytes.length < 29) throw new IOException("Ugyldig engangskode.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128, Arrays.copyOf(bytes, 12)));
        return new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8);
    }

    private synchronized void remember(JSONObject data) throws Exception {
        String id = data.getString("origin");
        JSONObject updated = new JSONObject(computers.toString());
        JSONObject previous = updated.optJSONObject(id);
        if (previous != null && previous.has("name")) data.put("name", previous.getString("name"));
        updated.put(id, data);
        persist(updated, id);
    }

    private void persist(JSONObject updated, String active) throws Exception {
        JSONObject data = new JSONObject().put("computers", updated).put("active", active);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(data.toString().getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        bytes.write(cipher.getIV());
        bytes.write(encrypted);
        if (!settings.edit().putString("encrypted", Base64.encodeToString(bytes.toByteArray(), BASE64)).commit()) {
            throw new IOException("Kunne ikke lagre tilkoblingen.");
        }
        computers = updated;
        connection = updated.optJSONObject(active);
    }

    JSONObject pair(String ticket) throws Exception {
        Uri uri = Uri.parse(ticket);
        if (!"chatomp".equals(uri.getScheme()) || !"pair".equals(uri.getHost()) || uri.getPathSegments().size() != 1) {
            throw new IOException("Skann engangskoden fra OMP Desktop.");
        }
        JSONObject bundle = new JSONObject(new String(Base64.decode(uri.getLastPathSegment(), BASE64), StandardCharsets.UTF_8));
        int port = bundle.getInt("port");
        String host = bundle.getString("address");
        String nonce = bundle.getString("nonce");
        if (!host.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}") || port < 1024 || port > 65535 || !nonce.matches("[A-Za-z0-9_-]{25,50}")) {
            throw new IOException("Engangskoden mangler en gyldig PC-adresse.");
        }
        byte[] secret = Base64.decode(bundle.getString("key"), BASE64);
        if (secret.length != 32) throw new IOException("Ugyldig engangskode.");
        HttpURLConnection exchange = open("http://" + host + ":" + port + "/" + nonce, "", "GET", "");
        String sealed;
        try {
            if (exchange.getResponseCode() != 200) throw new IOException("Koden er utløpt eller allerede brukt. Vis en ny kode på PC-en.");
            sealed = read(exchange.getInputStream(), 65536);
        } finally { exchange.disconnect(); }
        JSONObject data = new JSONObject(decrypt(Base64.decode(sealed, BASE64), new SecretKeySpec(secret, "AES")));
        URL address = new URL(data.getString("origin"));
        String credential = data.getString("credential");
        if (!host.equals(address.getHost()) || !(address.getProtocol().equals("http") || address.getProtocol().equals("https"))
            || address.getUserInfo() != null || credential.isEmpty() || credential.contains("\r") || credential.contains("\n")) {
            throw new IOException("Bridgen samsvarer ikke med engangskoden.");
        }
        JSONObject health = json(open(address + "/api/health", credential, "GET", ""));
        if (!health.optBoolean("ok")) throw new IOException("OMP Bridge svarte uten aktiv status.");
        remember(data);
        return health;
    }

    HttpURLConnection connect(String method, String route, String body) throws Exception {
        return connect(connection, method, route, body);
    }

    JSONObject snapshot() { return connection; }

    private HttpURLConnection connect(JSONObject current, String method, String route, String body) throws Exception {
        if (current == null) throw new IOException("Koble til PC-en i innstillinger.");
        Uri path = Uri.parse(route);
        boolean allowed = ("GET".equals(method) && GET.contains(path.getPath()))
            || ("POST".equals(method) && POST.contains(path.getPath()))
            || ("DELETE".equals(method) && "/api/session".equals(path.getPath()));
        if (path.getScheme() != null || path.getAuthority() != null ||
            !allowed) throw new IOException("Ukjent bridge-handling.");
        return open(current.getString("origin") + route, current.getString("credential"), method, body);
    }

    JSONObject request(JSONObject current, String method, String route, String body) throws Exception {
        if ("POST".equals(method) && "/api/wol/wake".equals(route)) {
            JSONObject wol = current.optJSONObject("wol");
            if (wol == null) throw new IOException("Skann en ny QR-kode fra PC-en.");
            String mac = wol.optString("mac");
            String token = wol.optString("relayToken");
            if (!mac.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}") || !token.matches("[A-Za-z0-9_-]{32,128}")) {
                throw new IOException("Wake-on-LAN er ikke konfigurert for denne PC-en.");
            }
            URL relay = new URL(wol.getString("relayUrl"));
            boolean privateHttp = "http".equals(relay.getProtocol()) &&
                relay.getHost().matches("(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)[0-9.]+");
            if (relay.getUserInfo() != null || (!"https".equals(relay.getProtocol()) && !privateHttp)) {
                throw new IOException("Wake-on-LAN-reléet må bruke HTTPS eller en lokal IPv4-adresse.");
            }
            return json(open(new URL(relay, "/wake").toString(), token, "POST",
                new JSONObject().put("mac", mac).toString()));
        }
        JSONObject response = json(connect(current, method, route, body));
        if ("/api/omp/providers".equals(Uri.parse(route).getPath())) {
            JSONArray providers = response.optJSONArray("providers");
            if (providers != null) for (int i = 0; i < providers.length(); i++) providers.getJSONObject(i).remove("apiKey");
        }
        return response;
    }

    private static HttpURLConnection open(String address, String credential, String method, String body) throws IOException {
        URL url = new URL(address);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        boolean connectionCheck = "/api/health".equals(url.getPath());
        conn.setConnectTimeout(connectionCheck ? 4000 : 6500);
        boolean longRequest = "/api/prompt".equals(url.getPath()) || "/api/model".equals(url.getPath());
        conn.setReadTimeout(connectionCheck ? 4000 : longRequest ? 540000 : 120000);
        conn.setInstanceFollowRedirects(false);
        conn.setRequestMethod(method);
        conn.setRequestProperty("User-Agent", "Chat-OMP-OMP/0.1");
        if (!credential.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + credential);
        if (method.equals("POST")) {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 1048576) throw new IOException("Meldingen er for stor.");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setFixedLengthStreamingMode(bytes.length);
            try (java.io.OutputStream output = conn.getOutputStream()) { output.write(bytes); }
        }
        return conn;
    }

    private static JSONObject json(HttpURLConnection conn) throws Exception {
        try {
            int code = conn.getResponseCode();
            if (code == 401) {
                throw new IOException("Bridge avviste koblingen (HTTP 401). Skann en ny QR-kode fra OMP Desktop på denne PC-en.");
            }
            String raw = read(code < 400 ? conn.getInputStream() : conn.getErrorStream(), 16 * 1024 * 1024);
            JSONObject response = new JSONObject(raw);
            if (code < 200 || code >= 300 || response.optBoolean("ok", true) == false) {
                throw new IOException(response.optString("error", "Bridge svarte med HTTP " + code + "."));
            }
            return response;
        } finally { conn.disconnect(); }
    }

    private static String read(InputStream stream, int limit) throws IOException {
        if (stream == null) throw new IOException("Tomt svar fra bridgen.");
        try (InputStream input = stream; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            for (int count; (count = input.read(chunk)) != -1;) {
                if (buffer.size() + count > limit) throw new IOException("Svaret fra bridgen er for stort.");
                buffer.write(chunk, 0, count);
            }
            return buffer.toString("UTF-8");
        }
    }
}
