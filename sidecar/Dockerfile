FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cmake clang build-essential wget lld && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --recursive https://github.com/microsoft/BitNet.git && \
    cd BitNet && pip install -r requirements.txt

# Download the 2B model
RUN pip install huggingface_hub && \
    huggingface-cli download microsoft/BitNet-b1.58-2B-4T --local-dir /build/BitNet/models/BitNet-b1.58-2B-4T

# Build — patch const-correctness bug, then build and convert separately for debugging
RUN cd /build/BitNet && \
    sed -i 's/int8_t \* y_col = y + col \* by;/const int8_t * y_col = y + col * by;/' src/ggml-bitnet-mad.cpp && \
    (python setup_env.py -md models/BitNet-b1.58-2B-4T -q i2_s 2>&1; \
     echo "EXIT CODE: $?"; \
     echo "=== LS BUILD/BIN ==="; ls -la /build/BitNet/build/bin/ 2>/dev/null; \
     echo "=== LS MODELS ==="; ls -la /build/BitNet/models/BitNet-b1.58-2B-4T/*.gguf 2>/dev/null; \
     echo "=== COMPILE LOG ==="; cat /build/BitNet/logs/compile.log 2>/dev/null; \
     echo "=== CONVERT LOG ==="; cat /build/BitNet/logs/*.log 2>/dev/null; \
     true)

# --- Runtime stage ---
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/BitNet /app/BitNet
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

COPY server.py /app/server.py

EXPOSE 8000
CMD ["python", "server.py"]
