package net.nimay.chatompomp;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.Locale;
import java.util.Set;

final class MessageSpeech {
    interface Listener { void completed(String id, String error); }

    private final Context context;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech engine;
    private boolean ready;
    private boolean closed;
    private String active;
    private String pending;

    MessageSpeech(Context context, Listener listener) {
        this.context = context;
        this.listener = listener;
    }

    void read(String id, String text) {
        stop();
        if (closed || text == null || text.trim().isEmpty() || text.length() > 1048576) {
            listener.completed(id, "Meldingen kan ikke leses opp.");
            return;
        }
        active = id;
        pending = text;
        if (ready) speak();
        else if (engine == null) engine = new TextToSpeech(context, status -> main.post(() -> initialize(status, 6)));
    }

    private void initialize(int status, int attempts) {
        if (closed) return;
        boolean hasVoice = status == TextToSpeech.SUCCESS && selectVoice();
        if (!hasVoice && status == TextToSpeech.SUCCESS && attempts > 0) {
            main.postDelayed(() -> initialize(status, attempts - 1), 350);
            return;
        }
        if (!hasVoice) {
            engine.shutdown();
            engine = null;
            if (active != null) finish(active, "Installer en lokal talestemme i Android-innstillingene.");
            return;
        }
        engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utterance) {}
            @Override public void onDone(String utterance) {
                if (utterance.endsWith(":last")) main.post(() -> finish(requestId(utterance), null));
            }
            @Override public void onError(String utterance) {
                main.post(() -> {
                    if (requestId(utterance).equals(active)) {
                        engine.stop();
                        finish(active, "Kunne ikke lese opp meldingen.");
                    }
                });
            }
        });
        ready = true;
        if (active != null) speak();
    }

    private boolean selectVoice() {
        Set<Voice> voices = engine.getVoices();
        if (voices == null) return false;
        Voice selected = null;
        int best = -1;
        for (Voice voice : voices) {
            Set<String> features = voice.getFeatures();
            if (voice.isNetworkConnectionRequired() || (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))) continue;
            String language = voice.getLocale().getLanguage();
            int score = language.matches("nb|no|nn") ? 3 : language.equals(Locale.getDefault().getLanguage()) ? 2 :
                language.equals("en") ? 1 : 0;
            if (score > best) { best = score; selected = voice; }
        }
        return selected != null && engine.setVoice(selected) == TextToSpeech.SUCCESS;
    }

    private void speak() {
        String text = pending;
        pending = null;
        int limit = Math.min(TextToSpeech.getMaxSpeechInputLength(), 3500);
        for (int start = 0; start < text.length();) {
            int end = Math.min(text.length(), start + limit);
            if (end < text.length()) {
                int space = text.lastIndexOf(' ', end - 1);
                if (space > start) end = space + 1;
                else if (Character.isHighSurrogate(text.charAt(end - 1))) end--;
            }
            String part = text.substring(start, end);
            String utterance = active + ":" + (end == text.length() ? "last" : start);
            if (engine.speak(part, start == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, utterance) == TextToSpeech.ERROR) {
                engine.stop();
                finish(active, "Kunne ikke lese opp meldingen.");
                return;
            }
            start = end;
        }
    }

    private static String requestId(String utterance) { return utterance.split(":", 2)[0]; }

    private void finish(String id, String error) {
        if (!id.equals(active)) return;
        active = pending = null;
        listener.completed(id, error);
    }

    void stop() {
        if (ready) engine.stop();
        if (active != null) finish(active, null);
    }

    void close() {
        stop();
        closed = true;
        if (engine != null) engine.shutdown();
    }
}
