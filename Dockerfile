FROM node:18-alpine

WORKDIR /app

# Paket dosyalarını kopyala
COPY package.json ./

# Bağımlılıkları kur
RUN npm install

# Tüm dosyaları kopyala
COPY . .

# Konteynerin 80 portunu aç (server.js 80 portundan çalışıyor)
EXPOSE 80

# Sunucuyu başlat
CMD ["npm", "start"]
