package rocks.rumi.music.commands;

import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.interactions.commands.OptionMapping;
import net.dv8tion.jda.api.entities.channel.middleman.AudioChannel;
import rocks.rumi.music.embeds.EmbedFactory;
import rocks.rumi.music.model.CommandResult;
import rocks.rumi.music.permissions.PermissionService;
import rocks.rumi.music.player.MusicManager;
import rocks.rumi.music.spotify.SpotifyApiService;
import rocks.rumi.music.spotify.SpotifyOAuthService;
import rocks.rumi.music.spotify.SpotifyTrackResolver;

import java.util.HashMap;
import java.util.Map;

public final class CommandHandler {
    private final MusicManager musicManager;
    private final SpotifyApiService spotifyApiService;
    private final SpotifyOAuthService spotifyOAuthService;
    private final SpotifyTrackResolver resolver;
    private final PermissionService permissionService;
    private final EmbedFactory embedFactory;

    public CommandHandler(
        MusicManager musicManager,
        SpotifyApiService spotifyApiService,
        SpotifyOAuthService spotifyOAuthService,
        SpotifyTrackResolver resolver,
        PermissionService permissionService,
        EmbedFactory embedFactory
    ) {
        this.musicManager = musicManager;
        this.spotifyApiService = spotifyApiService;
        this.spotifyOAuthService = spotifyOAuthService;
        this.resolver = resolver;
        this.permissionService = permissionService;
        this.embedFactory = embedFactory;
    }

    public void handle(SlashCommandInteractionEvent event) {
        if (!permissionService.canRun(event)) {
            event.reply(permissionService.denyReason(event)).setEphemeral(true).queue();
            return;
        }

        CommandResult result = switch (event.getName()) {
            case "music" -> handleMusic(event);
            case "spotify" -> handleSpotify(event);
            default -> CommandResult.info("music", "Unknown command.");
        };

        event.replyEmbeds(embedFactory.build(result).build()).setEphemeral(result.ephemeral()).queue();
    }

    private CommandResult handleMusic(SlashCommandInteractionEvent event) {
        long guildId = event.getGuild().getIdLong();
        String subcommand = event.getSubcommandName();
        String group = event.getSubcommandGroup();

        if (subcommand == null) {
            return musicManager.status(guildId);
        }

        Map<String, String> options = optionMap(event);
        AudioChannel channel = event.getMember() == null || event.getMember().getVoiceState() == null
            ? null
            : event.getMember().getVoiceState().getChannel();
        if (channel != null) {
            options.put("voiceChannelId", channel.getId());
        }
        return musicManager.handle(guildId, commandKey(group, subcommand), options);
    }

