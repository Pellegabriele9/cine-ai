// 👀 INTERSECTION OBSERVER (animazione scroll)
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("show");

            observer.unobserve(entry.target); // animazione solo una volta
        }
    });
}, {
    threshold: 0.1
});

// 🔐 API KEY
let ultimiFilm = [];
let savedMovies = JSON.parse(localStorage.getItem("savedMovies")) || [];
let dislikedMovies = JSON.parse(localStorage.getItem("dislikedMovies")) || [];
let genreScores = JSON.parse(localStorage.getItem("genreScores")) || {};
let rerollSeed = 0;
const isTouchLikeDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
let userProfile = {
    moodHistory: [],
    genreHistory: [],
    likedGenres: {}
};

function syncSavedUI(filmId) {
    document.querySelectorAll(`.movie-card[data-id="${filmId}"] .save-btn`).forEach(btn => {
        btn.classList.toggle("saved", savedMovies.includes(filmId));
    });
}

function toggleSavedMovie(film) {
    const filmId = film.id;

    if (savedMovies.includes(filmId)) {
        savedMovies = savedMovies.filter(id => id !== filmId);
    } else {
        savedMovies.push(filmId);

        if (film.genre_ids) {
            film.genre_ids.forEach(g => {
                genreScores[g] = (genreScores[g] || 0) + 2;
            });
            localStorage.setItem("genreScores", JSON.stringify(genreScores));
        }
    }

    localStorage.setItem("savedMovies", JSON.stringify(savedMovies));
    syncSavedUI(filmId);
    mostraFilmSalvati();
}

document.addEventListener("DOMContentLoaded", () => {
    mostraFilmSalvati();
});


// 🎬 HERO DINAMICA
async function caricaHeroDinamica(genere = "azione") {
    try {
        const hero = document.getElementById("hero");

        const genreMap = {
            azione: 28,
            avventura: 12,
            animazione: 16,
            commedia: 35,
            crime: 80,
            documentario: 99,
            drammatico: 18,
            famiglia: 10751,
            fantasy: 14,
            storia: 36,
            horror: 27,
            musicale: 10402,
            mistero: 9648,
            romantico: 10749,
            fantascienza: 878,
            thriller: 53,
            guerra: 10752,
            western: 37
        };

        const genreId = genreMap[genere] || 28;

        const url = `http://localhost:3000/api/hero?genre=${genreId}`;

        const response = await fetch(url);
        const data = await response.json();

        const randomIndex = Math.floor(Math.random() * data.results.length);
        const film = data.results[randomIndex];

        const backdrop = film.backdrop_path
            ? `https://image.tmdb.org/t/p/original${film.backdrop_path}`
            : "";

        // fade smooth (già fatto)
        hero.style.opacity = "0";

        setTimeout(() => {
            hero.style.backgroundImage = `url(${backdrop})`;
            hero.style.opacity = "1";
        }, 200);

    } catch (error) {
        console.error("Errore hero:", error);
    }
}


function generaProfiloAI(mood, tempo, genere) {
    return {
        mood,
        tempo,
        genere,
        minVote: mood === "mentale" ? 7 : 6,
        preferShort: tempo < 100,
        preferPopular: mood === "comfort",
        preferIntense: mood === "emozioni_forti"
    };
}
// 🎬 CHIAMATA API TMDB
async function fetchFilmDaAPI(mood, tempo, genere, pageHint = null) {

    let sort = "popularity.desc";
    let minVote = 5.5;
    let minVotes = 150;
    if (genere === "documentario") {
        minVote = 5;
        minVotes = 20;
    }

    if (mood === "mentale") sort = "vote_average.desc";
    if (mood === "emozioni_forti") sort = "vote_count.desc";
    if (mood === "comfort") sort = "popularity.desc";

    try {
        // 🎯 genera generi intelligenti

        // 🎬 URL TMDB diretto
        const genreMap = {
            azione: 28, avventura: 12, animazione: 16, commedia: 35,
            crime: 80, documentario: 99, drammatico: 18, famiglia: 10751,
            fantasy: 14, storia: 36, horror: 27, musicale: 10402,
            mistero: 9648, romantico: 10749, fantascienza: 878,
            thriller: 53, guerra: 10752, western: 37
        };
        const generi = genreMap[genere] || 28;
        const randomPage = Math.floor(Math.random() * 10) + 1;
        const page = Number.isFinite(Number(pageHint)) ? Number(pageHint) : randomPage;

        const epoca = wizardData?.epoca || "misto";
        const url = `http://localhost:3000/api/films?mood=${mood}&tempo=${tempo}&genere=${genere}&epoca=${epoca}&page=${page}`;
        const response = await fetch(url);
        const data = await response.json();

        // 🔥 sicurezza totale
        if (!data || !Array.isArray(data.results)) {
            console.error("API rotta:", data);
            return [];
        }

        const results = data.results;

        const ordinati = results.sort((a, b) => {

            const score = (f) => {

                let s = 0;

                // 🎯 qualità base
                s += f.vote_average * 2;

                // 🎯 affidabilità (log per non esagerare)
                s += Math.log10(f.vote_count + 1) * 2;

                // 🎯 popolarità
                s += f.popularity * 0.01;

                // 🎯 bonus lingua (SOFT, non blocca)
                if (f.original_language === "en" || f.original_language === "it") {
                    s += 2;
                }

                return s;
            };

            return score(b) - score(a);
        });

        const titoliVisti = new Set();

        const filtrati = ordinati.filter(f => {

            if (ultimiFilm.includes(f.id)) return false;
            if (dislikedMovies.includes(f.id)) return false;

            let titolo = f.title.toLowerCase();

            titolo = titolo.replace(/\d+/g, "");
            titolo = titolo.replace(/chapter|parte|part|episode/gi, "");
            titolo = titolo.split(":")[0];
            titolo = titolo.trim();

            if (titoliVisti.has(titolo)) return false;

            titoliVisti.add(titolo);

            return true;
        });

        // fallback: se i filtri "soft" svuotano troppo la lista, riapriamo
        // la selezione tenendo solo il blocco dei dislike.
        const pool = filtrati.length >= 12
            ? filtrati
            : ordinati.filter(f => !dislikedMovies.includes(f.id) && !ultimiFilm.includes(f.id));

        ultimiFilm = pool.slice(0, 10).map(f => f.id);

        return pool.slice(0, 40);


    } catch (error) {
        console.error("Errore fetch:", error);
        return [];
    }
}

