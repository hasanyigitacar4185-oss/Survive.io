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
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Aktif")).catch(err => console.error(err));

const HighScore = mongoose.model('HighScore', new mongoose.Schema({ name: String, score: Number, date: { type: Date, default: Date.now } }));

const MAP_SIZE = 5000;
const FOOD_COUNT = 325; // Yiyecek sayısı 2 kat azaltıldı
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;

let players = {};
let foods = [];

function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 7 };
    if (index !== undefined) foods[index] = f;
    return f;
}

for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));

async function getGlobalScores() {
    try { return await HighScore.find().sort({ score: -1 }).limit(10); } catch(e) { return []; }
}

io.on('connection', async (socket) => {
    // Girişte rekorları gönder
    socket.emit('globalScoresUpdate', await getGlobalScores());

    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id, name: username || "Adsız",
            x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            radius: INITIAL_RADIUS, targetX: 0, targetY: 0, score: 0
        };
        socket.emit('initFoods', foods);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].targetX = data.x;
            players[socket.id].targetY = data.y;
        }
    });

    socket.on('disconnect', async () => { 
        if(players[socket.id] && players[socket.id].score > 30) {
            const p = players[socket.id];
            await new HighScore({ name: p.name, score: Math.floor(p.score) }).save();
            io.emit('globalScoresUpdate', await getGlobalScores());
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
            // Hız eski dengeli haline (6) döndürüldü
            let speed = 6 * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
            let moveSpeed = dist < 50 ? (speed * dist / 50) : speed;
            p.x += Math.cos(angle) * moveSpeed;
            p.y += Math.sin(angle) * moveSpeed;
        }
        
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        for (let i = 0; i < foods.length; i++) {
            let f = foods[i];
            if (Math.abs(p.x - f.x) < p.radius && Math.abs(p.y - f.y) < p.radius) {
                if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                    p.radius += 0.4; p.score += 1.5;
                    const newF = spawnFood(i);
                    io.emit('foodCollected', { i: i, newF: newF });
                }
            }
        }

        playerIds.forEach(otherId => {
            if (id === otherId) return;
            let other = players[otherId];
            if (!other) return;
            let distance = Math.hypot(p.x - other.x, p.y - other.y);
            if (distance < p.radius && p.score > other.score + EAT_MARGIN) {
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
