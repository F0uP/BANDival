# Bandival stem splitter – Demucs source separation (CPU build, ~2 GB image).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TORCH_HOME=/models DATA_DIR=/data
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# CPU wheels keep the image small; demucs 4.0.1 needs torchaudio < 2.1.
RUN pip install --no-cache-dir torch==2.0.1 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake the default model into the image so the first job does not need internet.
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY app.py .
RUN useradd --create-home --uid 10001 app && mkdir -p /data && chown -R app /data /models
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