// 🎬 APRE MODALE CON DETTAGLI + TRAILER
async function apriModale(film, card) {

    // 🔥 pulizia fallback vecchi
    document.querySelectorAll(".trailer-fallback").forEach(e => e.remove());
    const modal = document.getElementById("modal");
    const trailerFrame = modal.querySelector("#trailer");
    const info = modal.querySelector("#modal-info"); const rect = card.getBoundingClientRect();

    const startX = rect.left;
    const startY = rect.top;
    const startWidth = rect.width;
    const startHeight = rect.height;


    modal.classList.add("active");
    document.body.classList.add("blur-active");
    document.body.style.overflow = "hidden";

    const modalContent = modal.querySelector(".modal-content");
    // aspetta un frame (IMPORTANTISSIMO)
    requestAnimationFrame(() => {

        const endWidth = window.innerWidth * 0.9;
        const endHeight = window.innerHeight * 0.8;

        const endX = (window.innerWidth - endWidth) / 2;
        const endY = (window.innerHeight - endHeight) / 2;

        const scaleX = startWidth / endWidth;
        const scaleY = startHeight / endHeight;

        const translateX = startX - endX;
        const translateY = startY - endY;

        modalContent.style.transform = `
        translate(${translateX}px, ${translateY}px)
        scale(${scaleX}, ${scaleY})
    `;
        modalContent.style.opacity = "0";

        modalContent.getBoundingClientRect();

        modalContent.style.transition = "all 0.4s cubic-bezier(0.22, 1, 0.36, 1)";
        modalContent.style.transform = "translate(0,0) scale(1,1)";
        modalContent.style.opacity = "1";

    });


    // reset corretto
    // 🔥 RESET TOTALE IFRAME (FIX BOX NERO)
    trailerFrame.src = "";
    trailerFrame.removeAttribute("src"); // 🔥 importantissimo
    trailerFrame.style.display = "none";
    // reset



    try {

        const url = `http://localhost:3000/api/film/${film.id}?include=videos,providers,credits`;
        const res = await fetch(url);
        const data = await res.json();
        modal.querySelector("#modal-title-header").textContent = data.title;

        // 🎬 BACKDROP
        const backdrop = data.backdrop_path
            ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
            : "";

        modal.style.backgroundImage = `url(${backdrop})`;
        modal.style.backgroundSize = "cover";
        modal.style.backgroundPosition = "center";

        // 🎬 TRAILER
        function getTrailer(videos) {
            if (!videos || !videos.results) return null;

            const trailer = videos.results.find(v =>
                v.type === "Trailer" &&
                v.site === "YouTube" &&
                v.official === true
            );

            const fallback = videos.results.find(v =>
                v.type === "Trailer" &&
                v.site === "YouTube"
            );

            return trailer || fallback || null;
        }

        // 🎬 PROVIDERS
        const providers = data["watch/providers"]?.results?.IT?.flatrate || [];

        let providersHTML = "";

        if (providers.length > 0) {
            const unique = [];
            const names = new Set();

            providers.forEach(p => {
                if (!names.has(p.provider_name)) {
                    names.add(p.provider_name);
                    unique.push(p);
                }
            });

            const topProviders = unique.slice(0, 5);

            providersHTML = `
            <div class="providers-clean">
                <p class="provider-title">Disponibile su</p>
                <div class="providers-row">
                    ${topProviders.map(p => `
                        <a href="${getAffiliateLink(p.provider_name, data.title)}" target="_blank" class="provider-pill" title="${p.provider_name}">
                            <img src="https://image.tmdb.org/t/p/w92${p.logo_path}" 
                                 class="provider-logo-clean"
                                 alt="${p.provider_name}">
                            <span>${p.provider_name}</span>
                        </a>
                    `).join("")}
                </div>
            </div>
        `;
        } else {
            providersHTML = `<p class="no-provider">Non disponibile in streaming</p>`;
        }

        // 🎬 TRAILER LOGIC
        // 🎬 TRAILER LOGIC (FIX)
        const trailer = getTrailer(data.videos);
        let mediaHTML = "";

        const trailerWrapper = modal.querySelector(".trailer-wrapper");
        if (trailer && trailer.key) {
            modal.classList.remove("no-trailer");
            trailerFrame.style.display = "block";
            trailerWrapper.style.display = "block";

            trailerFrame.src = `https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&rel=0`;

        } else {
            modal.classList.add("no-trailer");
            trailerFrame.style.display = "none";
            trailerWrapper.style.display = "none"; // 🔥 FIX VERO

            const poster = data.poster_path
                ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
                : "";

            mediaHTML = `<img src="${poster}" class="fallback-poster">`;
        }

        // 🎬 RENDER FINALE
        const generi = data.genres?.map(g => g.name).join(" • ") || "";
        const durata = data.runtime ? `⏱ ${data.runtime} min` : "";
        const voto = data.vote_average ? `⭐ ${data.vote_average.toFixed(1)}` : "";
        const cast = data.credits?.cast?.slice(0, 5) || [];
        const castHTML = cast.length ? `
    <div class="cast-strip">
        <p class="provider-title">Cast principale</p>
        <div class="cast-row">
            ${cast.map(person => `
                <div class="cast-chip">
                    ${person.profile_path
                ? `<img src="https://image.tmdb.org/t/p/w185${person.profile_path}" alt="${person.name}">`
                : `<div class="cast-avatar">${person.name.charAt(0)}</div>`}
                    <span>${person.name}</span>
                </div>
            `).join("")}
        </div>
    </div>
` : "";
        const modalReason = generaMotivoBreve(wizardData.mood || "comfort");
        const isSaved = savedMovies.includes(data.id);

        info.innerHTML = `
    ${mediaHTML}
    <div class="modal-title-row">
        <h2>
            ${data.title}
            <span class="year">${data.release_date?.split("-")[0] || "—"}</span>
        </h2>
    </div>
    <div class="modal-meta-row">
        ${voto ? `<span class="modal-badge">${voto}</span>` : ""}
        ${durata ? `<span class="modal-badge">${durata}</span>` : ""}
        ${generi ? `<span class="modal-badge">${generi}</span>` : ""}
    </div>
    <button class="modal-save-btn ${isSaved ? "saved" : ""}" id="modalSaveBtn">
        ${isSaved ? "❤️ Salvato" : "🤍 Salva"}
    </button>
    <div class="modal-ai-reason">${modalReason}</div>
    <p>${data.overview || "Trama non disponibile"}</p>
    ${castHTML}
    <div class="providers-container">
        ${providersHTML}
    </div>
`;

        const modalSaveBtn = document.getElementById("modalSaveBtn");
        modalSaveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSavedMovie({
                id: data.id,
                genre_ids: data.genres?.map(g => g.id) || film.genre_ids || []
            });
            const nowSaved = savedMovies.includes(data.id);
            modalSaveBtn.classList.toggle("saved", nowSaved);
            modalSaveBtn.textContent = nowSaved ? "❤️ Salvato" : "🤍 Salva";
        });

    } catch (error) {
        console.error("Errore modale:", error);
        info.innerHTML = "<p>Errore nel caricamento dei dettagli 😢</p>";
    }
}

