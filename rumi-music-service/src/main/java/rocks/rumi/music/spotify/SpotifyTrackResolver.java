package rocks.rumi.music.spotify;

import rocks.rumi.music.cache.CacheService;

public final class SpotifyTrackResolver {
    private final SpotifyApiService apiService;
    private final SearchScorer scorer;
    private final CacheService cacheService;

    public SpotifyTrackResolver(SpotifyApiService apiService, SearchScorer scorer, CacheService cacheService) {
        this.apiService = apiService;
        this.scorer = scorer;
        this.cacheService = cacheService;
    }

    public String resolve(String query) {
        if (query == null || query.isBlank()) return "";
        String cacheKey = "spotify:" + query.toLowerCase();
        String cached = cacheService.get(cacheKey);
        if (cached != null) return cached;

        String resolved = buildResolvableIdentifier(query);

        cacheService.put(cacheKey, resolved, 900);
        return resolved;
    }

    public String describe(String query) {
        if (query == null || query.isBlank()) return "Nothing to resolve.";
        String resolved = resolve(query);
        double confidence = scorer.score(query, query);
        if (!apiService.configured()) {
            return "Spotify credentials are not configured, so I am using a fallback search for `" + query + "`.";
        }
        return "Resolved Spotify request for `" + query + "` as `" + resolved + "` with confidence " + String.format("%.2f", confidence) + ".";
    }

    private String buildResolvableIdentifier(String query) {
        String trimmed = query.trim();
        if (trimmed.startsWith("ytsearch:") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        String cleaned = trimmed
            .replace("spotify:track:", "")
            .replace("spotify:album:", "")
            .replace("spotify:playlist:", "")
            .replace("https://open.spotify.com/track/", "")
            .replace("https://open.spotify.com/album/", "")
            .replace("https://open.spotify.com/playlist/", "")
            .replaceAll("\\?.*$", "")
            .replace('-', ' ')
            .trim();
        return "ytsearch:" + (cleaned.isBlank() ? trimmed : cleaned);
    }
}
