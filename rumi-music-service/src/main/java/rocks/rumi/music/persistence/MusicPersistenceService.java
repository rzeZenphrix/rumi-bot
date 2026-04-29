package rocks.rumi.music.persistence;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import rocks.rumi.music.player.GuildMusicPlayer;
import rocks.rumi.music.settings.SettingsService;

import java.util.List;
import java.util.Map;

public final class MusicPersistenceService {
    private static final String PLAYER_NAMESPACE = "music:players";
    private static final String SETTINGS_NAMESPACE = "music:settings";
    private static final String SPOTIFY_LINK_NAMESPACE = "music:spotify-links";

    private final SupabaseRestClient client;
    private final Gson gson = new Gson();

    public MusicPersistenceService(SupabaseRestClient client) {
        this.client = client;
    }

    public boolean configured() {
        return client.configured();
    }

    public void savePlayer(GuildMusicPlayer player) {
        client.setKv(PLAYER_NAMESPACE, String.valueOf(player.guildId()), PlayerState.from(player));
    }

    public void saveSettings(long guildId, SettingsService.GuildSettings settings) {
        client.setKv(SETTINGS_NAMESPACE, String.valueOf(guildId), SettingsState.from(settings));
    }

    public List<Map.Entry<String, JsonElement>> listPlayers() {
        return client.listNamespace(PLAYER_NAMESPACE, 500);
    }

    public GuildMusicPlayer loadPlayer(long guildId) {
        JsonElement value = client.getKv(PLAYER_NAMESPACE, String.valueOf(guildId));
        if (value == null || value.isJsonNull()) return null;
        PlayerState state = gson.fromJson(value, PlayerState.class);
        return state == null ? null : state.toPlayer(guildId);
    }

    public SettingsService.GuildSettings loadSettings(long guildId) {
        JsonElement value = client.getKv(SETTINGS_NAMESPACE, String.valueOf(guildId));
        if (value == null || value.isJsonNull()) return null;
        SettingsState state = gson.fromJson(value, SettingsState.class);
        return state == null ? null : state.toSettings();
    }

    public void saveSpotifyLink(long userId, SpotifyLinkState link) {
        client.setKv(SPOTIFY_LINK_NAMESPACE, String.valueOf(userId), link);
    }

    public SpotifyLinkState loadSpotifyLink(long userId) {
        JsonElement value = client.getKv(SPOTIFY_LINK_NAMESPACE, String.valueOf(userId));
        if (value == null || value.isJsonNull()) return null;
        return gson.fromJson(value, SpotifyLinkState.class);
    }

    public void deleteSpotifyLink(long userId) {
        client.deleteKv(SPOTIFY_LINK_NAMESPACE, String.valueOf(userId));
    }

    public record SpotifyLinkState(
        String spotifyUserId,
        String spotifyDisplayName,
        String refreshToken,
        String accessToken,
        long accessTokenExpiresAt,
        String deviceId,
        String deviceName,
        boolean autosync,
        boolean followMode,
        String priority,
        String scope
    ) {
    }

    private record PlayerState(
        List<String> queue,
        List<String> history,
        String nowPlaying,
        boolean paused,
        int volume,
        String loopMode,
        boolean autoplay,
        String filter,
        long lastSeekMs,
        String boundVoiceChannelId
    ) {
        static PlayerState from(GuildMusicPlayer player) {
            return new PlayerState(
                List.copyOf(player.queue()),
                List.copyOf(player.history()),
                player.nowPlaying(),
                player.paused(),
                player.volume(),
                player.loopMode(),
                player.autoplay(),
                player.filter(),
                player.lastSeekMs(),
                player.boundVoiceChannelId()
            );
        }

        GuildMusicPlayer toPlayer(long guildId) {
            GuildMusicPlayer player = new GuildMusicPlayer(guildId);
            player.queue().addAll(queue == null ? List.of() : queue);
            player.history().addAll(history == null ? List.of() : history);
            player.setNowPlaying(nowPlaying);
            player.setPaused(paused);
            player.setVolume(volume);
            player.setLoopMode(loopMode == null ? "off" : loopMode);
            player.setAutoplay(autoplay);
            player.setFilter(filter == null ? "none" : filter);
            player.setLastSeekMs(lastSeekMs);
            player.setBoundVoiceChannelId(boundVoiceChannelId);
            return player;
        }
    }

    private record SettingsState(
        int defaultVolume,
        boolean autoplay,
        boolean announce,
        String djRoleId,
        int idleSeconds,
        String restrictMode
    ) {
        static SettingsState from(SettingsService.GuildSettings settings) {
            return new SettingsState(
                settings.defaultVolume(),
                settings.autoplay(),
                settings.announce(),
                settings.djRoleId(),
                settings.idleSeconds(),
                settings.restrictMode()
            );
        }

        SettingsService.GuildSettings toSettings() {
            SettingsService.GuildSettings settings = new SettingsService.GuildSettings();
            settings.setDefaultVolume(defaultVolume);
            settings.setAutoplay(autoplay);
            settings.setAnnounce(announce);
            settings.setDjRoleId(djRoleId);
            settings.setIdleSeconds(idleSeconds);
            settings.setRestrictMode(restrictMode);
            return settings;
        }
    }
}