async function mostraFilm(listaFilm, container) {

    if (!Array.isArray(listaFilm) || listaFilm.length === 0) {
        container.innerHTML = "<p>Nessun film trovato 😢</p>";
        return;
    }

    const filmsWithDetails = await Promise.all(
        listaFilm.map(async (film) => {
            if (typeof film.runtime === "number") return film;

            try {
                const detailsRes = await fetch(`http://localhost:3000/api/film/${film.id}`);
                const details = await detailsRes.json();
                return {
                    ...film,
                    runtime: typeof details.runtime === "number" ? details.runtime : undefined
                };
            } catch (_error) {
                return film;
            }
        })
    );

    const tempoUtente = wizardData.tempo || 120;
    const tolleranza = 10;
    const maxDurata = tempoUtente + tolleranza;

    const filtratiPerRuntime = filmsWithDetails.filter(film => {
        if (typeof film.runtime !== "number") return true;
        if (film.runtime < 60) return false;
        return film.runtime <= maxDurata;
    });

    // Evita UI vuota per un filtro runtime troppo aggressivo.
    const filmDaMostrare = (filtratiPerRuntime.length > 0 ? filtratiPerRuntime : listaFilm).slice(0, 12);

    filmDaMostrare.forEach((film) => {

        const poster = film.poster_path
            ? `https://image.tmdb.org/t/p/w500${film.poster_path}`
            : "";

        const durata = film.runtime ? ` • ⏱ ${film.runtime} min` : "";

        const card = document.createElement("div");
        card.classList.add("movie-card");
        card.dataset.id = film.id;

        card.addEventListener("mousemove", (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty("--x", x + "px");
            card.style.setProperty("--y", y + "px");
        });



        card.innerHTML = `
    <div class="card-media">
        <div class="actions">
            <div class="save-btn">❤️</div>
            <div class="dislike-btn">👎</div>
        </div>
        <img src="${poster}" alt="${film.title}" class="poster">
        <div class="overlay-card">
    <h3>${film.title}</h3>
    <p>⭐ ${film.vote_average.toFixed(1)}${durata}</p>
    <div class="watch-btn">🎬 Scopri di più</div>
</div>
    </div>
`;
        const saveBtn = card.querySelector(".save-btn");
        const dislikeBtn = card.querySelector(".dislike-btn");

        // stato iniziale
        if (dislikedMovies.includes(film.id)) {
            card.style.display = "none";
        }

        // click dislike
        dislikeBtn.addEventListener("click", (e) => {
            e.stopPropagation();

            if (!dislikedMovies.includes(film.id)) {
                dislikedMovies.push(film.id);
                localStorage.setItem("dislikedMovies", JSON.stringify(dislikedMovies));
            }

            // rimuovi anche dai preferiti se c’è
            savedMovies = savedMovies.filter(id => id !== film.id);
            localStorage.setItem("savedMovies", JSON.stringify(savedMovies));

            // animazione + sparizione
            card.style.transform = "scale(0.8)";
            card.style.opacity = "0";

            setTimeout(() => {
                card.remove();
            }, 300);

            mostraFilmSalvati();
        });
        // stato iniziale
        if (savedMovies.includes(film.id)) {
            saveBtn.classList.add("saved");
        }

        // click salva
        saveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSavedMovie(film);

            if (savedMovies.includes(film.id)) {
                saveBtn.style.transform = "scale(1.4)";
                setTimeout(() => {
                    saveBtn.style.transform = "scale(1)";
                }, 200);
            }
        });
        card.addEventListener("click", () => {

            card.classList.add("clicked");

            let opened = false;

            const open = () => {
                if (opened) return;
                opened = true;

                apriModale(film, card);
                card.classList.remove("clicked");
            };

            // animazione desktop
            card.addEventListener("transitionend", open, { once: true });

            // fallback mobile (🔥 fondamentale)
            setTimeout(open, 250);

        });

        card.style.opacity = "0";
        card.style.transform = "translateY(30px)";

        container.appendChild(card);

        setTimeout(() => {
            card.style.transition = "all 0.6s ease";
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        }, 100);
        card.style.transitionDelay = (Math.random() * 0.2) + "s";
        observer.observe(card);



    });

}

