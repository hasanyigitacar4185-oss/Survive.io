const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap-canvas');
const mCtx = mCanvas.getContext('2d');
const socket = io();

let allPlayers = {}, allFoods = [], mapSize = 5000;
let isAlive = false, controlType = "mouse", globalScores = [];
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    document.getElementById('orientation-warning').style.display = (window.innerHeight > window.innerWidth && isMobile) ? 'flex' : 'none';
}
window.addEventListener('resize', resize); resize();

function enterFullScreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

socket.on('initFoods', (f) => allFoods = f);
socket.on('foodCollected', (data) => allFoods[data.i] = data.newF);
socket.on('updatePlayers', (p) => allPlayers = p);
socket.on('globalScoresUpdate', (s) => {
    globalScores = s;
    const list = document.getElementById('global-list');
    if(list) list.innerHTML = s.map((item, i) => `<div class="global-item"><span>${i+1}. ${item.name}</span><span>${Math.floor(item.score)}</span></div>`).join('');
});

document.getElementById('btn-play').onclick = () => {
    if (isMobile) enterFullScreen(); 
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
    isAlive = true;
};

window.addEventListener('mousemove', (e) => {
    if (isAlive && controlType === "mouse") socket.emit('playerMove', { x: e.clientX - canvas.width/2, y: e.clientY - canvas.height/2 });
});

socket.on('dead', (d) => { isAlive = false; document.getElementById('final-score').innerText = `Skor: ${Math.floor(d.score)}`; document.getElementById('death-overlay').style.display = 'flex'; });

function draw() {
    const me = allPlayers[socket.id];
    ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (me) {
        // Zoom mantığı iyileştirildi: Mobilde daha geniş açı (0.35 -> 0.28)
        let zoomBase = isMobile ? 22 : 30;
        let zoom = Math.pow(zoomBase / me.radius, 0.45);
        let minZoom = isMobile ? 0.25 : 0.35;
        if (zoom < minZoom) zoom = minZoom;

        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(zoom, zoom);
        ctx.translate(-me.x, -me.y);

        // Grid
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
        ctx.beginPath();
        for(let x=0; x<=mapSize; x+=500) { ctx.moveTo(x,0); ctx.lineTo(x,mapSize); }
        for(let y=0; y<=mapSize; y+=500) { ctx.moveTo(0,y); ctx.lineTo(mapSize,y); }
        ctx.stroke();
        ctx.strokeStyle = '#f33'; ctx.lineWidth = 15; ctx.strokeRect(0,0,mapSize,mapSize);

        // Yiyecekler
        for(let f of allFoods) {
            if (Math.abs(me.x - f.x) < 1800 && Math.abs(me.y - f.y) < 1800) {
                ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI*2); ctx.fill();
            }
        }

        for (let id in allPlayers) drawJellyPlayer(allPlayers[id], id === socket.id);
        ctx.restore();
        updateLeaderboard(me);
        drawMinimap(me);
    }
    requestAnimationFrame(draw);
}

function drawJellyPlayer(p, isMe) {
    const points = 32; 
    const time = Date.now() * 0.006;
    const vertices = [];
    const moveAngle = Math.atan2(p.targetY, p.targetX);

    for (let i = 0; i < points; i++) {
        let angle = (i / points) * Math.PI * 2;
        let wobble = Math.sin(time + i * 1.2) * (p.radius * 0.04);
        let stretch = (Math.abs(p.targetX) > 5 || Math.abs(p.targetY) > 5) ? Math.cos(angle - moveAngle) * (p.radius * 0.18) : 0;
        let pressure = 0;
        if (p.x < p.radius + 15) pressure += Math.max(0, (p.radius + 15 - p.x) * -Math.cos(angle));
        if (mapSize - p.x < p.radius + 15) pressure += Math.max(0, (p.radius + 15 - (mapSize - p.x)) * Math.cos(angle));
        if (p.y < p.radius + 15) pressure += Math.max(0, (p.radius + 15 - p.y) * -Math.sin(angle));
        if (mapSize - p.y < p.radius + 15) pressure += Math.max(0, (p.radius + 15 - (mapSize - p.y)) * Math.sin(angle));
        let r = p.radius + wobble + stretch - pressure;
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
    ctx.strokeStyle = 'white'; ctx.lineWidth = 4; ctx.stroke();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(moveAngle);
    ctx.fillStyle="white"; ctx.beginPath(); ctx.arc(p.radius*0.35, -p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.arc(p.radius*0.35, p.radius*0.2, p.radius*0.2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="black"; ctx.beginPath(); ctx.arc(p.radius*0.35+3, -p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.arc(p.radius*0.35+3, p.radius*0.2, p.radius*0.1, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "white"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center"; ctx.fillText(p.name, p.x, p.y - p.radius - 18);
}

function updateLeaderboard(me) {
    let sorted = Object.values(allPlayers).sort((a,b) => b.score - a.score);
    document.getElementById('lb-list').innerHTML = sorted.slice(0, 5).map((p, i) => `<div class="lb-item"><span>${i+1}. ${p.name}</span><span>${Math.floor(p.score)}</span></div>`).join('');
    let rank = sorted.findIndex(p => p.id === socket.id) + 1;
    document.getElementById('lb-player').innerHTML = `<div class="lb-item lb-own"><span>${rank}. ${me.name}</span><span>${Math.floor(me.score)}</span></div>`;
}

function drawMinimap(me) {
    mCtx.clearRect(0,0,120,120); const s = 120 / mapSize;
    for(let id in allPlayers) { 
        mCtx.fillStyle = id === socket.id ? "#fff" : "#f44"; 
        mCtx.beginPath(); mCtx.arc(allPlayers[id].x*s, allPlayers[id].y*s, id === socket.id ? 3 : 2, 0, Math.PI*2); mCtx.fill(); 
    }
}
draw();
