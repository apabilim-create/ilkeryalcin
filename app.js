// Supabase Configuration
const SUPABASE_URL = 'https://api.ilachatirlatma.com';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.Bgt6cMbbssaluViATACTpBIC6_AIgckuHJndSmZHER0';

let supabaseClient;
try {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase istemcisi hazır.');
    } else {
        throw new Error('Supabase kütüphanesi yüklenemedi. Lütfen internet bağlantınızı ve CDN bağlantısını kontrol edin.');
    }
} catch (err) {
    console.error('Supabase Başlatma Hatası:', err);
    document.getElementById('supabase-error-msg').innerHTML = `<div class="supabase-error"><strong>Supabase Bağlantı Hatası:</strong> ${err.message}</div>`;
}

const listSection = document.getElementById('conversation-list');
const detailSection = document.getElementById('conversation-detail');
const listContainer = document.getElementById('list-container');
const detailContainer = document.getElementById('detail-container');
const detailTitle = document.getElementById('detail-title');
const backBtn = document.getElementById('back-btn');
const pageTitle = document.getElementById('page-title');

// Sidebar Navigation Elements
const navKonusmalar = document.getElementById('nav-konusmalar');
const navRandevular = document.getElementById('nav-randevular');
const viewKonusmalar = document.getElementById('view-konusmalar');
const viewRandevular = document.getElementById('view-randevular');

// --- CALENDAR GLOBAL VARIABLE ---
let calendar;

// Sidebar Navigation Logic
navKonusmalar.addEventListener('click', () => {
    navKonusmalar.classList.add('active');
    navRandevular.classList.remove('active');
    viewKonusmalar.classList.remove('hidden-view');
    viewRandevular.classList.add('hidden-view');
    pageTitle.textContent = 'Konuşmalar';
});

navRandevular.addEventListener('click', () => {
    navRandevular.classList.add('active');
    navKonusmalar.classList.remove('active');
    viewRandevular.classList.remove('hidden-view');
    viewKonusmalar.classList.add('hidden-view');
    pageTitle.textContent = 'Randevu Ekranı';
    
    // Takvimi Başlat veya Boyutlandır
    if (!calendar) {
        initCalendar();
    } else {
        setTimeout(() => calendar.render(), 100); // Görünür olduktan sonra tekrar çiz
    }
});

// ==========================================
// KONUŞMALAR (SUPABASE) İŞLEMLERİ
// ==========================================

let allConversations = [];
let currentActiveConversationTitle = null; // Aktif konuşmayı takip etmek için

async function fetchConversations() {
    if (!supabaseClient) return;
    
    // Yükleniyor yazısını sadece ilk yüklemede göster (canlı güncellemede ekranı titretmemek için)
    if (allConversations.length === 0) {
        listContainer.innerHTML = '<p class="loading">Veriler yükleniyor...</p>';
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('konusmalar')
            .select('*')
            .order('olusturulma_zamani', { ascending: true });

        if (error) throw error;
        
        allConversations = data || [];
        renderList();
    } catch (error) {
        console.error('Veri çekme hatası:', error);
        listContainer.innerHTML = `<p style="color:red; padding:1rem;"><strong>Bağlantı Hatası:</strong> ${error.message}<br><small>Supabase URL veya Key hatalı olabilir ya da tablo ismi 'konusmalar' değildir.</small></p>`;
    }
}

function renderList() {
    listContainer.innerHTML = '';
    
    if (allConversations.length === 0) {
        listContainer.innerHTML = '<p style="padding:1rem;">Henüz kayıtlı konuşma bulunmuyor.</p>';
        return;
    }

    const grouped = {};
    allConversations.forEach(item => {
        let tel = item.telefon_numarasi || 'Bilinmeyen No';
        if(tel.includes('@')) tel = tel.split('@')[0];

        const ad = item.kisi_adi && item.kisi_adi.trim() !== '' ? item.kisi_adi : 'İsimsiz';
        const key = `${tel} - ${ad}`;
        
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
    });

    Object.keys(grouped).forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'conversation-btn';
        if (currentActiveConversationTitle === key) {
            btn.classList.add('active'); // Aktif olanı işaretle
        }
        btn.innerHTML = `<span>${key}</span><span class="btn-icon">➔</span>`;
        btn.onclick = () => {
            document.querySelectorAll('.conversation-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showDetail(key, grouped[key]);
        };
        listContainer.appendChild(btn);
    });

    // Eğer açık bir konuşma varsa ve yeni mesaj geldiyse o ekranı da güncelle
    if (currentActiveConversationTitle && grouped[currentActiveConversationTitle]) {
        showDetail(currentActiveConversationTitle, grouped[currentActiveConversationTitle]);
    }
}