async function mostraTop3(lista, container) {
    const filmsWithDetails = await Promise.all(
        lista.map(async (film) => {
            const res = await fetch(`http://localhost:3000/api/film/${film.id}`);
            const data = await res.json();
            return {
                ...film,
                runtime: data.runtime,
                backdrop_path: data.backdrop_path || film.backdrop_path,
                overview: data.overview || film.overview,
                genres: data.genres || []
            };
        })
    );
    filmsWithDetails.forEach((film, index) => {

        const poster = film.poster_path
            ? `https://image.tmdb.org/t/p/w500${film.poster_path}`
            : "";
        const backdrop = film.backdrop_path
            ? `https://image.tmdb.org/t/p/original${film.backdrop_path}`
            : poster;
        const generi = film.genres?.slice(0, 3).map(g => g.name).join(" • ") || "";
        const motivo = generaMotivoBreve(wizardData.mood || "comfort");

        const card = document.createElement("div");
        card.classList.add("top-card");
        card.dataset.id = film.id;
        if (index === 0) card.classList.add("top-card-featured");

        card.innerHTML = index === 0 ? `
            <img src="${backdrop}" class="top-poster top-backdrop" alt="${film.title}">
            <div class="badge">TOP PICK</div>
            <div class="top-overlay">
                <p class="top-kicker">Scelta CineAI per questa serata</p>
                <h2>${film.title}</h2>
                <p class="top-meta">
                    ⭐ ${film.vote_average.toFixed(1)}
                    ${film.runtime ? `• ⏱ ${film.runtime} min` : ""}
                    ${generi ? `• ${generi}` : ""}
                </p>
                <p class="top-synopsis">${film.overview || "Una scelta forte per il mood che hai impostato."}</p>
                <div class="top-reason">${motivo}</div>
                <div class="watch-btn">🎬 Scopri di più</div>
            </div>
        ` : `
            <img src="${poster}" class="top-poster">

            <div class="top-overlay">
    <h2>${film.title}</h2>

    <p class="top-meta">
        ⭐ ${film.vote_average.toFixed(1)}
        ${film.runtime ? `• ⏱ ${film.runtime} min` : ""}
    </p>
    <div class="watch-btn">🎬 Scopri di più</div>
</div>
        `;

        card.addEventListener("click", () => {
            apriModale(film, card);
        });

        container.appendChild(card);
    });
}


