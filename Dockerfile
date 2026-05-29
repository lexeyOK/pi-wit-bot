FROM node:26-slim

RUN npm install -g pnpm@10.33.4

RUN apt-get update -qq && apt-get install -y -qq \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm_config_minimum_release_age=0 pnpm install
COPY . .

VOLUME ["/app/data"]

CMD ["pnpm", "start"]
