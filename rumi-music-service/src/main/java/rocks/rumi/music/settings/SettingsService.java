package rocks.rumi.music.settings;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class SettingsService {
    private final Map<Long, GuildSettings> settings = new ConcurrentHashMap<>();

    public GuildSettings get(long guildId) {
        return settings.computeIfAbsent(guildId, ignored -> new GuildSettings());
    }

    public GuildSettings update(long guildId, java.util.function.Consumer<GuildSettings> updater) {
        GuildSettings current = get(guildId);
        updater.accept(current);
        return current;
    }

    public void restore(long guildId, GuildSettings restored) {
        if (restored == null) return;
        settings.put(guildId, restored);
    }

    public static final class GuildSettings {
        private int defaultVolume = 80;
        private boolean autoplay;
        private boolean announce = true;
        private String djRoleId = "";
        private int idleSeconds = 300;
        private String restrictMode = "off";

        public int defaultVolume() { return defaultVolume; }
        public void setDefaultVolume(int defaultVolume) { this.defaultVolume = defaultVolume; }
        public boolean autoplay() { return autoplay; }
        public void setAutoplay(boolean autoplay) { this.autoplay = autoplay; }
        public boolean announce() { return announce; }
        public void setAnnounce(boolean announce) { this.announce = announce; }
        public String djRoleId() { return djRoleId; }
        public void setDjRoleId(String djRoleId) { this.djRoleId = djRoleId == null ? "" : djRoleId; }
        public int idleSeconds() { return idleSeconds; }
        public void setIdleSeconds(int idleSeconds) { this.idleSeconds = idleSeconds; }
        public String restrictMode() { return restrictMode; }
        public void setRestrictMode(String restrictMode) { this.restrictMode = restrictMode == null ? "off" : restrictMode; }
    }
}
