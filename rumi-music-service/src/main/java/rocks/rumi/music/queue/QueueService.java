package rocks.rumi.music.queue;

import rocks.rumi.music.player.GuildMusicPlayer;
import rocks.rumi.music.player.TrackScheduler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class QueueService {
    private final Map<Long, GuildMusicPlayer> players = new ConcurrentHashMap<>();
    private final TrackScheduler scheduler;

    public QueueService(TrackScheduler scheduler) {
        this.scheduler = scheduler;
    }

    public GuildMusicPlayer player(long guildId) {
        return players.computeIfAbsent(guildId, GuildMusicPlayer::new);
    }

    public TrackScheduler scheduler() {
        return scheduler;
    }

    public void restore(GuildMusicPlayer player) {
        if (player == null) return;
        players.put(player.guildId(), player);
    }
}
