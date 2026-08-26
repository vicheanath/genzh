FROM coturn/coturn:alpine

COPY coturn/turnserver.conf /etc/coturn/turnserver.conf

EXPOSE 3478/tcp 3478/udp 5349/tcp 5349/udp 49152-49200/udp

USER nobody:nogroup

ENTRYPOINT ["turnserver", "-c", "/etc/coturn/turnserver.conf"]
