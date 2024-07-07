#!/bin/sh

if [ "$1" != "" ]; then
    docker-compose run --rm web /pwd/server.py --data-path /data "$@"
else
    docker-compose up --detach
fi
