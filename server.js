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
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Bağlantısı Başarılı!")).catch(err => console.error(err));

const HighScore = mongoose.model('HighScore', new mongoose.Schema({
    name: String, score: Number, date: { type: Date, default: Date.now }
}));

// OYUN AYARLARI
const MAP_SIZE = 15000;
const FOOD_COUNT = 1100;
const VIRUS_COUNT = 45;
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;
const BOT_COUNT_TARGET = 10; // Toplam oyuncu (Bot+Gerçek) hedefi 10
const EJECT_COST = 20;

let players = {};
let bots = {};
let foods = [];
let viruses = [];
let ejectedMasses = [];

const botNames = ["ShadowNinja", "Luffy_G5", "Zoro_King", "Alpha_Wolf", "Ghost_IO", "VoidWalker", "Slayer_X", "Neon_Blob", "Deep_Hunter", "Storm_Breaker"];

// YARDIMCI FONKSİYONLAR
function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 7 };
    if (index !== undefined) foods[index] = f;
    return f;
}
function spawnVirus() { return { x: Math.random() * (MAP_SIZE - 1500) + 750, y: Math.random() * (MAP_SIZE - 1500) + 750, r: 85 }; }

function getSafeSpawn() {
    let x, y, safe = false, attempts = 0;
    while(!safe && attempts < 30) {
        x = Math.random() * (MAP_SIZE - 2000) + 1000;
        y = Math.random() * (MAP_SIZE - 2000) + 1000;
        safe = true;
        for(let id in players) if(Math.hypot(x-players[id].x, y-players[id].y) < 1200) safe = false;
        attempts++;
    }
    return {x, y};
}

for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));
for (let i = 0; i < VIRUS_COUNT; i++) viruses.push(spawnVirus());

async function getCategorizedScores() {
    const now = new Date();
    const trOffset = 3 * 60 * 60 * 1000;
    const today = new Date(now.getTime() + trOffset);
    today.setUTCHours(0,0,0,0);
    today.setTime(today.getTime() - trOffset);
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
        daily: await HighScore.find({ date: { $gte: today } }).sort({ score: -1 }).limit(10),
        monthly: await HighScore.find({ date: { $gte: month } }).sort({ score: -1 }).limit(10),
        allTime: await HighScore.find().sort({ score: -1 }).limit(10)
    };
}

// SÜPER BOT AI V6
function updateSuperBotAI() {
    const everyone = {...players, ...bots};
    for (let id in bots) {
        let b = bots[id];
        
        // 1. Zeka Katmanı: Yakın Tehdit Algılama (Virüsler)
        let nearVirus = viruses.find(v => Math.hypot(b.x - v.x, b.y - v.y) < b.radius + 180);
        if (nearVirus && b.score > 200) {
            b.targetX = b.x - nearVirus.x; b.targetY = b.y - nearVirus.y;
        } else {
            // 2. Zeka Katmanı: Hedef Belirleme
            let targets = Object.values(everyone).filter(o => o.id !== b.id);
            let nearestEnemy = targets.sort((a,b) => Math.hypot(b.x-b.x, b.y-b.y))[0];
            
            if (nearestEnemy) {
                let dist = Math.hypot(nearestEnemy.x - b.x, nearestEnemy.y - b.y);
                if (dist < 2500) {
                    if (b.score > nearestEnemy.score + 15) { // Hunt Mode
                        b.targetX = (nearestEnemy.x + (nearestEnemy.targetX || 0) * 0.5) - b.x;
                        b.targetY = (nearestEnemy.y + (nearestEnemy.targetY || 0) * 0.5) - b.y;
                        if (dist < 600 && Math.random() < 0.04 && !b.isBoosting) {
                            b.isBoosting = true; setTimeout(() => { if(bots[id]) bots[id].isBoosting = false; }, 1500);
                        }
                    } else { // Flee Mode
                        b.targetX = b.x - nearestEnemy.x; b.targetY = b.y - nearestEnemy.y;
                        if (dist < 500 && Math.random() < 0.05 && !b.isBoosting) {
                            b.isBoosting = true; setTimeout(() => { if(bots[id]) bots[id].isBoosting = false; }, 1500);
                        }
                    }
                } else {
                    // Yem Toplama Modu
                    let f = foods[Math.floor(Math.random() * foods.length)];
                    b.targetX = f.x - b.x; b.targetY = f.y - b.y;
                }
            }
        }

        let angle = Math.atan2(b.targetY, b.targetX);
        let speed = (b.isBoosting ? 18 : 7) * Math.pow(b.radius / INITIAL_RADIUS, -0.15);
        b.x += Math.cos(angle) * speed; b.y += Math.sin(angle) * speed;
        b.x = Math.max(50, Math.min(MAP_SIZE-50, b.x)); b.y = Math.max(50, Math.min(MAP_SIZE-50, b.y));
    }
}

