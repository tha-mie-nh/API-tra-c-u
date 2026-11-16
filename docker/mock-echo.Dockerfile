# Mock echo upstream (scripts/mock-echo-server.js) — a tiny image for tracing request/response transactions.
#   docker build -f docker/mock-echo.Dockerfile -t gthanh/app_tra_cuu:mock-echo-v1 .
#   docker run --rm -p 4200:4200 gthanh/app_tra_cuu:mock-echo-v1
FROM node:22-alpine
WORKDIR /app
COPY scripts/mock-echo-server.js ./mock-echo-server.js
ENV PORT=4200
EXPOSE 4200
USER node
CMD ["node", "mock-echo-server.js"]
