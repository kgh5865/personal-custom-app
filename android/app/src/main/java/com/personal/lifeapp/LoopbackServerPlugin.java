package com.personal.lifeapp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;

/**
 * RFC 8252 loopback OAuth 콜백 수신용 로컬 HTTP 서버.
 * Codex OAuth 클라이언트가 redirect_uri 로 http://localhost:1455/auth/callback 만 허용하므로
 * 안드로이드에서도 동일 포트로 서버를 띄워 브라우저 리다이렉트를 잡는다.
 *
 * JS 에서 addListener("callback", cb) 로 콜백 URL 파라미터를 받는다.
 * 응답 HTML 에 meta refresh 로 personal-life-app://oauth/done 딥링크를 심어
 * Custom Tabs 를 닫고 앱을 다시 포그라운드로 데려온다.
 */
@CapacitorPlugin(name = "LoopbackServer")
public class LoopbackServerPlugin extends Plugin {
    private ServerSocket serverSocket;
    private Thread serverThread;

    @PluginMethod
    public void start(PluginCall call) {
        int port = call.getInt("port", 1455);
        stopServer();
        try {
            serverSocket = new ServerSocket(port, 1, InetAddress.getByName("127.0.0.1"));
        } catch (Exception e) {
            call.reject("failed to bind loopback port " + port + ": " + e.getMessage(), e);
            return;
        }
        final ServerSocket boundSocket = serverSocket;
        serverThread = new Thread(() -> {
            while (!boundSocket.isClosed()) {
                try {
                    Socket client = boundSocket.accept();
                    handle(client);
                } catch (Exception ignored) {
                    // socket closed or transient error — exit loop on close, continue otherwise
                    if (boundSocket.isClosed()) return;
                }
            }
        }, "oauth-loopback");
        serverThread.setDaemon(true);
        serverThread.start();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopServer();
        call.resolve();
    }

    private void stopServer() {
        try {
            if (serverSocket != null && !serverSocket.isClosed()) serverSocket.close();
        } catch (Exception ignored) {}
        serverSocket = null;
        serverThread = null;
    }

    private void handle(Socket client) {
        try {
            BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream()));
            String requestLine = in.readLine();
            String path = "/";
            if (requestLine != null) {
                String[] parts = requestLine.split(" ");
                if (parts.length >= 2) path = parts[1];
            }
            // consume rest of headers (best-effort)
            String line;
            while ((line = in.readLine()) != null && !line.isEmpty()) { /* skip */ }

            Map<String, String> params = parseQuery(path);
            JSObject data = new JSObject();
            data.put("path", path);
            data.put("code", params.getOrDefault("code", ""));
            data.put("state", params.getOrDefault("state", ""));
            data.put("error", params.getOrDefault("error", ""));
            data.put("errorDescription", params.getOrDefault("error_description", ""));
            notifyListeners("callback", data);

            String body = "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\">"
                    + "<title>연결됨</title>"
                    + "<meta http-equiv=\"refresh\" content=\"0;url=personal-life-app://oauth/done\">"
                    + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                    + "<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
                    + "text-align:center;padding:3em 1.5em;color:#191F28;background:#F2F4F6}"
                    + "h2{font-weight:700;margin:0 0 0.6em}p{color:#8B95A1;margin:0}"
                    + "a{color:#3182F6;font-weight:700;text-decoration:none}</style></head>"
                    + "<body><h2>연결되었습니다.</h2>"
                    + "<p>앱으로 돌아갑니다...</p>"
                    + "<p style=\"margin-top:2em\"><a href=\"personal-life-app://oauth/done\">앱 열기</a></p>"
                    + "</body></html>";
            byte[] bodyBytes = body.getBytes("UTF-8");
            OutputStream out = client.getOutputStream();
            String header = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: text/html; charset=utf-8\r\n"
                    + "Content-Length: " + bodyBytes.length + "\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(header.getBytes("UTF-8"));
            out.write(bodyBytes);
            out.flush();
        } catch (Exception ignored) {
        } finally {
            try { client.close(); } catch (Exception ignored) {}
        }
    }

    private Map<String, String> parseQuery(String path) {
        Map<String, String> map = new HashMap<>();
        int q = path.indexOf('?');
        if (q < 0) return map;
        String query = path.substring(q + 1);
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            try {
                String k = URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                String v = URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                map.put(k, v);
            } catch (Exception ignored) {}
        }
        return map;
    }
}
