package rocks.rumi.music.permissions;

import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;

public final class PermissionService {
    public boolean canRun(SlashCommandInteractionEvent event) {
        return event.getGuild() != null;
    }

    public String denyReason(SlashCommandInteractionEvent event) {
        if (event.getGuild() == null) return "Music commands only work in servers.";
        return "You cannot use this music command here.";
    }
}
