package rocks.rumi.music.discord;

import net.dv8tion.jda.api.events.session.ReadyEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import rocks.rumi.music.config.MusicConfig;

public final class ReadyListener extends ListenerAdapter {
    private final MusicConfig config;

    public ReadyListener(MusicConfig config) {
        this.config = config;
    }

    @Override
    public void onReady(ReadyEvent event) {
        if (config.registerSlashCommands()) {
            for (var command : SlashCommandCatalog.commands()) {
                event.getJDA().upsertCommand(command).queue();
            }
        }

        System.out.printf(
            "[rumi-music] ready as %s | supabase=%s | lavalink=%s | spotify=%s | google=%s | slashRegister=%s | slashListen=%s%n",
            event.getJDA().getSelfUser().getAsTag(),
            config.supabaseConfigured(),
            config.lavalinkConfigured(),
            config.spotifyConfigured(),
            config.googleConfigured(),
            config.registerSlashCommands(),
            config.listenSlashInteractions()
        );
    }
}
