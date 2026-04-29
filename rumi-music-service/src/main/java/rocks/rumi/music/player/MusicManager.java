package rocks.rumi.music.player;

import rocks.rumi.music.lavalink.NodeManager;
import rocks.rumi.music.lavalink.LavalinkRuntimeService;
import rocks.rumi.music.model.CommandResult;
import rocks.rumi.music.persistence.MusicPersistenceService;
import rocks.rumi.music.queue.QueueService;
import rocks.rumi.music.settings.SettingsService;
import rocks.rumi.music.spotify.SpotifyTrackResolver;
import rocks.rumi.music.ui.PlayerPanelService;

import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import java.util.ArrayList;

public final class MusicManager {
    private final QueueService queueService;
    private final SettingsService settingsService;
    private final NodeManager nodeManager;
    private final SpotifyTrackResolver resolver;
    private final PlayerPanelService panelService;
    private final MusicPersistenceService persistenceService;
    private final LavalinkRuntimeService runtimeService;

    public MusicManager(
        QueueService queueService,
        SettingsService settingsService,
        NodeManager nodeManager,
        SpotifyTrackResolver resolver,
        PlayerPanelService panelService,
        MusicPersistenceService persistenceService,
        LavalinkRuntimeService runtimeService
    ) {
        this.queueService = queueService;
        this.settingsService = settingsService;
        this.nodeManager = nodeManager;
        this.resolver = resolver;
        this.panelService = panelService;
        this.persistenceService = persistenceService;
        this.runtimeService = runtimeService;
    }

    public void restoreState() {
        for (Map.Entry<String, com.google.gson.JsonElement> entry : persistenceService.listPlayers()) {
            try {
                long guildId = Long.parseLong(entry.getKey());
                GuildMusicPlayer restored = persistenceService.loadPlayer(guildId);
                if (restored != null) {
                    queueService.restore(restored);
                }
                SettingsService.GuildSettings settings = persistenceService.loadSettings(guildId);
                if (settings != null) {
                    settingsService.restore(guildId, settings);
                }
            } catch (RuntimeException ignored) {
            }
        }
    }

    public CommandResult status(long guildId) {
        GuildMusicPlayer player = queueService.player(guildId);
        List<CommandResult.EmbedField> fields = new ArrayList<>();
        fields.add(field("Now Playing", player.nowPlaying() == null ? "Nothing right now." : player.nowPlaying(), false));
        fields.add(field("Queue", String.valueOf(player.queue().size()), true));
        fields.add(field("Volume", player.volume() + "%", true));
        fields.add(field("Loop", player.loopMode(), true));
        fields.add(field("Filter", player.filter(), true));
        fields.add(field("Autoplay", String.valueOf(player.autoplay()), true));
        fields.add(field("Paused", String.valueOf(player.paused()), true));
        fields.add(field("Voice Channel", player.boundVoiceChannelId() == null ? "Not connected" : player.boundVoiceChannelId(), false));
        return CommandResult.rich(
            "Music Status",
            nodeManager.healthSummary(),
            fields
        ).withFooter(panelService.summary(player));
    }

