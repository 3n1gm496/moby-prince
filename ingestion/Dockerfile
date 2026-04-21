FROM node:22-slim
WORKDIR /app

# ffmpeg — required by MediaProcessorWorker for audio noise reduction
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Install production dependencies for the ingestion module
COPY ingestion/package.json ./ingestion/
RUN cd ingestion && npm install --production --ignore-scripts

# Copy ingestion source
COPY ingestion/ ./ingestion/

# Install optional GCP SDKs (non-fatal if npm install already ran without them)
RUN cd ingestion && \
    npm install --save-optional \
      @google-cloud/storage \
      @google-cloud/firestore \
      @google-cloud/monitoring \
      @google-cloud/documentai \
    2>/dev/null || true

ENV LOG_LEVEL=info
ENV NODE_ENV=production

# Default command: retry failed jobs (overridden by Cloud Run Job args)
ENTRYPOINT ["node", "ingestion/cloudrun/entrypoint.js"]
CMD ["retry"]
