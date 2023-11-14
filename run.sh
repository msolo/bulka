#!/bin/sh

if [ "$1" != "" ]; then
    docker_args="-it --rm"
else
    docker_args="--name bulka --init --detach --restart=always"
fi

if [ "$PORT" = "" ]; then
    PORT=8000
fi

# Don't run as root inside - it's not necessary and git
# dumps a bunch of pointless warnings.
docker run $docker_args \
       -e PUID=1000 \
       -e PGID=1000 \
       -e TZ=America/Los_Angeles \
       -p $PORT:8000 \
       -v $PWD:/pwd \
       -w /pwd \
       -u 1000 \
       bulka /pwd/server.py "$@"
