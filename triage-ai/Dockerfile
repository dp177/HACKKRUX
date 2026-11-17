# Triage AI service (FastAPI). Works on Hugging Face Spaces (port 7860) or
# any Docker host. Build from the REPO ROOT so the rule engine in
# triage_engine/ is available:
#   docker build -f triage-ai/Dockerfile .
FROM python:3.11-slim
WORKDIR /app
COPY triage-ai/requirements.txt ./triage-ai/requirements.txt
RUN pip install --no-cache-dir -r triage-ai/requirements.txt
COPY triage_engine ./triage_engine
COPY triage-ai ./triage-ai
ENV PORT=7860
EXPOSE 7860
CMD uvicorn --app-dir triage-ai main:app --host 0.0.0.0 --port ${PORT}
