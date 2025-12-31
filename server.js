const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const MONGODB_URI = "mongodb+srv://hasanyigitacar4185_db_user:Hh254185@cluster0.wpqguet.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Bağlantısı Başarılı!")).catch(err => console.error(err));

const HighScore = mongoose.model('HighScore', new mongoose.Schema({ name: String, score: Number, date: { type: Date, default: Date.now } }));

const MAP_SIZE = 5000;
const FOOD_COUNT = 600;
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;

let players = {};
let foods = [];

function spawnFood(index) {
    const f = {
        i: index, // Index (Veri tasarrufu için kısa isim)
        x: Math.floor(Math.random() * MAP_SIZE),
        y: Math.floor(Math.random() * MAP_SIZE),
        c: `hsl(${Math.random() * 360}, 70%, 50%)`, // Renk
        r: 7
    };
    if (index !== undefined) foods[index] = f;
    return f;
}

// Başlangıç yiyecekleri
for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));

io.on('connection', async (socket) => {
    // 1. Bağlanınca sadece rekorları gönder
    try {
        const scores = await HighScore.find().sort({ score: -1 }).limit(10);
        socket.emit('globalScoresUpdate', scores);
    } catch(e) {}

    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id, name: username || "Adsız",
            x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            radius: INITIAL_RADIUS, targetX: 0, targetY: 0, score: 0, isBoosting: false
        };
        // 2. Oyuna girince yiyecek listesini TEK SEFERLİK gönder
        socket.emit('initFoods', foods);
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
        if(players[socket.id]) {
            const p = players[socket.id];
            if(p.score > 30) {
                new HighScore({ name: p.name, score: Math.floor(p.score) }).save()
                    .then(() => HighScore.find().sort({ score: -1 }).limit(10))
                    .then(s => io.emit('globalScoresUpdate', s));
            }
        }
        delete players[socket.id]; 
    });
});

// Oyun motoru
setInterval(() => {
    const playerIds = Object.keys(players);
    for (let id in players) {
        let p = players[id];
        let angle = Math.atan2(p.targetY, p.targetX);
        let dist = Math.sqrt(p.targetX * p.targetX + p.targetY * p.targetY);

        if (dist > 5) {
            let speed = 5 * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
            if (p.isBoosting && p.score > 10) {
                speed *= 1.7;
                p.score -= 0.15;
                p.radius -= 0.01;
            }
            p.x += Math.cos(angle) * speed;
            p.y += Math.sin(angle) * speed;
        }
        
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        // Yiyecek yeme (Optimize edilmiş çarpışma)
        for (let i = 0; i < foods.length; i++) {
            let f = foods[i];
            if (Math.abs(p.x - f.x) < p.radius && Math.abs(p.y - f.y) < p.radius) {
                p.radius += 0.35; p.score += 1.2;
                const newF = spawnFood(i);
                // Sadece yenen yiyeceğin değiştiğini herkese bildir (DEVSAL TASARRUF)
                io.emit('foodCollected', { i: i, newF: newF });
            }
        }

        // Oyuncu yeme
        playerIds.forEach(otherId => {
            if (id === otherId) return;
            let other = players[otherId];
            if (!other) return;
            let distance = Math.hypot(p.x - other.x, p.y - other.y);
            if (distance < p.radius && p.score > other.score + EAT_MARGIN) {
                p.score += Math.floor(other.score * 0.5) + 30;
                p.radius += (other.radius * 0.3);
                io.to(otherId).emit('dead', { score: other.score });
                delete players[otherId];
            }
        });
    }
    // Sadece oyuncu verilerini gönder (Yiyecekler yok!)
    io.emit('updatePlayers', players);
}, 1000 / 25); // 25 FPS hem akıcı hem tasarrufludur

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server aktif.`));
