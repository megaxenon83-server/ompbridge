package net.nimay.chatompomp;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Camera;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
    private static final String PAGE = "file:///android_asset/index.html";
    private final ExecutorService workers = Executors.newFixedThreadPool(5);
    private final ExecutorService eventWorkers = Executors.newCachedThreadPool();
    private final AtomicBoolean pairing = new AtomicBoolean();
    private final AtomicBoolean decoding = new AtomicBoolean();
    private FrameLayout root;
    private WebView web;
    private BridgeClient bridge;
    private MessageSpeech speech;
    private FrameLayout scanner;
    private Camera camera;
    private volatile HttpURLConnection events;
    private volatile int eventGeneration;
    private String pendingLink;
    private boolean pageReady;
    private PermissionRequest microphoneRequest;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        applyChrome(Color.rgb(244, 246, 242), false);
        bridge = new BridgeClient(this);
        speech = new MessageSpeech(this, (id, error) ->
            js("window.onMessageSpeech(" + JSONObject.quote(id) + "," +
                (error == null ? "null" : JSONObject.quote(error)) + ")"));
        root = new FrameLayout(this);
        web = new WebView(this);
        web.setHorizontalScrollBarEnabled(false);
        web.getSettings().setSupportZoom(false);
        web.getSettings().setBuiltInZoomControls(false);
        web.getSettings().setDisplayZoomControls(false);
        web.getSettings().setUseWideViewPort(false);
        web.getSettings().setLoadWithOverviewMode(false);
        root.addView(web);
        setContentView(root);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setBlockNetworkLoads(true);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                String audio = PermissionRequest.RESOURCE_AUDIO_CAPTURE;
                if (!"file".equals(request.getOrigin().getScheme()) || !PAGE.equals(web.getUrl()) ||
                    request.getResources().length != 1 || !audio.equals(request.getResources()[0]) || microphoneRequest != null) {
                    request.deny();
                } else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{audio});
                } else {
                    microphoneRequest = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 3);
                }
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (microphoneRequest == request) microphoneRequest = null;
            }
        });
        web.setBackgroundColor(Color.rgb(244, 246, 242));
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public void onPageFinished(WebView view, String url) {
                if (!PAGE.equals(url)) return;
                pageReady = true;
                if (pendingLink != null) {
                    String link = pendingLink;
                    pendingLink = null;
                    handleLink(link, true);
                }
            }
        });
        web.addJavascriptInterface(new AppApi(), "Native");
        web.loadUrl(PAGE);
        receiveLink(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        receiveLink(intent);
    }

    private void receiveLink(Intent intent) {
        Uri uri = intent.getData();
        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || uri == null || !"chatomp".equals(uri.getScheme())) return;
        if (pageReady) handleLink(uri.toString(), true);
        else pendingLink = uri.toString();
    }

    private void handleLink(String link, boolean confirmPairing) {
        if (link == null || link.length() > 8192) return;
        Uri uri = Uri.parse(link);
        if (!"chatomp".equals(uri.getScheme())) return;
        if ("pair".equals(uri.getHost())) {
            if (confirmPairing) confirmPairLink(link);
            else pair(link);
        } else if ("thread".equals(uri.getHost()) && uri.getPathSegments().size() == 1) {
            js("window.onThreadLink(" + JSONObject.quote(uri.getPathSegments().get(0)) + "," +
                JSONObject.quote(uri.getQueryParameter("check")) + ")");
        }
    }

    private void confirmPairLink(String link) {
        new android.app.AlertDialog.Builder(this).setTitle("Koble til OMP Desktop?")
            .setMessage("Bruk engangskoden hvis du åpnet koblingen fra din egen PC.")
            .setPositiveButton("Koble til", (dialog, choice) -> pair(link))
            .setNegativeButton("Avbryt", null).show();
    }

    private void js(String expression) {
        runOnUiThread(() -> { if (!isDestroyed()) web.evaluateJavascript(expression, null); });
    }

    private void pair(String link) {
        if (!pairing.compareAndSet(false, true)) return;
        js("window.pairingStarted()");
        workers.execute(() -> {
            try {
                bridge.pair(link);
                js("window.onPairing(" + JSONObject.quote(bridge.origin()) + ",null)");
            } catch (Exception error) {
                js("window.onPairing(null," + JSONObject.quote(message(error)) + ")");
            } finally { pairing.set(false); }
        });
    }

    private static String message(Exception error) {
        String text = error.getMessage();
        return text == null || text.isEmpty() ? "Handlingen kunne ikke fullføres." : text;
    }

    private void applyChrome(int tint, boolean dark) {
        getWindow().setStatusBarColor(tint);
        getWindow().setNavigationBarColor(tint);
        getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (web != null) web.setBackgroundColor(tint);
    }

    private void stopEvents() {
        eventGeneration++;
        HttpURLConnection active = events;
        events = null;
        if (active != null) eventWorkers.execute(active::disconnect);
    }

    private void subscribe(String route, String origin) {
        stopEvents();
        int generation = eventGeneration;
        if (route.isEmpty()) return;
        eventWorkers.execute(() -> {
            HttpURLConnection conn = null;
            try {
                conn = bridge.connect("GET", route, "");
                conn.setReadTimeout(40000);
                conn.setRequestProperty("Accept-Encoding", "identity");
                if (generation != eventGeneration) return;
                events = conn;
                if (conn.getResponseCode() != 200) throw new IllegalStateException("Kunne ikke åpne live-strømmen.");
                try (BufferedReader input = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    for (String line; generation == eventGeneration && (line = input.readLine()) != null;) {
                        if (line.startsWith("data: ")) {
                            JSONObject frame = new JSONObject(line.substring(6));
                            JSONObject trace = frame.optJSONObject("trace");
                            if (trace != null) trace.put("androidReceivedAt", System.currentTimeMillis());
                            String event = "window.onBridgeEvent(" + JSONObject.quote(frame.toString()) + "," + JSONObject.quote(origin) + ")";
                            runOnUiThread(() -> {
                                if (generation == eventGeneration && !isDestroyed()) web.evaluateJavascript(event, null);
                            });
                        }
                    }
                }
            } catch (Exception error) {
                if (generation == eventGeneration) android.util.Log.w("OMP-Live", "Live stream closed: " + error);
            } finally {
                if (conn != null) conn.disconnect();
                runOnUiThread(() -> {
                    if (generation == eventGeneration && !isDestroyed()) web.evaluateJavascript("window.onStreamEnded()", null);
                });
            }
        });
    }

    public final class AppApi {
        @JavascriptInterface public String origin() { return bridge.origin(); }
        @JavascriptInterface public String appVersion() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
            catch (PackageManager.NameNotFoundException error) { return ""; }
        }
        @JavascriptInterface public String adbIdentity() { return AdbIdentityProvider.identity(MainActivity.this); }
        @JavascriptInterface public String debuggingStatus() {
            try {
                int usb = Settings.Global.getInt(getContentResolver(), Settings.Global.ADB_ENABLED, -1);
                int wireless = Settings.Global.getInt(getContentResolver(), "adb_wifi_enabled", -1);
                return "{\"usb\":" + usb + ",\"wireless\":" + wireless + "}";
            } catch (SecurityException error) { return "{}"; }
        }
        @JavascriptInterface public void openDebuggingSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)); }
                catch (android.content.ActivityNotFoundException error) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
            });
        }
        @JavascriptInterface public boolean copyMessage(String text) {
            if (text == null || text.length() > 200000) return false;
            ClipboardManager clipboard = getSystemService(ClipboardManager.class);
            if (clipboard == null) return false;
            try {
                clipboard.setPrimaryClip(ClipData.newPlainText("OMP-melding", text));
                return true;
            } catch (RuntimeException error) { return false; }
        }
        @JavascriptInterface public void readMessage(String id, String text) {
            runOnUiThread(() -> speech.read(id, text));
        }
        @JavascriptInterface public void stopReading() { runOnUiThread(speech::stop); }
        @JavascriptInterface public void request(String id, String method, String route, String body, String origin) {
            JSONObject current = bridge.snapshot();
            workers.execute(() -> {
                try {
                    if (current == null || !origin.equals(current.optString("origin"))) throw new IllegalStateException("PC-en ble byttet.");
                    JSONObject result = bridge.request(current, method, route, body);
                    js("window.complete(" + JSONObject.quote(id) + "," + JSONObject.quote(result.toString()) + ",null)");
                } catch (Exception error) {
                    js("window.complete(" + JSONObject.quote(id) + ",null," + JSONObject.quote(message(error)) + ")");
                }
            });
        }
        @JavascriptInterface public void stream(String route, String origin) {
            runOnUiThread(() -> { if (origin.equals(bridge.origin())) subscribe(route, origin); });
        }
        @JavascriptInterface public void scan() { runOnUiThread(() -> {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startScanner();
            else requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
        }); }
        @JavascriptInterface public void chrome(String color, boolean dark) {
            if (color == null || !color.matches("#[0-9a-fA-F]{6}")) return;
            int tint = Color.parseColor(color);
            runOnUiThread(() -> applyChrome(tint, dark));
        }
        @JavascriptInterface public String computers() {
            try { return bridge.computers().toString(); }
            catch (Exception error) { return "[]"; }
        }
        @JavascriptInterface public void computer(String action, String id, String name) { runOnUiThread(() -> {
            try {
                switch (action) {
                    case "rename": bridge.rename(id, name); js("window.onComputersChanged()"); return;
                    case "remove": bridge.remove(id); break;
                    case "select": bridge.select(id); break;
                    default: throw new IllegalArgumentException("Ukjent PC-handling.");
                }
                stopEvents();
                js("window.onPairing(" + JSONObject.quote(bridge.origin()) + ",null)");
            } catch (Exception error) {
                js("window.onPairing(null," + JSONObject.quote(message(error)) + ")");
            }
        }); }
        @JavascriptInterface public String readDrafts() {
            return getSharedPreferences("drafts", MODE_PRIVATE).getString("entries", "[]");
        }
        @JavascriptInterface public void writeDrafts(String entries) {
            if (entries == null || entries.length() > 1048576) return;
            getSharedPreferences("drafts", MODE_PRIVATE).edit().putString("entries", entries).commit();
        }
        @JavascriptInterface public void photo() { runOnUiThread(() -> {
            Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("image/*");
            try { startActivityForResult(pick, 2); }
            catch (RuntimeException error) { js("window.onAttachment(null,'Kunne ikke åpne bildevelgeren.')"); }
        }); }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 1 && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startScanner();
        else if (request == 1) js("window.onPairing(null,'Gi appen kameratilgang for å skanne koden.')");
        if (request == 3 && microphoneRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
                microphoneRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else microphoneRequest.deny();
            microphoneRequest = null;
        }
    }

    private void startScanner() {
        if (scanner != null) return;
        scanner = new FrameLayout(this);
        scanner.setBackgroundColor(Color.BLACK);
        SurfaceView surface = new SurfaceView(this);
        scanner.addView(surface, new FrameLayout.LayoutParams(-1, -1));
        TextView label = new TextView(this);
        label.setText("Rett kameraet mot QR-koden i OMP Desktop");
        label.setTextColor(Color.WHITE);
        label.setTextSize(16);
        label.setGravity(Gravity.CENTER);
        label.setPadding(12, 18, 12, 18);
        label.setBackgroundColor(Color.argb(185, 12, 24, 21));
        scanner.addView(label, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        Button close = new Button(this);
        close.setText("Lukk skanner");
        close.setOnClickListener(view -> stopScanner());
        scanner.addView(close, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        root.addView(scanner, new FrameLayout.LayoutParams(-1, -1));
        surface.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder holder) {
                try {
                    camera = Camera.open();
                    camera.setDisplayOrientation(90);
                    Camera.Parameters config = camera.getParameters();
                    if (config.getSupportedFocusModes().contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                        config.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
                        camera.setParameters(config);
                    }
                    Camera.Size size = camera.getParameters().getPreviewSize();
                    camera.setPreviewDisplay(holder);
                    camera.setPreviewCallback((data, unused) -> decode(data, size.width, size.height));
                    camera.startPreview();
                } catch (Exception error) {
                    stopScanner();
                    js("window.onPairing(null,'Kameraet kunne ikke åpnes.')");
                }
            }
            @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}
            @Override public void surfaceDestroyed(SurfaceHolder holder) { releaseCamera(); }
        });
    }

    private void decode(byte[] frame, int width, int height) {
        if (!decoding.compareAndSet(false, true)) return;
        byte[] luminance = java.util.Arrays.copyOf(frame, width * height);
        workers.execute(() -> {
            try {
                PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(luminance, width, height, 0, 0, width, height, false);
                String scanned = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
                if (scanned.startsWith("chatomp://pair/") || scanned.startsWith("chatomp://thread/")) {
                    runOnUiThread(() -> { stopScanner(); handleLink(scanned, false); });
                }
            } catch (Exception ignored) {
            } finally { decoding.set(false); }
        });
    }

    private void releaseCamera() {
        if (camera != null) {
            camera.setPreviewCallback(null);
            camera.release();
            camera = null;
        }
    }

    private void stopScanner() {
        releaseCamera();
        if (scanner != null) { root.removeView(scanner); scanner = null; }
    }

    @Override protected void onPause() { super.onPause(); stopScanner(); speech.stop(); }
    @Override protected void onResume() { super.onResume(); if (pageReady) js("window.onResumeApp()"); }

    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        if (request != 2 || result != RESULT_OK || intent == null || intent.getData() == null) return;
        Uri image = intent.getData();
        workers.execute(() -> {
            try {
                String mime = getContentResolver().getType(image);
                if (mime == null || !mime.matches("image/(png|jpeg|webp|gif)")) throw new IllegalStateException("Bruk PNG, JPEG, WebP eller GIF.");
                byte[] chunk = new byte[8192];
                java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
                try (java.io.InputStream input = getContentResolver().openInputStream(image)) {
                    if (input == null) throw new IllegalStateException("Kunne ikke lese bildet.");
                    for (int read; (read = input.read(chunk)) != -1;) {
                        if (buffer.size() + read > 650000) throw new IllegalStateException("Bildet kan være opptil 650 kB.");
                        buffer.write(chunk, 0, read);
                    }
                }
                JSONObject data = new JSONObject().put("type", "image").put("mimeType", mime)
                    .put("data", android.util.Base64.encodeToString(buffer.toByteArray(), android.util.Base64.NO_WRAP));
                js("window.onAttachment(" + JSONObject.quote(data.toString()) + ",null)");
            } catch (Exception error) {
                js("window.onAttachment(null," + JSONObject.quote(message(error)) + ")");
            }
        });
    }

    @Override public void onBackPressed() {
        if (scanner != null) stopScanner();
        else web.evaluateJavascript("window.androidBack()", result -> { if ("false".equals(result)) finish(); });
    }

    @Override protected void onDestroy() {
        speech.close();
        stopScanner();
        stopEvents();
        workers.shutdownNow();
        eventWorkers.shutdownNow();
        web.removeJavascriptInterface("Native");
        web.destroy();
        super.onDestroy();
    }
}
