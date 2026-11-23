FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 27779
CMD ["node", "server.mjs"]
