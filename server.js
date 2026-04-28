const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 80;

app.use(cors());
app.use(express.json());

// Google Calendar Yetkilendirmesi
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const CALENDAR_ID = 'dc484578af91bbae30fe5da087d199317240b91a380841960d1ecddc6dc8d9f8@group.calendar.google.com';

let calendar;
let authError = null;

try {
    if (process.env.GOOGLE_CREDENTIALS) {
        let credsRaw = process.env.GOOGLE_CREDENTIALS.trim();
        
        // Önce temizleme (tırnaklar vs.)
        if ((credsRaw.startsWith("'") && credsRaw.endsWith("'")) || 
            (credsRaw.startsWith('"') && credsRaw.endsWith('"'))) {
            credsRaw = credsRaw.slice(1, -1);
        }

        let credentials;
        // Eğer Base64 formatındaysa çöz, değilse direkt parse et
        try {
            // Base64 kontrolü (basitçe: süslü parantezle başlamıyorsa Base64 olabilir)
            if (!credsRaw.startsWith('{')) {
                const decoded = Buffer.from(credsRaw, 'base64').toString('utf-8');
                credentials = JSON.parse(decoded);
                console.log('✅ Base64 JSON başarıyla çözüldü.');
            } else {
                credentials = JSON.parse(credsRaw);
            }
        } catch (e) {
            throw new Error("JSON Çözme Hatası: " + e.message);
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: SCOPES,
        });
        calendar = google.calendar({ version: 'v3', auth });
        console.log('✅ Google Calendar yetkilendirmesi hazır.');
    } else {
        console.error('❌ HATA: GOOGLE_CREDENTIALS çevre değişkeni sistemde bulunamadı!');
        authError = "GOOGLE_CREDENTIALS bulunamadı.";
    }
} catch (err) {
    console.error('Auth Başlatma Hatası:', err);
    authError = "Yetkilendirme Hatası: " + err.message;
}

// Takvim etkinliklerini getirme
app.get('/api/calendar/events', async (req, res) => {
    if (authError || !calendar) {
        return res.status(500).json({ error: 'Yetkilendirme Hatası', details: authError });
    }
    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const response = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: startOfMonth.toISOString(), // Ayın başından itibaren getir
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
app.post('/api/calendar/add', async (req, res) => {
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
            dateTime: startDateTime, // Beklenen format: '2023-10-15T09:00:00+03:00'
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

// Statik dosyaları sunma (index.html, style.css, app.js vs.)
app.use(express.static(__dirname));

// Tüm diğer rotaları index.html'e yönlendir (SPA davranışı için - gerçi bizde tek sayfa ama güvence)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Randevu Silme (Delete)
app.delete('/api/calendar/delete/:eventId', async (req, res) => {
    if (authError) return res.status(500).json({ error: 'Auth hatası', details: authError });
    
    const { eventId } = req.params;
    try {
        const calendar = google.calendar({ version: 'v3', auth });
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
app.patch('/api/calendar/update/:eventId', async (req, res) => {
    if (authError) return res.status(500).json({ error: 'Auth hatası', details: authError });
    
    const { eventId } = req.params;
    const { startDateTime, endDateTime } = req.body;
    
    try {
        const calendar = google.calendar({ version: 'v3', auth });
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

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});
