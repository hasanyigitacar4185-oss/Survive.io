const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- MONGO KONFİGÜRASYONU ---
const MONGODB_URI = "mongodb+srv://hasanyigitacar4185_db_user:Hh254185@cluster0.wpqguet.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB & AI Aktif")).catch(err => console.error(err));

const HighScore = mongoose.model('HighScore', new mongoose.Schema({
    name: String, score: Number, date: { type: Date, default: Date.now }
}));

// OYUN AYARLARI
const MAP_SIZE = 15000; // 3 Kat Artırıldı
const FOOD_COUNT = 1000; // Ölçekli Artış
const VIRUS_COUNT = 45; // Ölçekli Artış
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;
const BOT_COUNT_TARGET = 10;

let players = {};
let bots = {};
let foods = [];
let viruses = [];
let ejectedMasses = [];

const botNames = ["SlimeHunter", "Ghost_IO", "TurboSlayer", "Shadow", "Pro_Survivor", "DeepBlue", "Neon_Blob", "Alpha", "Beta_Max", "Zenith", "Storm", "VoidWalker"];

// Yardımcı Fonksiyonlar
function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 7 };
    if (index !== undefined) foods[index] = f;
    return f;
}

function spawnVirus() { return { x: Math.random() * (MAP_SIZE - 1000) + 500, y: Math.random() * (MAP_SIZE - 1000) + 500, r: 85 }; }

function getSafeSpawn() {
    let x, y, safe = false;
    while(!safe) {
        x = Math.random() * (MAP_SIZE - 1000) + 500;
        y = Math.random() * (MAP_SIZE - 1000) + 500;
        safe = true;
        for(let id in players) if(Math.hypot(x-players[id].x, y-players[id].y) < 800) safe = false;
    }
    return {x, y};
}

// Başlangıç Kurulumu
for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));
for (let i = 0; i < VIRUS_COUNT; i++) viruses.push(spawnVirus());

// BOT MANTIĞI
function updateBots() {
    const totalEntities = Object.keys(players).length + Object.keys(bots).length;
    
    // Eksik botları tamamla
    if (totalEntities < BOT_COUNT_TARGET) {
        const botId = "bot_" + Math.random().toString(36).substr(2, 5);
        const spawn = getSafeSpawn();
        bots[botId] = {
            id: botId, isBot: true, name: botNames[Math.floor(Math.random() * botNames.length)],
            x: spawn.x, y: spawn.y, color: `hsl(${Math.random() * 360}, 60%, 50%)`,
            radius: INITIAL_RADIUS, score: 0, targetX: 0, targetY: 0, 
            decisionTimer: 0
        };
    }

    for (let id in bots) {
        let b = bots[id];
        b.decisionTimer--;

        if (b.decisionTimer <= 0) {
            // Yapay Zeka Karar Verme
            let nearestPlayer = null;
            let minDist = 1500;

            for(let pid in players) {
                let d = Math.hypot(b.x - players[pid].x, b.y - players[pid].y);
                if(d < minDist) { minDist = d; nearestPlayer = players[pid]; }
            }

            if (nearestPlayer) {
                if (b.score > nearestPlayer.score + 20) { // Kovalama
                    b.targetX = nearestPlayer.x - b.x; b.targetY = nearestPlayer.y - b.y;
                } else { // Kaçma
                    b.targetX = b.x - nearestPlayer.x; b.targetY = b.y - nearestPlayer.y;
                }
            } else {
                // Yem Ara
                b.targetX = Math.random() * 200 - 100; b.targetY = Math.random() * 200 - 100;
            }
            b.decisionTimer = 60 + Math.random() * 100;
        }

        // Bot Hareketi
        let angle = Math.atan2(b.targetY, b.targetX);
        let speed = 5.5 * Math.pow(b.radius / INITIAL_RADIUS, -0.15);
        b.x += Math.cos(angle) * speed;
        b.y += Math.sin(angle) * speed;
        b.x = Math.max(50, Math.min(MAP_SIZE - 50, b.x));
        b.y = Math.max(50, Math.min(MAP_SIZE - 50, b.y));

        // Bot Yeme Kontrolleri (Basitleştirilmiş)
        foods.forEach((f, i) => {
            if(Math.hypot(b.x-f.x, b.y-f.y) < b.radius) { b.radius += 0.35; b.score += 1.3; spawnFood(i); io.emit('foodCollected', {i, newF: foods[i]}); }
        });
    }
}

