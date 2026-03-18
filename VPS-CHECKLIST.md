# VPS Deployment Checklist

## Required
- [ ] Create VPS (DigitalOcean $6/mo or Hetzner €4/mo)
- [ ] Get server IP address
- [ ] Point domain to IP (if using custom domain)

## After Server Created
- [ ] SSH into server
- [ ] Run: curl -sL https://raw.githubusercontent.com/JamesJ417/restaurant-ai-toolkit/main/setup-vps.sh | sudo bash
- [ ] Add STRIPE_SECRET_KEY to .env
- [ ] Run: certbot --nginx -d yourdomain.com

## Current App Status
- GitHub: https://github.com/JamesJ417/restaurant-ai-toolkit
- Local test: Working with Ollama ✅
- AI Model: qwen3.5:2b (free, local)
- Zero per-use AI cost
