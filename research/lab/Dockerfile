FROM python:3.12-slim
WORKDIR /app
COPY research/lab/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r /app/requirements.lock --extra-index-url https://download.pytorch.org/whl/cpu
COPY research/lab /app/research/lab
COPY graph /app/graph
ENV LAB_GRAPH_DIR=/app/graph LAB_DATA_DIR=/data/runs LAB_THREADS=2 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "research.lab.service:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
