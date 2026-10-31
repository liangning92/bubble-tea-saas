FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git curl nodejs npm chromium ca-certificates fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY hermes-source /tmp/build-hermes
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
RUN pip install --no-cache-dir uv==0.11.6 && cd /tmp/build-hermes && uv sync --frozen --no-install-project --extra messaging --extra bedrock && cd / && rm -rf /tmp/build-hermes && npm install -g agent-browser@0.26.0
COPY hermes-source /opt/hermes
COPY adapter /opt/store-adapter
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /home/hermes
EXPOSE 8643
ENTRYPOINT ["/opt/venv/bin/python","-I","-B","/opt/store-adapter/scripts/hermes_employee/native_api_service.py"]
