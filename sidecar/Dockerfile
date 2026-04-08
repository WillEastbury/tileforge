# --- Build stage: compile llama.cpp and download model ---
FROM mcr.microsoft.com/cbl-mariner/base/core:2.0 AS builder

RUN tdnf install -y git cmake gcc gcc-c++ make binutils glibc-devel kernel-headers curl ca-certificates && \
    tdnf clean all

WORKDIR /build

# Build llama.cpp (llama-server for native OpenAI-compatible API)
RUN git clone --depth 1 https://github.com/ggerganov/llama.cpp.git && \
    cd llama.cpp && \
    cmake -B build -DLLAMA_CURL=OFF -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --config Release -j$(nproc) --target llama-server llama-cli && \
    ls -lh build/bin/llama-server build/bin/llama-cli

# Download Qwen2.5-1.5B-Instruct Q4_K_M (~1GB, strong instruction following)
RUN mkdir -p /build/models && \
    curl -L -o /build/models/model.gguf \
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf" && \
    ls -lh /build/models/model.gguf

# --- Runtime stage ---
FROM mcr.microsoft.com/cbl-mariner/base/core:2.0

RUN tdnf install -y libgomp libstdc++ ca-certificates && tdnf clean all

WORKDIR /app

# Copy server binary and all shared libraries from the build
COPY --from=builder /build/llama.cpp/build/bin/llama-server /app/llama-server
COPY --from=builder /build/models/model.gguf /app/model.gguf

# Collect shared libs needed at runtime
RUN mkdir -p /app/lib
COPY --from=builder /build/llama.cpp/build/src/ /tmp/build-src/
COPY --from=builder /build/llama.cpp/build/ggml/ /tmp/build-ggml/
RUN find /tmp/build-src /tmp/build-ggml -name '*.so*' -exec cp {} /app/lib/ \; && \
    rm -rf /tmp/build-src /tmp/build-ggml && \
    ls -lh /app/lib/ && \
    ls -lh /app/model.gguf

ENV LD_LIBRARY_PATH=/app/lib:$LD_LIBRARY_PATH

EXPOSE 8000

# llama-server: native OpenAI-compatible /v1/chat/completions and /v1/models
CMD ["/app/llama-server", \
     "-m", "/app/model.gguf", \
     "--port", "8000", \
     "--host", "0.0.0.0", \
     "-ngl", "0", \
     "-t", "2", \
     "-c", "2048", \
     "--chat-template", "chatml"]
