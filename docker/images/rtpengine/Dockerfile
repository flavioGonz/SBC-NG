# ============================================================================
#  SBC-NG · rtpengine con TRANSCODING
#
#  El rtpengine de los repos viene sin códecs: sólo relaya. Eso alcanza mientras
#  las dos puntas hablen el mismo idioma… y no lo hacen: un softphone WebRTC
#  habla Opus y muchos operadores sólo hablan G.729. Sin transcoding, esa llamada
#  simplemente no existe (488 Not Acceptable Here).
#
#  Por eso lo compilamos con soporte de códecs (ffmpeg + bcg729):
#    G.711 (PCMU/PCMA) · G.722 · Opus · G.729 · G.726 · GSM
#
#  Transcodificar cuesta CPU, así que se activa POR TRONCAL, nunca global.
# ============================================================================
FROM debian:12-slim AS build
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential git pkg-config cmake \
      libglib2.0-dev libssl-dev libavcodec-dev libavformat-dev libavutil-dev \
      libswresample-dev libavfilter-dev libevent-dev libpcap-dev libxmlrpc-core-c3-dev \
      libhiredis-dev libjson-glib-dev libcurl4-openssl-dev libmosquitto-dev \
      libwebsockets-dev libspandsp-dev libopus-dev libmnl-dev libnftnl-dev \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# G.729 (bcg729): el códec que piden los operadores viejos y que WebRTC no habla.
RUN git clone --depth 1 https://github.com/BelledonneCommunications/bcg729.git /src/bcg729 \
    && cd /src/bcg729 && cmake -DCMAKE_INSTALL_PREFIX=/usr -DENABLE_SHARED=YES . \
    && make -j"$(nproc)" && make install && ldconfig

ARG RTPENGINE_VERSION=mr11.5.1.24
RUN git clone --depth 1 --branch ${RTPENGINE_VERSION} \
      https://github.com/sipwise/rtpengine.git /src/rtpengine \
    && cd /src/rtpengine/daemon && make -j"$(nproc)"

FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 libssl3 libavcodec59 libavformat59 libavutil57 libswresample4 \
      libavfilter8 libevent-2.1-7 libpcap0.8 libxmlrpc-core-c3 libhiredis0.14 \
      libjson-glib-1.0-0 libcurl4 libmosquitto1 libwebsockets17 libspandsp2 libopus0 \
      libmnl0 libnftnl11 iproute2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/rtpengine/daemon/rtpengine /usr/local/bin/rtpengine
COPY --from=build /usr/lib/libbcg729* /usr/lib/
RUN ldconfig

COPY images/rtpengine/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
