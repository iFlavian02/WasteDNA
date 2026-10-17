FROM python:3.11-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.lock.txt backend/requirements.lock.txt
RUN pip install --no-cache-dir -r backend/requirements.lock.txt

COPY backend/app backend/app
COPY data/template.csv data/template.csv
COPY data/demo/restaurant_minimal_synthetic.csv data/demo/restaurant_minimal_synthetic.csv

ENV APP_MODE=normal DATA_DIR=/data/datasets REDISTRIBUTION_DB_PATH=/data/redistribution.sqlite3
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
