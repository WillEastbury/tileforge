FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cmake clang build-essential wget lld && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --recursive https://github.com/microsoft/BitNet.git && \
    cd BitNet && pip install -r requirements.txt

# Download the pre-converted GGUF model (skip conversion entirely)
RUN pip install huggingface_hub && \
    huggingface-cli download microsoft/BitNet-b1.58-2B-4T --local-dir /build/BitNet/models/BitNet-b1.58-2B-4T && \
    huggingface-cli download microsoft/bitnet-b1.58-2B-4T-gguf --local-dir /build/BitNet/models/BitNet-b1.58-2B-4T-gguf

# Build llama-cli binary only (conversion already done via pre-built GGUF)
RUN cd /build/BitNet && \
    sed -i 's/int8_t \* y_col = y + col \* by;/const int8_t * y_col = y + col * by;/' src/ggml-bitnet-mad.cpp && \
    python setup_env.py -md models/BitNet-b1.58-2B-4T -q i2_s 2>&1; \
    test -f /build/BitNet/build/bin/llama-cli && echo "llama-cli built OK"

# Find the GGUF file from the pre-converted repo
RUN ls -lh /build/BitNet/models/BitNet-b1.58-2B-4T-gguf/*.gguf

# --- Runtime stage ---
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/BitNet /app/BitNet
ENV LD_LIBRARY_PATH=/app/BitNet/build/3rdparty/llama.cpp/src:/app/BitNet/build/3rdparty/llama.cpp/ggml/src:/app/BitNet/build/bin:$LD_LIBRARY_PATH
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

COPY server.py /app/server.py

EXPOSE 8000
CMD ["python", "server.py"]