io.on('connection', async (socket) => {
    socket.emit('globalScoresUpdate', await getCategorizedScores());
    socket.on('joinGame', (name) => {
        const spawn = getSafeSpawn();
        players[socket.id] = { id: socket.id, name: name || "Adsız", x: spawn.x, y: spawn.y, color: `hsl(${Math.random()*360}, 80%, 60%)`, radius: INITIAL_RADIUS, score: 0, targetX: 0, targetY: 0, lastBoost: 0, isBoosting: false };
        socket.emit('initGameData', { foods, viruses });
    });
    socket.on('playerMove', (d) => { if(players[socket.id]) { players[socket.id].targetX = d.x; players[socket.id].targetY = d.y; } });
    socket.on('triggerBoost', () => {
        let p = players[socket.id];
        if(p && Date.now() - p.lastBoost > 15000) { p.lastBoost = Date.now(); p.isBoosting = true; setTimeout(()=> { if(players[socket.id]) players[socket.id].isBoosting=false; }, 1500); socket.emit('boostActivated'); }
    });
    socket.on('ejectMass', () => {
        let p = players[socket.id];
        if(p && p.score >= 200) { p.score -= EJECT_COST; p.radius -= 1.5; let a = Math.atan2(p.targetY, p.targetX); ejectedMasses.push({ x: p.x+Math.cos(a)*p.radius, y: p.y+Math.sin(a)*p.radius, c: p.color, r: 20, angle: a, speed: 25 }); }
    });
    socket.on('disconnect', async () => {
        if(players[socket.id] && players[socket.id].score > 30) { await new HighScore({ name: players[socket.id].name, score: Math.floor(players[socket.id].score) }).save(); io.emit('globalScoresUpdate', await getCategorizedScores()); }
        delete players[socket.id];
    });
});

setInterval(() => {
    const playerCount = Object.keys(players).length;
    if (playerCount === 0) return; // Uyku modu (Veri tasarrufu)

    if (playerCount + Object.keys(bots).length < BOT_COUNT_TARGET) {
        let id = "bot_" + Math.random().toString(36).substr(2, 5);
        bots[id] = { id, isBot: true, name: botNames[Math.floor(Math.random()*botNames.length)], x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, color: `hsl(${Math.random()*360}, 60%, 50%)`, radius: INITIAL_RADIUS, score: 0, targetX: 0, targetY: 0, isBoosting: false };
    }

    updateSuperBotAI();
    ejectedMasses.forEach(m => { if(m.speed > 0) { m.x += Math.cos(m.angle)*m.speed; m.y += Math.sin(m.angle)*m.speed; m.speed *= 0.9; } });

    const everyone = {...players, ...bots};
    for (let id in everyone) {
        let p = everyone[id];
        if(!p.isBot) {
            let a = Math.atan2(p.targetY, p.targetX), d = Math.hypot(p.targetX, p.targetY);
            if(d > 5) { let s = (p.isBoosting?18:7)*Math.pow(p.radius/INITIAL_RADIUS, -0.15); p.x += Math.cos(a)*(d<50?s*d/50:s); p.y += Math.sin(a)*(d<50?s*d/50:s); }
        }
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x)); p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        foods.forEach((f, i) => { if(Math.hypot(p.x-f.x, p.y-f.y) < p.radius) { p.radius+=0.4; p.score+=1.5; io.emit('foodCollected', {i, newF: spawnFood(i)}); } });
        ejectedMasses.forEach((m, i) => { if(Math.hypot(p.x-m.x, p.y-m.y) < p.radius) { p.score+=20; p.radius+=3; ejectedMasses.splice(i,1); } });
        viruses.forEach((v, i) => { if(Math.hypot(p.x-v.x, p.y-v.y) < p.radius+15 && p.score > 200) { p.score *= 0.9; p.radius *= 0.95; viruses[i]=spawnVirus(); io.emit('updateViruses', viruses); }});

        for(let oid in everyone) {
            if(id === oid) continue;
            let o = everyone[oid];
            if(Math.hypot(p.x-o.x, p.y-o.y) < p.radius && p.score > o.score + EAT_MARGIN) {
                p.score += Math.floor(o.score*0.5)+40; p.radius += (o.radius*0.4);
                if(o.isBot) delete bots[oid]; else { io.to(oid).emit('dead', {score: o.score}); delete players[oid]; }
            }
        }
    }
    
    for(let pid in players) {
        let me = players[pid];
        let visible = {};
        for(let oid in everyone) if(Math.abs(me.x - everyone[oid].x) < 4500 && Math.abs(me.y - everyone[oid].y) < 3500) visible[oid] = everyone[oid];
        io.to(pid).emit('updateState', { players: visible, ejectedMasses });
    }
}, 1000 / 30);

server.listen(process.env.PORT || 10000);
