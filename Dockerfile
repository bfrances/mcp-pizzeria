FROM ubuntu:22.04

# Installer dépendances système
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git build-essential python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Installer Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Ajouter Ollama au PATH
ENV PATH="/root/.ollama/bin:${PATH}"

# Installer Node.js (LTS) et npm
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Installer le client MCP pour Ollama
RUN pip install --no-cache-dir ollmcp

# Répertoire de travail partagé
WORKDIR /workspace
VOLUME ["/workspace"]

# Exposer l’API Ollama
EXPOSE 11434

CMD ["/bin/bash"]
