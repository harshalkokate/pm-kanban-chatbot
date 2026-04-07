#!/bin/bash
set -e

docker stop pm-app
docker rm pm-app

echo "App stopped."
