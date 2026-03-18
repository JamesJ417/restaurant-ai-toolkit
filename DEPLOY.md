# Restaurant AI Toolkit - Deployment Guide

## Quick Start (5 minutes)

### Option 1: DigitalOcean VPS (Recommended - $6/mo)

1. **Create Account**: Go to https://digitalocean.com and sign up

2. **Create Droplet**:
   - Image: Ubuntu 22.04
   - Size: $6/mo (1GB RAM)
   - Add your SSH key

3. **SSH into server** and run:
   ```bash
   curl -sL https://raw.githubusercontent.com/JamesJ417/restaurant-ai-toolkit/main/setup-vps.sh | sudo bash
   ```

4. **Point domain** to your server IP

5. **Get SSL**:
   ```bash
   certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

6. **Add Stripe** (optional):
   ```bash
   nano /opt/restaurant-ai-toolkit/.env
   ```
   Add: `STRIPE_SECRET_KEY=sk_test_...`

---

### Option 2: Hetzner (Cheaper - €4/mo)
Same process, just choose Hetzner instead of DigitalOcean

---

## Architecture

```
User's Phone/Browser
        ↓
    Nginx (SSL)
        ↓
   Node.js App (port 18790)
        ↓
    Ollama (AI - free, local)
```

**Benefits:**
- Zero per-use AI costs (Ollama runs locally)
- $6-10/month total
- Full control
- Stripe payments ready
- Production-ready

---

## Checking Status

```bash
# Check AI models
ollama list

# Check app
pm2 status

# View logs
pm2 logs restaurant-ai
```

---

## Updating the App

```bash
cd /opt/restaurant-ai-toolkit
git pull origin main
npm install --production
pm2 restart restaurant-ai
```