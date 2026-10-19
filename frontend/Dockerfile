FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# transformers.js pulls in onnxruntime-node, whose postinstall downloads a CUDA build the browser never uses.
RUN npm ci --ignore-scripts

COPY . .

# Vite inlines these at build time, so changing them means rebuilding the image.
ARG VITE_API_BASE_URL=""
ARG VITE_ASR_MODEL_ID=""
ARG VITE_ASR_LOCAL_MODELS="false"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_ASR_MODEL_ID=$VITE_ASR_MODEL_ID \
    VITE_ASR_LOCAL_MODELS=$VITE_ASR_LOCAL_MODELS

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
