const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 8080;

// Motor HTTP estático incorporado para saltarnos los bloqueos de micrófonos locales de Chrome
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/voice_index.html') {
        fs.readFile(path.join(__dirname, 'voice_index.html'), 'utf8', (err, data) => {
            if (err) return res.writeHead(500).end('Error cargando la interfaz');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (req.url === '/logo.png') {
        fs.readFile(path.join(__dirname, 'logo.png'), (err, data) => {
            if (err) return res.writeHead(404).end();
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(data);
        });
    } else {
        res.writeHead(404).end();
    }
});

// Anclar Websocket al servidor Web
const wss = new WebSocketServer({ server });

// Llave de OpenAI API (Debe configurarse en el archivo .env)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    console.error("Falta configurar la OPENAI_API_KEY en el archivo .env");
    process.exit(1);
}

// Detectar automáticamente si estamos corriendo dentro del Docker de la Nube (DigitalOcean) o en la Laptop:
// Si corremos en Docker, saltamos la IP Pública (que Docker bloquea) y le hablamos a n8n por el tubo interno de alta velocidad.
const isDocker = fs.existsSync('/.dockerenv');
const baseUrl = isDocker ? 'http://n8n:5678' : 'https://hugovera.lat';

// Estos son los webhooks dinámicos auto-ajustables
const CARTONES_API_URL = process.env.CARTONES_API_URL || "https://cotizador.hugovera.lat/api/cartones";
const COTIZAR_API_URL = process.env.COTIZAR_API_URL || "https://cotizador.hugovera.lat/api/cotizar";

