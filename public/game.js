let allPlayers = {};
let allFoods = []; // Yiyecekleri tutmak için yeni değişken

socket.on('update', (data) => {
    allPlayers = data.players;
    allFoods = data.foods; // Sunucudan gelen yiyecekleri al
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Arka plan ızgarası (Opsiyonel: Şimdilik mevcut kodun kalabilir)
    
    // Önce yiyecekleri çiz (Oyuncuların altında kalsınlar)
    allFoods.forEach(food => {
        ctx.fillStyle = food.color;
        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Oyuncuları çiz
    for (let id in allPlayers) {
        const p = allPlayers[id];
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Kenarlık
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        // İsim/Durum metni
        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(id === socket.id ? "SEN" : "RAKİP", p.x, p.y - p.radius - 10);
    }

    requestAnimationFrame(draw);
}
draw();