    private CommandResult handleSpotify(SlashCommandInteractionEvent event) {
        String subcommand = event.getSubcommandName();
        String group = event.getSubcommandGroup();
        long guildId = event.getGuild().getIdLong();
        long userId = event.getUser().getIdLong();
        Map<String, String> options = optionMap(event);
        String commandKey = commandKey(group, subcommand);

        return switch (commandKey) {
            case "link" -> {
                if (!spotifyOAuthService.canStartLink()) {
                    yield CommandResult.info("spotify", "Spotify OAuth is not configured yet. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and a public SPOTIFY_REDIRECT_URI or RUMI_MUSIC_SERVICE_PUBLIC_URL.");
                }

                String authorizeUrl = spotifyOAuthService.createAuthorizationUrl(userId);
                yield CommandResult.info("spotify", "Open this link to finish connecting your Spotify account:\n" + authorizeUrl + "\n\nAfter you approve it, run `/spotify status` to confirm the link.");
            }
            case "unlink" -> CommandResult.info("spotify", spotifyOAuthService.unlink(userId) ? "Spotify link removed." : "There was no Spotify link to remove.");
            case "status" -> CommandResult.info("spotify", "Account: `" + spotifyOAuthService.status(userId) + "`\n" + spotifyApiService.statusLine());
            case "resolve" -> CommandResult.info("spotify", resolver.describe(options.getOrDefault("query", "")));
            case "play", "queue.play", "queue.add" -> musicManager.handle(guildId, "play", withVoiceContext(event, options));
            case "pause" -> musicManager.handle(guildId, "pause", options);
            case "resume" -> musicManager.handle(guildId, "resume", options);
            case "skip" -> musicManager.handle(guildId, "skip", options);
            case "volume" -> musicManager.handle(guildId, "volume", Map.of("value", options.getOrDefault("value", "80")));
            case "shuffle" -> musicManager.handle(guildId, "shuffle", options);
            case "device.set" -> {
                String device = options.getOrDefault("device", "");
                spotifyOAuthService.setDevice(userId, device, device);
                yield CommandResult.info("spotify", device.isBlank() ? "I need a device name or ID." : "Saved active Spotify device as `" + device + "`.");
            }
            case "autosync" -> {
                spotifyOAuthService.setModes(userId, parseBoolean(options.get("enabled"), true), state(userId).followMode(), state(userId).priority());
                yield CommandResult.info("spotify", "Saved Spotify autosync preference.");
            }
            case "follow" -> {
                spotifyOAuthService.setModes(userId, state(userId).autosync(), parseBoolean(options.get("enabled"), true), state(userId).priority());
                yield CommandResult.info("spotify", "Saved Spotify follow mode.");
            }
            case "priority" -> {
                String mode = options.getOrDefault("mode", "balanced");
                spotifyOAuthService.setModes(userId, state(userId).autosync(), state(userId).followMode(), mode);
                yield CommandResult.info("spotify", "Saved Spotify resolver priority as `" + mode + "`.");
            }
            case "cache" -> CommandResult.info("spotify", resolver.describe(options.getOrDefault("query", "cache status")));
            case "nowplaying", "previous", "liked", "recommendations", "device.list",
                "repeat", "sync", "debug", "playlist.list", "playlist.view", "playlist.play" -> CommandResult.info(
                "spotify",
                "The `" + commandKey + "` surface is registered and stateful. Live Spotify user playback still depends on the user's real OAuth tokens and active device."
            );
            default -> CommandResult.info("spotify", "That Spotify command is registered, but it still needs the deeper runtime pass.");
        };
    }

    private Map<String, String> optionMap(SlashCommandInteractionEvent event) {
        Map<String, String> output = new HashMap<>();
        for (OptionMapping option : event.getOptions()) {
            output.put(option.getName(), option.getAsString());
        }
        return output;
    }

    private String commandKey(String group, String subcommand) {
        return group == null || group.isBlank() ? subcommand : group + "." + subcommand;
    }

    private Map<String, String> withVoiceContext(SlashCommandInteractionEvent event, Map<String, String> options) {
        Map<String, String> next = new HashMap<>(options);
        AudioChannel channel = event.getMember() == null || event.getMember().getVoiceState() == null
            ? null
            : event.getMember().getVoiceState().getChannel();
        if (channel != null) {
            next.put("voiceChannelId", channel.getId());
        }
        return next;
    }

    private boolean parseBoolean(String raw, boolean fallback) {
        if (raw == null) return fallback;
        return switch (raw.trim().toLowerCase()) {
            case "true", "on", "yes", "enabled" -> true;
            case "false", "off", "no", "disabled" -> false;
            default -> fallback;
        };
    }

    private rocks.rumi.music.persistence.MusicPersistenceService.SpotifyLinkState state(long userId) {
        rocks.rumi.music.persistence.MusicPersistenceService.SpotifyLinkState current = spotifyOAuthService.state(userId);
        if (current != null) return current;
        return new rocks.rumi.music.persistence.MusicPersistenceService.SpotifyLinkState(
            "",
            "",
            "",
            "",
            0L,
            "",
            "",
            false,
            false,
            "balanced",
            ""
        );
    }
}
