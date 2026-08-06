package com.personal.lifeapp;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android Keystore 로 보호되는 AES256-GCM 암호화 저장소.
 * @capacitor/preferences 는 평문 XML 로 저장되어 run-as 로 탈취 가능하므로
 * OAuth 토큰 등 민감 값은 이 플러그인을 통해 저장한다.
 */
@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {
    private static final String TAG = "SecureStorage";
    // 이 파일명은 res/xml/backup_rules.xml, data_extraction_rules.xml 의
    // exclude path 와 일치해야 한다. 바꾸면 그쪽도 같이 바꿀 것.
    private static final String PREF_NAME = "SecureStorage";
    private SharedPreferences prefs;

    private SharedPreferences open() throws Exception {
        MasterKey masterKey = new MasterKey.Builder(getContext())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(
                getContext(),
                PREF_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    private SharedPreferences getPrefs() throws Exception {
        if (prefs != null) return prefs;
        try {
            prefs = open();
        } catch (Exception first) {
            // Keystore 키가 무효화되면(잠금화면 변경, 백업 복원 등) 기존 암호문을
            // 영영 못 읽는다. 그대로 두면 앱이 시크릿 저장소를 못 열어 먹통이 되므로,
            // 남은 암호문을 버리고 새로 만든다. 사용자는 재로그인하면 된다.
            Log.w(TAG, "암호화 저장소를 열지 못해 초기화합니다", first);
            getContext().deleteSharedPreferences(PREF_NAME);
            prefs = open();
        }
        return prefs;
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key 파라미터가 필요합니다");
            return;
        }
        try {
            JSObject ret = new JSObject();
            ret.put("value", getPrefs().getString(key, null));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("암호화 저장소를 열지 못했습니다: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key, value 파라미터가 필요합니다");
            return;
        }
        try {
            getPrefs().edit().putString(key, value).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("암호화 저장소에 쓰지 못했습니다: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key 파라미터가 필요합니다");
            return;
        }
        try {
            getPrefs().edit().remove(key).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("암호화 저장소에서 삭제하지 못했습니다: " + e.getMessage(), e);
        }
    }
}
