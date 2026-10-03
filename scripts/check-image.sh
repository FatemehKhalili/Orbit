#!/usr/bin/env sh
# Start a production image on its own and check that it serves its health endpoint.
# Usage: ./scripts/check-image.sh api|web <image>
# No database or API is needed: liveness does not depend on other services.
set -eu

app=$1 image=$2
name="orbit-image-check-$app-$$"
port=18080

cleanup() {
  status=$?
  [ "$status" -eq 0 ] || docker logs "$name" >&2 || true
  docker rm -f "$name" > /dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

case $app in
  api)
    # Points at a port nothing listens on; only liveness is checked.
    env_args="-e DATABASE_URL=postgresql://orbit:unused@127.0.0.1:1/orbit"
    container_port=8000 path=/health expected='"service":"orbit-api"'
    # The admin CLI loads (including the native Argon2 library) in the runtime image.
    docker run --rm $env_args "$image" python -m app.cli --help > /dev/null
    echo "ok   api image: admin CLI loads"
    ;;
  web)
    env_args="-e ORBIT_API_URL=http://127.0.0.1:1"
    container_port=3000 path=/api/health expected='"service":"orbit-web"'
    ;;
  *) echo "usage: $0 api|web <image>" >&2; exit 2 ;;
esac

docker run -d --name "$name" $env_args -p "127.0.0.1:$port:$container_port" "$image" > /dev/null

for _ in $(seq 1 30); do
  if body=$(curl -fsS --max-time 2 "http://127.0.0.1:$port$path" 2> /dev/null); then
    case $body in
      *"$expected"*) echo "ok   $app image serves $path"; break ;;
    esac
  fi
  sleep 1
done
case ${body:-} in *"$expected"*) ;; *) echo "FAIL $app image did not serve $path" >&2; exit 1 ;; esac

if [ "$app" = web ]; then
  location=$(curl -sS -o /dev/null -w '%{redirect_url}' "http://127.0.0.1:$port/")
  case $location in
    */login) echo "ok   web image sends visitors without a session to /login" ;;
    *) echo "FAIL web image: / should redirect to /login, got '$location'" >&2; exit 1 ;;
  esac
fi
