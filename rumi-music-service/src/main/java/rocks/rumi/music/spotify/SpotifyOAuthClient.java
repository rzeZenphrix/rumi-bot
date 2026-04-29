package rocks.rumi.music.spotify;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import rocks.rumi.music.config.MusicConfig;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class SpotifyOAuthClient {
    private static final String AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
    private static final String TOKEN_URL = "https://accounts.spotify.com/api/token";
    private static final String PROFILE_URL = "https://api.spotify.com/v1/me";
    private static final String STATE_PREFIX = "rumi-spotify:";
    private static final String SCOPE = String.join(" ",
        "user-read-private",
        "user-read-email",
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "playlist-read-private",
        "playlist-read-collaborative"
    );

    private final MusicConfig config;
    private final HttpClient httpClient;
    private final SecureRandom secureRandom = new SecureRandom();

    public SpotifyOAuthClient(MusicConfig config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    public boolean configured() {
        return config.spotifyOAuthConfigured();
    }

    public String createAuthorizationUrl(long userId) {
        if (!configured()) {
            throw new IllegalStateException("Spotify OAuth is not configured.");
        }

        Map<String, String> params = new LinkedHashMap<>();
        params.put("client_id", config.spotifyClientId());
        params.put("response_type", "code");
        params.put("redirect_uri", config.spotifyRedirectUri());
        params.put("scope", SCOPE);
        params.put("state", createState(userId));
        params.put("show_dialog", "true");

        String query = params.entrySet().stream()
            .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
            .reduce((left, right) -> left + "&" + right)
            .orElse("");
        return AUTHORIZE_URL + "?" + query;
    }

    public OAuthCompletion completeAuthorizationCode(String code, String state) throws IOException, InterruptedException {
        if (!configured()) {
            throw new IllegalStateException("Spotify OAuth is not configured.");
        }

        StatePayload payload = decodeState(state);
        TokenResponse tokenResponse = exchangeCode(code);
        SpotifyProfile profile = loadProfile(tokenResponse.accessToken());

        long expiresAt = System.currentTimeMillis() + Math.max(0L, tokenResponse.expiresIn()) * 1000L;
        return new OAuthCompletion(
            payload.userId(),
            profile.id(),
            profile.displayName(),
            tokenResponse.accessToken(),
            tokenResponse.refreshToken(),
            expiresAt,
            tokenResponse.scope()
        );
    }

    private TokenResponse exchangeCode(String code) throws IOException, InterruptedException {
        String form = "grant_type=authorization_code"
            + "&code=" + encode(code)
            + "&redirect_uri=" + encode(config.spotifyRedirectUri());

        HttpRequest request = HttpRequest.newBuilder(URI.create(TOKEN_URL))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", basicAuth())
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(form))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Spotify token exchange failed with status " + response.statusCode() + ".");
        }

        JsonObject json = JsonParser.parseString(response.body()).getAsJsonObject();
        String accessToken = stringValue(json, "access_token");
        String refreshToken = stringValue(json, "refresh_token");
        long expiresIn = longValue(json, "expires_in", 3600L);
        String scope = stringValue(json, "scope");

        if (accessToken.isBlank() || refreshToken.isBlank()) {
            throw new IOException("Spotify did not return the expected tokens.");
        }

        return new TokenResponse(accessToken, refreshToken, expiresIn, scope);
    }

    private SpotifyProfile loadProfile(String accessToken) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(PROFILE_URL))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer " + accessToken)
            .GET()
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() / 100 != 2) {
            throw new IOException("Spotify profile request failed with status " + response.statusCode() + ".");
        }

        JsonObject json = JsonParser.parseString(response.body()).getAsJsonObject();
        String id = stringValue(json, "id");
        String displayName = stringValue(json, "display_name");
        if (id.isBlank()) {
            throw new IOException("Spotify did not return a profile id.");
        }

        return new SpotifyProfile(id, displayName);
    }

    private String createState(long userId) {
        long issuedAt = System.currentTimeMillis();
        long expiresAt = issuedAt + Duration.ofMinutes(15).toMillis();
        String nonce = randomToken(18);
        String payload = userId + ":" + issuedAt + ":" + expiresAt + ":" + nonce;
        String signature = sign(payload);
        return STATE_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString((payload + "." + signature).getBytes(StandardCharsets.UTF_8));
    }

    private StatePayload decodeState(String state) {
        if (state == null || !state.startsWith(STATE_PREFIX)) {
            throw new IllegalArgumentException("Spotify link state is missing.");
        }

        String raw = new String(Base64.getUrlDecoder().decode(state.substring(STATE_PREFIX.length())), StandardCharsets.UTF_8);
        int split = raw.lastIndexOf('.');
        if (split <= 0 || split >= raw.length() - 1) {
            throw new IllegalArgumentException("Spotify link state is invalid.");
        }

        String payload = raw.substring(0, split);
        String signature = raw.substring(split + 1);
        if (!MessageDigest.isEqual(signature.getBytes(StandardCharsets.UTF_8), sign(payload).getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("Spotify link state could not be verified.");
        }

        String[] parts = payload.split(":", 4);
        if (parts.length != 4) {
            throw new IllegalArgumentException("Spotify link state is malformed.");
        }

        long userId = parseLong(parts[0], "Spotify link state user id");
        long issuedAt = parseLong(parts[1], "Spotify link state issue time");
        long expiresAt = parseLong(parts[2], "Spotify link state expiry");
        if (System.currentTimeMillis() > expiresAt) {
            throw new IllegalArgumentException("Spotify link state has expired.");
        }

        return new StatePayload(userId, issuedAt, expiresAt, parts[3]);
    }

    private long parseLong(String raw, String label) {
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException(label + " is invalid.", error);
        }
    }

    private String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] output = mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(output);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to sign Spotify state.", error);
        }
    }

    private String signingSecret() {
        if (config.sharedSecret() != null && !config.sharedSecret().isBlank()) {
            return config.sharedSecret();
        }
        if (config.spotifyClientSecret() != null && !config.spotifyClientSecret().isBlank()) {
            return config.spotifyClientSecret();
        }
        throw new IllegalStateException("Spotify OAuth signing secret is missing.");
    }

    private String basicAuth() {
        String credentials = config.spotifyClientId() + ":" + config.spotifyClientSecret();
        return "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    private String randomToken(int bytes) {
        byte[] data = new byte[Math.max(8, bytes)];
        secureRandom.nextBytes(data);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private String stringValue(JsonObject json, String key) {
        return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsString() : "";
    }

    private long longValue(JsonObject json, String key, long fallback) {
        try {
            return json.has(key) && !json.get(key).isJsonNull() ? json.get(key).getAsLong() : fallback;
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private record StatePayload(long userId, long issuedAt, long expiresAt, String nonce) {
    }

    private record TokenResponse(String accessToken, String refreshToken, long expiresIn, String scope) {
    }

    private record SpotifyProfile(String id, String displayName) {
    }

    public record OAuthCompletion(
        long userId,
        String spotifyUserId,
        String spotifyDisplayName,
        String accessToken,
        String refreshToken,
        long accessTokenExpiresAt,
        String scope
    ) {
    }
}