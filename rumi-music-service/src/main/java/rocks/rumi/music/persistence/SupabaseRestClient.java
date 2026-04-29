package rocks.rumi.music.persistence;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
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
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class SupabaseRestClient {
    private final MusicConfig config;
    private final HttpClient httpClient;
    private final Gson gson = new Gson();

    public SupabaseRestClient(MusicConfig config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    public boolean configured() {
        return config.supabaseConfigured();
    }

    public JsonElement getKv(String namespace, String key) {
        if (!configured()) return null;
        String query = "namespace=eq." + encode(namespace) + "&key=eq." + encode(key) + "&select=value";
        HttpRequest request = baseRequest("/rest/v1/bot_kv?" + query)
            .GET()
            .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) return null;
            JsonArray rows = JsonParser.parseString(response.body()).getAsJsonArray();
            if (rows.isEmpty()) return null;
            return rows.get(0).getAsJsonObject().get("value");
        } catch (IOException | InterruptedException ignored) {
            return null;
        }
    }

    public List<Map.Entry<String, JsonElement>> listNamespace(String namespace, int limit) {
        List<Map.Entry<String, JsonElement>> output = new ArrayList<>();
        if (!configured()) return output;
        String query = "namespace=eq." + encode(namespace) + "&select=key,value&limit=" + Math.max(1, limit);
        HttpRequest request = baseRequest("/rest/v1/bot_kv?" + query)
            .GET()
            .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) return output;
            JsonArray rows = JsonParser.parseString(response.body()).getAsJsonArray();
            for (JsonElement row : rows) {
                JsonObject object = row.getAsJsonObject();
                output.add(Map.entry(object.get("key").getAsString(), object.get("value")));
            }
        } catch (IOException | InterruptedException ignored) {
            return output;
        }
        return output;
    }

    public boolean setKv(String namespace, String key, Object value) {
        if (!configured()) return false;
        JsonObject payload = new JsonObject();
        payload.addProperty("namespace", namespace);
        payload.addProperty("key", key);
        payload.add("value", gson.toJsonTree(value));
        payload.addProperty("updated_at", java.time.Instant.now().toString());

        HttpRequest request = baseRequest("/rest/v1/bot_kv?on_conflict=namespace,key")
            .header("Prefer", "resolution=merge-duplicates")
            .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(payload)))
            .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() / 100 == 2;
        } catch (IOException | InterruptedException ignored) {
            return false;
        }
    }

    public boolean deleteKv(String namespace, String key) {
        if (!configured()) return false;
        String query = "namespace=eq." + encode(namespace) + "&key=eq." + encode(key);
        HttpRequest request = baseRequest("/rest/v1/bot_kv?" + query)
            .DELETE()
            .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() / 100 == 2;
        } catch (IOException | InterruptedException ignored) {
            return false;
        }
    }

    private HttpRequest.Builder baseRequest(String path) {
        return HttpRequest.newBuilder(URI.create(config.supabaseUrl() + path))
            .timeout(Duration.ofSeconds(15))
            .header("apikey", config.supabaseServiceRoleKey())
            .header("Authorization", "Bearer " + config.supabaseServiceRoleKey())
            .header("Content-Type", "application/json");
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
