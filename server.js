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
const FOOD_COUNT = 1000;
const VIRUS_COUNT = 45;
const INITIAL_RADIUS = 30;
const EAT_MARGIN = 5;
const BOT_COUNT_TARGET = 10;
const EJECT_COST = 20;

let players = {};
let bots = {};
let foods = [];
let viruses = [];
let ejectedMasses = [];

const botNames = ["Ninja_IO", "Luffy", "Zoro", "Speedy", "Solo_Player", "Alpha", "King", "Slayer", "Shadow", "Neon", "Void", "Storm"];

// YARDIMCI FONKSİYONLAR
function spawnFood(index) {
    const f = { i: index, x: Math.floor(Math.random() * MAP_SIZE), y: Math.floor(Math.random() * MAP_SIZE), c: `hsl(${Math.random() * 360}, 70%, 50%)`, r: 7 };
    if (index !== undefined) foods[index] = f;
    return f;
}
function spawnVirus() { return { x: Math.random() * (MAP_SIZE - 1000) + 500, y: Math.random() * (MAP_SIZE - 1000) + 500, r: 85 }; }

function getSafeSpawn() {
    let x, y, safe = false;
    let attempts = 0;
    while(!safe && attempts < 20) {
        x = Math.random() * (MAP_SIZE - 2000) + 1000;
        y = Math.random() * (MAP_SIZE - 2000) + 1000;
        safe = true;
        for(let id in players) if(Math.hypot(x-players[id].x, y-players[id].y) < 800) safe = false;
        attempts++;
    }
    return {x, y};
}

for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood(i));
for (let i = 0; i < VIRUS_COUNT; i++) viruses.push(spawnVirus());

async function getCategorizedScores() {
    const trOffset = 3 * 60 * 60 * 1000;
    const now = new Date(Date.now() + trOffset);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const daily = await HighScore.find({ date: { $gte: startOfToday } }).sort({ score: -1 }).limit(10);
    const monthly = await HighScore.find({ date: { $gte: startOfMonth } }).sort({ score: -1 }).limit(10);
    const allTime = await HighScore.find().sort({ score: -1 }).limit(10);
    return { daily, monthly, allTime };
}

function updateBotAI() {
    const everyone = {...players, ...bots};
    for (let id in bots) {
        let b = bots[id];
        
        // Sıkılma Kontrolü
        if (!b.targetId || Date.now() > b.targetExpireTime) {
            let targets = Object.values(everyone).filter(o => o.id !== b.id);
            if (targets.length > 0) {
                let nearest = targets.sort((a,b) => Math.hypot(b.x-a.x, b.y-a.y))[0];
                b.targetId = nearest.id;
                b.targetExpireTime = Date.now() + (10000 + Math.random() * 15000); // 10-25 sn
            }
        }

        const target = everyone[b.targetId];
        if (target) {
            let dx = target.x - b.x, dy = target.y - b.y;
            let dist = Math.hypot(dx, dy);
            
            if (b.score > target.score + 10) { // KOVALA
                b.targetX = dx; b.targetY = dy;
                if (dist < 500 && Math.random() < 0.05) b.isBoosting = true;
            } else { // KAÇ
                b.targetX = -dx; b.targetY = -dy;
                if (dist < 400) b.isBoosting = true;
            }
        } else {
            b.targetX = Math.sin(Date.now() * 0.001) * 100;
            b.targetY = Math.cos(Date.now() * 0.001) * 100;
        }

        let angle = Math.atan2(b.targetY, b.targetX);
        let speed = (b.isBoosting ? 18 : 6.5) * Math.pow(b.radius / INITIAL_RADIUS, -0.15);
        b.x += Math.cos(angle) * speed; b.y += Math.sin(angle) * speed;
        b.x = Math.max(50, Math.min(MAP_SIZE-50, b.x)); b.y = Math.max(50, Math.min(MAP_SIZE-50, b.y));
        if (b.isBoosting) setTimeout(() => { b.isBoosting = false; }, 1000);
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
        if(p && p.score >= 200) { p.score -= 20; p.radius -= 1.5; let a = Math.atan2(p.targetY, p.targetX); ejectedMasses.push({ x: p.x+Math.cos(a)*p.radius, y: p.y+Math.sin(a)*p.radius, c: p.color, r: 20, angle: a, speed: 25 }); }
    });
    socket.on('disconnect', async () => {
        if(players[socket.id] && players[socket.id].score > 30) { await new HighScore({ name: players[socket.id].name, score: Math.floor(players[socket.id].score) }).save(); io.emit('globalScoresUpdate', await getCategorizedScores()); }
        delete players[socket.id];
    });
});

setInterval(() => {
    const playerCount = Object.keys(players).length;
    if (playerCount === 0) return;

    if (playerCount + Object.keys(bots).length < BOT_COUNT_TARGET) {
        let id = "bot_" + Math.random().toString(36).substr(2, 5);
        bots[id] = { id, isBot: true, name: botNames[Math.floor(Math.random()*botNames.length)], x: Math.random()*MAP_SIZE, y: Math.random()*MAP_SIZE, color: `hsl(${Math.random()*360}, 60%, 50%)`, radius: INITIAL_RADIUS, score: 0, targetX: 0, targetY: 0, isBoosting: false, targetExpireTime: 0 };
    }

    updateBotAI();
    ejectedMasses.forEach(m => { if(m.speed > 0) { m.x += Math.cos(m.angle)*m.speed; m.y += Math.sin(m.angle)*m.speed; m.speed *= 0.9; } });

    const everyone = {...players, ...bots};
    for (let id in everyone) {
        let p = everyone[id];
        if(!p.isBot) {
            let a = Math.atan2(p.targetY, p.targetX), d = Math.hypot(p.targetX, p.targetY);
            if(d > 5) { let s = (p.isBoosting?18:6.5)*Math.pow(p.radius/INITIAL_RADIUS, -0.15); p.x += Math.cos(a)*(d<50?s*d/50:s); p.y += Math.sin(a)*(d<50?s*d/50:s); }
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
        for(let oid in everyone) {
            let o = everyone[oid];
            if(Math.abs(me.x - o.x) < 3000 && Math.abs(me.y - o.y) < 2000) visible[oid] = o;
        }
        io.to(pid).emit('updateState', { players: visible, ejectedMasses });
    }
}, 1000 / 30);

server.listen(process.env.PORT || 10000);
