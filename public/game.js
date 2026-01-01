const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap-canvas');
const mCtx = mCanvas.getContext('2d');
const pingEl = document.getElementById('ping-display');
const boostBar = document.getElementById('boost-bar');
const socket = io();

let allPlayers = {}, allFoods = [], viruses = [], ejectedMasses = [], mapSize = 15000;
let isAlive = false, controlType = "mouse", globalData = {}, boostCharge = 100;
let lastPingTime = 0, currentPing = 0, eatEffect = 0;

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

setInterval(() => { if(socket.connected) { lastPingTime = Date.now(); socket.emit('heartbeat', lastPingTime); } }, 2000);
socket.on('heartbeat_res', (t) => {
    currentPing = Date.now() - t; pingEl.innerText = `Ping: ${currentPing} ms`;
    pingEl.style.color = currentPing < 100 ? "#00ff00" : (currentPing < 200 ? "#ffff00" : "#ff0000");
});

socket.on('initGameData', (data) => { allFoods = data.foods; viruses = data.viruses; });
socket.on('updateViruses', (v) => viruses = v);
socket.on('foodCollected', (data) => { 
    if(allFoods[data.i]) { allFoods[data.i] = data.newF; eatEffect = 15; } // Yeme titremesi başlat
});
socket.on('updateState', (data) => { allPlayers = data.players; ejectedMasses = data.ejectedMasses; });
socket.on('globalScoresUpdate', (data) => { globalData = data; });

document.getElementById('btn-play').onclick = () => {
    const name = document.getElementById('username').value;
    const selected = document.getElementById('control-type').value;
    controlType = (selected === "auto") ? (isMobile ? "joystick" : "mouse") : selected;
    if (controlType === "joystick") {
        document.getElementById('joystick-zone').style.display = 'block';
        nipplejs.create({ zone: document.getElementById('joystick-zone'), mode: 'static', position: {left:'50%', top:'50%'}, color:'white', size:100 })
            .on('move', (e, d) => socket.emit('playerMove', { x: d.vector.x*100, y: -d.vector.y*100 }))
            .on('end', () => socket.emit('playerMove', { x: 0, y: 0 }));
    }
    socket.emit('joinGame', name);
    document.getElementById('menu-overlay').style.display = 'none';
    document.getElementById('leaderboard').style.display = 'block';
    document.getElementById('minimap').style.display = 'block';
    document.getElementById('boost-container').style.display = 'block';
    isAlive = true;
};

window.addEventListener('mousemove', (e) => {
    if (isAlive && controlType === "mouse") socket.emit('playerMove', { x: e.clientX - window.innerWidth / 2, y: e.clientY - window.innerHeight / 2 });
});

window.addEventListener('mousedown', (e) => {
    if(!isAlive) return;
    if(e.button === 0) socket.emit('ejectMass');
    if(e.button === 2) socket.emit('triggerBoost');
});

socket.on('boostActivated', () => { boostCharge = 0; });
socket.on('dead', (d) => { isAlive = false; document.getElementById('final-score').innerText = `Skor: ${Math.floor(d.score)}`; document.getElementById('death-overlay').style.display = 'flex'; });

