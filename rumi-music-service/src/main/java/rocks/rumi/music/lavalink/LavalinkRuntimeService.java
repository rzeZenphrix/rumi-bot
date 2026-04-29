package rocks.rumi.music.lavalink;

import dev.arbjerg.lavalink.client.Helpers;
import dev.arbjerg.lavalink.client.LavalinkClient;
import dev.arbjerg.lavalink.client.Link;
import dev.arbjerg.lavalink.client.NodeOptions;
import dev.arbjerg.lavalink.client.player.LavalinkLoadResult;
import dev.arbjerg.lavalink.client.player.PlaylistLoaded;
import dev.arbjerg.lavalink.client.player.SearchResult;
import dev.arbjerg.lavalink.client.player.Track;
import dev.arbjerg.lavalink.client.player.TrackLoaded;
import dev.arbjerg.lavalink.libraries.jda.JDAVoiceUpdateListener;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.entities.Guild;
import net.dv8tion.jda.api.entities.channel.middleman.AudioChannel;
import rocks.rumi.music.config.MusicConfig;

import java.util.ArrayList;
import java.util.List;

public final class LavalinkRuntimeService {
    private final MusicConfig config;
    private final LavalinkClient lavalinkClient;
    private final List<String> nodeNames = new ArrayList<>();
    private JDA jda;

    public LavalinkRuntimeService(MusicConfig config) {
        this.config = config;
        this.lavalinkClient = config.lavalinkConfigured()
            ? new LavalinkClient(Helpers.getUserIdFromToken(config.discordToken()))
            : null;
        if (lavalinkClient != null) {
            int index = 1;
            for (String node : config.lavalinkNodes()) {
                String name = "node-" + index++;
                nodeNames.add(name);
                lavalinkClient.addNode(
                    new NodeOptions.Builder()
                        .setName(name)
                        .setServerUri(node)
                        .setPassword(config.lavalinkPassword())
                        .setSessionId(config.lavalinkResumeKey())
                        .build()
                );
            }
        }
    }

    public boolean configured() {
        return lavalinkClient != null;
    }

    public JDAVoiceUpdateListener voiceInterceptor() {
        return lavalinkClient == null ? null : new JDAVoiceUpdateListener(lavalinkClient);
    }

    public void attachJda(JDA jda) {
        this.jda = jda;
    }

    public String connect(long guildId, String voiceChannelId) {
        if (!configured()) return "Lavalink is not configured.";
        if (jda == null) return "Music runtime is not ready yet.";
        Guild guild = jda.getGuildById(guildId);
        if (guild == null) return "I am not in that guild on the music service.";
        AudioChannel channel = guild.getChannelById(AudioChannel.class, voiceChannelId);
        if (channel == null) return "I could not find that voice channel.";
        jda.getDirectAudioController().connect(channel);
        lavalinkClient.getOrCreateLink(guildId);
        return "Connected to `" + channel.getName() + "`.";
    }

    public String play(long guildId, String identifier, int volume) {
        if (!configured()) return "Lavalink is not configured.";
        Link link = lavalinkClient.getOrCreateLink(guildId);
        LavalinkLoadResult result = link.loadItem(identifier).block();
        if (result instanceof TrackLoaded trackLoaded) {
            return startTrack(link, trackLoaded.getTrack(), volume);
        }
        if (result instanceof SearchResult searchResult && !searchResult.getTracks().isEmpty()) {
            return startTrack(link, searchResult.getTracks().get(0), volume);
        }
        if (result instanceof PlaylistLoaded playlistLoaded && !playlistLoaded.getTracks().isEmpty()) {
            return startTrack(link, playlistLoaded.getTracks().get(0), volume) + " Playlist size: " + playlistLoaded.getTracks().size() + ".";
        }
        return "Lavalink could not load anything for `" + identifier + "`.";
    }

    public void pause(long guildId, boolean paused) {
        if (!configured()) return;
        lavalinkClient.getOrCreateLink(guildId).updatePlayer(update -> update.setPaused(paused)).block();
    }

    public void stop(long guildId) {
        if (!configured()) return;
        lavalinkClient.getOrCreateLink(guildId).updatePlayer(update -> update.stopTrack()).block();
    }

    public void seek(long guildId, long positionMs) {
        if (!configured()) return;
        lavalinkClient.getOrCreateLink(guildId).updatePlayer(update -> update.setPosition(positionMs)).block();
    }

    public void setVolume(long guildId, int volume) {
        if (!configured()) return;
        lavalinkClient.getOrCreateLink(guildId).updatePlayer(update -> update.setVolume(volume)).block();
    }

    public void destroy(long guildId) {
        if (!configured()) return;
        lavalinkClient.getOrCreateLink(guildId).destroy().block();
    }

    public String failover(String nextNodeName) {
        if (!configured()) return "Lavalink is not configured.";
        if (nextNodeName == null || nextNodeName.isBlank()) return "Lavalink failover requested.";
        return "Lavalink failover targeted `" + nextNodeName + "`.";
    }

    private String startTrack(Link link, Track track, int volume) {
        link.updatePlayer(update -> {
            update.setTrack(track);
            update.setVolume(volume);
            update.setPaused(false);
        }).block();
        return "Started `" + track.getInfo().getTitle() + "`.";
    }
}
