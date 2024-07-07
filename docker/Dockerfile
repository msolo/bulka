FROM alpine

ARG UNAME=svc
ARG UID=1000
ARG GID=1000
RUN addgroup -g $GID $UNAME
RUN adduser -u $UID -G $UNAME -s /bin/bash -D -H $UNAME

RUN apk add --update-cache --update --no-cache tzdata
RUN apk add --update-cache --update --no-cache python3
RUN apk add --update-cache --update --no-cache git
