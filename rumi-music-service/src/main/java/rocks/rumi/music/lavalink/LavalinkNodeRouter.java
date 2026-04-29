package rocks.rumi.music.lavalink;

import rocks.rumi.music.config.MusicConfig;

public final class LavalinkNodeRouter {
    private final MusicConfig config;
    private int currentIndex;

    public LavalinkNodeRouter(MusicConfig config) {
        this.config = config;
    }

    public String routeSummary() {
        if (config.lavalinkNodes().isEmpty()) return "No Lavalink nodes configured.";
        return "Active node: " + activeNode() + " | total nodes: " + config.lavalinkNodes().size();
    }

    public String activeNode() {
        if (config.lavalinkNodes().isEmpty()) return "";
        if (currentIndex >= config.lavalinkNodes().size()) currentIndex = 0;
        return config.lavalinkNodes().get(currentIndex);
    }

    public String failover() {
        if (config.lavalinkNodes().isEmpty()) return "";
        currentIndex = (currentIndex + 1) % config.lavalinkNodes().size();
        return activeNode();
    }
}
