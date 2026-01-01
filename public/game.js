const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap-canvas');
const mCtx = mCanvas.getContext('2d');
const socket = io();

let allPlayers = {}, allFoods = [], viruses = [], ejectedMasses = [], mapSize = 5000;
let isAlive = false, controlType = "mouse", globalData = {}, boostCharge = 100;
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize); resize();

function enterFullScreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

socket.on('initGameData', (data) => { allFoods = data.foods; viruses = data.viruses; });
socket.on('updateViruses', (v) => viruses = v);
socket.on('foodCollected', (data) => allFoods[data.i] = data.newF);
socket.on('updateState', (data) => { allPlayers = data.players; ejectedMasses = data.ejectedMasses; });
socket.on('globalScoresUpdate', (data) => { globalData = data; renderScores('daily'); });

function changeTab(t, b) { document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderScores(t); }
function renderScores(t) {
    const list = document.getElementById('global-list');
    const data = globalData[t] || [];
    list.innerHTML = data.length ? data.map((s,i) => `<div class="lb-item"><span>${i+1}. ${s.name}</span><span>${Math.floor(s.score)}</span></div>`).join('') : "Kayıt yok.";
}

document.getElementById('btn-play').onclick = () => {
    enterFullScreen();
    const name = document.getElementById('username').value;
    const selected = document.getElementById('control-type').value;
    controlType = (selected === "auto") ? (isMobile ? "joystick" : "mouse") : selected;

    if (controlType === "joystick") {
        document.getElementById('joystick-zone').style.display = 'block';
        nipplejs.create({ zone: document.getElementById('joystick-zone'), mode: 'static', position: {left:'50%', top:'50%'}, color:'white', size:100 })
            .on('move', (e, d) => socket.emit('playerMove', { x: d.vector.x*100, y: -d.vector.y*100 }))
            .on('end', () => socket.emit('playerMove', { x: 0, y: 0 }));
    }
    if (isMobile) {
        document.getElementById('btn-boost-mob').style.display = 'flex';
        document.getElementById('btn-eject-mob').style.display = 'flex';
    }
    
    socket.emit('joinGame', name);
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'block';
    document.getElementById('minimap').style.display = 'block';
    document.getElementById('boost-container').style.display = 'block';
    isAlive = true;
};

// PC HAREKET FİX (Tam ekran ve Resize uyumlu)
window.addEventListener('mousemove', (e) => {
    if (isAlive && controlType === "mouse") {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        socket.emit('playerMove', { x: e.clientX - centerX, y: e.clientY - centerY });
    }
});

window.addEventListener('mousedown', (e) => {
    if(!isAlive) return;
    if(e.button === 0) socket.emit('ejectMass');
    if(e.button === 2) socket.emit('triggerBoost');
});

document.getElementById('btn-boost-mob').ontouchstart = (e) => { e.preventDefault(); socket.emit('triggerBoost'); };
document.getElementById('btn-eject-mob').ontouchstart = (e) => { e.preventDefault(); socket.emit('ejectMass'); };

socket.on('boostActivated', () => { boostCharge = 0; });
socket.on('dead', (d) => { isAlive = false; document.getElementById('final-score').innerText = `Skor: ${Math.floor(d.score)}`; document.getElementById('death-overlay').style.display = 'flex'; });

function draw() {
    const me = allPlayers[socket.id];
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (me && isAlive) {
        if (boostCharge < 100) boostCharge += (100 / (15 * 60));
        document.getElementById('boost-bar').style.width = boostCharge + "%";
        document.getElementById('boost-bar').style.background = boostCharge >= 100 ? "#ffeb3b" : "white";

        let zoom = Math.pow(isMobile ? 24 : 30, 0.45) / Math.pow(me.radius, 0.45);
        if (zoom < (isMobile ? 0.22 : 0.32)) zoom = isMobile ? 0.22 : 0.32;

        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(zoom, zoom);
        ctx.translate(-me.x, -me.y);

        ctx.strokeStyle = '#181818'; ctx.lineWidth = 2;
        ctx.beginPath();
        for(let x=0; x<=mapSize; x+=500) { ctx.moveTo(x,0); ctx.lineTo(x,mapSize); }
        for(let y=0; y<=mapSize; y+=500) { ctx.moveTo(0,y); ctx.lineTo(mapSize,y); }
        ctx.stroke();
        ctx.strokeStyle = '#f33'; ctx.lineWidth = 15; ctx.strokeRect(0,0,mapSize,mapSize);

        for(let f of allFoods) {
            if (Math.abs(me.x - f.x) < 1500 && Math.abs(me.y - f.y) < 1500) {
                ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI*2); ctx.fill();
            }
        }
        for(let m of ejectedMasses) {
            ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = 'black'; ctx.lineWidth = 2; ctx.stroke();
        }
        for(let v of viruses) drawVirus(v.x, v.y, v.r);
        for(let id in allPlayers) drawJellyPlayer(allPlayers[id], id === socket.id);
        
        ctx.restore();
        updateUI(me);
        drawMinimap(me);
    }
    requestAnimationFrame(draw);
}

