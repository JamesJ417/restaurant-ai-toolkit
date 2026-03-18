#!/bin/bash
# Restaurant AI Toolkit - VPS Setup Script
# Run as: sudo bash setup-vps.sh

set -e

echo "=== Restaurant AI Toolkit Setup ==="
echo "This script will install everything needed for your AI-powered restaurant marketing app"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "Please run as root: sudo bash setup-vps.sh"
   exit 1
fi

# Get domain
read -p "Enter your domain (e.g., restaurantmarketingai.app): " DOMAIN

echo "Installing dependencies..."
apt update
apt install -y curl git nodejs npm nginx certbot python3-certbot-nginx

# Install Ollama
echo "Installing Ollama (free local AI)..."
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
systemctl enable ollama
systemctl start ollama

# Pull efficient model
echo "Installing AI model (llama3.2 - this may take a few minutes)..."
ollama pull llama3.2

# Setup the app
echo "Setting up the app..."
cd /opt
git clone https://github.com/JamesJ417/restaurant-ai-toolkit.git restaurant-ai
cd restaurant-ai
npm install --production

# Create environment file
cat > .env << EOF
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2
NODE_ENV=production
PORT=18790
DOMAIN=$DOMAIN
EOF

# Setup PM2 to keep app running
echo "Setting up process manager..."
npm install -g pm2
pm2 stop all 2>/dev/null || true
pm2 start server.js --name restaurant-ai
pm2 startup
pm2 save

# Setup Nginx
echo "Configuring Nginx..."
cat > /etc/nginx/sites-available/restaurant-ai << EOF
server {
    listen 80;
    server_name $DOMAIN;

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
systemctl reload nginx

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Next steps:"
echo "1. Point your domain '$DOMAIN' to this server's IP"
echo "2. Wait for DNS to propagate"
echo "3. Run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo "4. Add Stripe keys: nano /opt/restaurant-ai-toolkit/.env"
echo ""
echo "To check AI: ollama list"
echo "To check app: pm2 status"
echo "To view logs: pm2 logs restaurant-ai"