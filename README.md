# Restaurant AI Toolkit

AI-powered marketing toolkit for restaurants - generate job posts, review responses, social media, menu descriptions, and emails.

## 🌟 Features

- **Job Post Generator** - Create professional job listings
- **Review Response** - Respond to online reviews with AI
- **Social Media** - Generate engaging posts for Instagram, Facebook, Twitter
- **Menu Descriptions** - Write mouth-watering dish descriptions
- **Email Marketing** - Create promotional emails
- **Daily Specials** - Generate compelling daily special descriptions

## 🚀 Quick Start (Local)

```bash
# Install dependencies
npm install

# Start server (requires Ollama running)
npm start

# App runs at http://localhost:18790
```

## ☁️ Cloud Deployment (Railway)

1. Deploy from GitHub: https://github.com/JamesJ417/restaurant-ai-toolkit
2. Add environment variables:
   - `GROQ_API_KEY` - For cloud AI (optional, paid)
   - `STRIPE_SECRET_KEY` - For payments (optional)

## 🖥️ Production VPS Deployment (Recommended)

See [DEPLOY.md](DEPLOY.md) for full instructions.

### Quick Setup:
```bash
# On your VPS, run:
curl -sL https://raw.githubusercontent.com/JamesJ417/restaurant-ai-toolkit/main/setup-vps.sh | sudo bash
```

This installs:
- Node.js + PM2 (app server)
- Ollama + Llama3.2 (free local AI)
- Nginx (web server)
- Auto-ssl with Let's Encrypt

## 💰 Payments

Set `STRIPE_SECRET_KEY` in environment variables to enable payments.

- Free trial: 1 AI generation
- Paid: $97 lifetime access

## 📱 Mobile-First Design

Built for phone use with:
- Bottom tab navigation
- Native app feel
- Responsive design

## Tech Stack

- **Backend**: Node.js
- **AI**: Ollama (local, free) or OpenClaw
- **Payments**: Stripe
- **Deployment**: Railway (cloud) or self-hosted VPS

## License

MIT