const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.disable("x-powered-by");
app.use(express.json());

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5500,http://127.0.0.1:5500,https://cine-ai-9mob.onrender.com,https://cine-ai-pi.vercel.app")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // Consente richieste server-to-server e tool locali senza origin header.
        if (!origin) return callback(null, true);
        // Supporta Live Server su porte dinamiche (5500, 5501, 5502, ...).
        if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin non autorizzata"), false);
    },
    methods: ["GET"],
    credentials: false
}));

const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) {
    console.error("TMDB_API_KEY mancante nel file .env");
}

const GENRE_MAP = {
    azione: 28, avventura: 12, animazione: 16, commedia: 35,
    crime: 80, documentario: 99, drammatico: 18, famiglia: 10751,
    fantasy: 14, storia: 36, horror: 27, musicale: 10402,
    mistero: 9648, romantico: 10749, fantascienza: 878,
    thriller: 53, guerra: 10752, western: 37
};

const ALLOWED_MOODS = new Set(["mentale", "evasione", "emozioni_forti", "comfort", "curioso"]);
const ALLOWED_EPOCA = new Set(["recente", "classici", "misto"]);

const WINDOW_MS = 60 * 1000;
const MAX_REQ_PER_WINDOW = 120;
const rateStore = new Map();

function rateLimit(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const current = rateStore.get(key) || { count: 0, resetAt: now + WINDOW_MS };

    if (now > current.resetAt) {
        current.count = 0;
        current.resetAt = now + WINDOW_MS;
    }

    current.count += 1;
    rateStore.set(key, current);

    if (current.count > MAX_REQ_PER_WINDOW) {
        return res.status(429).json({ error: "Troppe richieste, riprova tra poco." });
    }

    return next();
}

app.use(rateLimit);

function normalizeTempo(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 120;
    return Math.min(300, Math.max(30, Math.round(n)));
}

function validateFilmsQuery(req, res, next) {
    const { mood, tempo, genere, epoca, page } = req.query;

    if (!mood || !ALLOWED_MOODS.has(mood)) {
        return res.status(400).json({ error: "Parametro mood non valido." });
    }

    if (!genere || !GENRE_MAP[genere]) {
        return res.status(400).json({ error: "Parametro genere non valido." });
    }

    if (epoca && !ALLOWED_EPOCA.has(epoca)) {
        return res.status(400).json({ error: "Parametro epoca non valido." });
    }

    const normalizedPage = Number(page);
    req.query.page = Number.isFinite(normalizedPage)
        ? Math.min(50, Math.max(1, Math.round(normalizedPage)))
        : 1;
    req.query.tempo = normalizeTempo(tempo);
    return next();
}

function tmdbUrl(path, query = "") {
    return `https://api.themoviedb.org/3${path}?api_key=${API_KEY}&language=it-IT${query}`;
}

// endpoint test
app.get("/movies/popular", async (req, res) => {
try {
const response = await axios.get(
`https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}&language=it-IT`
);

res.json(response.data);

} catch (error) {
res.status(500).json({ error: "Errore server" });
}
});

app.listen(3000, () => {
console.log("Server attivo su http://localhost:3000");
});
app.get("/api/hero", async (req, res) => {
    try {
        const genreRaw = Number(req.query.genre);
        const genre = Number.isFinite(genreRaw) ? genreRaw : 28;

        const url = tmdbUrl("/discover/movie", `&with_genres=${genre}&sort_by=popularity.desc`);

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: "Errore TMDB", details: data });
        }

        res.json(data);

    } catch (error) {
        res.status(500).json({ error: "Errore server" });
    }
});
app.get("/api/films", validateFilmsQuery, async (req, res) => {

    const { mood, tempo, genere, epoca, page } = req.query;

    const genreId = GENRE_MAP[genere];
    const maxRuntime = Number(tempo) + 15;
    const minRuntime = 65;
    const minVoteCount = 120;
    const releaseWindow = epoca === "recente"
        ? "&primary_release_date.gte=2000-01-01"
        : epoca === "classici"
            ? "&primary_release_date.lte=1999-12-31"
            : "";
    const sortBy = mood === "mentale"
        ? "vote_average.desc"
        : mood === "emozioni_forti"
            ? "vote_count.desc"
            : "popularity.desc";

    try {

        const strictUrl = tmdbUrl("/discover/movie", `&with_genres=${genreId}&sort_by=${sortBy}&include_adult=false&vote_count.gte=${minVoteCount}&with_runtime.gte=${minRuntime}&with_runtime.lte=${maxRuntime}&page=${page}${releaseWindow}`);
        const strictResponse = await fetch(strictUrl);
        const strictData = await strictResponse.json();

        if (!strictResponse.ok) {
            return res.status(strictResponse.status).json({ error: "Errore TMDB", details: strictData });
        }

        if (Array.isArray(strictData.results) && strictData.results.length > 0) {
            return res.json(strictData);
        }

        // Fallback: se i filtri runtime/epoca sono troppo aggressivi,
        // allarghiamo la query per non lasciare la UI vuota.
        const relaxedUrl = tmdbUrl("/discover/movie", `&with_genres=${genreId}&sort_by=${sortBy}&include_adult=false&vote_count.gte=60&with_runtime.gte=60&page=${page}`);
        const relaxedResponse = await fetch(relaxedUrl);
        const relaxedData = await relaxedResponse.json();

        if (!relaxedResponse.ok) {
            return res.status(relaxedResponse.status).json({ error: "Errore TMDB", details: relaxedData });
        }

        return res.json(relaxedData);

    } catch (error) {
        console.error("Errore API films:", error);
        res.status(500).json({ error: "Errore server" });
    }
});

app.get("/api/film/:id", async (req, res) => {
    const { id } = req.params;
    const include = req.query.include || "";
    if (!/^\d+$/.test(id)) {
        return res.status(400).json({ error: "ID film non valido." });
    }
    const append = [];

    const includeTokens = String(include)
        .split(",")
        .map(x => x.trim().toLowerCase())
        .filter(Boolean);

    if (includeTokens.includes("videos")) append.push("videos");
    if (includeTokens.includes("providers")) append.push("watch/providers");
    if (includeTokens.includes("credits")) append.push("credits");

    const appendParam = append.length ? `&append_to_response=${encodeURIComponent(append.join(","))}` : "";

    try {
        const url = tmdbUrl(`/movie/${id}`, appendParam);
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: "Errore TMDB",
                details: data
            });
        }

        res.json(data);
    } catch (error) {
        console.error("Errore API film dettaglio:", error);
        res.status(500).json({ error: "Errore server" });
    }
});

app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
    if (err && err.message === "Origin non autorizzata") {
        return res.status(403).json({ error: "Origin non autorizzata." });
    }
    console.error("Errore non gestito:", err);
    return res.status(500).json({ error: "Errore server." });
});