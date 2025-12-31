const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

let allPlayers = {};
let allFoods = [];
let mapSize = 3000;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Fare hareketini merkeze (senin karakterine) göre hesapla
window.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX - canvas.width / 2;
    const mouseY = e.clientY - canvas.height / 2;
    socket.emit('playerMove', { x: mouseX, y: mouseY });
});

socket.on('update', (data) => {
    allPlayers = data.players;
    allFoods = data.foods;
    mapSize = data.MAP_SIZE;
});

function draw() {
    const me = allPlayers[socket.id];
    if (!me) {
        requestAnimationFrame(draw);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- KAMERA BAŞLANGICI ---
    ctx.save();
    // Ekranı oyuncu merkezde kalacak şekilde kaydır
    ctx.translate(canvas.width / 2 - me.x, canvas.height / 2 - me.y);

    // 1. Harita Arka Planı ve Izgara (Grid)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = 0; x <= mapSize; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapSize); ctx.stroke();
    }
    for (let y = 0; y <= mapSize; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(mapSize, y); ctx.stroke();
    }

    // 2. Harita Sınır Duvarları
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, mapSize, mapSize);

    // 3. Yiyecekleri Çiz
    allFoods.forEach(food => {
        ctx.fillStyle = food.color;
        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // 4. Oyuncuları Çiz
    for (let id in allPlayers) {
        const p = allPlayers[id];
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(id === socket.id ? "SENSİN" : "RAKİP", p.x, p.y - p.radius - 10);
    }

    ctx.restore();
    // --- KAMERA BİTİŞİ ---

    requestAnimationFrame(draw);
}

draw();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
