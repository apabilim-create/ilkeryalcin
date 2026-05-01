const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 80;

// ─── KİMLİK BİLGİLERİ ───────────────────────────────────────────────
const ADMIN_USERNAME = 'Bilalilker';
const ADMIN_PASSWORD = '1453';
// ────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Session ayarları
app.use(session({
    secret: 'ilkeryalcin-panel-secret-2024-secure',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, 
        httpOnly: true
    }
}));

// ─── GÜVENLİK DUVARI (MIDDLEWARE) ───────────────────────────────────
// Bu fonksiyon her istekte çalışır ve izinsiz geçişi engeller.
const requireAuth = (req, res, next) => {
    // İzin verilen yollar (Giriş sayfası ve giriş API'si)
    const publicPaths = ['/login', '/api/login'];
    
    if (publicPaths.includes(req.path)) {
        return next();
    }

    if (req.session && req.session.loggedIn) {
        return next();
    }

    // Yetkisiz erişim: API ise 401 hatası, sayfa ise Login'e yönlendir
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
    }
    res.redirect('/login');
};

// ─── ROTALAR ────────────────────────────────────────────────────────

// 1. Giriş Sayfası (Herkes görebilir)
app.get('/login', (req, res) => {
    if (req.session.loggedIn) return res.redirect('/panel');
    res.sendFile(path.join(__dirname, 'login.html'));
});

// 2. Giriş İşlemi
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.loggedIn = true;
        req.session.user = username;
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false });
});

// 3. Çıkış İşlemi
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ─── BU NOKTADAN SONRAKİ HER ŞEY KORUMA ALTINDADIR ─────────────────
app.use(requireAuth);

// Ana Panel (Sadece giriş yapanlar)
app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Kök dizin yönlendirmesi
app.get('/', (req, res) => {
    res.redirect('/panel');
});

// Statik Dosyalar (app.js, style.css vb.) 
// requireAuth'tan sonra olduğu için artık bunlara da şifresiz erişilemez!
app.use(express.static(__dirname));


// ─── GOOGLE CALENDAR İŞLEMLERİ (KORUMALI) ───────────────────────────
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CALENDAR_ID = 'dc484578af91bbae30fe5da087d199317240b91a380841960d1ecddc6dc8d9f8@group.calendar.google.com';

let calendar;
let calendarAuth;
let authError = null;

try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
    if (clientEmail && privateKeyRaw) {
        const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
        const { JWT } = require('google-auth-library');
        calendarAuth = new JWT({ email: clientEmail, key: privateKey, scopes: SCOPES });
        calendar = google.calendar({ version: 'v3', auth: calendarAuth });
    } else {
        authError = "Google credentials eksik.";
    }
} catch (err) {
    authError = err.message;
}

// API: Takvim Listele
app.get('/api/calendar/events', async (req, res) => {
    if (authError || !calendar) return res.status(500).json({ error: authError });
    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const response = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: startOfMonth.toISOString(),
            maxResults: 100,
            singleEvents: true,
            orderBy: 'startTime',
        });
        res.json(response.data.items || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Randevu Ekle
app.post('/api/calendar/add', async (req, res) => {
    const { summary, description, startDateTime, endDateTime } = req.body;
    const event = {
        summary, description,
        start: { dateTime: startDateTime, timeZone: 'Europe/Istanbul' },
        end: { dateTime: endDateTime, timeZone: 'Europe/Istanbul' },
    };
    try {
        const response = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
        res.json({ success: true, event: response.data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Sil
app.delete('/api/calendar/delete/:eventId', async (req, res) => {
    try {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: req.params.eventId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Güncelle
app.patch('/api/calendar/update/:eventId', async (req, res) => {
    try {
        await calendar.events.patch({
            calendarId: CALENDAR_ID,
            eventId: req.params.eventId,
            requestBody: {
                start: { dateTime: req.body.startDateTime },
                end: { dateTime: req.body.endDateTime }
            }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Güvenli sunucu ${PORT} portunda aktif.`);
});
