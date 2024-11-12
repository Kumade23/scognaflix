const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(express.json());

//login

// Configura Mongoose per MongoDB
mongoose.connect('mongodb://localhost:27017/authDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connesso'))
  .catch(err => console.error('Errore di connessione a MongoDB:', err));

// Middleware di sessione
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
}));

// Middleware per gestire il parsing dei form e per l'uso di EJS
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'ejs');

// Route principale (ora / invece di /index)
app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('index'); // Mostra la pagina index
});

// Routes per autenticazione e admin
app.use('/', authRoutes);
app.use('/admin', adminRoutes);

//

const TMDB_API_KEY = '3a0a2828ee87871788df6cff0138a5ee';

// Serve the HTML files
app.get('/film', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('film');
});

app.get('/serietv', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('serietv');
});

// Movie search route for TMDb API
app.get('/search', async (req, res) => {
    const query = req.query.query;
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'it-IT',
                query,
            },
        });

        const movies = await Promise.all(response.data.results.map(async movie => {
            let imdb_id = null;
            try {
                const movieDetails = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}`, {
                    params: { api_key: TMDB_API_KEY },
                });
                imdb_id = movieDetails.data.imdb_id;
            } catch (error) {
                console.error(`Errore durante il recupero dell'ID IMDb per ${movie.title}:`, error);
            }

            return {
                title: movie.title,
                poster_path: movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : null,
                imdb_id,
            };
        }));

        res.json(movies);
    } catch (error) {
        console.error('Error searching movies:', error);
        res.status(500).json({ error: "Errore durante la ricerca del film." });
    }
});

// Series search route for TMDb API
app.get('/search-series', async (req, res) => {
    const query = req.query.query;
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/search/tv`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'it-IT',
                query,
            },
        });

        const series = await Promise.all(response.data.results.map(async serie => {
            let imdb_id = null;
            try {
                const serieDetails = await axios.get(`https://api.themoviedb.org/3/tv/${serie.id}/external_ids`, {
                    params: { api_key: TMDB_API_KEY },
                });
                imdb_id = serieDetails.data.imdb_id;
            } catch (error) {
                console.error(`Errore durante il recupero dell'ID IMDb per ${serie.name}:`, error);
            }

            return {
                title: serie.name,
                poster_path: serie.poster_path ? `https://image.tmdb.org/t/p/w200${serie.poster_path}` : null,
                imdb_id,
            };
        }));

        res.json(series);
    } catch (error) {
        console.error('Error searching series:', error);
        res.status(500).json({ error: "Errore durante la ricerca della serie." });
    }
});

// Scraping route to retrieve video link for movies
app.post('/scrape', async (req, res) => {
    const imdbId = req.body.imdbId;
    const mostraguardaUrl = `https://mostraguarda.stream/movie/${imdbId}`;

    try {
        const response = await axios.get(mostraguardaUrl);
        const $ = cheerio.load(response.data);

        $('iframe, .ad, .popup, .overlay').remove();

        const videoUrls = [];
        $('ul._player-mirrors li').each((_, el) => {
            const url = $(el).attr('data-link');
            if (url && url.includes('supervideo.cc')) {
                videoUrls.push(url.startsWith('http') ? url : `https:${url}`);
            }
        });

        let m3u8Url = null;

        for (const videoUrl of videoUrls) {
            try {
                const videoResponse = await axios.get(videoUrl);
                const videoHtml = videoResponse.data;

                const hfsMatch = videoHtml.match(/\|hfs(\d+)\|/);
                const urlMatch = videoHtml.match(/urlset\|(.+?)\|hls/);

                if (hfsMatch && urlMatch) {
                    const hfsNumber = hfsMatch[1];
                    const codeSegment = urlMatch[1];
                    const segments = codeSegment.split('|');

                    let finalCode;
                    if (segments.length === 1) {
                        finalCode = segments[0];
                    } else if (segments.length >= 2) {
                        finalCode = segments[segments.length - 1] + segments[0];
                    }

                    m3u8Url = `https://hfs${hfsNumber}.serversicuro.cc/hls/${finalCode}/index-v1-a1.m3u8`;
                    console.log("Constructed M3U8 URL:", m3u8Url);
                    break;
                }
            } catch (innerError) {
                console.error(`Failed to load ${videoUrl}:`, innerError);
            }
        }

        if (m3u8Url) {
            res.json({ m3u8Url, message: "M3U8 URL constructed successfully." });
        } else {
            res.status(404).json({ error: "Failed to extract M3U8 URL." });
        }
    } catch (error) {
        console.error('Error during scraping:', error);
        res.status(500).json({ error: "Error during scraping" });
    }
});

