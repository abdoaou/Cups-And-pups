FROM node:20-alpine

WORKDIR /app

COPY ["cups and pups/package.json", "cups and pups/package-lock.json", "./"]
RUN npm ci --omit=dev

COPY ["cups and pups/", "./"]

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
