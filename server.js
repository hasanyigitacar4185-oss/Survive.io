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
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Aktif")).catch(err => console.error(err));

const HighScore = mongoose.model('HighScore', new mongoose.Schema({
    name: String, score: Number, date: { type: Date, default: Date.now }
}));

const MAP_SIZE = 5000;
const FOOD_COUNT = 325;
const VIRUS_COUNT = 15;
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;
const EJECT_COST = 20;
const EJECT_THRESHOLD = 200;

let players = {};
let foods = [];
let viruses = [];
let ejectedMasses = [];

function getSafeSpawn() {
    let x, y, isSafe = false, attempts = 0;
    while (!isSafe && attempts < 20) {
        x = Math.random() * (MAP_SIZE - 400) + 200;
        y = Math.random() * (MAP_SIZE - 400) + 200;
        isSafe = true;
        for (let id in players) {
            if (Math.hypot(x - players[id].x, y - players[id].y) < 600) { isSafe = false; break; }
        }
        attempts++;
    }
    return { x, y };
}

function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 7 };
    if (index !== undefined) foods[index] = f;
    return f;
}
for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));

function spawnVirus() { return { x: Math.random() * (MAP_SIZE - 800) + 400, y: Math.random() * (MAP_SIZE - 800) + 400, r: 85 }; }
for (let i = 0; i < VIRUS_COUNT; i++) viruses.push(spawnVirus());

async function getScores() {
    const trOffset = 3 * 60 * 60 * 1000;
    const now = new Date(Date.now() + trOffset);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
        daily: await HighScore.find({ date: { $gte: today } }).sort({ score: -1 }).limit(10),
        monthly: await HighScore.find({ date: { $gte: month } }).sort({ score: -1 }).limit(10),
        allTime: await HighScore.find().sort({ score: -1 }).limit(10)
    };
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
        if (p && p.score >= EJECT_THRESHOLD) {
            p.score -= EJECT_COST; p.radius -= 1.5;
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
    ejectedMasses.forEach((m) => {
        if (m.speed > 0) { m.x += Math.cos(m.angle)*m.speed; m.y += Math.sin(m.angle)*m.speed; m.speed *= 0.92; if(m.speed < 1) m.speed = 0; }
        m.x = Math.max(20, Math.min(MAP_SIZE-20, m.x)); m.y = Math.max(20, Math.min(MAP_SIZE-20, m.y));
    });

    for (let id in players) {
        let p = players[id];
        let angle = Math.atan2(p.targetY, p.targetX);
        let dist = Math.sqrt(p.targetX * p.targetX + p.targetY * p.targetY);
        if (dist > 5) {
            let speed = (p.isBoosting ? 18 : 6.5) * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
            p.x += Math.cos(angle) * (dist < 50 ? (speed * dist / 50) : speed);
            p.y += Math.sin(angle) * (dist < 50 ? (speed * dist / 50) : speed);
        }
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x)); p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        foods.forEach((f, i) => {
            if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                p.radius += 0.4; p.score += 1.5; io.emit('foodCollected', { i: i, newF: spawnFood(i) });
            }
        });

        ejectedMasses.forEach((m, idx) => {
            if (Math.hypot(p.x - m.x, p.y - m.y) < p.radius) { p.score += EJECT_COST; p.radius += 2.5; ejectedMasses.splice(idx, 1); }
        });

        viruses.forEach((v, idx) => {
            if (Math.hypot(p.x - v.x, p.y - v.y) < p.radius + 15 && p.score > 200) {
                p.score *= 0.9; p.radius *= 0.95; viruses[idx] = spawnVirus(); io.emit('updateViruses', viruses);
            }
        });

        Object.keys(players).forEach(oid => {
            if (id === oid) return;
            let o = players[oid];
            if (o && Math.hypot(p.x - o.x, p.y - o.y) < p.radius && p.score > o.score + EAT_MARGIN) {
                p.score += Math.floor(o.score * 0.5) + 40; p.radius += (o.radius * 0.4);
                io.to(oid).emit('dead', { score: o.score }); delete players[oid];
            }
        });
    }
    io.emit('updateState', { players, ejectedMasses });
}, 1000 / 60);

server.listen(process.env.PORT || 10000);
