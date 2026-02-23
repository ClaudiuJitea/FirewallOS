FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    nftables \
    iproute2 \
    dnsmasq \
    procps \
    tcpdump \
    iputils-ping \
    dnsutils \
    traceroute \
    netcat-openbsd \
    curl
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
