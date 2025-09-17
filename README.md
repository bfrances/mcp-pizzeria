# MCP Stack

Ce projet décrit comment construire et lancer une stack MCP avec Docker, Ollama et un serveur MCP personnalisé.

## 🚀 Build et Run avec Docker

### Build de l'image
```bash
docker build -t mcp-stack .
```

### Lancer le container:
```bash
docker run -it -d -p 11434:11434 -p 8787:8787 -v <path>/workspace:/workspace -v ollama_models:/root/.ollama --name mcp-stack mcp-stack
```

### Accéder au container
```bash
docker exec -it mcp-stack bash
```

---

## ⚙️ Commandes à exécuter dans le container

### Lancer le serveur Ollama
```bash
ollama server
```

### Récupérer le modèle Qwen
```bash
ollama pull qwen2.5:7b
```

### Utilisation sans MCP
```bash
ollmcp --model qwen2.5:7b
```

### Utilisation avec MCP (serveur custom)
```bash
ollmcp --mcp-server /workspace/my-pizzeria.js --model qwen2.5:7b
```

---

## 💬 Exemples de prompts

- *J'ai faim qu'elle est la liste des pizzas ?*  
- *Il me faudrait 2 pizzas, dont 1 pizza à moins de 10€ et une autre pizza avec du poulet.*  
- *Retire du panier la pizza BBQ Chicken.*  
- *Merci récapitule-moi le montant total que j'ai à payer ?*  

---

## 📌 Notes

- Les ports exposés sont `11434` (Ollama) et `8787` (MCP server).  
- Le volume `workspace` permet d'éditer le code localement et de l'utiliser dans le container.  
- Le volume `ollama_models` conserve les modèles téléchargés.  
