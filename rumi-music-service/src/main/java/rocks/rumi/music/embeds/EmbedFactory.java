package rocks.rumi.music.embeds;

import net.dv8tion.jda.api.EmbedBuilder;
import rocks.rumi.music.model.CommandResult;

public final class EmbedFactory {
    public EmbedBuilder build(CommandResult result) {
        EmbedBuilder embed = new EmbedBuilder()
            .setColor(result.color() == null ? 0x5865F2 : result.color())
            .setDescription(result.description());
        if (result.title() != null && !result.title().isBlank()) {
            embed.setTitle(result.title());
        }
        if (result.thumbnail() != null && !result.thumbnail().isBlank()) {
            embed.setThumbnail(result.thumbnail());
        }
        if (result.footer() != null && !result.footer().isBlank()) {
            embed.setFooter(result.footer());
        }
        if (result.fields() != null) {
            for (CommandResult.EmbedField field : result.fields().stream().limit(25).toList()) {
                if (field == null) continue;
                embed.addField(field.name(), field.value(), field.inline());
            }
        }
        return embed;
    }
}
