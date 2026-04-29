package rocks.rumi.music.discord;

import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import rocks.rumi.music.commands.CommandHandler;

public final class EventListener extends ListenerAdapter {
    private final CommandHandler commandHandler;

    public EventListener(CommandHandler commandHandler) {
        this.commandHandler = commandHandler;
    }

    @Override
    public void onSlashCommandInteraction(SlashCommandInteractionEvent event) {
        commandHandler.handle(event);
    }
}