function calcolaGeneriPreferiti(mood, tempo, genereUtente) {

    let score = { ...genreScores }; // 👈 usa lo storico reale

    // fallback se vuoto
    if (Object.keys(score).length === 0) {
        score = {
            28: 1, 12: 1, 35: 1, 18: 1,
            10749: 1, 878: 1, 9648: 1, 14: 1, 10751: 1
        };
    }

    // 🎭 MOOD BOOST
    if (mood === "mentale") {
        score[18] = (score[18] || 0) + 4;
        score[9648] = (score[9648] || 0) + 3;
    }

    if (mood === "evasione") {
        score[14] = (score[14] || 0) + 4;
        score[12] = (score[12] || 0) + 3;
    }

    if (mood === "emozioni_forti") {
        score[28] = (score[28] || 0) + 4;
        score[53] = (score[53] || 0) + 3;
    }

    if (mood === "comfort") {
        score[35] = (score[35] || 0) + 4;
        score[10751] = (score[10751] || 0) + 3;
    }

    // ⏱ TEMPO
    if (tempo < 100) {
        score[35] = (score[35] || 0) + 2;
    } else {
        score[18] = (score[18] || 0) + 2;
    }

    // 🎯 GENERE UTENTE = priorità MASSIMA
    const genreMap = {
        azione: 28,
        avventura: 12,
        animazione: 16,
        commedia: 35,
        crime: 80,
        documentario: 99,
        drammatico: 18,
        famiglia: 10751,
        fantasy: 14,
        storia: 36,
        horror: 27,
        musicale: 10402,
        mistero: 9648,
        romantico: 10749,
        fantascienza: 878,
        thriller: 53,
        guerra: 10752,
        western: 37
    };

    const userGenreId = genreMap[genereUtente];

    if (userGenreId) {
        score[userGenreId] = (score[userGenreId] || 0) + 6;
    }

    // 🔥 ordina
    const sorted = Object.entries(score)
        .sort((a, b) => b[1] - a[1])
        .map(g => g[0]);

    // 🎬 ritorna top 2
    // 🎯 genere utente SEMPRE incluso
    if (userGenreId) {
        const altriGeneri = sorted.filter(g => g != userGenreId);
        return [userGenreId, altriGeneri[0]].join(",");
    }

    return sorted.slice(0, 2).join(",");
}
function generaMotivoBreve(mood) {

    const map = {
        mentale: [
            "🧠 Ti farà riflettere",
            "🧩 Ricco di significato",
            "🎯 Stimolante e profondo"
        ],
        evasione: [
            "🌍 Perfetto per staccare",
            "✨ Ti porta altrove",
            "🎬 Intrattenimento puro"
        ],
        emozioni_forti: [
            "🔥 Ritmo altissimo",
            "⚡ Tensione continua",
            "💥 Adrenalina pura"
        ],
        comfort: [
            "😌 Leggero e rilassante",
            "🍿 Perfetto per una serata easy",
            "😊 Zero stress, solo piacere"
        ],
        curioso: [
            "✨ Qualcosa di diverso",
            "🎥 Fuori dai soliti schemi",
            "🧪 Esperienza originale"
        ]
    };

    const options = map[mood] || ["🎯 Consigliato per te"];

    return options[Math.floor(Math.random() * options.length)];
}
function generaSpiegazione(mood, tempo, genere) {

    const moodMap = {
        mentale: "ho cercato storie con più sostanza, ritmo meno usa-e-getta e un buon voto medio",
        evasione: "ho privilegiato film capaci di portarti altrove senza chiederti troppa fatica",
        emozioni_forti: "ho alzato la soglia su tensione, energia e film con tanto passaparola",
        comfort: "ho evitato scelte troppo pesanti e ho spinto titoli più facili da abitare stasera",
        curioso: "ho lasciato spazio a film meno ovvi, con un'identità più riconoscibile"
    };

    const tempoText = tempo < 90
        ? `Restando sotto circa ${tempo} minuti, ho tagliato fuori i film troppo lunghi.`
        : tempo > 150
            ? `Con ${tempo} minuti disponibili, posso permettermi film più ampi e immersivi.`
            : `Con ${tempo} minuti, ho tenuto un equilibrio tra ritmo e storia.`;

    const epocaText = wizardData.epoca === "recente"
        ? "Ho dato priorità a titoli dal 2000 in poi."
        : wizardData.epoca === "classici"
            ? "Ho pescato soprattutto tra film più classici, senza rincorrere solo le uscite recenti."
            : "Ho lasciato l'epoca aperta per non perdere titoli forti fuori dal filtro principale.";

    return `${moodMap[mood] || "ho cercato un consiglio equilibrato per la tua serata"}. ${tempoText} ${epocaText} Il genere ${genere} resta il baricentro della selezione.`;
}
// ❌ CHIUDI MODALE
document.addEventListener("click", (e) => {
    if (e.target.id === "closeModal" || e.target.id === "modal") {
        document.getElementById("modal").classList.remove("active");
        document.body.classList.remove("blur-active");
        const modalContent = document.querySelector(".modal-content");
        modalContent.style.transition = "none";
        modalContent.style.transform = "";
        modalContent.style.opacity = "";
        document.body.style.overflow = "auto";

        const trailer = document.getElementById("trailer");
        trailer.src = "";
        trailer.removeAttribute("src");
        trailer.style.display = "none"; // 🔥 evita glitch
    }


});

async function mostraFilmSalvati() {
    const container = document.getElementById("savedResults");
    const count = document.getElementById("savedCount");
    const clearBtn = document.getElementById("clearSaved");

    container.innerHTML = "";
    const label = savedMovies.length === 1 ? "1 film salvato" : `${savedMovies.length} film salvati`;
    if (count) count.textContent = label;
    if (clearBtn) clearBtn.disabled = savedMovies.length === 0;

    if (savedMovies.length === 0) {
        container.innerHTML = `
            <div class="saved-empty">
                <span>❤️</span>
                <p>Nessun film salvato</p>
            </div>
        `;
        return;
    }

    for (let id of savedMovies) {
        try {
            const res = await fetch(`http://localhost:3000/api/film/${id}`);
            const film = await res.json();

            const poster = film.poster_path
                ? `https://image.tmdb.org/t/p/w500${film.poster_path}`
                : "";

            const card = document.createElement("div");
            card.classList.add("movie-card");
            card.dataset.id = film.id;
            const anno = film.release_date?.split("-")[0] || "—";

            card.innerHTML = `
    <div class="card-media">

        <div class="remove-btn">✕</div>

        <img src="${poster}" class="poster">

        <div class="saved-card-info">
            <h3>${film.title}</h3>
            <p>${anno} • ⭐ ${film.vote_average ? film.vote_average.toFixed(1) : "N/D"}</p>
        </div>
    </div>
`;
            const removeBtn = card.querySelector(".remove-btn");

            removeBtn.addEventListener("click", (e) => {
                e.stopPropagation();

                // rimuovi da array
                savedMovies = savedMovies.filter(m => m !== film.id);

                // aggiorna localStorage
                localStorage.setItem("savedMovies", JSON.stringify(savedMovies));

                // refresh UI
                mostraFilmSalvati();
                syncSavedUI(film.id);
            });

            container.appendChild(card);
            card.addEventListener("click", () => {
                apriModale(film, card);
            });

        } catch (error) {
            console.error("Errore film salvato:", error);
        }
    }
}
function getAffiliateLink(provider, title) {
    const query = encodeURIComponent(title);
    return `https://www.justwatch.com/it/cerca?q=${query}`;
}

