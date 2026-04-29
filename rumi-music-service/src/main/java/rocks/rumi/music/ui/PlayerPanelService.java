package rocks.rumi.music.ui;

import rocks.rumi.music.player.GuildMusicPlayer;

public final class PlayerPanelService {
    public String summary(GuildMusicPlayer player) {
        return "Now playing: " + (player.nowPlaying() == null ? "nothing" : player.nowPlaying())
            + " | queued: " + player.queue().size()
            + " | paused: " + player.paused()
            + " | loop: " + player.loopMode()
            + " | autoplay: " + player.autoplay();
    }
}
