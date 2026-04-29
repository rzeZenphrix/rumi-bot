package rocks.rumi.music.player;

import java.util.Collections;
import java.util.List;

public final class TrackScheduler {
    public void enqueue(GuildMusicPlayer player, String query) {
        if (player.nowPlaying() == null || player.nowPlaying().isBlank()) {
            player.setNowPlaying(query);
            player.history().add(query);
            return;
        }
        player.queue().add(query);
    }

    public String skip(GuildMusicPlayer player) {
        if (player.queue().isEmpty()) {
            String finished = player.nowPlaying();
            player.setNowPlaying(null);
            return finished;
        }

        String next = player.queue().remove(0);
        player.setNowPlaying(next);
        player.history().add(next);
        return next;
    }

    public String remove(GuildMusicPlayer player, int index) {
        if (index < 0 || index >= player.queue().size()) return null;
        return player.queue().remove(index);
    }

    public boolean move(GuildMusicPlayer player, int fromIndex, int toIndex) {
        if (fromIndex < 0 || fromIndex >= player.queue().size()) return false;
        if (toIndex < 0 || toIndex >= player.queue().size()) return false;
        if (fromIndex == toIndex) return true;
        String value = player.queue().remove(fromIndex);
        player.queue().add(toIndex, value);
        return true;
    }

    public void clear(GuildMusicPlayer player) {
        player.queue().clear();
        player.setNowPlaying(null);
        player.setPaused(false);
    }

    public void shuffle(GuildMusicPlayer player) {
        Collections.shuffle(player.queue());
    }

    public List<String> snapshot(GuildMusicPlayer player) {
        return List.copyOf(player.queue());
    }
}
