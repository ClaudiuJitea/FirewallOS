FROM debian:12-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    dnsutils \
    iproute2 \
    iputils-ping \
    isc-dhcp-client \
    net-tools \
    netcat-openbsd \
    nmap \
    tcpdump \
    traceroute \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /opt/fw-tests/entrypoint.sh
COPY tools/ /opt/fw-tests/tools/
RUN chmod +x /opt/fw-tests/entrypoint.sh /opt/fw-tests/tools/*.sh

WORKDIR /opt/fw-tests