// 🎬 WIZARD
let wizardData = { mood: null, tempo: 120, genere: null, epoca: null };
let currentStep = 1;

const moodLabels = {
    mentale: "mood mentale",
    evasione: "voglia di evasione",
    emozioni_forti: "emozioni forti",
    comfort: "relax totale",
    curioso: "curiosita accesa"
};

const genreLabels = {
    azione: "azione",
    commedia: "commedia",
    drammatico: "dramma",
    thriller: "thriller",
    horror: "horror",
    fantascienza: "fantascienza",
    romantico: "romantico",
    avventura: "avventura",
    animazione: "animazione",
    documentario: "documentario"
};

const epocaLabels = {
    recente: "film recenti",
    misto: "qualsiasi epoca",
    classici: "classici"
};

function updateWizardChrome() {
    const label = document.getElementById("wizardStepLabel");
    const fill = document.getElementById("wizardLineFill");
    const summary = document.getElementById("wizardSummary");

    if (label) label.textContent = `Step ${currentStep} di 4`;
    if (fill) fill.style.width = `${currentStep * 25}%`;

    const parts = [];
    if (wizardData.mood) parts.push(moodLabels[wizardData.mood] || wizardData.mood);
    if (wizardData.tempo) parts.push(`${wizardData.tempo} min`);
    if (wizardData.genere) parts.push(genreLabels[wizardData.genere] || wizardData.genere);
    if (wizardData.epoca) parts.push(epocaLabels[wizardData.epoca] || wizardData.epoca);

    const fallback = [
        "Scegli il mood della serata",
        "Regola il tempo che hai davvero",
        "Scegli il territorio del film",
        "Ultimo filtro, poi si accendono le luci"
    ];

    if (summary) summary.textContent = parts.length ? parts.join(" • ") : fallback[currentStep - 1];
}

function goToStep(step) {

    const current = document.querySelector(".wizard-step.active");

    if (current) {
        current.style.opacity = "0";
        current.style.transform = isTouchLikeDevice ? "none" : "translateY(-10px) scale(0.98)";
    }

    setTimeout(() => {
        document.querySelectorAll(".wizard-step").forEach(s => s.classList.remove("active"));
        document.querySelectorAll(".wizard-dot").forEach(d => d.classList.remove("active"));

        const nextStep = document.getElementById(`step${step}`);
        nextStep.style.opacity = "";
        nextStep.style.transform = "";
        nextStep.classList.add("active");
        document.querySelector(`.wizard-dot[data-step="${step}"]`).classList.add("active");

        currentStep = step;
        updateWizardChrome();
    }, 150);
}

function selectWizardCard(card, scopeSelector) {
    document.querySelectorAll(`${scopeSelector} .wizard-card`).forEach(c => c.classList.remove("selected", "choosing"));
    card.classList.add("selected", "choosing");

    const form = document.getElementById("formWizard");
    if (!isTouchLikeDevice) {
        form.classList.add("active-feedback");
        spawnParticleBurst();
    }

    setTimeout(() => {
        card.classList.remove("choosing");
        if (!isTouchLikeDevice) {
            form.classList.remove("active-feedback");
        }
    }, 360);
}

// STEP 1 — MOOD
document.querySelectorAll("#step1 .wizard-card").forEach(card => {
    card.addEventListener("click", () => {
        selectWizardCard(card, "#step1");

        wizardData.mood = card.dataset.value;
        updateWizardChrome();

        setTimeout(() => goToStep(2), 380);
    });
});

// STEP 2 — TEMPO
const tempoRange = document.getElementById("tempoRange");
const tempoDisplay = document.getElementById("tempoDisplay");

tempoRange.addEventListener("input", () => {
    wizardData.tempo = parseInt(tempoRange.value);
    tempoDisplay.textContent = tempoRange.value + " min";
    updateWizardChrome();
});

document.getElementById("nextStep2").addEventListener("click", () => {
    goToStep(3);
});

// STEP 3 — GENERE
document.querySelectorAll("#step3 .wizard-card").forEach(card => {
    card.addEventListener("click", () => {
        selectWizardCard(card, "#step3");

        wizardData.genere = card.dataset.value;
        updateWizardChrome();

        setTimeout(() => goToStep(4), 380);
    });
});

// STEP 4 — EPOCA
document.querySelectorAll("#step4 .wizard-card").forEach(card => {
    card.addEventListener("click", () => {
        selectWizardCard(card, "#step4");

        wizardData.epoca = card.dataset.value;
        updateWizardChrome();
    });
});

// STEP — DOTS cliccabili per tornare indietro
document.querySelectorAll(".wizard-dot").forEach(dot => {
    dot.addEventListener("click", () => {
        const step = parseInt(dot.dataset.step);
        if (step < currentStep) goToStep(step);
    });
});

