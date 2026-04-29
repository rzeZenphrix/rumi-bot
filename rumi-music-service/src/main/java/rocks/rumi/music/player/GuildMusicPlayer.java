package rocks.rumi.music.player;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class GuildMusicPlayer {
    private final long guildId;
    private final List<String> queue = new ArrayList<>();
    private final List<String> history = new ArrayList<>();
    private String nowPlaying;
    private boolean paused;
    private int volume = 80;
    private String loopMode = "off";
    private boolean autoplay;
    private String filter = "none";
    private long lastSeekMs;
    private String boundVoiceChannelId;

    public GuildMusicPlayer(long guildId) {
        this.guildId = guildId;
    }

    public long guildId() {
        return guildId;
    }

    public List<String> queue() {
        return queue;
    }

    public List<String> history() {
        return history;
    }

    public List<String> queueView() {
        return Collections.unmodifiableList(queue);
    }

    public List<String> historyView() {
        return Collections.unmodifiableList(history);
    }

    public String nowPlaying() {
        return nowPlaying;
    }

    public void setNowPlaying(String nowPlaying) {
        this.nowPlaying = nowPlaying;
    }

    public boolean paused() {
        return paused;
    }

    public void setPaused(boolean paused) {
        this.paused = paused;
    }

    public int volume() {
        return volume;
    }

    public void setVolume(int volume) {
        this.volume = volume;
    }

    public String loopMode() {
        return loopMode;
    }

    public void setLoopMode(String loopMode) {
        this.loopMode = loopMode;
    }

    public boolean autoplay() {
        return autoplay;
    }

    public void setAutoplay(boolean autoplay) {
        this.autoplay = autoplay;
    }

    public String filter() {
        return filter;
    }

    public void setFilter(String filter) {
        this.filter = filter;
    }

    public long lastSeekMs() {
        return lastSeekMs;
    }

    public void setLastSeekMs(long lastSeekMs) {
        this.lastSeekMs = lastSeekMs;
    }

    public String boundVoiceChannelId() {
        return boundVoiceChannelId;
    }

    public void setBoundVoiceChannelId(String boundVoiceChannelId) {
        this.boundVoiceChannelId = boundVoiceChannelId;
    }
}
