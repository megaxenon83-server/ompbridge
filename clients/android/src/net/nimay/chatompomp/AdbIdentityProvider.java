package net.nimay.chatompomp;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Binder;
import java.util.UUID;

public final class AdbIdentityProvider extends ContentProvider {
    static synchronized String identity(Context context) {
        SharedPreferences preferences = context.getSharedPreferences("adb-identity", Context.MODE_PRIVATE);
        String value = preferences.getString("id", "");
        if (!value.isEmpty()) return value;
        value = UUID.randomUUID().toString();
        preferences.edit().putString("id", value).apply();
        return value;
    }

    @Override public boolean onCreate() { return true; }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        if (Binder.getCallingUid() != 2000 || !"/identity".equals(uri.getPath())) {
            throw new SecurityException("ADB shell only");
        }
        MatrixCursor result = new MatrixCursor(new String[] { "omp_id" });
        result.addRow(new Object[] { identity(getContext()) });
        return result;
    }

    @Override public String getType(Uri uri) { return null; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
