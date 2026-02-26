FROM node:20-alpine

RUN apk add --no-cache git bash coreutils

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

RUN echo 'GDG{yOU_ARE_THE_1ST_OF_YOUR_KIND}' > /root/flag.txt && \
    chmod 400 /root/flag.txt

EXPOSE 5000

CMD ["node", "src/server.js"]
