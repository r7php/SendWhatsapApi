const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors()); 

const server = http.createServer(app); 
const io = socketIO(server, {
    cors: {
        origin: "*",  // Permite conexões de qualquer origem
        methods: ["GET", "POST"]
    }
});
app.use(express.json());  // Este middleware processa o corpo das requisições como JSON

function clearDebugLog() {
    const debugLogPath = path.join(__dirname, 'session', 'session', 'Default', 'chrome_debug.log');
    try {
        if (fs.existsSync(debugLogPath)) {
            fs.unlinkSync(debugLogPath);
        }
    } catch (err) {
        console.error('Erro ao limpar o debug log:', err.message);
    }
}

// Inicializa o cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

// Eventos principais do cliente
client.on('qr', (qr) => {
    console.log('Escaneie o QR Code abaixo para conectar:');
    qrcode.generate(qr, { small: true });
    io.emit('qr', qr); // Emite o QR code para o frontend via Socket.IO
});

client.on('ready', () => {
    console.log('WhatsApp conectado e pronto para uso!');
    io.emit('ready', 'WhatsApp conectado e pronto!');
});

client.on('authenticated', () => {
    console.log('WhatsApp autenticado com sucesso.');
    io.emit('authenticated', 'Autenticado com sucesso');
});

client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação:', msg);
    io.emit('auth_failure', 'Falha na autenticação');
});

client.on('disconnected', async (reason) => {
    console.log(`Cliente desconectado. Motivo: ${reason}`);
    io.emit('disconnected', `Cliente desconectado: ${reason}`);

    try {
        // Tenta destruir o cliente com segurança
        await client.destroy();
        console.log('Cliente destruído com sucesso.');
    } catch (destroyError) {
        console.error('Erro ao destruir o cliente:', destroyError.message);
    }

    setTimeout(() => {
        try {
            console.log('Tentando reinicializar o cliente...');
            client.initialize();
        } catch (initError) {
            console.error('Erro ao reinicializar o cliente:', initError.message);
        }
    }, 3000); // Aguarda 3 segundos antes de reiniciar
});


client.on('error', (error) => {
    console.error('Erro no cliente:', error);

    if (error.message.includes('EBUSY')) {
        console.log('Erro de arquivo bloqueado (EBUSY). Tentando reiniciar após aguardar...');

        setTimeout(() => {
            try {
                client.destroy().then(() => {
                    client.initialize();
                });
            } catch (err) {
                console.error('Erro ao reiniciar após EBUSY:', err.message);
            }
        }, 3000); // Espera para evitar erro repetido
    }

    io.emit('error', error.message);
});


clearDebugLog();
console.log('Iniciando cliente WhatsApp...');
client.initialize();


app.use(express.static('public')); 


app.post('/send-message', async (req, res) => {
 

    const { number, message, carteira } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: 'Número e mensagem são obrigatórios.' });
    }

    try {
        await client.sendMessage(number, message);
        return res.json({
            success: true,
            message: 'Mensagem enviada com sucesso.',
            telefone_envio: number
        });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Erro ao enviar mensagem.',
            details: error.message,
        });
    }
});


const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});