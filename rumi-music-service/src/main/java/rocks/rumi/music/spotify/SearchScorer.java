package rocks.rumi.music.spotify;

public final class SearchScorer {
    public double score(String spotifyTitle, String candidateTitle) {
        String left = normalize(spotifyTitle);
        String right = normalize(candidateTitle);
        if (left.isBlank() || right.isBlank()) return 0;
        if (left.equals(right)) return 1.0;
        if (right.contains(left) || left.contains(right)) return 0.85;
        int overlap = 0;
        for (String token : left.split(" ")) {
            if (!token.isBlank() && right.contains(token)) overlap++;
        }
        return Math.min(0.8, overlap / (double) Math.max(1, left.split(" ").length));
    }

    private String normalize(String value) {
        return String.valueOf(value)
            .toLowerCase()
            .replaceAll("\\b(live|remix|nightcore|slowed|sped up)\\b", " ")
            .replaceAll("[^a-z0-9 ]", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }
}
