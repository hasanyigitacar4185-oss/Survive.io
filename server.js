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

// --- AYARLAR ---
const MAP_SIZE = 15000; 
const FOOD_COUNT = 3000; 
const VIRUS_COUNT = 30;  
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;
const EJECT_COST = 30; 
const EJECT_THRESHOLD = 200;
const BOT_COUNT = 10;

// İngilizce Bot İsim Havuzu
const botNames = ["Striker", "Storm_Hunter", "Pro_Gamer", "Shadow_Walker", "Neon_Light", "Fast_and_Furious", "Eagle_Eye", "Alpha_One", "Viper", "Ghost_Player", "Iron_Man", "Sky_High", "Bullet_Proof", "Silent_Killer", "Warrior"];

let players = {};
let bots = {};
let foods = [];
let viruses = [];
let ejectedMasses = [];

function calculateRadius(score) {
    return INITIAL_RADIUS + Math.sqrt(score) * 6.0;
}

function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 8 };
    if (index !== undefined) foods[index] = f;
    return f;
}
for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));

function spawnVirus() { return { x: Math.random() * (MAP_SIZE - 1000) + 500, y: Math.random() * (MAP_SIZE - 1000) + 500, r: 90 }; }
for (let i = 0; i < VIRUS_COUNT; i++) viruses.push(spawnVirus());

// --- BOT YÖNETİMİ ---
function createBot(id) {
    const startScore = Math.floor(Math.random() * 2500);
    let name = botNames[Math.floor(Math.random() * botNames.length)];
    bots[id] = {
        id: id, isBot: true, name: name + "_" + Math.floor(Math.random()*99),
        x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 60%, 50%)`,
        score: startScore, radius: calculateRadius(startScore),
        targetX: 0, targetY: 0, angle: Math.random() * Math.PI * 2,
        nextScoreTime: Date.now() + Math.random() * 2000
    };
}

function clearBots() { bots = {}; }
function checkBots() {
    const playerCount = Object.keys(players).length;
    if (playerCount > 0 && Object.keys(bots).length === 0) {
        for(let i=0; i<BOT_COUNT; i++) createBot("bot_" + i);
    } else if (playerCount === 0) {
        clearBots();
    }
}

async function getScores() {
    try {
        const today = new Date(); today.setHours(0,0,0,0);
        return {
            daily: await HighScore.find({ date: { $gte: today } }).sort({ score: -1 }).limit(10),
            allTime: await HighScore.find().sort({ score: -1 }).limit(10)
        };
    } catch (e) { return { daily: [], allTime: [] }; }
}

io.on('connection', async (socket) => {
    socket.emit('globalScoresUpdate', await getScores());
    socket.on('heartbeat', (t) => { socket.emit('heartbeat_res', t); });

    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id, name: username || "Adsız", x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`, radius: INITIAL_RADIUS,
            targetX: 0, targetY: 0, score: 0, lastBoost: 0, isBoosting: false
        };
        socket.emit('initGameData', { foods, viruses });
        checkBots();
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
            p.score -= EJECT_COST; p.radius = calculateRadius(p.score);
            const angle = Math.atan2(p.targetY, p.targetX);
            ejectedMasses.push({ x: p.x + Math.cos(angle)*p.radius, y: p.y + Math.sin(angle)*p.radius, c: p.color, r: 20, angle: angle, speed: 25 });
        }
    });

    socket.on('disconnect', async () => {
        if(players[socket.id] && players[socket.id].score > 30) {
            await new HighScore({ name: players[socket.id].name, score: Math.floor(players[socket.id].score) }).save();
            io.emit('globalScoresUpdate', await getScores());
        }
        delete players[socket.id];
        checkBots(); // Kimse kalmadıysa botları temizle
    });
});

setInterval(() => {
    const activePlayerCount = Object.keys(players).length;
    if (activePlayerCount === 0) return; // Sunucu boşsa hiçbir işlem yapma (Ping ve CPU dostu)

    ejectedMasses.forEach((m) => {
        if (m.speed > 0) { m.x += Math.cos(m.angle)*m.speed; m.y += Math.sin(m.angle)*m.speed; m.speed *= 0.92; if(m.speed < 1) m.speed = 0; }
        m.x = Math.max(20, Math.min(MAP_SIZE-20, m.x)); m.y = Math.max(20, Math.min(MAP_SIZE-20, m.y));
    });

    const allEntities = { ...players, ...bots };

    for (let id in allEntities) {
        let p = allEntities[id];
        
        if(p.isBot) {
            if(Date.now() > p.nextScoreTime) {
                p.score += 1; p.radius = calculateRadius(p.score);
                p.nextScoreTime = Date.now() + Math.random() * 2000;
            }

            let closest = null, minDist = 800;
            for(let oid in allEntities) {
                if(id === oid) continue;
                let dist = Math.hypot(p.x - allEntities[oid].x, p.y - allEntities[oid].y);
                if(dist < minDist) { minDist = dist; closest = allEntities[oid]; }
            }

            if(closest) {
                let angleTo = Math.atan2(closest.y - p.y, closest.x - p.x);
                p.angle = (p.score > closest.score + EAT_MARGIN) ? angleTo : angleTo + Math.PI;
            } else { p.angle += (Math.random() - 0.5) * 0.1; }
            
            let speed = 5.5 * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
            p.x += Math.cos(p.angle) * speed; p.y += Math.sin(p.angle) * speed;
            p.targetX = Math.cos(p.angle) * 100; p.targetY = Math.sin(p.angle) * 100;
        } else {
            let angle = Math.atan2(p.targetY, p.targetX);
            let dist = Math.sqrt(p.targetX * p.targetX + p.targetY * p.targetY);
            if (dist > 5) {
                let speed = (p.isBoosting ? 18 : 6.5) * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
                p.x += Math.cos(angle) * (dist < 50 ? (speed * dist / 50) : speed);
                p.y += Math.sin(angle) * (dist < 50 ? (speed * dist / 50) : speed);
            }
        }
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x)); p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        if(!p.isBot) {
            foods.forEach((f, i) => {
                if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius) {
                    p.score += 2; p.radius = calculateRadius(p.score);
                    io.emit('foodCollected', { i: i, newF: spawnFood(i) });
                }
            });
        }

        for(let oid in allEntities) {
            if(id === oid) continue;
            let o = allEntities[oid];
            if (o && Math.hypot(p.x - o.x, p.y - o.y) < p.radius && p.score > o.score + EAT_MARGIN) {
                p.score += Math.floor(o.score * 0.6); p.radius = calculateRadius(p.score);
                if(o.isBot) { createBot(oid); }
                else { io.to(oid).emit('dead', { score: o.score }); delete players[oid]; }
            }
        }

        viruses.forEach((v, idx) => {
            if (Math.hypot(p.x - v.x, p.y - v.y) < p.radius + 15 && p.score > 250) {
                p.score *= 0.9; p.radius = calculateRadius(p.score);
                viruses.splice(idx, 1); io.emit('updateViruses', viruses);
                setTimeout(() => { viruses.push(spawnVirus()); io.emit('updateViruses', viruses); }, 30000);
            }
        });
    }
    io.emit('updateState', { players, bots, ejectedMasses });
}, 1000 / 60);

server.listen(process.env.PORT || 10000);