function drawVirus(x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.fillStyle = '#ff0000'; ctx.strokeStyle = '#800000'; ctx.lineWidth = 4;
    for (let i = 0; i < 40; i++) {
        let a = (i / 20) * Math.PI; let d = i % 2 === 0 ? r : r * 0.85;
        ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

function drawJellyPlayer(p, isMe) {
    const points = 32, time = Date.now() * 0.006, vertices = [];
    const moveAngle = Math.atan2(p.targetY, p.targetX);
    for (let i = 0; i < points; i++) {
        let a = (i / points) * Math.PI * 2;
        let w = Math.sin(time + i * 1.2) * (p.radius * 0.04);
        let s = (Math.abs(p.targetX) > 5 || Math.abs(p.targetY) > 5) ? Math.cos(a - moveAngle) * (p.radius * (p.isBoosting ? 0.3 : 0.18)) : 0;
        let press = 0;
        if (p.x < p.radius + 15) press += Math.max(0, (p.radius + 15 - p.x) * -Math.cos(a));
        if (mapSize - p.x < p.radius + 15) press += Math.max(0, (p.radius + 10 - (mapSize - p.x)) * Math.cos(a));
        if (p.y < p.radius + 15) press += Math.max(0, (p.radius + 15 - p.y) * -Math.sin(a));
        if (mapSize - p.y < p.radius + 15) press += Math.max(0, (p.radius + 15 - (mapSize - p.y)) * Math.sin(a));
        let r = p.radius + w + s - press;
        vertices.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    }
    ctx.beginPath(); ctx.moveTo((vertices[0].x + vertices[points-1].x) / 2, (vertices[0].y + vertices[points-1].y) / 2);
    for (let i = 0; i < points; i++) {
        const n = vertices[(i + 1) % points];
        ctx.quadraticCurveTo(vertices[i].x, vertices[i].y, (vertices[i].x + n.x) / 2, (vertices[i].y + n.y) / 2);
    }
    ctx.closePath(); ctx.fillStyle = p.color; ctx.fill(); ctx.strokeStyle = p.isBoosting ? 'yellow' : 'white'; ctx.lineWidth = p.isBoosting ? 6 : 4; ctx.stroke();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(moveAngle);
    ctx.fillStyle="white"; ctx.beginPath(); ctx.arc(p.radius*0.35, -p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.arc(p.radius*0.35, p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="black"; ctx.beginPath(); ctx.arc(p.radius*0.35+3, -p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.arc(p.radius*0.35+3, p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(p.name, p.x, p.y - p.radius - 18);
}

function updateUI(me) {
    let sorted = Object.values(allPlayers).sort((a,b) => b.score - a.score);
    document.getElementById('lb-list').innerHTML = sorted.slice(0, 5).map((p, i) => `<div class="lb-item"><span>${i+1}. ${p.name}</span><span>${Math.floor(p.score)}</span></div>`).join('');
    document.getElementById('lb-player').innerHTML = `<div class="lb-item lb-own"><span>${sorted.findIndex(p => p.id === socket.id)+1}. ${me.name}</span><span>${Math.floor(me.score)}</span></div>`;
}

function drawMinimap(me) {
    mCtx.clearRect(0,0,125,125); const s = 125 / mapSize;
    for(let id in allPlayers) { 
        const p = allPlayers[id]; mCtx.fillStyle = id === socket.id ? "#fff" : "#f44"; 
        let dotR = Math.max(2, p.radius * 0.05); 
        mCtx.beginPath(); mCtx.arc(p.x*s, p.y*s, dotR, 0, Math.PI*2); mCtx.fill(); 
    }
}
draw();
