# Usa una imagen base ligera de Python
FROM python:3.11-slim

# Establece variables de entorno para optimizar Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Establece el directorio de trabajo
WORKDIR /app

# Instala dependencias del sistema si son necesarias
# Descomenta y ajusta si necesitas paquetes adicionales
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     build-essential \
#     && rm -rf /var/lib/apt/lists/*

# Copia el archivo de requerimientos y instala las dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia el código de la aplicación
COPY ./app /app/app

# Expon el puerto que usará la aplicación
EXPOSE 8000

# Comando para iniciar la aplicación con Uvicorn y soporte de recarga en desarrollo
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
