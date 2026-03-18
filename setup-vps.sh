#!/bin/bash
# Restaurant AI Toolkit - VPS Setup Script
# Run as: sudo bash setup-vps.sh

set -e

echo "=== Restaurant AI Toolkit Setup ==="

# Update and install dependencies
apt update && apt upgrade -y
apt install -y curl git nodejs npm nginx certbot python3-certbot-nginx

# Install Ollama (free local AI)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a good model (llama3.2 for efficiency)
echo "Installing AI model (this may take a few minutes)..."
ollama pull llama3.2

# Clone or setup the app
cd /opt
git clone https://github.com/JamesJ417/restaurant-ai-toolkit.git
cd restaurant-ai-toolkit
npm install

# Create environment file
cat > .env << EOF
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
NODE_ENV=production
PORT=18790
DOMAIN=your-domain.com
EOF

# Setup PM2 to keep app running
npm install -g pm2
pm2 start server.js --name restaurant-ai
pm2 startup
pm2 save

# Setup Nginx
cat > /etc/nginx/sites-available/restaurant-ai << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:18790;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/restaurant-ai /etc/nginx/sites-enabled/
nginx -t

echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Point your domain to this server's IP"
echo "2. Run: certbot --nginx -d your-domain.com"
echo "3. Edit /opt/restaurant-ai-toolkit/.env with your domain"
echo "4. Run: pm2 restart restaurant-ai"