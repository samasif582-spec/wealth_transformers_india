FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/mock-whatsapp-server/package*.json ./apps/mock-whatsapp-server/
RUN npm install
COPY apps/mock-whatsapp-server ./apps/mock-whatsapp-server
RUN npm run build --workspace=apps/mock-whatsapp-server
EXPOSE 4010
CMD ["npm", "run", "start", "--workspace=apps/mock-whatsapp-server"]
