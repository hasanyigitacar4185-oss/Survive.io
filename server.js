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
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB & Zaman Ayarı Aktif")).catch(err => console.error(err));

const HighScore = mongoose.model('HighScore', new mongoose.Schema({
    name: String, score: Number, date: { type: Date, default: Date.now }
}));

const MAP_SIZE = 5000;
const FOOD_COUNT = 325;
const VIRUS_COUNT = 15;
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;

let players = {};
let foods = [];
let viruses = [];

function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 7 };
    if (index !== undefined) foods[index] = f;
    return f;
}
for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));

for (let i = 0; i < VIRUS_COUNT; i++) {
    viruses.push({ id: i, x: Math.random() * (MAP_SIZE - 600) + 300, y: Math.random() * (MAP_SIZE - 600) + 300, r: 85 });
}

// İstanbul Saatiyle Kategorize Skorlar
async function getScores() {
    const trOffset = 3 * 60 * 60 * 1000;
    const now = new Date(Date.now() + trOffset);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const daily = await HighScore.find({ date: { $gte: today } }).sort({ score: -1 }).limit(10);
    const monthly = await HighScore.find({ date: { $gte: month } }).sort({ score: -1 }).limit(10);
    const allTime = await HighScore.find().sort({ score: -1 }).limit(10);
    return { daily, monthly, allTime };
}

io.on('connection', async (socket) => {
    socket.emit('globalScoresUpdate', await getScores());

    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id, name: username || "Adsız",
            x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            radius: INITIAL_RADIUS, targetX: 0, targetY: 0, score: 0, lastBoost: 0, isBoosting: false
        };
        socket.emit('initGameData', { foods, viruses });
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].targetX = data.x;
            players[socket.id].targetY = data.y;
        }
    });

    socket.on('triggerBoost', () => {
        const p = players[socket.id];
        if (p && Date.now() - p.lastBoost > 15000) {
            p.lastBoost = Date.now();
            p.isBoosting = true;
            setTimeout(() => { if(players[socket.id]) players[socket.id].isBoosting = false; }, 1500);
            socket.emit('boostActivated');
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

        foods.forEach((f, i) => {
            if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                p.radius += 0.4; p.score += 1.5;
                io.emit('foodCollected', { i: i, newF: spawnFood(i) });
            }
        });

        viruses.forEach(v => {
            if (Math.hypot(p.x - v.x, p.y - v.y) < p.radius + 20 && p.score > 200) {
                p.score *= 0.9; p.radius *= 0.95;
            }
        });

        Object.keys(players).forEach(oid => {
            if (id === oid) return;
            let o = players[oid];
            if (o && Math.hypot(p.x - o.x, p.y - o.y) < p.radius && p.score > o.score + EAT_MARGIN) {
                p.score += Math.floor(o.score * 0.5) + 40; p.radius += (o.radius * 0.4);
                io.to(oid).emit('dead', { score: o.score });
                delete players[oid];
            }
        });
    }
    io.emit('updatePlayers', players);
}, 1000 / 60);

server.listen(process.env.PORT || 10000);
