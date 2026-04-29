package rocks.rumi.music.http;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import rocks.rumi.music.config.MusicConfig;
import rocks.rumi.music.model.CommandResult;
import rocks.rumi.music.player.MusicManager;
import rocks.rumi.music.spotify.SpotifyOAuthClient;
import rocks.rumi.music.spotify.SpotifyOAuthService;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public final class HealthServer {
    private final HttpServer server;
    private final MusicConfig config;
    private final MusicManager musicManager;
    private final SpotifyOAuthService spotifyOAuthService;
    private final Gson gson = new Gson();

    public HealthServer(MusicConfig config, MusicManager musicManager, SpotifyOAuthService spotifyOAuthService) throws IOException {
        this.config = config;
        this.musicManager = musicManager;
        this.spotifyOAuthService = spotifyOAuthService;
        this.server = HttpServer.create(new InetSocketAddress(config.port()), 0);
        this.server.createContext("/health", this::handleHealth);
        this.server.createContext("/api/command", this::handleCommand);
        this.server.createContext("/api/state", this::handleState);
        this.server.createContext("/api/spotify/link", this::handleSpotifyLink);
        this.server.createContext("/api/spotify/callback", this::handleSpotifyCallback);
        this.server.createContext("/api/spotify/unlink", this::handleSpotifyUnlink);
    }

    public void start() {
        server.start();
        System.out.printf("[rumi-music] health server listening on %d%n", config.port());
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
                String body = """
            {
              "ok": true,
              "service": "rumi-music-service",
              "supabaseConfigured": %s,
              "spotifyConfigured": %s,
                            "spotifyOAuthConfigured": %s,
              "googleConfigured": %s,
              "lavalinkConfigured": %s
            }
            """.formatted(
                config.supabaseConfigured(),
                config.spotifyConfigured(),
                                config.spotifyOAuthConfigured(),
                config.googleConfigured(),
                config.lavalinkConfigured()
            ).trim();

        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

    private void handleCommand(HttpExchange exchange) throws IOException {
        if (!isAuthorized(exchange) || !"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            writeJson(exchange, 401, Map.of("ok", false, "error", "Unauthorized"));
            return;
        }

        JsonObject body = parseBody(exchange.getRequestBody());
        long guildId = body.has("guildId") ? body.get("guildId").getAsLong() : 0L;
        String command = body.has("command") ? body.get("command").getAsString() : "";
        JsonObject optionsObject = body.has("options") && body.get("options").isJsonObject()
            ? body.getAsJsonObject("options")
            : new JsonObject();
        Map<String, String> options = new HashMap<>();
        for (Map.Entry<String, com.google.gson.JsonElement> entry : optionsObject.entrySet()) {
            options.put(entry.getKey(), entry.getValue().getAsString());
        }

        CommandResult result = musicManager.handle(guildId, command, options);
        writeJson(exchange, 200, Map.of(
            "ok", true,
            "title", result.title(),
            "description", result.description(),
            "ephemeral", result.ephemeral(),
            "color", result.color(),
            "thumbnail", result.thumbnail() == null ? "" : result.thumbnail(),
            "footer", result.footer() == null ? "" : result.footer(),
            "fields", result.fields() == null ? java.util.List.of() : result.fields()
        ));
    }

    private void handleState(HttpExchange exchange) throws IOException {
        if (!isAuthorized(exchange) || !"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            writeJson(exchange, 401, Map.of("ok", false, "error", "Unauthorized"));
            return;
        }
        Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
        long guildId = Long.parseLong(query.getOrDefault("guildId", "0"));
        CommandResult result = musicManager.status(guildId);
        writeJson(exchange, 200, Map.of(
            "ok", true,
            "title", result.title(),
            "description", result.description(),
            "ephemeral", result.ephemeral(),
            "color", result.color(),
            "thumbnail", result.thumbnail() == null ? "" : result.thumbnail(),
            "footer", result.footer() == null ? "" : result.footer(),
            "fields", result.fields() == null ? java.util.List.of() : result.fields()
        ));
    }

    private void handleSpotifyLink(HttpExchange exchange) throws IOException {
        if (!isAuthorized(exchange) || !"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            writeJson(exchange, 401, Map.of("ok", false, "error", "Unauthorized"));
            return;
        }
        JsonObject body = parseBody(exchange.getRequestBody());
        long userId = body.has("userId") ? body.get("userId").getAsLong() : 0L;
        if (userId <= 0) {
            writeJson(exchange, 400, Map.of("ok", false, "error", "I need a userId."));
            return;
        }
        if (!spotifyOAuthService.canStartLink()) {
            writeJson(exchange, 503, Map.of(
                "ok", false,
                "error", "Spotify OAuth is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and a public SPOTIFY_REDIRECT_URI or RUMI_MUSIC_SERVICE_PUBLIC_URL."
            ));
            return;
        }
        writeJson(exchange, 200, Map.of(
            "ok", true,
            "authorizeUrl", spotifyOAuthService.createAuthorizationUrl(userId),
            "message", "Open the link to finish connecting your Spotify account."
        ));
    }

    private void handleSpotifyCallback(HttpExchange exchange) throws IOException {
        Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
        String code = query.getOrDefault("code", "");
        String state = query.getOrDefault("state", "");
        String spotifyError = query.getOrDefault("error", "");

        if (!spotifyError.isBlank()) {
            writeHtml(exchange, 400, spotifyHtml("Spotify link failed", "Spotify returned: " + escapeHtml(spotifyError)));
            return;
        }

        if (code.isBlank() || state.isBlank()) {
            writeHtml(exchange, 400, spotifyHtml("Spotify link failed", "The callback did not include the expected code and state."));
            return;
        }

        try {
            SpotifyOAuthClient.OAuthCompletion completion = spotifyOAuthService.completeAuthorizationCode(code, state);
            String label = completion.spotifyDisplayName().isBlank()
                ? completion.spotifyUserId()
                : completion.spotifyDisplayName() + " (" + completion.spotifyUserId() + ")";
            writeHtml(exchange, 200, spotifyHtml(
                "Spotify linked",
                "Your Spotify account is now linked as " + escapeHtml(label) + ". You can return to Discord and run /spotify status."
            ));
        } catch (IllegalArgumentException exception) {
            writeHtml(exchange, 400, spotifyHtml("Spotify link failed", escapeHtml(exception.getMessage())));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            writeHtml(exchange, 503, spotifyHtml("Spotify link failed", "The Spotify token exchange was interrupted."));
        } catch (Exception exception) {
            writeHtml(exchange, 503, spotifyHtml("Spotify link failed", escapeHtml(exception.getMessage() == null ? "Unknown error." : exception.getMessage())));
        }
    }

    private void handleSpotifyUnlink(HttpExchange exchange) throws IOException {
        if (!isAuthorized(exchange) || !"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            writeJson(exchange, 401, Map.of("ok", false, "error", "Unauthorized"));
            return;
        }
        JsonObject body = parseBody(exchange.getRequestBody());
        long userId = body.has("userId") ? body.get("userId").getAsLong() : 0L;
        writeJson(exchange, 200, Map.of("ok", spotifyOAuthService.unlink(userId)));
    }

    private JsonObject parseBody(InputStream inputStream) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        inputStream.transferTo(output);
        String body = output.toString(StandardCharsets.UTF_8);
        if (body.isBlank()) return new JsonObject();
        return JsonParser.parseString(body).getAsJsonObject();
    }

    private Map<String, String> parseQuery(String raw) {
        Map<String, String> query = new HashMap<>();
        if (raw == null || raw.isBlank()) return query;
        for (String pair : raw.split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2) {
                query.put(parts[0], java.net.URLDecoder.decode(parts[1], StandardCharsets.UTF_8));
            }
        }
        return query;
    }

    private boolean isAuthorized(HttpExchange exchange) {
        if (config.sharedSecret().isBlank()) return true;
        String provided = exchange.getRequestHeaders().getFirst("x-rumi-shared-secret");
        return config.sharedSecret().equals(provided);
    }

    private void writeJson(HttpExchange exchange, int status, Object value) throws IOException {
        byte[] bytes = gson.toJson(value).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(bytes);
        }
    }

        private void writeHtml(HttpExchange exchange, int status, String html) throws IOException {
            byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(bytes);
            }
        }

        private String spotifyHtml(String title, String body) {
            return """
                <!doctype html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>%s</title>
                  <style>
                    body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; min-height: 100vh; display: grid; place-items: center; }
                    main { max-width: 720px; padding: 32px; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
                    h1 { margin-top: 0; font-size: 28px; }
                    p { line-height: 1.6; color: #cbd5e1; }
                  </style>
                </head>
                <body>
                  <main>
                    <h1>%s</h1>
                    <p>%s</p>
                  </main>
                </body>
                </html>
                """.formatted(escapeHtml(title), escapeHtml(title), body);
        }

        private String escapeHtml(String value) {
            if (value == null || value.isBlank()) {
                return "";
            }
            return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
        }
}
