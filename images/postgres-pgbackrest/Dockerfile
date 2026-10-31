# The official Postgres image + pgBackRest, for WAL archiving and point-in-time restores (#79).
# pgBackRest comes from the PGDG repository the official image already uses.
FROM postgres:17.11
RUN apt-get update \
 && apt-get install -y --no-install-recommends pgbackrest=2.60.0-1.pgdg13+1 \
 && rm -rf /var/lib/apt/lists/* \
 && install -d -o postgres -g postgres -m 750 /var/lib/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest
