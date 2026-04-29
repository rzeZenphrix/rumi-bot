package rocks.rumi.music.model;

import java.util.List;

public record CommandResult(
    String title,
    String description,
    boolean ephemeral,
    Integer color,
    String thumbnail,
    List<EmbedField> fields,
    String footer
) {
    public record EmbedField(String name, String value, boolean inline) {
    }

    public static CommandResult info(String title, String description) {
        return new CommandResult(title, description, true, 0x5865F2, null, List.of(), null);
    }

    public static CommandResult rich(
        String title,
        String description,
        List<EmbedField> fields
    ) {
        return new CommandResult(title, description, true, 0x5865F2, null, fields, null);
    }

    public CommandResult withThumbnail(String nextThumbnail) {
        return new CommandResult(title, description, ephemeral, color, nextThumbnail, fields, footer);
    }

    public CommandResult withFooter(String nextFooter) {
        return new CommandResult(title, description, ephemeral, color, thumbnail, fields, nextFooter);
    }

    public CommandResult withColor(Integer nextColor) {
        return new CommandResult(title, description, ephemeral, nextColor, thumbnail, fields, footer);
    }
}
