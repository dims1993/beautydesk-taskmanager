# Usamos una imagen oficial de Python ligera
FROM python:3.11-slim

# Evita que Python genere archivos .pyc y fuerza la salida por consola (bueno para logs)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Directorio de trabajo en el contenedor
WORKDIR /app

# Instalamos dependencias del sistema necesarias para compilar (gcc, libpq)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copiamos e instalamos las dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copiamos el resto del código (aunque usaremos volúmenes en desarrollo)
COPY . .

# Comando por defecto (aunque docker-compose lo puede sobreescribir)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]