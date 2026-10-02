FROM node:24-bookworm-slim
WORKDIR /app
COPY *.mjs ./
RUN mkdir -p /data/fumigacion /data/servicio-tecnico && chown -R node:node /data
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
