const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap-canvas');
const mCtx = mCanvas.getContext('2d');
const socket = io();

let allPlayers = {}, allFoods = [], viruses = [], mapSize = 5000;
let isAlive = false, controlType = "mouse", globalData = {};
let boostCharge = 100;
const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);

function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize); resize();

// Tam Ekran + Menüden Başlatma
function lockLandscape() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
    }
}

socket.on('initGameData', (data) => {
    allFoods = data.foods;
    viruses = data.viruses;
});
socket.on('foodCollected', (data) => allFoods[data.i] = data.newF);
socket.on('updatePlayers', (p) => allPlayers = p);
socket.on('globalScoresUpdate', (data) => {
    globalData = data;
    renderScores('daily');
});

// Rekor Sekme Yönetimi
function changeTab(type, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderScores(type);
}
function renderScores(type) {
    const list = document.getElementById('global-list');
    const data = globalData[type] || [];
    list.innerHTML = data.length ? data.map((s, i) => `<div class="lb-item"><span>${i+1}. ${s.name}</span><span>${Math.floor(s.score)}</span></div>`).join('') : "Kayıt yok.";
}
function openGlobal() { document.getElementById('global-modal').style.display = 'flex'; }

// Giriş
document.getElementById('btn-play').onclick = () => {
    lockLandscape();
    const name = document.getElementById('username').value;
    const selected = document.getElementById('control-type').value;
    controlType = (selected === "auto") ? (isMobile ? "joystick" : "mouse") : selected;

    if (controlType === "joystick") {
        nipplejs.create({ zone: document.getElementById('joystick-zone'), mode: 'static', position: {left:'50%', top:'50%'}, color:'white', size:100 })
            .on('move', (e, d) => socket.emit('playerMove', { x: d.vector.x*100, y: -d.vector.y*100 }))
            .on('end', () => socket.emit('playerMove', { x: 0, y: 0 }));
    }
    if (isMobile) document.getElementById('boost-btn-mobile').style.display = 'block';
    
    socket.emit('joinGame', name);
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'block';
    document.getElementById('minimap').style.display = 'block';
    document.getElementById('boost-container').style.display = 'block';
    isAlive = true;
};

// Boost Tetikleyici (Sağ Tık & Mobil Buton)
window.addEventListener('contextmenu', (e) => { e.preventDefault(); if(isAlive) socket.emit('triggerBoost'); });
document.getElementById('boost-btn-mobile').ontouchstart = (e) => { e.preventDefault(); socket.emit('triggerBoost'); };

socket.on('boostActivated', () => { boostCharge = 0; });
socket.on('dead', (d) => { isAlive = false; document.getElementById('final-score').innerText = `Skor: ${Math.floor(d.score)}`; document.getElementById('death-overlay').style.display = 'flex'; });

function draw() {
    const me = allPlayers[socket.id];
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (me && isAlive) {
        // Boost Bar Güncelleme
        if (boostCharge < 100) boostCharge += (100 / (15 * 60)); // 15 Saniyede dolar
        const bar = document.getElementById('boost-bar');
        bar.style.width = boostCharge + "%";
        bar.style.background = boostCharge >= 100 ? "#ffeb3b" : "white";

        let zoom = Math.pow(isMobile ? 22 : 30, 0.45) / Math.pow(me.radius, 0.45);
        if (zoom < (isMobile ? 0.22 : 0.32)) zoom = isMobile ? 0.22 : 0.32;

        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(zoom, zoom);
        ctx.translate(-me.x, -me.y);

        // Arka Plan
        ctx.strokeStyle = '#181818'; ctx.lineWidth = 2;
        ctx.beginPath();
        for(let x=0; x<=mapSize; x+=500) { ctx.moveTo(x,0); ctx.lineTo(x,mapSize); }
        for(let y=0; y<=mapSize; y+=500) { ctx.moveTo(0,y); ctx.lineTo(mapSize,y); }
        ctx.stroke();
        ctx.strokeStyle = '#f33'; ctx.lineWidth = 15; ctx.strokeRect(0,0,mapSize,mapSize);

        // Yiyecekler
        for(let f of allFoods) {
            if (Math.abs(me.x - f.x) < 1500 && Math.abs(me.y - f.y) < 1500) {
                ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI*2); ctx.fill();
            }
        }

        // --- VİRÜS ÇİZİMİ (Tırtıklı Kırmızı Küreler) ---
        for(let v of viruses) {
            drawVirus(v.x, v.y, v.r);
        }

        for (let id in allPlayers) drawJellyPlayer(allPlayers[id], id === socket.id);
        ctx.restore();
        updateUI(me);
        drawMinimap(me);
    }
    requestAnimationFrame(draw);
}

function drawVirus(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.fillStyle = '#ff0000';
    ctx.strokeStyle = '#800000';
    ctx.lineWidth = 4;
    const spikes = 20;
    for (let i = 0; i < spikes * 2; i++) {
        let angle = (i / spikes) * Math.PI;
        let dist = i % 2 === 0 ? r : r * 0.85;
        ctx.lineTo(Math.cos(angle) * dist, Math.sin(angle) * dist);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawJellyPlayer(p, isMe) {
    const points = 32, time = Date.now() * 0.006, vertices = [];
    const moveAngle = Math.atan2(p.targetY, p.targetX);
    for (let i = 0; i < points; i++) {
        let angle = (i / points) * Math.PI * 2;
        let wobble = Math.sin(time + i * 1.2) * (p.radius * 0.04);
        let stretch = (Math.abs(p.targetX) > 5 || Math.abs(p.targetY) > 5) ? Math.cos(angle - moveAngle) * (p.radius * (p.isBoosting ? 0.3 : 0.18)) : 0;
        let r = p.radius + wobble + stretch;
        vertices.push({ x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r });
    }
    ctx.beginPath();
    ctx.moveTo((vertices[0].x + vertices[points-1].x) / 2, (vertices[0].y + vertices[points-1].y) / 2);
    for (let i = 0; i < points; i++) {
        const next = vertices[(i + 1) % points];
        ctx.quadraticCurveTo(vertices[i].x, vertices[i].y, (vertices[i].x + next.x) / 2, (vertices[i].y + next.y) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = p.color; ctx.fill();
    ctx.strokeStyle = p.isBoosting ? 'yellow' : 'white'; ctx.lineWidth = p.isBoosting ? 6 : 4; ctx.stroke();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(moveAngle);
    ctx.fillStyle="white"; ctx.beginPath(); ctx.arc(p.radius*0.35, -p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.arc(p.radius*0.35, p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="black"; ctx.beginPath(); ctx.arc(p.radius*0.35+3, -p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.arc(p.radius*0.35+3, p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(p.name, p.x, p.y - p.radius - 18);
}

function updateUI(me) {
    let sorted = Object.values(allPlayers).sort((a,b) => b.score - a.score);
    document.getElementById('lb-list').innerHTML = sorted.slice(0, 5).map((p, i) => `<div class="lb-item"><span>${i+1}. ${p.name}</span><span>${Math.floor(p.score)}</span></div>`).join('');
}

function drawMinimap(me) {
    mCtx.clearRect(0,0,120,120); const s = 120 / mapSize;
    for(let id in allPlayers) { 
        const p = allPlayers[id];
        mCtx.fillStyle = id === socket.id ? "#fff" : "#f44"; 
        // Minimap noktaları oyuncunun büyüklüğüne göre ölçeklenir
        let dotR = Math.max(2, p.radius * 0.05); 
        mCtx.beginPath(); mCtx.arc(p.x*s, p.y*s, dotR, 0, Math.PI*2); mCtx.fill(); 
    }
}
draw();
