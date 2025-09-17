Build: docker build -t mcp-stack .
RUN: docker run -it -d -p 11434:11434 -p 8787:8787 -v C:\Users\benja\Documents\Dev\mcp-server\workspace:/workspace -v ollama_models:/root/.ollama --name mcp-stack mcp-stack
EXEC: docker exec -it mcp-stack bash


RUN in container:
ollama server <= lancer le server ollama.
ollama pull qwen2.5:7b <= pull version

ollmcp --model qwen2.5:7b <= sans mcp

ollmcp --mcp-server /workspace/my-pizzaria.js --model qwen2.5:7b <= avec mcp

Promps:
J'ai faim qu'elle est la liste des pizzas ?
Il me faudra 2 pizzas a moins de 10€ et une pizza avec du poulet.
Peux tu retirer du panier la BBQ Chicken car je pense que ça fait un peu trop ?
Merci récapitule moi le montant total que j'ai a payer ?