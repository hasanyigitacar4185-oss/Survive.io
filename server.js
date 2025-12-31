const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- VERİTABANI BAĞLANTISI ---
const MONGODB_URI = "mongodb+srv://hasanyigitacar4185_db_user:Hh254185@cluster0.wpqguet.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ MongoDB Bağlantısı Başarılı!"))
    .catch(err => console.error("❌ Bağlantı Hatası: ", err));

const ScoreSchema = new mongoose.Schema({
    name: String,
    score: Number,
    date: { type: Date, default: Date.now }
});
const HighScore = mongoose.model('HighScore', ScoreSchema);

const MAP_SIZE = 5000;
const FOOD_COUNT = 850;
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;
const BOOST_SPEED_MULTIPLIER = 1.8;
const BOOST_SCORE_COST = 0.15;

let players = {};
let foods = [];

// Global Skorları Yayınla
async function syncGlobalScores() {
    try {
        const scores = await HighScore.find().sort({ score: -1 }).limit(10);
        io.emit('globalScoresUpdate', scores);
    } catch (e) { console.log("Senkronize hatası"); }
}

// Skoru Veritabanına Yaz
async function updateGlobalScores(name, score) {
    if (score < 20) return; // 20 puandan azsa kaydetme
    try {
        await new HighScore({ name, score: Math.floor(score) }).save();
        syncGlobalScores();
    } catch (e) { console.log("Skor kaydedilemedi"); }
}

function spawnFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        radius: 7
    };
}

for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood());

io.on('connection', async (socket) => {
    try {
        const initialScores = await HighScore.find().sort({ score: -1 }).limit(10);
        socket.emit('globalScoresUpdate', initialScores);
    } catch(e) {}

    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id,
            name: username || "Adsız",
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            radius: INITIAL_RADIUS,
            targetX: 0, targetY: 0, score: 0,
            isBoosting: false
        };
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].targetX = data.x;
            players[socket.id].targetY = data.y;
        }
    });

    socket.on('startBoost', () => { if(players[socket.id]) players[socket.id].isBoosting = true; });
    socket.on('stopBoost', () => { if(players[socket.id]) players[socket.id].isBoosting = false; });

    socket.on('disconnect', () => { 
        if (players[socket.id]) {
            // Sekmeyi kapattığında da skoru kaydetmeyi dene
            updateGlobalScores(players[socket.id].name, players[socket.id].score);
            delete players[socket.id]; 
        }
    });
});

setInterval(() => {
    const playerIds = Object.keys(players);
    for (let id in players) {
        let p = players[id];
        let angle = Math.atan2(p.targetY, p.targetX);
        let dist = Math.sqrt(p.targetX * p.targetX + p.targetY * p.targetY);

        if (dist > 5) {
            let speed = 5 * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
            if (p.isBoosting && p.score > 5) {
                speed *= BOOST_SPEED_MULTIPLIER;
                p.score -= BOOST_SCORE_COST;
                p.radius -= BOOST_SCORE_COST * 0.1;
            }
            let moveSpeed = dist < 50 ? (speed * dist / 50) : speed;
            p.x += Math.cos(angle) * moveSpeed;
            p.y += Math.sin(angle) * moveSpeed;
        }
        
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));
        if (p.radius < INITIAL_RADIUS) p.radius = INITIAL_RADIUS;

        foods.forEach((food, index) => {
            if (Math.hypot(p.x - food.x, p.y - food.y) < p.radius) {
                p.radius += 0.35; p.score += 1.2;
                foods[index] = spawnFood();
            }
        });

        playerIds.forEach(otherId => {
            if (id === otherId) return;
            let other = players[otherId];
            if (!other) return;
            if (Math.hypot(p.x - other.x, p.y - other.y) < p.radius && p.score > other.score + EAT_MARGIN) {
                p.score += Math.floor(other.score * 0.6) + 30;
                p.radius += (other.radius * 0.4);
                
                // Ölen oyuncunun skorunu kaydet
                updateGlobalScores(other.name, other.score);
                
                io.to(otherId).emit('dead', { score: other.score });
                delete players[otherId];
            }
        });
    }
    io.emit('update', { players, foods, MAP_SIZE });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Survive.io aktif: http://localhost:${PORT}`));
