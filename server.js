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
const ADMIN_PASSWORD = '1543';
// ────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Session ayarları
app.use(session({
    secret: 'ilkeryalcin-panel-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,       // HTTP için false, HTTPS kullananlar true yapabilir
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000  // 8 saat
    }
}));

// ─── LOGIN ENDPOINT ──────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.loggedIn = true;
        req.session.user = username;
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Hatalı kullanıcı adı veya şifre.' });
});

// ─── LOGOUT ENDPOINT ─────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) {
        return next();
    }
    // API isteği mi yoksa sayfa isteği mi?
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Oturum açmanız gerekiyor.' });
    }
    return res.redirect('/login');
}

// Login sayfasını oturum kontrolü olmadan sun
app.get('/login', (req, res) => {
    if (req.session && req.session.loggedIn) {
        return res.redirect('/panel');
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Ana panel → /panel rotasına taşındı, koruma altında
app.get('/panel', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Kök → login'e yönlendir
app.get('/', (req, res) => {
    if (req.session && req.session.loggedIn) {
        return res.redirect('/panel');
    }
    res.redirect('/login');
});

// ─── GOOGLE CALENDAR YETKİLENDİRMESİ ─────────────────────────────────
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

        console.log('📧 Client Email:', clientEmail);
        console.log('🔑 Private Key uzunluk:', privateKey.length);
        console.log('🔑 Key başlangıç:', privateKey.substring(0, 40));

        const { JWT } = require('google-auth-library');
        calendarAuth = new JWT({
            email: clientEmail,
            key: privateKey,
            scopes: SCOPES,
        });

        calendar = google.calendar({ version: 'v3', auth: calendarAuth });
        console.log('✅ Google Calendar yetkilendirmesi hazır.');
    } else {
        console.error('❌ HATA: GOOGLE_CLIENT_EMAIL veya GOOGLE_PRIVATE_KEY bulunamadı!');
        authError = "Google credential env vars bulunamadı.";
    }
} catch (err) {
    console.error('Auth Başlatma Hatası:', err);
    authError = "Yetkilendirme Hatası: " + err.message;
}

// ─── API ROTALARI (Tüm API'ler auth koruması altında) ────────────────

// Takvim etkinliklerini getirme
app.get('/api/calendar/events', requireAuth, async (req, res) => {
    if (authError || !calendar) {
        return res.status(500).json({ error: 'Yetkilendirme Hatası', details: authError });
    }
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
        console.error('Takvim API Hatası (List):', error);
        res.status(500).json({ error: 'Etkinlikler alınamadı', details: error.message });
    }
});

// Yeni etkinlik (randevu) ekleme
app.post('/api/calendar/add', requireAuth, async (req, res) => {
    if (authError) {
        return res.status(500).json({ error: 'Yetkilendirme Hatası', details: authError });
    }
    const { summary, description, startDateTime, endDateTime } = req.body;

    if (!summary || !startDateTime || !endDateTime) {
        return res.status(400).json({ error: 'Eksik parametreler (summary, startDateTime, endDateTime gereklidir)' });
    }

    const event = {
        summary: summary,
        description: description || '',
        start: {
            dateTime: startDateTime,
            timeZone: 'Europe/Istanbul',
        },
        end: {
            dateTime: endDateTime,
            timeZone: 'Europe/Istanbul',
        },
    };

    try {
        const response = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
        });
        res.json({ success: true, event: response.data });
    } catch (error) {
        console.error('Etkinlik ekleme hatası:', error);
        res.status(500).json({ error: 'Randevu eklenemedi', details: error.message });
    }
});

// Randevu Silme
app.delete('/api/calendar/delete/:eventId', requireAuth, async (req, res) => {
    if (authError) return res.status(500).json({ error: 'Auth hatası', details: authError });

    const { eventId } = req.params;
    try {
        await calendar.events.delete({
            calendarId: CALENDAR_ID,
            eventId: eventId,
        });
        res.json({ success: true, message: 'Randevu başarıyla silindi.' });
    } catch (error) {
        console.error('Randevu silme hatası:', error);
        res.status(500).json({ error: 'Randevu silinemedi.', details: error.message });
    }
});

// Randevu Güncelleme (Sürükle-Bırak/Boyutlandırma için)
app.patch('/api/calendar/update/:eventId', requireAuth, async (req, res) => {
    if (authError) return res.status(500).json({ error: 'Auth hatası', details: authError });

    const { eventId } = req.params;
    const { startDateTime, endDateTime } = req.body;

    try {
        await calendar.events.patch({
            calendarId: CALENDAR_ID,
            eventId: eventId,
            requestBody: {
                start: { dateTime: startDateTime },
                end: { dateTime: endDateTime }
            }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Randevu güncelleme hatası:', error);
        res.status(500).json({ error: 'Güncellenemedi.', details: error.message });
    }
});

// Statik dosyaları sun (login.html, style.css, app.js vs.)
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
    console.log(`🔐 Giriş: http://localhost:${PORT}/login`);
});
