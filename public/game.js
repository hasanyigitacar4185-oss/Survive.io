const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap-canvas');
const mCtx = mCanvas.getContext('2d');
const socket = io();

const joyZone = document.getElementById('joystick-zone');
const boostBtn = document.getElementById('boost-btn');
const globalList = document.getElementById('global-list');

let allPlayers = {}, allFoods = [], mapSize = 5000;
let isAlive = false, controlType = "mouse", manager = null, globalScores = [];

function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    document.getElementById('orientation-warning').style.display = (window.innerHeight > window.innerWidth && isMobile) ? 'flex' : 'none';
}
window.addEventListener('resize', resize); resize();

// Global Skorlar
document.getElementById('btn-global').onclick = () => {
    document.getElementById('global-modal').style.display = 'flex';
    globalList.innerHTML = globalScores.length ? globalScores.map((s,i) => `<div class="global-item"><span>${i+1}. ${s.name}</span><span>${s.score}</span></div>`).join('') : "Henüz rekor yok.";
};

socket.on('globalScoresUpdate', (s) => globalScores = s);

// Oyuna Giriş
document.getElementById('btn-play').onclick = () => {
    const name = document.getElementById('username').value;
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const selected = document.getElementById('control-type').value;
    controlType = (selected === "auto") ? (isMobile ? "joystick" : "mouse") : selected;

    if (controlType === "joystick") {
        joyZone.style.display = 'block';
        manager = nipplejs.create({ zone: joyZone, mode: 'static', position: {left:'50%', top:'50%'}, color:'white', size:100 });
        manager.on('move', (e, d) => socket.emit('playerMove', { x: d.vector.x*100, y: -d.vector.y*100 }));
        manager.on('end', () => socket.emit('playerMove', { x: 0, y: 0 }));
    }
    if (isMobile) boostBtn.style.display = 'flex';

    socket.emit('joinGame', name);
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'block';
    document.getElementById('minimap').style.display = 'block';
    isAlive = true;
};

// Boost
window.addEventListener('keydown', (e) => { if(e.code === "Space") socket.emit('startBoost'); });
window.addEventListener('keyup', (e) => { if(e.code === "Space") socket.emit('stopBoost'); });
boostBtn.ontouchstart = () => socket.emit('startBoost');
boostBtn.ontouchend = () => socket.emit('stopBoost');

window.addEventListener('mousemove', (e) => {
    if (isAlive && controlType === "mouse") socket.emit('playerMove', { x: e.clientX - canvas.width/2, y: e.clientY - canvas.height/2 });
});

socket.on('update', (data) => { allPlayers = data.players || {}; allFoods = data.foods || []; mapSize = data.MAP_SIZE || 5000; });
socket.on('dead', (d) => { isAlive = false; document.getElementById('final-score').innerText = `Skor: ${Math.floor(d.score)}`; document.getElementById('death-overlay').style.display = 'flex'; boostBtn.style.display = 'none'; joyZone.style.display = 'none'; });

function draw() {
    const me = allPlayers[socket.id];
    ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (me && isAlive) {
        let zoom = Math.pow(30 / me.radius, 0.42);
        if (zoom < 0.3) zoom = 0.3;
        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(zoom, zoom);
        ctx.translate(-me.x, -me.y);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
        for(let x=0; x<=mapSize; x+=100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,mapSize); ctx.stroke(); }
        for(let y=0; y<=mapSize; y+=100) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(mapSize,y); ctx.stroke(); }
        ctx.strokeStyle = '#f33'; ctx.lineWidth = 12; ctx.strokeRect(0,0,mapSize,mapSize);
        allFoods.forEach(f => { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.radius, 0, Math.PI*2); ctx.fill(); });
        for (let id in allPlayers) { if (allPlayers[id]) drawJellyPlayer(allPlayers[id], id === socket.id); }
        ctx.restore();
        updateLeaderboard(me);
        drawMinimap(me);
    }
    requestAnimationFrame(draw);
}

function drawJellyPlayer(p, isMe) {
    const points = 32, time = Date.now() * 0.004, vertices = [];
    for (let i = 0; i < points; i++) {
        let angle = (i / points) * Math.PI * 2;
        let wobble = Math.sin(time + i * 0.5) * (p.radius * 0.04);
        let stretch = (isMe && (Math.abs(p.targetX) > 5 || Math.abs(p.targetY) > 5)) ? Math.cos(angle - Math.atan2(p.targetY, p.targetX)) * (p.radius * (p.isBoosting ? 0.25 : 0.15)) : 0;
        let pressure = 0;
        if (p.x < p.radius + 10) pressure += Math.max(0, (p.radius + 10 - p.x) * -Math.cos(angle));
        if (mapSize - p.x < p.radius + 10) pressure += Math.max(0, (p.radius + 10 - (mapSize - p.x)) * Math.cos(angle));
        if (p.y < p.radius + 10) pressure += Math.max(0, (p.radius + 10 - p.y) * -Math.sin(angle));
        if (mapSize - p.y < p.radius + 10) pressure += Math.max(0, (p.radius + 10 - (mapSize - p.y)) * Math.sin(angle));
        let r = p.radius + wobble + stretch - pressure;
        vertices.push({ x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r });
    }
    ctx.beginPath(); ctx.moveTo((vertices[0].x + vertices[points-1].x)/2, (vertices[0].y + vertices[points-1].y)/2);
    for (let i = 0; i < points; i++) { const next = vertices[(i + 1) % points]; ctx.quadraticCurveTo(vertices[i].x, vertices[i].y, (vertices[i].x + next.x)/2, (vertices[i].y + next.y)/2); }
    ctx.closePath(); ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = p.isBoosting ? 'cyan' : 'white'; ctx.lineWidth = p.isBoosting ? 6 : 4; ctx.stroke();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.targetY, p.targetX));
    ctx.fillStyle="white"; ctx.beginPath(); ctx.arc(p.radius*0.35, -p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.arc(p.radius*0.35, p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="black"; ctx.beginPath(); ctx.arc(p.radius*0.35+3, -p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.arc(p.radius*0.35+3, p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(p.name, p.x, p.y - p.radius - 15);
}

function updateLeaderboard(me) {
    let sorted = Object.values(allPlayers).sort((a,b) => b.score - a.score);
    document.getElementById('lb-list').innerHTML = sorted.slice(0, 5).map((p, i) => `<div class="lb-item"><span>${i+1}. ${p.name}</span><span>${Math.floor(p.score)}</span></div>`).join('');
    let myRank = sorted.findIndex(p => p.id === socket.id) + 1;
    document.getElementById('lb-player').innerHTML = `<div class="lb-item lb-own"><span>${myRank}. ${me.name}</span><span>${Math.floor(me.score)}</span></div>`;
}

function drawMinimap(me) {
    mCtx.clearRect(0,0,140,140); const s = 140 / mapSize;
    for(let id in allPlayers) { 
        if (!allPlayers[id]) continue;
        mCtx.fillStyle = id === socket.id ? "#fff" : "#f44"; 
        mCtx.beginPath(); mCtx.arc(allPlayers[id].x*s, allPlayers[id].y*s, id === socket.id ? 3 : 2, 0, Math.PI*2); mCtx.fill(); 
    }
}
draw();
