FROM node:20-alpine
# fontconfig + a real font file are required for sharp/libvips to render the
# <text> elements in the watermark and badge SVG overlays. Without them the
# Alpine image has no fonts at all, librsvg silently drops every text node,
# and a badge renders as a bare colored pill with no label.
RUN apk add --no-cache openssl curl fontconfig ttf-dejavu && fc-cache -f

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN npx prisma generate

RUN npm run build

# Docker-level health check. Coolify reads this, and so does `docker ps`, so a
# container that is up but not yet serving is visible as such rather than
# silently receiving traffic. curl is already installed above.
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/healthz || exit 1

CMD ["npm", "run", "docker-start"]
