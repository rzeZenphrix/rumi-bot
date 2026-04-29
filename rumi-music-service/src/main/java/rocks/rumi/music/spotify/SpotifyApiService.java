package rocks.rumi.music.spotify;

import rocks.rumi.music.config.MusicConfig;

public final class SpotifyApiService {
    private final MusicConfig config;

    public SpotifyApiService(MusicConfig config) {
        this.config = config;
    }

    public boolean configured() {
        return config.spotifyConfigured();
    }

    public String statusLine() {
        return configured()
            ? "Spotify app credentials are configured."
            : "Spotify app credentials are missing.";
    }
}