async function generaConsigli({ reroll = false } = {}) {
    if (!wizardData.mood) {
        goToStep(1);
        return;
    }

    if (!wizardData.genere) {
        goToStep(3);
        return;
    }

    if (!wizardData.epoca) wizardData.epoca = "misto";

    const loading = document.getElementById("loading");
    const rerollBtn = document.getElementById("rerollBtn");
    const hero = document.getElementById("hero");
    loading.classList.remove("hidden");
    rerollBtn.classList.add("hidden");
    document.body.classList.add("projector-mode");
    hero.classList.add("projector-start");

    try {
        // Nuova ricerca "normale": resetta la memoria anti-duplicati del reroll,
        // altrimenti la lista puo svuotarsi dopo vari giri.
        if (!reroll) {
            ultimiFilm = [];
        }

        if (reroll) {
            const filmVisibili = [...document.querySelectorAll(".top-card, .movie-card")]
                .map(card => parseInt(card.dataset.id))
                .filter(Boolean);
            ultimiFilm = [...new Set([...ultimiFilm, ...filmVisibili])];
        }

        const initialPage = reroll ? (Math.floor(Math.random() * 15) + 1 + rerollSeed) : null;
        let film = await fetchFilmDaAPI(wizardData.mood, wizardData.tempo, wizardData.genere, initialPage);

        // Non sovrascrivere un risultato buono con un fallback peggiore.
        if (film.length < 8) {
            const expanded = await fetchFilmDaAPI(
                wizardData.mood,
                wizardData.tempo + 40,
                wizardData.genere,
                initialPage ? initialPage + 1 : null
            );
            if (expanded.length > film.length) {
                film = expanded;
            }
        }

        // Fallback finale per la ricerca normale: prova pagine alternative.
        if (!reroll && film.length === 0) {
            const altPageA = Math.floor(Math.random() * 20) + 1;
            const altPageB = Math.floor(Math.random() * 20) + 21;

            const attemptA = await fetchFilmDaAPI(wizardData.mood, wizardData.tempo + 20, wizardData.genere, altPageA);
            const attemptB = await fetchFilmDaAPI(wizardData.mood, wizardData.tempo + 60, wizardData.genere, altPageB);

            film = attemptA.length >= attemptB.length ? attemptA : attemptB;
        }

        const spiegazione = generaSpiegazione(wizardData.mood, wizardData.tempo, wizardData.genere);
        document.getElementById("aiBox").innerHTML = `<div class="ai-box">🤖 ${spiegazione}</div>`;

        const top3Container = document.getElementById("top3");
        const resultsContainer = document.getElementById("results");
        resultsContainer.classList.add("results-grid");
        top3Container.innerHTML = "";
        resultsContainer.innerHTML = "";

        const topFilm = film.slice(0, Math.min(3, film.length));
        const altriFilm = film.length > 3 ? film.slice(3, 15) : film.slice(0, 12);

        await mostraTop3(topFilm, top3Container);
        await mostraFilm(altriFilm, resultsContainer);
        rerollBtn.classList.remove("hidden");

        setTimeout(() => {
            document.querySelector(".results-section").scrollIntoView({ behavior: "smooth" });
        }, 300);

    } catch (error) {
        console.error("Errore:", error);
    }

    loading.classList.add("hidden");
    setTimeout(() => {
        document.body.classList.remove("projector-mode");
        hero.classList.remove("projector-start");
    }, 900);
    goToStep(1);
    document.querySelectorAll(".wizard-card").forEach(c => c.classList.remove("selected"));
}

document.getElementById("btnTrovaFilm").addEventListener("click", () => {
    generaConsigli();
});

document.getElementById("rerollBtn").addEventListener("click", () => {
    rerollSeed += 1;
    generaConsigli({ reroll: true });
});

updateWizardChrome();

// 🎬 PARTICELLE HERO
const canvas = document.getElementById("particleCanvas");
const ctx = canvas.getContext("2d");
let mouse = { x: null, y: null };
let particles = [];
let sparks = [];
let animationTime = 0;

function resizeParticleCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createParticle() {
    const depth = Math.random();
    return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * (0.18 + depth * 0.32),
        vy: (Math.random() - 0.5) * (0.12 + depth * 0.24),
        size: 0.6 + depth * 2.2,
        depth,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.82 ? 28 : 0
    };
}

function initParticles() {
    const targetCount = window.innerWidth < 700 ? 58 : 115;
    particles = Array.from({ length: targetCount }, createParticle);
}

function spawnParticleBurst() {
    const originX = mouse.x ?? window.innerWidth / 2;
    const originY = mouse.y ?? window.innerHeight * 0.55;

    for (let i = 0; i < 22; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.6;
        sparks.push({
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            size: 1.2 + Math.random() * 2
        });
    }
}

resizeParticleCanvas();
initParticles();

window.addEventListener("resize", () => {
    resizeParticleCanvas();
    initParticles();
});

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

canvas.addEventListener("mouseleave", () => {
    mouse.x = null;
    mouse.y = null;
});

