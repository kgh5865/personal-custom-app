package com.personal.lifeapp;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 다운로드된 APK 를 OS 표준 설치 다이얼로그로 넘기는 플러그인.
 * Android 8+ 에서는 REQUEST_INSTALL_PACKAGES 권한과 함께
 * 사용자가 "출처를 알 수 없는 앱" 을 허용해야 한다.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        } else {
            allowed = true; // Pre-Oreo: 설치 시 시스템 다이얼로그만 뜸
        }
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("설정 화면을 열지 못했습니다: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("path 파라미터가 필요합니다");
            return;
        }
        // JS 는 file:// URI 또는 절대 경로를 넘길 수 있음
        File apk;
        try {
            if (path.startsWith("file://")) {
                apk = new File(Uri.parse(path).getPath());
            } else {
                apk = new File(path);
            }
        } catch (Exception e) {
            call.reject("APK 경로를 해석할 수 없습니다: " + e.getMessage(), e);
            return;
        }
        if (!apk.exists()) {
            call.reject("APK 파일을 찾을 수 없습니다: " + apk.getAbsolutePath());
            return;
        }
        try {
            String authority = getContext().getPackageName() + ".fileprovider";
            Uri uri = FileProvider.getUriForFile(getContext(), authority, apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("설치 다이얼로그를 열지 못했습니다: " + e.getMessage(), e);
        }
    }
}
