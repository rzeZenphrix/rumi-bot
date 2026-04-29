package rocks.rumi.music.config;

public record MusicConfig(
    String discordToken,
    String discordClientId,
    int port,
    String publicUrl,
    String supabaseUrl,
    String supabaseServiceRoleKey,
    String lavalinkUrl,
    String lavalinkPassword,
    String lavalinkResumeKey,
    String spotifyClientId,
    String spotifyClientSecret,
    String spotifyMarket,
    String googleApiKey,
    String botApiUrl,
    String sharedSecret,
    boolean registerSlashCommands,
    boolean listenSlashInteractions
) {
    public static MusicConfig fromEnv() {
        return new MusicConfig(
            env("DISCORD_TOKEN"),
            env("DISCORD_CLIENT_ID"),
            envInt("RUMI_MUSIC_SERVICE_PORT", 3025),
            envOr("RUMI_MUSIC_SERVICE_PUBLIC_URL", "http://localhost:3025"),
            envOr("SUPABASE_URL", ""),
            envOr("SUPABASE_SERVICE_ROLE_KEY", ""),
            envOr("LAVALINK_URL", ""),
            envOr("LAVALINK_PASSWORD", ""),
            envOr("LAVALINK_RESUME_KEY", "rumi-music"),
            envOr("SPOTIFY_CLIENT_ID", ""),
            envOr("SPOTIFY_CLIENT_SECRET", ""),
            envOr("SPOTIFY_MARKET", "GB"),
            envOr("GOOGLE_API_KEY", envOr("YOUTUBE_API_KEY", "")),
            envOr("RUMI_BOT_API_URL", ""),
            envOr("RUMI_SHARED_SECRET", ""),
            envBool("RUMI_MUSIC_REGISTER_SLASH", true),
            envBool("RUMI_MUSIC_LISTEN_SLASH", true)
        );
    }

    public String spotifyRedirectUri() {
        String explicit = envOr("SPOTIFY_REDIRECT_URI", "");
        if (!explicit.isBlank()) {
            return explicit;
        }

        if (publicUrl == null || publicUrl.isBlank()) {
            return "";
        }

        return publicUrl.replaceAll("/+$", "") + "/api/spotify/callback";
    }

    public boolean spotifyOAuthConfigured() {
        return spotifyConfigured() && !spotifyRedirectUri().isBlank();
    }

    public boolean spotifyConfigured() {
        return !spotifyClientId.isBlank() && !spotifyClientSecret.isBlank();
    }

    public boolean lavalinkConfigured() {
        return !lavalinkUrl.isBlank() && !lavalinkPassword.isBlank();
    }

    public boolean supabaseConfigured() {
        return !supabaseUrl.isBlank() && !supabaseServiceRoleKey.isBlank();
    }

    public boolean googleConfigured() {
        return !googleApiKey.isBlank();
    }

    public java.util.List<String> lavalinkNodes() {
        String raw = envOr("LAVALINK_NODES", "");
        if (raw.isBlank()) {
            return lavalinkConfigured() ? java.util.List.of(lavalinkUrl) : java.util.List.of();
        }
        return java.util.Arrays.stream(raw.split(","))
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .toList();
    }

    private static String env(String key) {
        return envOr(key, "");
    }

    private static String envOr(String key, String fallback) {
        String value = System.getenv(key);
        return value == null ? fallback : value.trim();
    }

    private static int envInt(String key, int fallback) {
        try {
            return Integer.parseInt(envOr(key, String.valueOf(fallback)));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static boolean envBool(String key, boolean fallback) {
        String raw = envOr(key, "");
        if (raw.isBlank()) return fallback;
        return switch (raw.trim().toLowerCase()) {
            case "1", "true", "yes", "on" -> true;
            case "0", "false", "no", "off" -> false;
            default -> fallback;
        };
    }
}
