package rocks.rumi.music.discord;

import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.CommandData;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.SubcommandData;
import net.dv8tion.jda.api.interactions.commands.build.SubcommandGroupData;

import java.util.List;

public final class SlashCommandCatalog {
    private SlashCommandCatalog() {
    }

    public static List<CommandData> commands() {
        CommandData music = Commands.slash("music", "Rumi music controls.")
            .addSubcommands(
                new SubcommandData("play", "Queue a track, URL, or search term.").addOption(OptionType.STRING, "query", "Track, URL, or search", true),
                new SubcommandData("search", "Search and queue the best result.").addOption(OptionType.STRING, "query", "What to search for", true),
                new SubcommandData("queue", "Show the current queue."),
                new SubcommandData("nowplaying", "Show the current track."),
                new SubcommandData("skip", "Skip the current track."),
                new SubcommandData("skipto", "Skip to a queue position.").addOption(OptionType.INTEGER, "index", "Queue position", true),
                new SubcommandData("pause", "Pause playback."),
                new SubcommandData("resume", "Resume playback."),
                new SubcommandData("stop", "Stop playback and clear current state."),
                new SubcommandData("leave", "Disconnect and clear current state."),
                new SubcommandData("volume", "Set playback volume.").addOption(OptionType.INTEGER, "value", "0-200", true),
                new SubcommandData("seek", "Seek within the track.").addOption(OptionType.STRING, "position", "Milliseconds or time hint", true),
                new SubcommandData("shuffle", "Shuffle the queue."),
                new SubcommandData("remove", "Remove a queue entry.").addOption(OptionType.INTEGER, "index", "Queue position", true),
                new SubcommandData("move", "Move a queue entry.").addOption(OptionType.INTEGER, "from", "Current position", true).addOption(OptionType.INTEGER, "to", "New position", true),
                new SubcommandData("clear", "Clear the queue."),
                new SubcommandData("history", "Show recent playback history."),
                new SubcommandData("stats", "Show player statistics."),
                new SubcommandData("lyrics", "Show lyrics for the current track."),
                new SubcommandData("autoplay", "Toggle autoplay.").addOption(OptionType.BOOLEAN, "enabled", "Turn autoplay on or off", false),
                new SubcommandData("panel", "Show the player panel summary."),
                new SubcommandData("export", "Export the current queue."),
                new SubcommandData("import", "Import newline-separated queue data.").addOption(OptionType.STRING, "data", "Queue export data", true)
            )
            .addSubcommandGroups(
                new SubcommandGroupData("loop", "Loop controls.")
                    .addSubcommands(
                        new SubcommandData("track", "Loop the current track."),
                        new SubcommandData("queue", "Loop the queue."),
                        new SubcommandData("off", "Disable loop.")
                    ),
                new SubcommandGroupData("filter", "Audio filter controls.")
                    .addSubcommands(
                        new SubcommandData("bassboost", "Apply bassboost."),
                        new SubcommandData("nightcore", "Apply nightcore."),
                        new SubcommandData("vaporwave", "Apply vaporwave."),
                        new SubcommandData("karaoke", "Apply karaoke."),
                        new SubcommandData("tremolo", "Apply tremolo."),
                        new SubcommandData("vibrato", "Apply vibrato."),
                        new SubcommandData("lowpass", "Apply lowpass."),
                        new SubcommandData("rotation", "Apply rotation."),
                        new SubcommandData("distortion", "Apply distortion."),
                        new SubcommandData("reset", "Clear active filters.")
                    ),
                new SubcommandGroupData("settings", "Guild music settings.")
                    .addSubcommands(
                        new SubcommandData("volume", "Set default volume.").addOption(OptionType.INTEGER, "value", "0-200", true),
                        new SubcommandData("autoplay", "Set default autoplay.").addOption(OptionType.BOOLEAN, "enabled", "Turn autoplay on or off", true),
                        new SubcommandData("announce", "Set announce behavior.").addOption(OptionType.BOOLEAN, "enabled", "Turn announce on or off", true),
                        new SubcommandData("djrole", "Set the DJ role ID or mention.").addOption(OptionType.STRING, "role", "Role ID or mention", true),
                        new SubcommandData("idle", "Set idle disconnect seconds.").addOption(OptionType.INTEGER, "seconds", "Seconds", true),
                        new SubcommandData("restrict", "Set restrict mode.").addOption(OptionType.STRING, "mode", "off, vote, dj, strict", true)
                    )
            );

        CommandData spotify = Commands.slash("spotify", "Rumi Spotify controls.")
            .addSubcommands(
                new SubcommandData("link", "Link a Spotify account."),
                new SubcommandData("unlink", "Unlink the current Spotify account."),
                new SubcommandData("status", "Show Spotify link status."),
                new SubcommandData("nowplaying", "Show the linked account's current Spotify track."),
                new SubcommandData("play", "Resolve and play a Spotify query.").addOption(OptionType.STRING, "query", "Spotify link, URI, or search", true),
                new SubcommandData("pause", "Pause Spotify-driven playback."),
                new SubcommandData("resume", "Resume Spotify-driven playback."),
                new SubcommandData("skip", "Skip Spotify-driven playback."),
                new SubcommandData("previous", "Go to the previous Spotify track."),
                new SubcommandData("liked", "Queue or inspect liked songs."),
                new SubcommandData("recommendations", "Get Spotify recommendations."),
                new SubcommandData("volume", "Set Spotify-linked playback volume.").addOption(OptionType.INTEGER, "value", "0-200", true),
                new SubcommandData("shuffle", "Toggle shuffle."),
                new SubcommandData("repeat", "Set repeat mode.").addOption(OptionType.STRING, "mode", "off, track, context", true),
                new SubcommandData("sync", "Sync playback from Spotify now playing."),
                new SubcommandData("autosync", "Toggle autosync.").addOption(OptionType.BOOLEAN, "enabled", "Enable or disable autosync", false),
                new SubcommandData("follow", "Follow the linked account's session.").addOption(OptionType.BOOLEAN, "enabled", "Enable or disable follow mode", false),
                new SubcommandData("priority", "Set resolver priority.").addOption(OptionType.STRING, "mode", "balanced, strict, fast", true),
                new SubcommandData("resolve", "Resolve a Spotify track to playback.").addOption(OptionType.STRING, "query", "Spotify link, URI, or search", true),
                new SubcommandData("cache", "Inspect resolver cache."),
                new SubcommandData("debug", "Show Spotify debug information.")
            )
            .addSubcommandGroups(
                new SubcommandGroupData("queue", "Spotify queue actions.")
                    .addSubcommands(
                        new SubcommandData("add", "Add a Spotify item to the queue.").addOption(OptionType.STRING, "query", "Spotify link, URI, or search", true),
                        new SubcommandData("play", "Resolve a Spotify item and play it now.").addOption(OptionType.STRING, "query", "Spotify link, URI, or search", true)
                    ),
                new SubcommandGroupData("playlist", "Spotify playlist actions.")
                    .addSubcommands(
                        new SubcommandData("list", "List playlists from the linked account."),
                        new SubcommandData("view", "View a playlist.").addOption(OptionType.STRING, "query", "Playlist name, ID, or URL", true),
                        new SubcommandData("play", "Resolve and play a playlist.").addOption(OptionType.STRING, "query", "Playlist name, ID, or URL", true)
                    ),
                new SubcommandGroupData("device", "Spotify device controls.")
                    .addSubcommands(
                        new SubcommandData("list", "List active Spotify devices."),
                        new SubcommandData("set", "Set the active Spotify device.").addOption(OptionType.STRING, "device", "Device name or ID", true)
                    )
            );

        return List.of(music, spotify);
    }
}
