FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/client-emulator/package*.json ./apps/client-emulator/
RUN npm install
COPY apps/client-emulator ./apps/client-emulator
EXPOSE 4020
CMD ["npm", "run", "start", "--workspace=apps/client-emulator"]