function showDetail(title, messages) {
    currentActiveConversationTitle = title; // Açık olan konuşmayı kaydet

    if (window.innerWidth <= 768) {
        listSection.classList.add('mobile-hidden');
        detailSection.classList.add('mobile-active');
    }
    
    detailSection.classList.remove('hidden-desktop');
    detailTitle.textContent = title;
    detailContainer.innerHTML = '';
    
    messages.forEach(msg => {
        const dateStr = msg.olusturulma_zamani ? new Date(msg.olusturulma_zamani).toLocaleString('tr-TR') : '';
        const isim = msg.kisi_adi && msg.kisi_adi.trim() !== '' ? msg.kisi_adi : 'Kullanıcı';

        if (msg.kullanici_mesaji && msg.kullanici_mesaji.trim() !== '') {
            const div = document.createElement('div');
            div.className = 'message-item';
            div.innerHTML = `${dateStr ? `<div class="message-date">${dateStr}</div>` : ''}<div class="message-content"><strong>${isim}:</strong> <br>${msg.kullanici_mesaji}</div>`;
            detailContainer.appendChild(div);
        }

        if (msg.asistan_yaniti && msg.asistan_yaniti.trim() !== '') {
            const div = document.createElement('div');
            div.className = 'message-item asistan-msg';
            div.innerHTML = `<div class="message-content"><strong>Asistan:</strong> <br>${msg.asistan_yaniti}</div>`;
            detailContainer.appendChild(div);
        }
    });
    // Her zaman en alta kaydır
    detailContainer.scrollTop = detailContainer.scrollHeight;
}

backBtn.addEventListener('click', () => {
    currentActiveConversationTitle = null; // Geri dönüldüğünde aktif konuşmayı temizle
    detailSection.classList.remove('mobile-active');
    listSection.classList.remove('mobile-hidden');
    document.querySelectorAll('.conversation-btn').forEach(b => b.classList.remove('active'));
});

// ==========================================
// FULLCALENDAR (RANDEVU) İŞLEMLERİ
// ==========================================

const btnShowAddForm = document.getElementById('btn-show-add-form');
const addAppointmentForm = document.getElementById('add-appointment-form');
const btnCancelAppointment = document.getElementById('btn-cancel-appointment');
const btnSaveAppointment = document.getElementById('btn-save-appointment');
const aptMsg = document.getElementById('apt-msg');

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'timeGridDay' : 'timeGridWeek', // MOBİLDE GÜNLÜK, MASAÜSTÜNDE HAFTALIK
        windowResize: function(arg) {
            if (window.innerWidth < 768) {
                calendar.changeView('timeGridDay');
            } else {
                calendar.changeView('timeGridWeek');
            }
        },
        locale: 'tr',
        slotMinTime: '07:00:00', // Takvim sabah 07:00'den başlasın
        slotMaxTime: '22:00:00', // Gece 22:00'ye kadar gitsin
        slotDuration: '00:30:00', // 30 DAKİKALIK DİLİMLER
        snapDuration: '00:30:00', // SÜRÜKLERKEN 30 DK'YA YAPIŞSIN
        allDaySlot: false,       // Tüm gün kısmını gizle (saat odaklı olsun)
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: {
            today: 'Bugün',
            month: 'Ay',
            week: 'Hafta',
            day: 'Gün'
        },
        editable: true, 
        selectable: true,
        events: async function(info, successCallback, failureCallback) {
            try {
                const response = await fetch('/api/calendar/events');
                const data = await response.json();
                
                if (!response.ok) throw new Error(data.details || 'Veri çekilemedi');

                const formattedEvents = data.map(event => ({
                    id: event.id,
                    title: event.summary || '(Başlıksız)',
                    start: event.start.dateTime || event.start.date,
                    end: event.end.dateTime || event.end.date,
                    description: event.description,
                    backgroundColor: '#0056b3',
                    borderColor: '#004494'
                }));
                
                successCallback(formattedEvents);
            } catch (error) {
                console.error('Takvim verisi hatası:', error);
                failureCallback(error);
            }
        },

        // --- HIZLI EKLEME (30 DK VARSAYILAN) ---
        dateClick: async function(info) {
            const summary = prompt('Yeni Randevu Başlığı:');
            if (!summary) return;

            try {
                // Tıklanan saatten itibaren 30 DAKİKALIK randevu oluştur
                const start = new Date(info.date);
                const end = new Date(info.date);
                end.setMinutes(end.getMinutes() + 30); // 30 DAKİKA EKLE

                const response = await fetch('/api/calendar/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        summary: summary,
                        startDateTime: start.toISOString(),
                        endDateTime: end.toISOString()
                    })
                });

                if (response.ok) {
                    calendar.refetchEvents();
                } else {
                    alert('Ekleme hatası oluştu.');
                }
            } catch (error) {
                alert('Hata: ' + error.message);
            }
        },

        // --- SÜRÜKLE BIRAK (GÜNCELLEME) ---
        eventDrop: async function(info) {
            updateEventTimes(info.event);
        },

        // --- BOYUTLANDIRMA (SÜRE DEĞİŞTİRME) ---
        eventResize: async function(info) {
            updateEventTimes(info.event);
        },

        // --- TIKLAYARAK SİLME ---
        eventClick: async function(info) {
            const eventId = info.event.id;
            const eventTitle = info.event.title;
            
            if (confirm(`"${eventTitle}" randevusunu silmek istediğinize emin misiniz?`)) {
                try {
                    const response = await fetch(`/api/calendar/delete/${eventId}`, {
                        method: 'DELETE'
                    });
                    
                    if (response.ok) {
                        calendar.refetchEvents();
                    } else {
                        const data = await response.json();
                        alert('Silme hatası: ' + data.error);
                    }
                } catch (error) {
                    alert('Bir hata oluştu: ' + error.message);
                }
            }
        }
    });
    calendar.render();
}

