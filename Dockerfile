# Basado en Node.js versión 20 ligera
FROM node:20-alpine

# Establece el directorio de trabajo en el contenedor
WORKDIR /app

# Copia los archivos de manifiesto para instalar dependencias
COPY package*.json ./

# Instala solo las dependencias de producción (ws, dotenv)
RUN npm install --production

# Copia todo el código fuente al contenedor
COPY . .

# Expone el puerto 8080
EXPOSE 8080

# Comando por defecto para correr el agente
CMD ["node", "server.js"]