function drawParticles() {
    animationTime += 0.01;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const gradient = ctx.createRadialGradient(
        window.innerWidth * 0.5,
        window.innerHeight * 0.44,
        20,
        window.innerWidth * 0.5,
        window.innerHeight * 0.46,
        window.innerWidth * 0.55
    );
    gradient.addColorStop(0, "rgba(255,80,70,0.08)");
    gradient.addColorStop(1, "rgba(255,80,70,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    particles.forEach(p => {
        const driftX = Math.cos(animationTime + p.phase) * 0.08 * p.depth;
        const driftY = Math.sin(animationTime * 0.8 + p.phase) * 0.08 * p.depth;

        p.x += p.vx + driftX;
        p.y += p.vy + driftY;

        if (mouse.x !== null) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 0 && dist < 150) {
                const force = (1 - dist / 150) * (0.75 + p.depth);
                p.x += (dx / dist) * force;
                p.y += (dy / dist) * force;
            }
        }

        if (p.x < -20) p.x = window.innerWidth + 20;
        if (p.x > window.innerWidth + 20) p.x = -20;
        if (p.y < -20) p.y = window.innerHeight + 20;
        if (p.y > window.innerHeight + 20) p.y = -20;
    });

    ctx.lineCap = "round";
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i];
            const b = particles[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            const maxDist = 105 + (a.depth + b.depth) * 35;

            if (dist < maxDist) {
                const alpha = (1 - dist / maxDist) * 0.16 * (a.depth + b.depth);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `rgba(255, 72, 62, ${alpha})`;
                ctx.lineWidth = 0.45 + (a.depth + b.depth) * 0.35;
                ctx.stroke();
            }
        }
    }

    particles.forEach(p => {
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 7);
        glow.addColorStop(0, `hsla(${p.hue}, 100%, 66%, ${0.22 + p.depth * 0.18})`);
        glow.addColorStop(1, `hsla(${p.hue}, 100%, 58%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 100%, 72%, ${0.45 + p.depth * 0.45})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    sparks = sparks.filter(s => s.life > 0.02);
    sparks.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.life *= 0.9;

        ctx.fillStyle = `rgba(255, 115, 65, ${s.life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
        ctx.fill();
    });

    requestAnimationFrame(drawParticles);
}

drawParticles();
document.addEventListener("DOMContentLoaded", () => {
    const trigger = document.getElementById("savedTrigger");
    const sidebar = document.getElementById("savedSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const closeBtn = document.getElementById("sidebarClose");
    const clearBtn = document.getElementById("clearSaved");

    trigger.addEventListener("click", () => {
        sidebar.classList.add("active");
        document.body.style.overflow = "hidden";
        document.body.classList.add("blur-active");
    });

    const closeSidebar = () => {
        sidebar.classList.remove("active");
        document.body.style.overflow = "auto";
        document.body.classList.remove("blur-active");
    };

    closeBtn.addEventListener("click", closeSidebar);
    overlay.addEventListener("click", closeSidebar);
    clearBtn.addEventListener("click", () => {
        savedMovies = [];
        localStorage.setItem("savedMovies", JSON.stringify(savedMovies));
        mostraFilmSalvati();
        document.querySelectorAll(".save-btn.saved").forEach(btn => btn.classList.remove("saved"));
    });
});
const form = document.querySelector(".form-container");

const hero = document.querySelector(".hero");

const canUseHoverEffects = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (canUseHoverEffects && form && hero) {
    hero.addEventListener("mousemove", (e) => {
        const rect = hero.getBoundingClientRect();

        const x = (rect.width / 2 - (e.clientX - rect.left)) / 30;
        const y = (rect.height / 2 - (e.clientY - rect.top)) / 30;

        form.style.setProperty("--rx", `${y}deg`);
        form.style.setProperty("--ry", `${x}deg`);
    });

    hero.addEventListener("mouseleave", () => {
        form.style.setProperty("--rx", "0deg");
        form.style.setProperty("--ry", "0deg");
    });

    form.addEventListener("mousemove", (e) => {
        const rect = form.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        form.style.setProperty("--mx", x + "px");
        form.style.setProperty("--my", y + "px");
    });
}
// 🔥 THREE BACKGROUND (NUOVO)

const canvas3d = document.getElementById("bg3d");

if (canvas3d && window.THREE) {

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas3d,
        alpha: true
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.z = 5;

    const PARTICLE_COUNT = 250;
    const MAX_DIST = 1.2;

    let mouse3D = { x: 0, y: 0 };

    const positions = [];
    const velocities = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions.push(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6
        );

        velocities.push(
            (Math.random() - 0.5) * 0.003,
            (Math.random() - 0.5) * 0.003,
            (Math.random() - 0.5) * 0.003
        );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        size: 0.03,
        color: 0xff3c3c,
        transparent: true,
        opacity: 0.7
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xff3c3c,
        transparent: true,
        opacity: 0.2
    });

    const lineGeometry = new THREE.BufferGeometry();
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    window.addEventListener("mousemove", (e) => {
        mouse3D.x = (e.clientX / window.innerWidth - 0.5) * 2;
        mouse3D.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    });

    function animate3D() {
        requestAnimationFrame(animate3D);

        const pos = geometry.attributes.position.array;

        for (let i = 0; i < pos.length; i += 3) {

            pos[i] += velocities[i];
            pos[i + 1] += velocities[i + 1];
            pos[i + 2] += velocities[i + 2];

            if (pos[i] > 3 || pos[i] < -3) velocities[i] *= -1;
            if (pos[i + 1] > 3 || pos[i + 1] < -3) velocities[i + 1] *= -1;
            if (pos[i + 2] > 3 || pos[i + 2] < -3) velocities[i + 2] *= -1;

            pos[i] += mouse3D.x * 0.002;
            pos[i + 1] += mouse3D.y * 0.002;
        }

        geometry.attributes.position.needsUpdate = true;

        const linePositions = [];

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            for (let j = i + 1; j < PARTICLE_COUNT; j++) {

                const ix = i * 3;
                const jx = j * 3;

                const dx = pos[ix] - pos[jx];
                const dy = pos[ix + 1] - pos[jx + 1];
                const dz = pos[ix + 2] - pos[jx + 2];

                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < MAX_DIST) {
                    linePositions.push(
                        pos[ix], pos[ix + 1], pos[ix + 2],
                        pos[jx], pos[jx + 1], pos[jx + 2]
                    );
                }
            }
        }

        lineGeometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(linePositions, 3)
        );

        points.rotation.y += 0.0004;
        lines.rotation.y += 0.0004;

        renderer.render(scene, camera);
    }

    animate3D();

    window.addEventListener("resize", () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });
}
