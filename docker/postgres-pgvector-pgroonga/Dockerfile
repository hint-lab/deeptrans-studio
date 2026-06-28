FROM groonga/pgroonga:4.0.6-debian-18

ARG PGVECTOR_VERSION=0.8.3

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        postgresql-server-dev-18 \
        wget; \
    wget -O /tmp/pgvector.tar.gz "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz"; \
    mkdir -p /tmp/pgvector; \
    tar -xzf /tmp/pgvector.tar.gz -C /tmp/pgvector --strip-components=1; \
    make -C /tmp/pgvector; \
    make -C /tmp/pgvector install; \
    rm -rf /tmp/pgvector /tmp/pgvector.tar.gz; \
    apt-get purge -y --auto-remove build-essential postgresql-server-dev-18 wget; \
    rm -rf /var/lib/apt/lists/*