// Sıralama Fonksiyonu (Fix)
async function getScores() {
    const startOfToday = new Date(); startOfToday.setUTCHours(0,0,0,0);
    const startOfMonth = new Date(); startOfMonth.setUTCHours(0,0,0,0); startOfMonth.setUTCDate(1);

    const daily = await HighScore.find({ date: { $gte: startOfToday } }).sort({ score: -1 }).limit(10);
    const monthly = await HighScore.find({ date: { $gte: startOfMonth } }).sort({ score: -1 }).limit(10);
    const allTime = await HighScore.find().sort({ score: -1 }).limit(10);
    return { daily, monthly, allTime };
}

io.on('connection', async (socket) => {
    socket.emit('globalScoresUpdate', await getScores());

    socket.on('joinGame', (username) => {
        const spawn = getSafeSpawn();
        players[socket.id] = {
            id: socket.id, name: username || "Adsız", x: spawn.x, y: spawn.y,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`, radius: INITIAL_RADIUS,
            targetX: 0, targetY: 0, score: 0, lastBoost: 0, isBoosting: false
        };
        socket.emit('initGameData', { foods, viruses });
    });

    socket.on('playerMove', (data) => { if (players[socket.id]) { players[socket.id].targetX = data.x; players[socket.id].targetY = data.y; } });

    socket.on('triggerBoost', () => {
        const p = players[socket.id];
        if (p && Date.now() - p.lastBoost > 15000) {
            p.lastBoost = Date.now(); p.isBoosting = true;
            setTimeout(() => { if(players[socket.id]) players[socket.id].isBoosting = false; }, 1500);
            socket.emit('boostActivated');
        }
    });

    socket.on('ejectMass', () => {
        const p = players[socket.id];
        if (p && p.score >= 200) {
            p.score -= 20; p.radius -= 1.5;
            const angle = Math.atan2(p.targetY, p.targetX);
            ejectedMasses.push({ x: p.x + Math.cos(angle)*p.radius, y: p.y + Math.sin(angle)*p.radius, c: p.color, r: 18, angle: angle, speed: 22 });
        }
    });

    socket.on('disconnect', async () => {
        if(players[socket.id] && players[socket.id].score > 30) {
            await new HighScore({ name: players[socket.id].name, score: Math.floor(players[socket.id].score) }).save();
            io.emit('globalScoresUpdate', await getScores());
        }
        delete players[socket.id];
    });
});

setInterval(() => {
    updateBots(); // Bot AI Çalıştır

    // Kütle Hareketi
    ejectedMasses.forEach((m) => {
        if (m.speed > 0) { m.x += Math.cos(m.angle)*m.speed; m.y += Math.sin(m.angle)*m.speed; m.speed *= 0.92; }
    });

    const allEntities = {...players, ...bots};

    for (let id in allEntities) {
        let p = allEntities[id];
        if(!p.isBot) { // Sadece gerçek oyuncu hareket mantığı (Botlar yukarıda yapıldı)
            let angle = Math.atan2(p.targetY, p.targetX);
            let dist = Math.sqrt(p.targetX * p.targetX + p.targetY * p.targetY);
            if (dist > 5) {
                let speed = (p.isBoosting ? 18 : 6.5) * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
                p.x += Math.cos(angle) * (dist < 50 ? (speed * dist / 50) : speed);
                p.y += Math.sin(angle) * (dist < 50 ? (speed * dist / 50) : speed);
            }
        }
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        // Yemekler
        foods.forEach((f, i) => {
            if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                p.radius += 0.4; p.score += 1.5; io.emit('foodCollected', { i, newF: spawnFood(i) });
            }
        });

        // Virüsler
        viruses.forEach((v, idx) => {
            if (Math.hypot(p.x - v.x, p.y - v.y) < p.radius + 15 && p.score > 200) {
                p.score *= 0.9; p.radius *= 0.95; viruses[idx] = spawnVirus(); io.emit('updateViruses', viruses);
            }
        });

        // Çakışma Kontrolü (Herkes Herkesi yiyebilir)
        for(let otherId in allEntities) {
            if(id === otherId) continue;
            let o = allEntities[otherId];
            if(Math.hypot(p.x-o.x, p.y-o.y) < p.radius && p.score > o.score + EAT_MARGIN) {
                p.score += Math.floor(o.score * 0.5) + 40; p.radius += (o.radius * 0.4);
                if(o.isBot) delete bots[otherId];
                else { io.to(otherId).emit('dead', { score: o.score }); delete players[otherId]; }
            }
        }
    }
    io.emit('updateState', { players, bots, ejectedMasses });
}, 1000 / 60);

server.listen(process.env.PORT || 10000);