    public CommandResult handle(long guildId, String commandKey, Map<String, String> options) {
        GuildMusicPlayer player = queueService.player(guildId);
        SettingsService.GuildSettings settings = settingsService.get(guildId);

        CommandResult result = switch (commandKey) {
            case "play", "search" -> {
                String query = options.getOrDefault("query", "").trim();
                if (query.isBlank()) yield CommandResult.info("music", "Give me something to queue.");
                String voiceChannelId = options.getOrDefault("voiceChannelId", "").trim();
                if (!voiceChannelId.isBlank()) {
                    player.setBoundVoiceChannelId(voiceChannelId);
                    runtimeService.connect(guildId, voiceChannelId);
                }
                String resolved = query.startsWith("spotify:") || query.contains("open.spotify.com")
                    ? resolver.resolve(query)
                    : query;
                queueService.scheduler().enqueue(player, resolved);
                String playback = runtimeService.play(guildId, resolved.startsWith("http") || resolved.startsWith("ytsearch:") ? resolved : "ytsearch:" + resolved, player.volume());
                yield CommandResult.info("music", "Queued `" + query + "`.\n" + playback + "\n" + panelService.summary(player));
            }
            case "queue" -> buildQueueResult(player);
            case "nowplaying" -> buildNowPlayingResult(player);
            case "skip" -> {
                String next = queueService.scheduler().skip(player);
                yield CommandResult.info("skip", next == null ? "There was nothing left to skip to." : "Skipped to `" + next + "`.");
            }
            case "skipto" -> {
                int index = parseInt(options.get("index"), 1) - 1;
                if (index < 0 || index >= player.queue().size()) yield CommandResult.info("skipto", "That queue position does not exist.");
                String selected = player.queue().remove(index);
                if (player.nowPlaying() != null) {
                    player.history().add(player.nowPlaying());
                }
                player.setNowPlaying(selected);
                yield CommandResult.info("skipto", "Jumped to `" + selected + "`.");
            }
            case "pause" -> {
                player.setPaused(true);
                runtimeService.pause(guildId, true);
                yield CommandResult.info("pause", "Playback is paused.");
            }
            case "resume" -> {
                player.setPaused(false);
                runtimeService.pause(guildId, false);
                yield CommandResult.info("resume", "Playback resumed.");
            }
            case "stop", "leave" -> {
                queueService.scheduler().clear(player);
                player.setBoundVoiceChannelId(null);
                runtimeService.destroy(guildId);
                yield CommandResult.info(commandKey, "Cleared the queue and stopped playback state.");
            }
            case "volume" -> {
                int volume = clamp(parseInt(options.get("value"), settings.defaultVolume()), 0, 200);
                player.setVolume(volume);
                settings.setDefaultVolume(volume);
                runtimeService.setVolume(guildId, volume);
                yield CommandResult.info("volume", "Volume set to `" + volume + "`.");
            }
            case "seek" -> {
                long millis = Math.max(0, parseLong(options.get("position"), 0));
                player.setLastSeekMs(millis);
                runtimeService.seek(guildId, millis);
                yield CommandResult.info("seek", "Seeked to `" + millis + "ms`.");
            }
            case "loop.track", "loop.queue", "loop.off" -> {
                String mode = commandKey.substring("loop.".length());
                player.setLoopMode(mode);
                yield CommandResult.info("loop", "Loop mode is now `" + mode + "`.");
            }
            case "shuffle" -> {
                queueService.scheduler().shuffle(player);
                yield CommandResult.info("shuffle", "Shuffled the queue.");
            }
            case "remove" -> {
                int index = parseInt(options.get("index"), 1) - 1;
                String removed = queueService.scheduler().remove(player, index);
                yield CommandResult.info("remove", removed == null ? "That queue entry does not exist." : "Removed `" + removed + "`.");
            }
            case "move" -> {
                int from = parseInt(options.get("from"), 1) - 1;
                int to = parseInt(options.get("to"), 1) - 1;
                boolean moved = queueService.scheduler().move(player, from, to);
                yield CommandResult.info("move", moved ? "Moved that track." : "I could not move that queue entry.");
            }
            case "clear" -> {
                player.queue().clear();
                yield CommandResult.info("clear", "Cleared the queued tracks.");
            }
            case "history" -> buildHistoryResult(player);
            case "stats" -> buildStatsResult(player);
            case "lyrics" -> CommandResult.info("lyrics", "Lyrics lookup is still waiting on the dedicated lyrics provider pass.");
            case "autoplay" -> {
                boolean enabled = parseBoolean(options.get("enabled"), !player.autoplay());
                player.setAutoplay(enabled);
                settings.setAutoplay(enabled);
                yield CommandResult.info("autoplay", "Autoplay is now `" + enabled + "`.");
            }
            case "filter" -> CommandResult.info("filter", "Use a specific filter subcommand.");
            case "filter.bassboost", "filter.nightcore", "filter.vaporwave", "filter.karaoke", "filter.tremolo",
                "filter.vibrato", "filter.lowpass", "filter.rotation", "filter.distortion" -> {
                String filter = commandKey.substring("filter.".length());
                player.setFilter(filter);
                yield CommandResult.info("filter", "Applied `" + filter + "`.");
            }
            case "filter.reset" -> {
                player.setFilter("none");
                yield CommandResult.info("filter", "Reset all filters.");
            }
            case "panel" -> buildPanelResult(player);
            case "export" -> {
                List<String> snapshot = queueService.scheduler().snapshot(player);
                yield CommandResult.info("export", snapshot.isEmpty() ? "The queue is empty." : String.join("\n", snapshot));
            }
            case "import" -> {
                String data = options.getOrDefault("data", "").trim();
                if (data.isBlank()) yield CommandResult.info("import", "Give me newline-separated tracks to import.");
                List<String> tracks = data.lines().map(String::trim).filter(line -> !line.isBlank()).toList();
                for (String track : tracks) queueService.scheduler().enqueue(player, track);
                yield CommandResult.info("import", "Imported `" + tracks.size() + "` track(s).");
            }
            case "settings" -> buildSettingsResult(settings);
            case "settings.volume" -> {
                int volume = clamp(parseInt(options.get("value"), settings.defaultVolume()), 0, 200);
                settings.setDefaultVolume(volume);
                player.setVolume(volume);
                yield CommandResult.info("settings", "Default volume is now `" + volume + "`.");
            }
            case "settings.autoplay" -> {
                boolean enabled = parseBoolean(options.get("enabled"), !settings.autoplay());
                settings.setAutoplay(enabled);
                yield CommandResult.info("settings", "Default autoplay is now `" + enabled + "`.");
            }
            case "settings.announce" -> {
                boolean enabled = parseBoolean(options.get("enabled"), !settings.announce());
                settings.setAnnounce(enabled);
                yield CommandResult.info("settings", "Announce mode is now `" + enabled + "`.");
            }
            case "settings.djrole" -> {
                String role = options.getOrDefault("role", "");
                settings.setDjRoleId(role);
                yield CommandResult.info("settings", role.isBlank() ? "Cleared the DJ role." : "DJ role saved as `" + role + "`.");
            }
            case "settings.idle" -> {
                int seconds = Math.max(0, parseInt(options.get("seconds"), settings.idleSeconds()));
                settings.setIdleSeconds(seconds);
                yield CommandResult.info("settings", "Idle disconnect is now `" + seconds + "` seconds.");
            }
            case "settings.restrict" -> {
                String mode = options.getOrDefault("mode", "off");
                settings.setRestrictMode(mode);
                yield CommandResult.info("settings", "Restrict mode is now `" + mode + "`.");
            }
            case "node.failover" -> CommandResult.info("music", nodeManager.failover());
            default -> CommandResult.info("music", "That music subcommand is registered, but its deep playback implementation still needs the Lavalink runtime pass.");
        };

        persistenceService.savePlayer(player);
        persistenceService.saveSettings(guildId, settings);
        return result;
    }