app.post('/scrape-series', async (req, res) => {
    const imdbId = req.body.imdbId;
    const searchUrl = `https://guardaserie.okinawa/?story=${imdbId}&do=search&subaction=search`;

    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);

        const serieLink = $('div.mlnh-thumb a').attr('href');
        if (!serieLink) {
            return res.status(404).json({ error: "Serie non trovata." });
        }

        const seriePageResponse = await axios.get(serieLink);
        const $$ = cheerio.load(seriePageResponse.data);

        const seasons = {};

        // Iterazione per ottenere tutti i link agli episodi
        $$('li a[data-link]').each((_, el) => {
            const seasonEpisode = $$(el).attr('data-num');
            if (seasonEpisode) {
                const [season, episode] = seasonEpisode.split('x');
                const videoUrl = $$(el).attr('data-link');

                if (!seasons[season]) {
                    seasons[season] = {};
                }

                if (videoUrl && videoUrl.includes('supervideo.cc')) {
                    seasons[season][episode] = {
                        title: $$(el).attr('data-title'),
                        videoUrl,
                        m3u8Url: null,  // Placeholder che sarà aggiornato
                    };
                }
            }
        });

        // Costruzione degli URL M3U8 per ogni episodio
        for (const season in seasons) {
            for (const episode in seasons[season]) {
                const videoUrl = seasons[season][episode].videoUrl;

                try {
                    const videoResponse = await axios.get(videoUrl);
                    const videoHtml = videoResponse.data;

                    // Costruzione URL M3U8
                    const hfsMatch = videoHtml.match(/\|hfs(\d+)\|/);
                    const urlMatch = videoHtml.match(/urlset\|(.+?)\|hls/);

                    if (hfsMatch && urlMatch) {
                        const hfsNumber = hfsMatch[1];
                        const codeSegment = urlMatch[1];
                        const segments = codeSegment.split('|');

                        let finalCode;
                        if (segments.length === 1) {
                            finalCode = segments[0];
                        } else if (segments.length >= 2) {
                            finalCode = segments[segments.length - 1] + segments[0];
                        }

                        const m3u8Url = `https://hfs${hfsNumber}.serversicuro.cc/hls/${finalCode}/index-v1-a1.m3u8`;
                        console.log(`M3U8 URL costruito per Stagione ${season}, Episodio ${episode}:`, m3u8Url);

                        // Aggiungi l'URL m3u8 finale
                        seasons[season][episode].m3u8Url = m3u8Url;
                        delete seasons[season][episode].videoUrl; // Rimuove l'URL superfluo
                    }
                } catch (error) {
                    console.error(`Errore durante il caricamento del video per Stagione ${season}, Episodio ${episode}:`, error);
                }
            }
        }

        // Rimozione degli episodi senza un URL M3U8 valido
        for (const season in seasons) {
            for (const episode in seasons[season]) {
                if (!seasons[season][episode].m3u8Url) {
                    delete seasons[season][episode];
                }
            }
            if (Object.keys(seasons[season]).length === 0) {
                delete seasons[season];
            }
        }

        res.json(seasons);
    } catch (error) {
        console.error('Errore durante lo scraping della serie:', error);
        res.status(500).json({ error: "Errore durante lo scraping della serie TV." });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});