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
const MAP_SIZE = 2000; // Harita boyutunu büyüttük
const FOOD_COUNT = 100; // Ekrandaki yiyecek sayısı

// Rastgele yiyecek oluşturma fonksiyonu
function spawnFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        radius: 5
    };
}

// Başlangıçta yiyecekleri doldur
for (let i = 0; i < FOOD_COUNT; i++) {
    foods.push(spawnFood());
}

io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    players[socket.id] = {
        x: Math.random() * 500,
        y: Math.random() * 500,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        radius: 20,
        score: 0
    };

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;

            // Yiyecek yeme kontrolü (Collision Detection)
            foods.forEach((food, index) => {
                const dist = Math.hypot(players[socket.id].x - food.x, players[socket.id].y - food.y);
                if (dist < players[socket.id].radius) {
                    // Yiyeceği yedi!
                    players[socket.id].radius += 0.5; // Biraz büyü
                    players[socket.id].score += 1;
                    foods[index] = spawnFood(); // Yenisini oluştur
                }
            });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// Güncelleme döngüsü
setInterval(() => {
    io.emit('update', { players, foods }); // Artık yiyecekleri de gönderiyoruz
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
