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
mongoose.connect(MONGODB_URI).then(() => console.log("✅ Veritabanı ve İstanbul Zaman Ayarı Hazır")).catch(err => console.error(err));

const HighScore = mongoose.model('HighScore', new mongoose.Schema({
    name: String,
    score: Number,
    date: { type: Date, default: Date.now }
}));

// OYUN AYARLARI
const MAP_SIZE = 5000;
const FOOD_COUNT = 325;
const VIRUS_COUNT = 15; // Kırmızı tırtıklı engel sayısı
const INITIAL_RADIUS = 30;
const VIRUS_THRESHOLD = 200; // Bu skordan büyükse virüs çarpar

let players = {};
let foods = [];
let viruses = [];

// Virüsleri oluştur (Sabit yerlerde büyük tırtıklı engeller)
function initViruses() {
    viruses = [];
    for (let i = 0; i < VIRUS_COUNT; i++) {
        viruses.push({
            id: i,
            x: Math.random() * (MAP_SIZE - 400) + 200,
            y: Math.random() * (MAP_SIZE - 400) + 200,
            r: 85 // Yaklaşık 200 puanlık oyuncu boyutu
        });
    }
}
initViruses();

function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 7 };
    if (index !== undefined) foods[index] = f;
    return f;
}
for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));

// İstanbul Saatiyle Sıralama Getir
async function getCategorizedScores() {
    const now = new Date();
    // İstanbul saati dengeleme (UTC+3)
    const offset = 3 * 60 * 60 * 1000;
    const todayStart = new Date(new Date().setUTCHours(0,0,0,0) - offset);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const daily = await HighScore.find({ date: { $gte: todayStart } }).sort({ score: -1 }).limit(10);
    const monthly = await HighScore.find({ date: { $gte: monthStart } }).sort({ score: -1 }).limit(10);
    const allTime = await HighScore.find().sort({ score: -1 }).limit(10);

    return { daily, monthly, allTime };
}

io.on('connection', async (socket) => {
    socket.emit('globalScoresUpdate', await getCategorizedScores());

    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id, name: username || "Adsız",
            x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            radius: INITIAL_RADIUS, targetX: 0, targetY: 0, score: 0,
            lastBoost: 0
        };
        socket.emit('initGameData', { foods, viruses });
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].targetX = data.x;
            players[socket.id].targetY = data.y;
        }
    });

    // Şarjlı Boost Kontrolü (15 Saniye)
    socket.on('triggerBoost', () => {
        const p = players[socket.id];
        if (p) {
            const now = Date.now();
            if (now - p.lastBoost > 15000) { // 15 Saniye bekleme
                p.lastBoost = now;
                p.isBoosting = true;
                setTimeout(() => { if(players[socket.id]) players[socket.id].isBoosting = false; }, 1500); // 1.5 saniye sürer
                socket.emit('boostActivated');
            }
        }
    });

    socket.on('disconnect', async () => { 
        if(players[socket.id] && players[socket.id].score > 30) {
            await new HighScore({ name: players[socket.id].name, score: Math.floor(players[socket.id].score) }).save();
            io.emit('globalScoresUpdate', await getCategorizedScores());
        }
        delete players[socket.id]; 
    });
});

setInterval(() => {
    const playerIds = Object.keys(players);
    for (let id in players) {
        let p = players[id];
        let angle = Math.atan2(p.targetY, p.targetX);
        let dist = Math.sqrt(p.targetX * p.targetX + p.targetY * p.targetY);

        if (dist > 5) {
            let speed = (p.isBoosting ? 18 : 6) * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
            let moveSpeed = dist < 50 ? (speed * dist / 50) : speed;
            p.x += Math.cos(angle) * moveSpeed;
            p.y += Math.sin(angle) * moveSpeed;
        }
        
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        // Yiyecek Yeme
        for (let i = 0; i < foods.length; i++) {
            let f = foods[i];
            if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                p.radius += 0.4; p.score += 1.5;
                io.emit('foodCollected', { i: i, newF: spawnFood(i) });
            }
        }

        // --- VİRÜS MANTIĞI ---
        viruses.forEach(v => {
            let d = Math.hypot(p.x - v.x, p.y - v.y);
            if (d < p.radius + v.r * 0.5) {
                if (p.score > VIRUS_THRESHOLD) {
                    // Büyük oyuncuyu parçala (%10 kayıp)
                    p.score *= 0.9;
                    p.radius *= 0.95;
                    io.to(p.id).emit('virusHit');
                }
            }
        });

        // Oyuncu Yeme
        playerIds.forEach(otherId => {
            if (id === otherId) return;
            let other = players[otherId];
            if (!other) return;
            if (Math.hypot(p.x - other.x, p.y - other.y) < p.radius && p.score > other.score + EAT_MARGIN) {
                p.score += Math.floor(other.score * 0.5) + 40;
                p.radius += (other.radius * 0.4);
                io.to(otherId).emit('dead', { score: other.score });
                delete players[otherId];
            }
        });
    }
    io.emit('updatePlayers', players);
}, 1000 / 60);

server.listen(process.env.PORT || 10000);
