"""Lightweight OpenAI-compatible API server wrapping BitNet inference."""
import json
import subprocess
import sys
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

_DEFAULT_PATHS = [
    "/app/BitNet/models/BitNet-b1.58-2B-4T/ggml-model-i2_s.gguf",
    "/app/BitNet/models/BitNet-b1.58-2B-4T-gguf/ggml-model-i2_s.gguf",
    "/app/BitNet/models/BitNet-b1.58-2B-4T/ggml-model-f32.gguf",
    "/app/BitNet/models/BitNet-b1.58-2B-4T-gguf/bitnet-b1.58-2B-4T-gguf.gguf",
]
MODEL_PATH = os.environ.get("MODEL_PATH", "")
if not MODEL_PATH:
    for p in _DEFAULT_PATHS:
        if os.path.exists(p):
            MODEL_PATH = p
            break
    else:
        # Glob fallback: find any .gguf file
        import glob
        gguf_files = glob.glob("/app/BitNet/models/**/*.gguf", recursive=True)
        MODEL_PATH = gguf_files[0] if gguf_files else _DEFAULT_PATHS[0]
BITNET_MAIN = "/app/BitNet/build/bin/llama-cli"
PORT = int(os.environ.get("PORT", "8000"))


def run_inference(prompt, max_tokens=100, temperature=0.7):
    """Run BitNet inference via CLI and return generated text."""
    cmd = [
        BITNET_MAIN,
        "-m", MODEL_PATH,
        "-p", prompt,
        "-n", str(max_tokens),
        "--temp", str(temperature),
        "-t", "2",
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=55
        )
        output = result.stdout.strip()
        # Strip the prompt from the output if it was echoed
        if output.startswith(prompt.strip()):
            output = output[len(prompt.strip()):].strip()
        # Also try stderr in case output went there
        if not output and result.stderr:
            output = result.stderr.strip()
        # Trim at "User:" or "Assistant:" continuations (model sometimes generates multi-turn)
        for stop in ["\nUser:", "\nAssistant:", "\nSystem:"]:
            idx = output.find(stop)
            if idx > 0:
                output = output[:idx].strip()
        return output if output else "..."
    except subprocess.TimeoutExpired:
        return "..."
    except Exception as e:
        return f"Error: {e}"


def build_prompt(messages):
    """Convert OpenAI-style messages to a single prompt string."""
    parts = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            parts.append(f"System: {content}")
        elif role == "user":
            parts.append(f"User: {content}")
        elif role == "assistant":
            parts.append(f"Assistant: {content}")
    parts.append("Assistant:")
    return "\n".join(parts)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/v1/models":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "data": [{"id": "bitnet-2b", "object": "model"}]
            }).encode())
        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/v1/chat/completions":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            messages = body.get("messages", [])
            max_tokens = body.get("max_tokens", 100)
            temperature = body.get("temperature", 0.7)

            prompt = build_prompt(messages)
            text = run_inference(prompt, max_tokens, temperature)

            response = {
                "choices": [{
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop"
                }],
                "model": "bitnet-2b"
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f"[bitnet-api] {args[0]}", file=sys.stderr)


if __name__ == "__main__":
    print(f"Model path: {MODEL_PATH} (exists: {os.path.exists(MODEL_PATH)})")
    print(f"llama-cli: {BITNET_MAIN} (exists: {os.path.exists(BITNET_MAIN)})")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"BitNet sidecar listening on port {PORT}")
    server.serve_forever()
