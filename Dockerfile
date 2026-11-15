# TrueWage: Python server + static front-end. Runtime dependencies: none, except the Postgres driver when DATABASE_URL is used.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PORT=8080 HOST=0.0.0.0 TRUEWAGE_DATA=/data
RUN useradd --system --uid 10001 --home-dir /app truewage && mkdir -p /data /app && chown truewage /data /app
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=truewage index.html server.py accounts.py store.py monitor.py backup.py manifest.json sw.js icon.svg ./
COPY --chown=truewage css ./css
COPY --chown=truewage js ./js
USER truewage
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s CMD ["python", "-c", "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8080'), timeout=3)"]
CMD ["python", "server.py"]
