# Instrucciones de Despliegue en DigitalOcean (Droplet)

Esta guía detalla los pasos exactos para actualizar y desplegar el código de **Jarvis Cotizador** en tu servidor (Droplet) usando Docker y Caddy Proxy. Esta es la configuración definitiva que funciona en producción.

## Requisitos Previos
- Estar conectado por SSH a tu Droplet (ej. `ssh root@tu-ip`).
- Estar dentro de la carpeta del proyecto (ej. `cd ~/jarvis_cotizador2`).
- Tener creado y configurado el archivo `.env` en esa misma carpeta.

---

## Pasos para Actualizar a una Nueva Versión

Cada vez que hagas un cambio en tu computadora y lo subas a GitHub, debes seguir estos 4 pasos en la consola de tu servidor:

### 1. Descargar los últimos cambios
Trae el código fresco desde GitHub:
```bash
git pull origin main
```

### 2. Reconstruir la Imagen de Docker
Empaqueta el nuevo código en la imagen de Docker:
```bash
docker build -t cotivoice2 .
```

### 3. Borrar el Contenedor Antiguo
Fuerza la eliminación del contenedor viejo para liberar el puerto y el nombre:
```bash
docker rm -f jarvis-cotizador
```

### 4. Levantar el Nuevo Contenedor
Copia y pega este bloque completo. Este comando asegura que:
1. Escuche en el puerto `3015`.
2. Fuerce la variable de entorno `PORT=3015` (ignorando posibles errores en el `.env`).
3. Se conecte automáticamente a la red de Caddy (`n8n_network`) para el certificado SSL y el dominio `jarvis.hugovera.lat`.
4. Se reinicie solo si el servidor se apaga (`--restart unless-stopped`).

```bash
docker run -d \
  --name jarvis-cotizador \
  -p 3015:3015 \
  --env-file .env \
  -e PORT=3015 \
  -l caddy=jarvis.hugovera.lat \
  -l caddy.reverse_proxy="{{upstreams 3015}}" \
  --network n8n_network \
  --restart unless-stopped \
  cotivoice2
```

---

## Verificación de Errores (Troubleshooting)

Si algo sale mal o la página no carga, ejecuta esto para ver los errores internos de la aplicación:
```bash
docker logs jarvis-cotizador --tail 20
```
La última línea debería confirmar que está corriendo en `http://localhost:3015`.

---

## Cambiar variables en el `.env` (ej. cambiar modelo de OpenAI)

Si modificas el archivo `.env` en tu servidor (por ejemplo, con `nano .env` para cambiar `OPENAI_MODEL`), **NO** basta con reiniciar el contenedor. Docker solo lee el `.env` cuando el contenedor se crea por primera vez.

Para aplicar tus cambios del `.env`, solo necesitas ejecutar el **Paso 3** y el **Paso 4**:
1. `docker rm -f jarvis-cotizador`
2. Pegar de nuevo el comando completo:
```bash
docker run -d \
  --name jarvis-cotizador \
  -p 3015:3015 \
  --env-file .env \
  -e PORT=3015 \
  -l caddy=jarvis.hugovera.lat \
  -l caddy.reverse_proxy="{{upstreams 3015}}" \
  --network n8n_network \
  --restart unless-stopped \
  cotivoice2
```

*(No es necesario hacer `git pull` ni `docker build` porque el código fuente no cambió, solo las variables de entorno).*