    private String formatQueue(GuildMusicPlayer player) {
        StringJoiner joiner = new StringJoiner("\n");
        if (player.nowPlaying() != null) {
            joiner.add("Now: `" + player.nowPlaying() + "`");
        }
        List<String> queued = player.queueView();
        for (int index = 0; index < queued.size(); index++) {
            joiner.add((index + 1) + ". `" + queued.get(index) + "`");
        }
        String rendered = joiner.toString();
        return rendered.isBlank() ? "The queue is empty." : rendered;
    }

    private String settingsSummary(SettingsService.GuildSettings settings) {
        return "Volume: `" + settings.defaultVolume() + "`\n"
            + "Autoplay: `" + settings.autoplay() + "`\n"
            + "Announce: `" + settings.announce() + "`\n"
            + "DJ role: `" + (settings.djRoleId().isBlank() ? "none" : settings.djRoleId()) + "`\n"
            + "Idle disconnect: `" + settings.idleSeconds() + "s`\n"
            + "Restrict: `" + settings.restrictMode() + "`";
    }

    private int parseInt(String raw, int fallback) {
        try {
            return Integer.parseInt(String.valueOf(raw).trim());
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private long parseLong(String raw, long fallback) {
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private boolean parseBoolean(String raw, boolean fallback) {
        if (raw == null) return fallback;
        return switch (raw.trim().toLowerCase()) {
            case "true", "on", "yes", "enabled" -> true;
            case "false", "off", "no", "disabled" -> false;
            default -> fallback;
        };
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private CommandResult buildQueueResult(GuildMusicPlayer player) {
        List<CommandResult.EmbedField> fields = new ArrayList<>();
        fields.add(field("Now Playing", player.nowPlaying() == null ? "Nothing right now." : player.nowPlaying(), false));
        List<String> queued = player.queueView();
        String upcoming = queued.isEmpty()
            ? "Queue is empty."
            : String.join("\n", queued.stream().limit(10).map(track -> "- " + track).toList());
        fields.add(field("Up Next", upcoming, false));
        if (queued.size() > 10) {
            fields.add(field("More Tracks", String.valueOf(queued.size() - 10), true));
        }
        return CommandResult.rich("Queue", "Current playback queue.", fields);
    }

    private CommandResult buildNowPlayingResult(GuildMusicPlayer player) {
        if (player.nowPlaying() == null) {
            return CommandResult.info("Now Playing", "Nothing is playing right now.");
        }
        return CommandResult.rich(
            "Now Playing",
            player.nowPlaying(),
            List.of(
                field("Volume", player.volume() + "%", true),
                field("Loop", player.loopMode(), true),
                field("Filter", player.filter(), true),
                field("Paused", String.valueOf(player.paused()), true)
            )
        );
    }

    private CommandResult buildHistoryResult(GuildMusicPlayer player) {
        List<String> history = player.historyView();
        return CommandResult.rich(
            "History",
            history.isEmpty() ? "No playback history yet." : "Recent playback history.",
            List.of(field("Tracks", history.isEmpty()
                ? "Nothing has been played yet."
                : String.join("\n", history.stream().limit(10).map(track -> "- " + track).toList()), false))
        );
    }

    private CommandResult buildStatsResult(GuildMusicPlayer player) {
        return CommandResult.rich(
            "Player Stats",
            "Live player metrics for this guild.",
            List.of(
                field("Queued", String.valueOf(player.queue().size()), true),
                field("History", String.valueOf(player.history().size()), true),
                field("Volume", player.volume() + "%", true),
                field("Autoplay", String.valueOf(player.autoplay()), true),
                field("Loop", player.loopMode(), true),
                field("Filter", player.filter(), true)
            )
        );
    }

    private CommandResult buildPanelResult(GuildMusicPlayer player) {
        return CommandResult.rich(
            "Player Panel",
            panelService.summary(player),
            List.of(
                field("Now Playing", player.nowPlaying() == null ? "Nothing right now." : player.nowPlaying(), false),
                field("Queue Size", String.valueOf(player.queue().size()), true),
                field("Volume", player.volume() + "%", true),
                field("Voice Channel", player.boundVoiceChannelId() == null ? "Not connected" : player.boundVoiceChannelId(), false)
            )
        );
    }

    private CommandResult buildSettingsResult(SettingsService.GuildSettings settings) {
        return CommandResult.rich(
            "Music Settings",
            "Saved default playback settings for this guild.",
            List.of(
                field("Default Volume", settings.defaultVolume() + "%", true),
                field("Autoplay", String.valueOf(settings.autoplay()), true),
                field("Announce", String.valueOf(settings.announce()), true),
                field("DJ Role", settings.djRoleId().isBlank() ? "none" : settings.djRoleId(), false),
                field("Idle Disconnect", settings.idleSeconds() + "s", true),
                field("Restrict", settings.restrictMode(), true)
            )
        );
    }

    private CommandResult.EmbedField field(String name, String value, boolean inline) {
        return new CommandResult.EmbedField(name, value, inline);
    }
}
