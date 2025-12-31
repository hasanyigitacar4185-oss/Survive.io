const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Public klasöründeki dosyaları dışarı açar
app.use(express.static(path.join(__dirname, 'public')));

let players = {};

io.on('connection', (socket) => {
    console.log('Yeni oyuncu bağlandı:', socket.id);

    // Yeni oyuncu için başlangıç verileri
    players[socket.id] = {
        x: Math.random() * 500,
        y: Math.random() * 500,
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
        radius: 20
    };

    // Oyuncudan gelen hareket bilgisini al
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    // Oyuncu ayrıldığında onu listeden sil
    socket.on('disconnect', () => {
        console.log('Oyuncu ayrıldı:', socket.id);
        delete players[socket.id];
    });
});

// Saniyede 30 kez tüm oyunculara bilgi gönder (Akıcı oyun için)
setInterval(() => {
    io.emit('update', players);
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
