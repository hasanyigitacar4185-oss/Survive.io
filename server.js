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

let players = {};
let bots = {};
let foods = [];
let viruses = [];
let ejectedMasses = [];

const botNames = ["Striker", "Storm", "Shadow", "Neon", "Alpha", "Viper", "Ghost", "Bullet", "Warrior", "Nova", "Titan", "Hunter", "Vortex", "Rex", "Ace"];

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

function createBot(id) {
    const startScore = Math.floor(Math.random() * 2500);
    let name = botNames[Math.floor(Math.random() * botNames.length)];
    bots[id] = {
        id: id, isBot: true, name: name.substring(0, 8),
        x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 60%, 50%)`,
        score: startScore, radius: calculateRadius(startScore),
        angle: Math.random() * Math.PI * 2, nextScoreTime: Date.now() + Math.random() * 2000,
        thinkTimer: 0
    };
}

function checkBots() {
    const pCount = Object.keys(players).length;
    if (pCount > 0 && Object.keys(bots).length === 0) {
        for(let i=0; i<BOT_COUNT; i++) createBot("bot_" + i);
    } else if (pCount === 0) { bots = {}; }
}

async function getScores() {
    try {
        const today = new Date(); today.setHours(0,0,0,0);
        const daily = await HighScore.find({ date: { $gte: today } }).sort({ score: -1 }).limit(10);
        const allTime = await HighScore.find().sort({ score: -1 }).limit(10);
        return { daily, allTime };
    } catch (e) { return { daily: [], allTime: [] }; }
}

io.on('connection', async (socket) => {
    socket.emit('globalScoresUpdate', await getScores());
    socket.on('heartbeat', (t) => { socket.emit('heartbeat_res', t); });

    socket.on('joinGame', (username) => {
        let cleanName = (username || "Guest").substring(0, 8);
        players[socket.id] = {
            id: socket.id, name: cleanName, x: Math.random() * (MAP_SIZE - 400) + 200, y: Math.random() * (MAP_SIZE - 400) + 200,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`, radius: INITIAL_RADIUS,
            targetX: 0, targetY: 0, score: 0, lastBoost: 0, isBoosting: false
        };
        // Başlangıçta tüm yemekleri değil, sadece genel bilgiyi gönderiyoruz
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
            ejectedMasses.push({ 
                owner: socket.id, x: p.x + Math.cos(angle)*(p.radius + 20), y: p.y + Math.sin(angle)*(p.radius + 20), 
                c: p.color, r: 20, angle: angle, speed: 25, spawnTime: Date.now() 
            });
            socket.emit('playSfx', 'eject');
        }
    });

    socket.on('disconnect', async () => {
        if(players[socket.id] && players[socket.id].score > 30) {
            await new HighScore({ name: players[socket.id].name, score: Math.floor(players[socket.id].score) }).save();
            io.emit('globalScoresUpdate', await getScores());
        }
        delete players[socket.id];
        checkBots();
    });
});

