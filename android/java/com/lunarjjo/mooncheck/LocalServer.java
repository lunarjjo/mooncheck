package com.lunarjjo.mooncheck;

import android.content.res.AssetManager;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * mooncheck — server HTTP loopback mini.
 *
 * Melayani aset aplikasi di 127.0.0.1:<port>/<token>/...
 * - Secure context (crypto.subtle & getUserMedia hidup di WebView).
 * - Token acak per sesi menolak aplikasi lain di perangkat yang sama.
 * - Hanya metode GET; path disanitasi (anti traversal "..").
 */
public class LocalServer {

    private final AssetManager assets;
    private final String token;
    private volatile int port = -1;
    private volatile boolean running = false;
    private ServerSocket serverSocket;
    private ExecutorService pool;

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("htm", "text/html; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("js", "application/javascript; charset=utf-8");
        MIME.put("mjs", "application/javascript; charset=utf-8");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("gif", "image/gif");
        MIME.put("webp", "image/webp");
        MIME.put("ico", "image/x-icon");
        MIME.put("txt", "text/plain; charset=utf-8");
        MIME.put("woff", "font/woff");
        MIME.put("woff2", "font/woff2");
    }

    public LocalServer(AssetManager assets) {
        this.assets = assets;
        byte[] t = new byte[16];
        new SecureRandom().nextBytes(t);
        StringBuilder sb = new StringBuilder();
        for (byte b : t) sb.append(String.format("%02x", b));
        this.token = sb.toString();
    }

    public void start() {
        if (running) return;
        int[] ports = {8471, 8472, 8473, 8474, 8475, 0};
        for (int p : ports) {
            try {
                serverSocket = new ServerSocket(p, 8, java.net.InetAddress.getByName("127.0.0.1"));
                port = serverSocket.getLocalPort();
                running = true;
                pool = Executors.newFixedThreadPool(3);
                Thread acceptor = new Thread(new Runnable() {
                    @Override
                    public void run() {
                        acceptLoop();
                    }
                }, "mooncheck-server");
                acceptor.setDaemon(true);
                acceptor.start();
                return;
            } catch (IOException ignored) {
                // coba port berikutnya
            }
        }
        port = -1;
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket sock = serverSocket.accept();
                pool.execute(new Runnable() {
                    @Override
                    public void run() {
                        handle(sock);
                    }
                });
            } catch (IOException e) {
                if (running) {
                    // server socket ditutup saat stop() — keluar senyap
                }
            }
        }
    }

    private void handle(Socket sock) {
        try {
            sock.setSoTimeout(8000);
            java.io.BufferedReader in = new java.io.BufferedReader(
                    new java.io.InputStreamReader(sock.getInputStream(), "UTF-8"));
            String line = in.readLine();
            if (line == null) {
                sock.close();
                return;
            }
            String[] parts = line.split(" ");
            if (parts.length < 2 || !"GET".equals(parts[0])) {
                writeSimple(sock, 405, "Method Not Allowed", "text/plain");
                return;
            }
            String raw = parts[1];
            int q = raw.indexOf('?');
            if (q >= 0) raw = raw.substring(0, q);
            String path = java.net.URLDecoder.decode(raw, "UTF-8");

            if (!path.startsWith("/" + token + "/") && !path.equals("/" + token)) {
                writeSimple(sock, 403, "Forbidden", "text/plain");
                return;
            }
            String rel = path.equals("/" + token) ? "index.html"
                    : path.substring(("/" + token + "/").length());

            if (rel.isEmpty()) rel = "index.html";
            // sanitisasi traversal
            if (rel.contains("..") || rel.startsWith("/") || rel.contains("\\")) {
                writeSimple(sock, 400, "Bad Request", "text/plain");
                return;
            }
            if (rel.endsWith("/")) rel += "index.html";

            byte[] body = readAsset(rel);
            if (body == null) {
                // SPA fallback: rute hash tidak butuh ini, tapi jalur bersih → index
                writeSimple(sock, 404, "Not Found", "text/plain");
                return;
            }
            String ext = rel.substring(rel.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            OutputStream out = sock.getOutputStream();
            String head = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: " + mime + "\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(head.getBytes("UTF-8"));
            out.write(body);
            out.flush();
            sock.close();
        } catch (Exception ignored) {
            try {
                sock.close();
            } catch (Exception ignored2) {
            }
        }
    }

    private byte[] readAsset(String rel) {
        InputStream is = null;
        try {
            is = assets.open(rel);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toByteArray();
        } catch (IOException e) {
            return null;
        } finally {
            if (is != null) {
                try {
                    is.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    private void writeSimple(Socket sock, int code, String status, String mime) {
        try {
            OutputStream out = sock.getOutputStream();
            String body = status;
            String head = "HTTP/1.1 " + code + " " + status + "\r\n"
                    + "Content-Type: " + mime + "; charset=utf-8\r\n"
                    + "Content-Length: " + body.getBytes("UTF-8").length + "\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(head.getBytes("UTF-8"));
            out.write(body.getBytes("UTF-8"));
            out.flush();
            sock.close();
        } catch (Exception ignored) {
        }
    }

    public String baseHttpUrl() {
        return "http://127.0.0.1:" + port + "/" + token;
    }

    public void stop() {
        running = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {
        }
        if (pool != null) pool.shutdownNow();
    }
}