async function updateEventTimes(event) {
    try {
        const response = await fetch(`/api/calendar/update/${event.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startDateTime: event.start.toISOString(),
                endDateTime: event.end ? event.end.toISOString() : event.start.toISOString()
            })
        });

        if (!response.ok) {
            alert('Güncelleme sunucuya iletilemedi.');
            calendar.refetchEvents();
        }
    } catch (error) {
        alert('Bağlantı hatası: ' + error.message);
        calendar.refetchEvents();
    }
}

// Form İşlemleri
btnShowAddForm.addEventListener('click', () => addAppointmentForm.classList.remove('hidden-form'));
btnCancelAppointment.addEventListener('click', () => {
    addAppointmentForm.classList.add('hidden-form');
    clearAptForm();
});

function clearAptForm() {
    document.getElementById('apt-summary').value = '';
    document.getElementById('apt-start').value = '';
    document.getElementById('apt-end').value = '';
    document.getElementById('apt-desc').value = '';
    aptMsg.innerHTML = '';
}

btnSaveAppointment.addEventListener('click', async () => {
    const summary = document.getElementById('apt-summary').value;
    const start = document.getElementById('apt-start').value;
    const end = document.getElementById('apt-end').value;
    const desc = document.getElementById('apt-desc').value;

    if (!summary || !start || !end) {
        aptMsg.innerHTML = '<span style="color:red;">Lütfen başlık, başlangıç ve bitiş zamanını girin.</span>';
        return;
    }

    btnSaveAppointment.disabled = true;
    btnSaveAppointment.textContent = 'Kaydediliyor...';
    
    try {
        const response = await fetch('/api/calendar/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary: summary,
                description: desc,
                startDateTime: new Date(start).toISOString(),
                endDateTime: new Date(end).toISOString()
            })
        });

        if (response.ok) {
            aptMsg.innerHTML = '<span style="color:green;">Randevu başarıyla eklendi!</span>';
            setTimeout(() => {
                addAppointmentForm.classList.add('hidden-form');
                clearAptForm();
                calendar.refetchEvents(); // Takvimi yenile
            }, 1500);
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Bilinmeyen hata');
        }
    } catch (error) {
        aptMsg.innerHTML = `<span style="color:red;">Hata: ${error.message}</span>`;
    } finally {
        btnSaveAppointment.disabled = false;
        btnSaveAppointment.textContent = 'Kaydet';
    }
});

// Sayfa yüklendiğinde Konuşmaları getir
window.addEventListener('DOMContentLoaded', () => {
    fetchConversations();
    
    // --- SUPABASE REALTIME (GERÇEK ZAMANLI GÜNCELLEME) ---
    // Bu kısım veritabanındaki her değişikliği canlı olarak dinler
    if (supabaseClient) {
        supabaseClient
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE hepsini dinle
                    schema: 'public',
                    table: 'konusmalar'
                },
                (payload) => {
                    console.log('Canlı değişiklik algılandı (Realtime):', payload);
                    fetchConversations(); // Verileri yeniden çek ve listeyi güncelle
                }
            )
            .subscribe((status, err) => {
                console.log('Supabase Realtime Durumu:', status);
                if (err) console.error('Realtime Hatası:', err);
            });
        console.log('Gerçek zamanlı takip başlatıldı.');
    }

    // --- GARANTİLİ YEDEKLEME (POLLING) ---
    // Eğer Supabase panelindeki Realtime ayarlarında bir sorun varsa,
    // sistemin her 5 saniyede bir arka planda sessizce yeni mesajları kontrol etmesini sağlar.
    setInterval(() => {
        fetchConversations();
    }, 5000);
});