setInterval(() => {
    const pCount = Object.keys(players).length;
    if (pCount === 0) return;

    ejectedMasses.forEach((m) => {
        if (m.speed > 0) { m.x += Math.cos(m.angle)*m.speed; m.y += Math.sin(m.angle)*m.speed; m.speed *= 0.92; if(m.speed < 1) m.speed = 0; }
        m.x = Math.max(20, Math.min(MAP_SIZE-20, m.x)); m.y = Math.max(20, Math.min(MAP_SIZE-20, m.y));
    });

    const all = { ...players, ...bots };

    for (let id in all) {
        let p = all[id];
        
        if(p.isBot) {
            if(Date.now() > p.nextScoreTime) { p.score += 1; p.radius = calculateRadius(p.score); p.nextScoreTime = Date.now() + Math.random() * 2000; }
            p.thinkTimer++;
            if(p.thinkTimer > 10) {
                let closest = null, minDist = 1200;
                for(let oid in all) {
                    if(id === oid) continue;
                    let dist = Math.hypot(p.x - all[oid].x, p.y - all[oid].y);
                    if(dist < minDist) { minDist = dist; closest = all[oid]; }
                }
                if(closest) {
                    let angleTo = Math.atan2(closest.y - p.y, closest.x - p.x);
                    p.angle = (p.score > closest.score + EAT_MARGIN) ? angleTo : angleTo + Math.PI;
                } else { p.angle += (Math.random() - 0.5) * 0.2; }
                p.thinkTimer = 0;
            }
            // Bot hızı 1.5 kat artırıldı (5.5 -> 8.25)
            let speed = 8.25 * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
            p.x += Math.cos(p.angle) * speed; p.y += Math.sin(p.angle) * speed;
            p.targetX = Math.cos(p.angle) * 100; p.targetY = Math.sin(p.angle) * 100;
        } else {
            let angle = Math.atan2(p.targetY, p.targetX);
            let dist = Math.sqrt(p.targetX * p.targetX + p.targetY * p.targetY);
            if (dist > 5) {
                // Oyuncu hızı 1.5 kat artırıldı (Boosting: 18->27, Normal: 6.5->9.75)
                let speed = (p.isBoosting ? 27 : 9.75) * Math.pow(p.radius / INITIAL_RADIUS, -0.15);
                p.x += Math.cos(angle) * (dist < 50 ? (speed * dist / 50) : speed);
                p.y += Math.sin(angle) * (dist < 50 ? (speed * dist / 50) : speed);
            }
        }
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x)); p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        let isNearHuman = false;
        let humanSocket = null;
        for(let pid in players) { 
            if(Math.hypot(p.x - players[pid].x, p.y - players[pid].y) < 3500) { 
                isNearHuman = true; humanSocket = pid; break; 
            } 
        }

        if(isNearHuman) {
            for(let i=0; i<foods.length; i++) {
                let f = foods[i];
                if (Math.abs(p.x - f.x) < p.radius && Math.abs(p.y - f.y) < p.radius) {
                    p.score += 2; p.radius = calculateRadius(p.score);
                    // Ses ve güncelleme sadece yakındakilere
                    if(!p.isBot) io.to(id).emit('playSfx', 'eat');
                    io.emit('foodCollected', { i: i, newF: spawnFood(i) });
                }
            }
        }

        ejectedMasses.forEach((m, idx) => {
            if (Math.hypot(p.x - m.x, p.y - m.y) < p.radius) {
                if (m.owner === id && Date.now() - m.spawnTime < 500) return;
                p.score += EJECT_COST * 0.8; p.radius = calculateRadius(p.score);
                if(!p.isBot) io.to(id).emit('playSfx', 'eat');
                ejectedMasses.splice(idx, 1);
            }
        });

        for(let oid in all) {
            if(id === oid) continue;
            let o = all[oid];
            if (o && Math.hypot(p.x - o.x, p.y - o.y) < p.radius && p.score > o.score + EAT_MARGIN) {
                p.score += Math.floor(o.score * 0.6); p.radius = calculateRadius(p.score);
                if(!p.isBot) io.to(id).emit('playSfx', 'eat');
                if(o.isBot) { createBot(oid); }
                else { io.to(oid).emit('dead', { score: o.score }); delete players[oid]; }
            }
        }

        if(isNearHuman) {
            viruses.forEach((v, idx) => {
                if (Math.hypot(p.x - v.x, p.y - v.y) < p.radius + 15 && p.score > 250) {
                    p.score *= 0.9; p.radius = calculateRadius(p.score);
                    if(!p.isBot) io.to(id).emit('playSfx', 'virus');
                    // Patlama efekti için client'a sinyal
                    io.emit('virusHitEffect', { x: v.x, y: v.y, color: '#ff0000' });
                    viruses.splice(idx, 1); io.emit('updateViruses', viruses);
                    setTimeout(() => { viruses.push(spawnVirus()); io.emit('updateViruses', viruses); }, 30000);
                }
            });
        }
    }
    io.emit('updateState', { players, bots, ejectedMasses });
}, 1000 / 60);

server.listen(process.env.PORT || 10000);
