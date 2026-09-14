# Backend image (PROJECT_SPEC.md section 10). Targets Python 3.11 per spec; the
# requirements.txt env markers select numpy 2.4.6 / scipy 1.17.1 here (3.11) vs
# 2.5.3 / 1.18.1 on the 3.14 dev machine.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so the (slow) wheel install layer is cached across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code + the processed race data so the image runs standalone. In
# docker-compose the processed dir is also bind-mounted, which just shadows this
# copy with the host's up-to-date data.
COPY app ./app
COPY data/processed ./data/processed

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
