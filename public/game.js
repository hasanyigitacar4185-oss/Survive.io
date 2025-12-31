const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const socket = io();
let allPlayers = {};

// Mouse hareketini sunucuya gönder
window.addEventListener('mousemove', (e) => {
    socket.emit('playerMove', { x: e.clientX, y: e.clientY });
});

// Sunucudan gelen güncellemeleri dinle
socket.on('update', (players) => {
    allPlayers = players;
});

function draw() {
    // Ekranı her karede temizle
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Basit bir ızgara (grid) çizimi (hareket hissi verir)
    ctx.strokeStyle = '#222';
    for(let i=0; i<canvas.width; i+=50) {
        ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke();
    }
    for(let i=0; i<canvas.height; i+=50) {
        ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(canvas.width,i); ctx.stroke();
    }

    // Tüm oyuncuları ekrana çiz
    for (let id in allPlayers) {
        const p = allPlayers[id];
        
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Oyuncunun etrafına beyaz bir çizgi
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Üzerine yazı yaz (Ben/Rakip ayrımı için)
        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(id === socket.id ? "SEN" : "RAKİP", p.x, p.y - p.radius - 10);
    }

    requestAnimationFrame(draw);
}

// Çizim döngüsünü başlat
draw();

// Pencere boyutu değişirse canvas'ı güncelle
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
