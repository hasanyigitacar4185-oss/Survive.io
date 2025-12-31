const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const socket = io();
let allPlayers = {};
let allFoods = []; // Burası boş dizi olarak başlamalı

window.addEventListener('mousemove', (e) => {
    socket.emit('playerMove', { x: e.clientX, y: e.clientY });
});

socket.on('update', (data) => {
    allPlayers = data.players;
    allFoods = data.foods;
});

function draw() {
    // Ekranı temizle
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Önce yiyecekleri çiz
    allFoods.forEach(food => {
        ctx.fillStyle = food.color;
        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    });

    // 2. Oyuncuları çiz
    for (let id in allPlayers) {
        const p = allPlayers[id];
        
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        // Kenarlık
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        // İsim
        ctx.fillStyle = "white";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(id === socket.id ? "SEN" : "RAKİP", p.x, p.y - p.radius - 10);
    }

    requestAnimationFrame(draw);
}

// Çizimi başlat
draw();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
