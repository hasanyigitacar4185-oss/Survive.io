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
const FOOD_COUNT = 50; 

// Yiyecek oluşturma
function spawnFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * 800, // Şimdilik küçük alan
        y: Math.random() * 600,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        radius: 5
    };
}

for (let i = 0; i < FOOD_COUNT; i++) {
    foods.push(spawnFood());
}

io.on('connection', (socket) => {
    console.log('Yeni oyuncu:', socket.id);

    players[socket.id] = {
        x: 400,
        y: 300,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        radius: 20
    };

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;

            // Yiyecek kontrolü
            foods.forEach((food, index) => {
                const dist = Math.hypot(players[socket.id].x - food.x, players[socket.id].y - food.y);
                if (dist < players[socket.id].radius) {
                    players[socket.id].radius += 0.5;
                    foods[index] = spawnFood();
                }
            });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    io.emit('update', { players, foods });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});
