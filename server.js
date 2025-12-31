const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let foods = [];
const MAP_SIZE = 3000; // Harita boyutu
const FOOD_COUNT = 300; // Daha büyük harita için daha çok yiyecek

function spawnFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        radius: 6
    };
}

for (let i = 0; i < FOOD_COUNT; i++) {
    foods.push(spawnFood());
}

io.on('connection', (socket) => {
    players[socket.id] = {
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        radius: 25,
        targetX: 0,
        targetY: 0
    };

    // Client'tan farenin nerede olduğunu alıyoruz
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].targetX = data.x;
            players[socket.id].targetY = data.y;
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// Hareket ve Çarpışma Hesaplamaları (Sunucuda döner)
setInterval(() => {
    for (let id in players) {
        let p = players[id];
        
        // Fareye doğru yumuşak hareket hesapla
        // (Fare oyuncunun merkezine göre ne kadar uzaktaysa o yöne git)
        let dx = p.targetX; 
        let dy = p.targetY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 5) { // Fare merkeze çok yakın değilse hareket et
            // Hız: Oyuncu büyüdükçe biraz yavaşlar (Opsiyonel)
            let speed = 4; 
            p.x += (dx / dist) * speed;
            p.y += (dy / dist) * speed;
        }

        // Harita Sınırları (Duvarlar)
        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));

        // Yiyecek yeme kontrolü
        foods.forEach((food, index) => {
            const distFood = Math.hypot(p.x - food.x, p.y - food.y);
            if (distFood < p.radius) {
                p.radius += 0.4;
                foods[index] = spawnFood();
            }
        });
    }
    io.emit('update', { players, foods, MAP_SIZE });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Survive.io ${PORT} portunda!`));
