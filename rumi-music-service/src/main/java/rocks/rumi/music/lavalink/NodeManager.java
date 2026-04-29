package rocks.rumi.music.lavalink;

import rocks.rumi.music.config.MusicConfig;

public final class NodeManager {
    private final MusicConfig config;
    private final LavalinkNodeRouter router;

    public NodeManager(MusicConfig config, LavalinkNodeRouter router) {
        this.config = config;
        this.router = router;
    }

    public boolean configured() {
        return config.lavalinkConfigured();
    }

    public String healthSummary() {
        return configured()
            ? "Lavalink configured with resume key `" + config.lavalinkResumeKey() + "`. " + router.routeSummary()
            : "Lavalink is not configured yet.";
    }

    public LavalinkNodeRouter router() {
        return router;
    }

    public String failover() {
        if (!configured()) return "No Lavalink node is configured.";
        return "Failed over to `" + router.failover() + "`.";
    }
}