wss.on('connection', (clientWs) => {
    console.log("Cliente frontend conectado. Abriendo conexión a OpenAI Realtime API...");

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini-realtime-preview';
    const openaiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
        headers: {
            "Authorization": "Bearer " + OPENAI_API_KEY,
            "OpenAI-Beta": "realtime=v1"
        }
    });

    openaiWs.on('open', () => {
        console.log("Conectado con éxito a OpenAI Realtime API.");

        const currentHour = new Date().getHours();
        let greeting = "Buenos días";
        if (currentHour >= 12 && currentHour < 19) greeting = "Buenas tardes";
        else if (currentHour >= 19 || currentHour < 5) greeting = "Buenas noches";

        // Configuramos la personalidad, las herramientas y la voz
        const sessionUpdate = {
            type: "session.update",
            session: {
                instructions: `Eres Jarvis, el mayordomo inteligente de una cartonera.
Tu objetivo es dar cotizaciones exactas.

FLUJO DE CONVERSACIÓN:
1. Tu objetivo es obtener estos 7 datos: Cartón, Ancho, Largo, Alto, Cantidad, Colores y Troquel.
2. Saluda: "${greeting} SEÑOR STARK. ¿Desea una cotización?".
3. Escucha atentamente: Si el usuario te da varios datos en una sola frase, procésalos todos.
4. Solo pregunta por los datos que falten de la lista. No repitas preguntas de datos que ya tienes.
5. Puedes pedir los datos faltantes en cualquier orden, pero intenta ser natural.
6. Una vez que tengas los 7 datos, ejecuta "cotizar_cajas".
7. Di el Costo Total y Unitario separando SIEMPRE los enteros de los decimales de esta forma:
   - Los números antes del punto son "Soles".
   - Los dos números después del punto son "Céntimos".
   - Formato Obligatorio: "[Entero] soles y [Decimal] céntimos".
   - Ejemplo para 9.28: "nueve soles y veintiocho céntimos". (NUNCA digas novecientos céntimos).
   - Ejemplo para 1.13: "un sol y trece céntimos".
   - IMPORTANTE: No uses el símbolo "S/".

REGLAS DE PERSONALIDAD Y CONDUCTA:
- Puedes responder preguntas de cortesía (ej: "¿Cómo estás?") o información general (ej: la hora).
- Si el usuario hace más de dos preguntas seguidas fuera del tema de cotización, responde a la tercera pregunta pero pide amablemente que regresen al proceso de cotización para no perder el hilo.
- Mantén siempre el tono de un mayordomo elegante, conciso y servicial (estilo Jarvis).
- Respuestas cortas y elegantes.
- No pidas datos que ya tienes.
- Si te interrumpen con "espera" o "no", guarda silencio.`,
                voice: "echo", // Voz más gruesa y profunda
                tools: [
                    {
                        type: "function",
                        name: "obtener_cartones",
                        description: "Usa esta herramienta EXCLUSIVAMENTE cuando el usuario te pregunte qué cartones hay, o cuando no sepa cuál elegir. Te devolverá los materiales registrados. Nombra solo los cartones obtenidos de aquí, sin inventar otros.",
                        parameters: {
                            type: "object",
                            properties: {},
                            required: []
                        }
                    },
                    {
                        type: "function",
                        name: "cotizar_cajas",
                        description: "Envía datos al sistema backend y devuelve el precio exacto final en una cotización.",
                        parameters: {
                            type: "object",
                            properties: {
                                cantidad: { type: "number", description: "Cantidad numérica de cajas a cotizar" },
                                carton: { type: "string", description: "El nombre exacto del cartón elegido que resultó de obtener_cartones" },
                                ancho: { type: "number", description: "Ancho en centímetros" },
                                largo: { type: "number", description: "Largo en centímetros" },
                                alto: { type: "number", description: "Alto en centímetros" },
                                colores: { type: "number", description: "Número de colores del diseño" },
                                troquel: { type: "boolean", description: "Indica si la caja requiere troquel (true si sí, false si no)" }
                            },
                            required: ["cantidad", "carton", "ancho", "largo", "alto", "colores", "troquel"]
                        }
                    }
                ],
                tool_choice: "auto",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                input_audio_transcription: { model: "whisper-1" },
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.85, // EXTREMO: Filtra ruidos de fondo suaves o estática (antes 0.5)
                    prefix_padding_ms: 300,
                    silence_duration_ms: 800 // EXTREMO: Espera más rato de silencio real antes de considerar la frase terminada (antes 200)
                }
            }
        };
        openaiWs.send(JSON.stringify(sessionUpdate));

        // Forzamos a Jarvis a HABLAR PRIMERO rompiendo el hielo automáticamente al conectar
        setTimeout(() => {
            if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({ type: "response.create" }));
            }
        }, 500); // Medio segundo para asegurar que las reglas (instructions) se aplicaron
    });

    openaiWs.on('message', async (data) => {
        const event = JSON.parse(data.toString());

        if (event.type === 'error') {
            // Ignoramos advertencias de sincronización de colas de OpenAI, ya que se resuelven internamente
            if (event.error?.code === 'conversation_already_has_active_response' || event.error?.message?.includes('no active response')) {
                return;
            }
            console.error("🚨 Error de OpenAI:", JSON.stringify(event.error, null, 2));
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'error', text: event.error.message }));
            }
        }

        if (event.type === 'session.updated') {
            console.log("✅ Configuración de sesión aplicada con éxito.");
        }

        // BARGE-IN: Si detecta que el usuario interrumpió hablando ("alto", "no", "espera"),
        // detiene el audio en el frontend Y cancela la respuesta activa en OpenAI
        if (event.type === 'input_audio_buffer.speech_started') {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'speech_started' }));
            }
            // Cancelar lo que Jarvis estaba diciendo para que no siga hablando encima del usuario
            if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
            }
        }

        // RECIBIR AUDIO: Si el de OpenAI nos está devolviendo audio generado, enviarlo al frontend al instante
        if (event.type === 'response.audio.delta') {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'audio', audio: event.delta }));
            }
        }

        // TRANSCRIPCIONES (para mostrar el chat de texto en UI)
        if (event.type === 'response.audio_transcript.done') {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'transcript', role: 'bot', text: event.transcript }));
            }
        }

        if (event.type === 'conversation.item.input_audio_transcription.completed') {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'transcript', role: 'user', text: event.transcript }));
            }
        }

        // TOOL EXECUTION: Si la inteligencia de la llamada determina que es hora de ejecutar el Webhook
        if (event.type === 'response.function_call_arguments.done') {
            const callId = event.call_id;
            const functionName = event.name;
            const args = JSON.parse(event.arguments || '{}');

            console.log(`[Sistema] Ejecutando: ${functionName} con parámetros:`, args);

            let result = {};
            try {
                // Herramienta 1: CARTONES
                if (functionName === 'obtener_cartones') {
                    console.log(`[Consultando API] Obteniendo lista de cartones desde: ${CARTONES_API_URL}`);
                    const res = await fetch(CARTONES_API_URL);
                    const data = await res.json();

                    // El nuevo endpoint devuelve una lista directa ["312B", "963BC"...]
                    const lista = Array.isArray(data) ? data : (data.lista_cartones || []);

                    // Creamos una versión de la lista que ayude a la IA a no confundirse con espacios
                    const listaLimpia = lista.map(c => c.replace(/\s+/g, ''));

                    result = {
                        cartones_disponibles: lista.join(', '),
                        sugerencia_busqueda: listaLimpia.join(', '),
                        cantidad_total: lista.length,
                        texto: `Contamos con ${lista.length} tipos de cartón: ${lista.join(', ')}. (Nota: Ignora espacios al buscar).`
                    };
                }
                // Herramienta 2: COTIZAR
                else if (functionName === 'cotizar_cajas') {
                    console.log(`[Consultando API] Enviando cotización a: ${COTIZAR_API_URL} con parámetros:`, args);
                    const res = await fetch(COTIZAR_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(args)
                    });
                    result = await res.json();
                }
            } catch (err) {
                console.error("Error consultando Webhooks de n8n:", err);
                result = { error: "Lo siento, tuve un problema conectándome a la libreta de cotizaciones. ¿Verificaste que los webhooks estén en Producción?" };
            }

            console.log(`[Sistema] ${functionName} -> Oculto en el log por longitud, devolviéndolo al Agente...`);

            // NOTA: Se eliminó el response.cancel aquí porque interfería con la respuesta
            // que debe generarse justo después de devolver el resultado de la herramienta.

            // Enviamos el cálculo final de vuelta al "cerebro" de OpenAI
            openaiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify(result)
                }
            }));

            // Le indicamos que siga hablando ahora que ya tiene la información de n8n
            openaiWs.send(JSON.stringify({
                type: "response.create"
            }));
        }
    });

    // RECIBIR AUDIO DEL CLIENTE: Cuando el navegador le envía audio del micrófono a este servidor de Node.js
    clientWs.on('message', (message) => {
        try {
            const clientData = JSON.parse(message);
            // Redirige transparentemente el stream de audio (Base64) al servidor de OpenAI
            if (clientData.type === 'input_audio' && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: clientData.audio // Chunk de audio en base64 (pcm16)
                }));
            }
        } catch (e) {
            console.error("Error leyendo msg de la interfaz web", e);
        }
    });

    clientWs.on('close', () => {
        console.log("Cliente web desconectado.");
        if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    });

    openaiWs.on('close', (code, reason) => {
        console.log(`❌ Conexión con OpenAI Realtime API cerrada. Código: ${code}, Razón: ${reason.toString()}`);
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });
});

server.listen(PORT, () => {
    console.log(`✅ Sistema Maestro de Jarvis iniciado.`);
    console.log(`🌍 ABRE TU NAVEGADOR EN: http://localhost:${PORT}`);
    console.log(`(Con este link el navegador memorizará y te dejará de pedir permiso de micro)`);
});
