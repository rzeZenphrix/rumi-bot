package rocks.rumi.music;

import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.requests.GatewayIntent;
import rocks.rumi.music.cache.CacheService;
import rocks.rumi.music.commands.CommandHandler;
import rocks.rumi.music.config.MusicConfig;
import rocks.rumi.music.embeds.EmbedFactory;
import rocks.rumi.music.lavalink.LavalinkNodeRouter;
import rocks.rumi.music.lavalink.LavalinkRuntimeService;
import rocks.rumi.music.lavalink.NodeManager;
import rocks.rumi.music.discord.EventListener;
import rocks.rumi.music.discord.ReadyListener;
import rocks.rumi.music.http.HealthServer;
import rocks.rumi.music.permissions.PermissionService;
import rocks.rumi.music.player.MusicManager;
import rocks.rumi.music.player.TrackScheduler;
import rocks.rumi.music.persistence.MusicPersistenceService;
import rocks.rumi.music.persistence.SupabaseRestClient;
import rocks.rumi.music.queue.QueueService;
import rocks.rumi.music.settings.SettingsService;
import rocks.rumi.music.spotify.SearchScorer;
import rocks.rumi.music.spotify.SpotifyApiService;
import rocks.rumi.music.spotify.SpotifyOAuthService;
import rocks.rumi.music.spotify.SpotifyTrackResolver;
import rocks.rumi.music.ui.PlayerPanelService;

public final class RumiMusicApplication {
    private RumiMusicApplication() {
    }

    public static void main(String[] args) throws Exception {
        MusicConfig config = MusicConfig.fromEnv();
        QueueService queueService = new QueueService(new TrackScheduler());
        SettingsService settingsService = new SettingsService();
        CacheService cacheService = new CacheService();
        MusicPersistenceService persistenceService = new MusicPersistenceService(new SupabaseRestClient(config));
        SpotifyApiService spotifyApiService = new SpotifyApiService(config);
        SpotifyOAuthService spotifyOAuthService = new SpotifyOAuthService(persistenceService);
        SpotifyTrackResolver resolver = new SpotifyTrackResolver(spotifyApiService, new SearchScorer(), cacheService);
        NodeManager nodeManager = new NodeManager(config, new LavalinkNodeRouter(config));
        LavalinkRuntimeService runtimeService = new LavalinkRuntimeService(config);
        MusicManager musicManager = new MusicManager(
            queueService,
            settingsService,
            nodeManager,
            resolver,
            new PlayerPanelService(),
            persistenceService,
            runtimeService
        );
        musicManager.restoreState();
        CommandHandler commandHandler = new CommandHandler(
            musicManager,
            spotifyApiService,
            spotifyOAuthService,
            resolver,
            new PermissionService(),
            new EmbedFactory()
        );
        HealthServer server = new HealthServer(config, musicManager, spotifyOAuthService);
        server.start();

        if (config.discordToken().isBlank()) {
            System.out.println("[rumi-music] DISCORD_TOKEN is missing; health server started without Discord login.");
            return;
        }

        JDABuilder builder = JDABuilder.createDefault(
                config.discordToken(),
                GatewayIntent.GUILD_VOICE_STATES,
                GatewayIntent.GUILD_MESSAGES,
                GatewayIntent.MESSAGE_CONTENT
        );
        if (runtimeService.voiceInterceptor() != null) {
            builder.setVoiceDispatchInterceptor(runtimeService.voiceInterceptor());
        }
        JDA jda = builder
            .addEventListeners(
                new ReadyListener(config),
                new EventListener(commandHandler)
            )
            .build();
        jda.awaitReady();

        runtimeService.attachJda(jda);
    }
}
