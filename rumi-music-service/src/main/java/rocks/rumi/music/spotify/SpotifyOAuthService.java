package rocks.rumi.music.spotify;

import rocks.rumi.music.config.MusicConfig;
import rocks.rumi.music.persistence.MusicPersistenceService;

public final class SpotifyOAuthService {
    private final MusicConfig config;
    private final MusicPersistenceService persistenceService;
    private final SpotifyOAuthClient oauthClient;

    public SpotifyOAuthService(MusicConfig config, MusicPersistenceService persistenceService) {
        this.config = config;
        this.persistenceService = persistenceService;
        this.oauthClient = new SpotifyOAuthClient(config);
    }

    public boolean canStartLink() {
        return config.spotifyOAuthConfigured();
    }

    public String createAuthorizationUrl(long userId) {
        return oauthClient.createAuthorizationUrl(userId);
    }

    public SpotifyOAuthClient.OAuthCompletion completeAuthorizationCode(String code, String state) throws java.io.IOException, InterruptedException {
        SpotifyOAuthClient.OAuthCompletion completion = oauthClient.completeAuthorizationCode(code, state);
        saveLink(
            completion.userId(),
            completion.spotifyUserId(),
            completion.spotifyDisplayName(),
            completion.refreshToken(),
            completion.accessToken(),
            completion.accessTokenExpiresAt(),
            completion.scope()
        );
        return completion;
    }

    public void saveLink(
        long userId,
        String spotifyUserId,
        String spotifyDisplayName,
        String refreshToken,
        String accessToken,
        long accessTokenExpiresAt,
        String scope
    ) {
        MusicPersistenceService.SpotifyLinkState next = new MusicPersistenceService.SpotifyLinkState(
            spotifyUserId == null || spotifyUserId.isBlank() ? ("spotify-user-" + userId) : spotifyUserId,
            spotifyDisplayName == null ? "" : spotifyDisplayName,
            refreshToken == null ? "" : refreshToken,
            accessToken == null ? "" : accessToken,
            accessTokenExpiresAt,
            "",
            "",
            false,
            false,
            "balanced",
            scope == null ? "" : scope
        );
        persistenceService.saveSpotifyLink(userId, next);
    }

    public boolean unlink(long userId) {
        boolean linked = isLinked(userId);
        persistenceService.deleteSpotifyLink(userId);
        return linked;
    }

    public boolean isLinked(long userId) {
        return persistenceService.loadSpotifyLink(userId) != null;
    }

    public String status(long userId) {
        MusicPersistenceService.SpotifyLinkState link = persistenceService.loadSpotifyLink(userId);
        if (link == null) return "not linked";
        String label = link.spotifyDisplayName() == null || link.spotifyDisplayName().isBlank()
            ? link.spotifyUserId()
            : link.spotifyDisplayName() + " (" + link.spotifyUserId() + ")";
        return "linked as " + label;
    }

    public MusicPersistenceService.SpotifyLinkState state(long userId) {
        return persistenceService.loadSpotifyLink(userId);
    }

    public void setDevice(long userId, String deviceId, String deviceName) {
        MusicPersistenceService.SpotifyLinkState current = persistenceService.loadSpotifyLink(userId);
        if (current == null) return;
        persistenceService.saveSpotifyLink(userId, new MusicPersistenceService.SpotifyLinkState(
            current.spotifyUserId(),
            current.spotifyDisplayName(),
            current.refreshToken(),
            current.accessToken(),
            current.accessTokenExpiresAt(),
            deviceId == null ? "" : deviceId,
            deviceName == null ? "" : deviceName,
            current.autosync(),
            current.followMode(),
            current.priority(),
            current.scope()
        ));
    }

    public void setModes(long userId, boolean autosync, boolean followMode, String priority) {
        MusicPersistenceService.SpotifyLinkState current = persistenceService.loadSpotifyLink(userId);
        if (current == null) return;
        persistenceService.saveSpotifyLink(userId, new MusicPersistenceService.SpotifyLinkState(
            current.spotifyUserId(),
            current.spotifyDisplayName(),
            current.refreshToken(),
            current.accessToken(),
            current.accessTokenExpiresAt(),
            current.deviceId(),
            current.deviceName(),
            autosync,
            followMode,
            priority == null || priority.isBlank() ? current.priority() : priority,
            current.scope()
        ));
    }
}