function draw() {
    const me = allPlayers[socket.id];
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (me && isAlive) {
        // Boost Bar Güncelleme
        if (boostCharge < 100) boostCharge += (100 / (15 * 60));
        boostBar.style.width = boostCharge + "%";
        boostBar.style.background = boostCharge >= 100 ? "#4CAF50" : "#fff";

        let zoom = Math.pow(isMobile ? 24 : 30, 0.45) / Math.pow(me.radius, 0.45);
        if (zoom < 0.25) zoom = 0.25;

        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(zoom, zoom);
        ctx.translate(-me.x, -me.y);

        // Izgara
        ctx.strokeStyle = '#121212'; ctx.lineWidth = 4; ctx.beginPath();
        for(let x=0; x<=mapSize; x+=500) { ctx.moveTo(x,0); ctx.lineTo(x,mapSize); }
        for(let y=0; y<=mapSize; y+=500) { ctx.moveTo(0,y); ctx.lineTo(mapSize,y); }
        ctx.stroke();
        ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 20; ctx.strokeRect(0,0,mapSize,mapSize);

        for(let f of allFoods) {
            if (Math.abs(me.x - f.x) < 2500 && Math.abs(me.y - f.y) < 2500) {
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
        if(eatEffect > 0) eatEffect *= 0.9; // Yeme efekti sönümü
    }
    requestAnimationFrame(draw);
}

function drawVirus(x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.fillStyle = '#ff0000'; ctx.strokeStyle = '#800000'; ctx.lineWidth = 5;
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
        // Temel jel hareketi + yeme titremesi
        let w = Math.sin(time + i * 1.2) * (p.radius * (0.04 + eatEffect * 0.005));
        let s = (Math.abs(p.targetX) > 5 || Math.abs(p.targetY) > 5) ? Math.cos(a - moveAngle) * (p.radius * (p.isBoosting ? 0.3 : 0.18)) : 0;
        
        let press = 0;
        const margin = 15;
        // Duvara yapışma fiziği (Yassılaşma)
        if (p.x < p.radius + margin) press += Math.max(0, (p.radius + margin - p.x) * -Math.cos(a));
        if (mapSize - p.x < p.radius + margin) press += Math.max(0, (p.radius + margin - (mapSize - p.x)) * Math.cos(a));
        if (p.y < p.radius + margin) press += Math.max(0, (p.radius + margin - p.y) * -Math.sin(a));
        if (mapSize - p.y < p.radius + margin) press += Math.max(0, (p.radius + margin - (mapSize - p.y)) * Math.sin(a));

        let r = p.radius + w + s - press;
        vertices.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    }

    ctx.beginPath();
    ctx.moveTo((vertices[0].x + vertices[points-1].x) / 2, (vertices[0].y + vertices[points-1].y) / 2);
    for (let i = 0; i < points; i++) {
        const n = vertices[(i + 1) % points];
        ctx.quadraticCurveTo(vertices[i].x, vertices[i].y, (vertices[i].x + n.x) / 2, (vertices[i].y + n.y) / 2);
    }
    ctx.closePath(); ctx.fillStyle = p.color; ctx.fill(); 
    ctx.strokeStyle = p.isBoosting ? '#fff' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = p.isBoosting ? 8 : 4; ctx.stroke();
    
    // Gözler
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(moveAngle);
    ctx.fillStyle="white"; ctx.beginPath(); 
    ctx.arc(p.radius * 0.35, -p.radius * 0.2, p.radius * 0.2, 0, Math.PI * 2); 
    ctx.arc(p.radius * 0.35, p.radius * 0.2, p.radius * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle="black"; ctx.beginPath(); 
    ctx.arc(p.radius * 0.35 + 4, -p.radius * 0.2, p.radius * 0.1, 0, Math.PI * 2); 
    ctx.arc(p.radius * 0.35 + 4, p.radius * 0.2, p.radius * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    
    ctx.fillStyle = "white"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center"; 
    ctx.fillText(p.name, p.x, p.y - p.radius - 20);
}

function updateUI(me) {
    let sorted = Object.values(allPlayers).sort((a,b) => b.score - a.score);
    document.getElementById('lb-list').innerHTML = sorted.slice(0, 5).map((p, i) => `<div class="lb-item"><span>${i+1}. ${p.name}</span><span>${Math.floor(p.score)}</span></div>`).join('');
    const myPos = sorted.findIndex(p => p.id === socket.id) + 1;
    document.getElementById('lb-player').innerHTML = `<div class="lb-item lb-own"><span>${myPos}. ${me.name}</span><span>${Math.floor(me.score)}</span></div>`;
}

function drawMinimap(me) {
    mCtx.clearRect(0,0,130,130); const s = 130 / mapSize; 
    for(let id in allPlayers) {
        const p = allPlayers[id]; mCtx.fillStyle = id === socket.id ? "#fff" : "#ff4444";
        let dotR = Math.max(2.5, p.radius * s * 5); 
        mCtx.beginPath(); mCtx.arc(p.x * s, p.y * s, dotR, 0, Math.PI*2); mCtx.fill();
    }
}
draw();
